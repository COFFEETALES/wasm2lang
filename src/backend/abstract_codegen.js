'use strict';

/**
 * Maps language identifiers to backend constructors.
 * Each concrete backend registers itself via {@code registerBackend}.
 *
 * @private
 * @const {!Object<string, function(new: Wasm2Lang.Backend.AbstractCodegen)>}
 */
Wasm2Lang.Backend.registry_ = Object.create(null);

/**
 * Registers a backend constructor for a given language identifier.
 *
 * @param {string} languageId  The {@code languageOut} option value (e.g. 'asmjs').
 * @param {function(new: Wasm2Lang.Backend.AbstractCodegen)} ctor
 * @return {void}
 */
Wasm2Lang.Backend.registerBackend = function (languageId, ctor) {
  Wasm2Lang.Backend.registry_[languageId] = ctor;
};

/**
 * Creates the backend for the given language identifier.  Falls back to
 * {@code AbstractCodegen} when the identifier has no registered backend.
 *
 * @param {string} languageId
 * @return {!Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.createBackend = function (languageId) {
  var /** @const {(function(new: Wasm2Lang.Backend.AbstractCodegen)|undefined)} */ ctor =
      Wasm2Lang.Backend.registry_[languageId];
  if (ctor) {
    return new ctor();
  }
  return new Wasm2Lang.Backend.AbstractCodegen();
};

/**
 * @constructor
 */
Wasm2Lang.Backend.AbstractCodegen = function () {
  /** @protected @type {?Object<string, boolean>} */
  this.usedHelpers_ = null;
};

/**
 * Records a helper function name as used.  Concrete backends may override
 * to add dependency resolution.
 *
 * @protected
 * @param {string} name
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.markHelper_ = function (name) {
  if (this.usedHelpers_) {
    this.usedHelpers_[name] = true;
  }
};

// ---------------------------------------------------------------------------
// Expression category constants.
//
// Each emitted expression carries a category that tells consumers whether
// coercion has already been applied.  Consumers call coerceToType_ which
// skips redundant coercion when the category satisfies the target type.
//
// i32 categories (0-4) are defined in I32Coercion and reused here.
// ---------------------------------------------------------------------------

/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_VOID = -1;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_F32 = 5;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_F64 = 6;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_RAW = 7;

/**
 * Returns the expression category that {@code renderCoercionByType_} produces
 * for the given wasm type.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.catForCoercedType_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.I32Coercion.SIGNED;
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AbstractCodegen.CAT_F32;
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AbstractCodegen.CAT_F64;
  }
  return Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
};

/**
 * Default metadata emission — returns the raw option string.  Concrete
 * backends override this to emit language-specific static-memory initialization.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitMetadata = function (wasmModule, options) {
  void wasmModule;
  return /** @type {string} */ (options.emitMetadata);
};

/**
 * Lazily-built reverse map from Binaryen expression-ID numbers to readable
 * names.  Populated once on first call to {@code idName_}.
 *
 * @private
 * @type {?Object<number, string>}
 */
Wasm2Lang.Backend.AbstractCodegen.idNames_ = null;

/**
 * @private
 * @typedef {{
 *   byteOffset: number,
 *   buffer: !ArrayBuffer,
 *   byteLength: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.StaticMemorySegment_;

/**
 * @private
 * @typedef {{
 *   startWordIndex: number,
 *   words: !Int32Array
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_;

/**
 * Language-neutral descriptor for a single non-zero run of i32 words in the
 * merged static memory.  Language backends consume these ops in their own
 * {@code emitStaticI32InitLines_} methods.
 *
 * opKind 'fill' — a run of {@code fillCountWords} identical words starting at
 *                 {@code startWordIndex}; {@code fillValueI32} holds the
 *                 repeated word.
 * opKind 'set'  — a short mixed run starting at {@code startWordIndex};
 *                 {@code setWordsI32} holds each word in order.
 *
 * @private
 * @typedef {{
 *   opKind: string,
 *   startWordIndex: number,
 *   fillValueI32: number,
 *   fillCountWords: number,
 *   setWordsI32: !Array<number>
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.I32InitOp_;

/**
 * Scans a merged Int32Array and classifies non-zero runs into language-neutral
 * {@code I32InitOp_} descriptors.  Zero words are skipped — targets are
 * expected to zero-initialize their backing arrays.
 *
 * Runs of {@code >=16} identical words become 'fill' ops; shorter or mixed
 * runs become 'set' ops.  The classification is identical to the original
 * {@code AsmjsCodegen.emitStaticI32InitLines_} inline logic.
 *
 * @protected
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @return {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectI32InitOps_ = function (i32, startWordIndex) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.I32InitOp_>} */ ops = [];
  // Break-even: >=16 identical i32 words are cheaper as a typed-array fill
  // than as individual per-word stores (empirical, matches asm.js codegen).
  var /** @const {number} */ fillThreshold = 16;
  var /** @type {number} */ index = 0;
  var /** @type {number} */ repeatEnd;
  var /** @const {number} */ endIndex = i32.length;

  while (index !== endIndex) {
    if (0 === i32[index]) {
      ++index;
      continue;
    }

    repeatEnd = index + 1;
    while (repeatEnd !== endIndex && i32[repeatEnd] === i32[index]) {
      ++repeatEnd;
    }

    if (fillThreshold <= repeatEnd - index) {
      ops[ops.length] = {
        opKind: 'fill',
        startWordIndex: startWordIndex + index,
        fillValueI32: i32[index],
        fillCountWords: repeatEnd - index,
        setWordsI32: []
      };
      index = repeatEnd;
      continue;
    }

    var /** @const {number} */ setStart = index;
    var /** @const {!Array<number>} */ setWords = [];

    while (index !== endIndex) {
      if (0 === i32[index]) {
        break;
      }

      repeatEnd = index + 1;
      while (repeatEnd !== endIndex && i32[repeatEnd] === i32[index]) {
        ++repeatEnd;
      }

      if (fillThreshold <= repeatEnd - index) {
        break;
      }

      setWords[setWords.length] = i32[index];
      ++index;
    }

    if (0 !== setWords.length) {
      ops[ops.length] = {
        opKind: 'set',
        startWordIndex: startWordIndex + setStart,
        fillValueI32: 0,
        fillCountWords: 0,
        setWordsI32: setWords
      };
      continue;
    }

    // Reached only when the very first word of the 'set' scan is itself
    // fill-worthy — the inner loop broke immediately, leaving setWords empty.
    // Emit a fill op for that run instead of re-entering the outer loop.
    ops[ops.length] = {
      opKind: 'fill',
      startWordIndex: startWordIndex + index,
      fillValueI32: i32[index],
      fillCountWords: repeatEnd - index,
      setWordsI32: []
    };
    index = repeatEnd;
  }

  return ops;
};

/**
 * Resolves the initial heap size in bytes from {@code options.definitions}.
 * Returns {@code defaultSize} when the key is absent or the parsed value is
 * non-finite or non-positive.
 *
 * Intended for use by language backends that accept a per-backend heap-size
 * define (e.g. ASMJS_HEAP_SIZE, PHP64_HEAP_SIZE).
 *
 * @protected
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {string} definitionKey  Name of the --define entry to look up.
 * @param {number} defaultSize    Fallback heap size in bytes.
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resolveHeapSize_ = function (options, definitionKey, defaultSize) {
  var /** @const {!Object<string, string>} */ definitions = options.definitions;

  if (!Object.prototype.hasOwnProperty.call(definitions, definitionKey)) {
    return defaultSize;
  }

  var /** @const {number} */ candidate = Number(definitions[definitionKey]);
  if (!isFinite(candidate) || 0 >= candidate) {
    return defaultSize;
  }

  return Math.floor(candidate);
};

/**
 * Collects and merges all static memory segments from the wasm module into a
 * single Int32Array.  Used by all language backends.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectStaticMemory_ = function (wasmModule) {
  var /** @const {number} */ numSegments = wasmModule.getNumMemorySegments();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.StaticMemorySegment_>} */ segments = [];

  for (var /** number */ i = 0; i !== numSegments; ++i) {
    var /** @const {!BinaryenMemorySegmentInfo} */ segInfo = wasmModule.getMemorySegmentInfo(String(i));
    segments[segments.length] = {
      byteOffset: segInfo.offset,
      buffer: segInfo.data,
      byteLength: segInfo.data.byteLength
    };
  }

  segments.sort(function (a, b) {
    return a.byteOffset - b.byteOffset;
  });

  if (0 === segments.length) {
    // No data segments present — insert a minimal 4-byte placeholder so the
    // bounds computation below always has at least one entry to work from.
    segments[0] = {
      byteOffset: 0,
      buffer: new ArrayBuffer(4),
      byteLength: 4
    };
  }

  var /** @const {number} */ startOffset = segments[0].byteOffset & ~3;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemorySegment_} */ lastSeg = segments[segments.length - 1];
  var /** @const {number} */ totalLen = (lastSeg.byteOffset + lastSeg.byteLength - startOffset + 3) & ~3;

  var /** @const {!Uint8Array} */ byteArray = new Uint8Array(totalLen);

  for (var /** number */ j = 0, /** @const {number} */ segmentCount = segments.length; j !== segmentCount; ++j) {
    byteArray.set(new Uint8Array(segments[j].buffer), segments[j].byteOffset - startOffset);
  }

  return {
    startWordIndex: Math.trunc(segments[0].byteOffset / 4),
    words: new Int32Array(byteArray.buffer)
  };
};

/**
 * Descriptor for a single wasm-level imported function.
 *
 * @protected
 * @typedef {{
 *   wasmFuncName: string,
 *   importBaseName: string,
 *   importModule: string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_;

/**
 * Collects every imported function from the wasm module.  A function is
 * considered imported when its {@code funcInfo.base} is non-empty.
 *
 * Returns descriptors in module index order so output is deterministic.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectImportedFunctions_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} */ imports = [];

  for (var /** number */ f = 0; f !== numFuncs; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    if ('' !== funcInfo.base) {
      imports[imports.length] = {
        wasmFuncName: funcInfo.name,
        importBaseName: funcInfo.base,
        importModule: funcInfo.module
      };
    }
  }

  return imports;
};

/**
 * Collects the full signature of every wasm function, keyed by internal name.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectFunctionSignatures_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
  var /** @const {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} */ signatures =
      /** @type {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} */ (Object.create(null));

  for (var /** number */ f = 0; f !== numFuncs; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);
    signatures[funcInfo.name] = {
      params: binaryen.expandType(funcInfo.params),
      results: funcInfo.results
    };
  }

  return signatures;
};

/**
 * Descriptor for a single wasm-level function export.
 *
 * {@code stubName} is a safe identifier derived from the internal wasm name —
 * numeric names like {@code "0"} are prefixed with {@code "fn_"} so they are
 * valid in JavaScript and PHP.
 *
 * @protected
 * @typedef {{
 *   exportName: string,
 *   internalName: string,
 *   stubName: string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_;

/**
 * Signature information for a wasm function.
 *
 * @protected
 * @typedef {{
 *   params: !Array<number>,
 *   results: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_;

/**
 * Shared module-level metadata used by concrete backend emitters.
 *
 * @protected
 * @typedef {{
 *   imports: !Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>,
 *   importedNames: !Object<string, string>,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globals: !Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>,
 *   globalTypes: !Object<string, number>,
 *   exports: !Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>,
 *   functions: !Array<!BinaryenFunctionInfo>
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_;

/**
 * Returns a safe identifier for use as a function/variable name.  Names that
 * start with a digit are prefixed with {@code "fn_"}.
 *
 * @protected
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_ = function (name) {
  var /** @const {number} */ ch = name.charCodeAt(0);
  // 0x30 = '0', 0x39 = '9'
  if (48 <= ch && ch <= 57) {
    return 'fn_' + name;
  }
  return name;
};

/**
 * Returns a string of {@code indent} two-space indentation units.
 *
 * @protected
 * @param {number} indent
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.pad_ = function (indent) {
  var /** @type {string} */ s = '';
  for (var /** number */ k = 0; k !== indent; ++k) {
    s += '  ';
  }
  return s;
};

/**
 * Formats a floating-point literal without introducing target-language
 * specific coercion syntax.
 *
 * Concrete backends decide whether the formatted literal needs additional
 * wrapping for f32/f64 semantics.
 *
 * @protected
 * @param {number} value
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_ = function (value) {
  if (!isFinite(value)) {
    return String(value);
  }
  return Math.floor(value) === value ? String(value) + '.0' : String(value);
};

/**
 * Appends every non-empty line from {@code text} to {@code parts}.
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {*} text
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_ = function (parts, text) {
  if ('string' !== typeof text || '' === text) {
    return;
  }

  var /** @const {!Array<string>} */ lines = text.split('\n');
  for (var /** number */ i = 0, /** @const {number} */ lineCount = lines.length; i !== lineCount; ++i) {
    if ('' !== lines[i]) {
      parts[parts.length] = lines[i];
    }
  }
};

/**
 * Shared textual precedence helper for string-based backend emitters.
 *
 * @protected
 * @typedef {{
 *   PREC_ASSIGN_: number,
 *   PREC_CONDITIONAL_: number,
 *   PREC_BIT_OR_: number,
 *   PREC_BIT_XOR_: number,
 *   PREC_BIT_AND_: number,
 *   PREC_EQUALITY_: number,
 *   PREC_RELATIONAL_: number,
 *   PREC_SHIFT_: number,
 *   PREC_ADDITIVE_: number,
 *   PREC_MULTIPLICATIVE_: number,
 *   PREC_UNARY_: number,
 *   PREC_PRIMARY_: number,
 *   isUnaryPosition_: function(string, number): boolean,
 *   isFullyParenthesized: function(string): boolean,
 *   topLevel: function(string): number,
 *   wrap: function(string, number, boolean): string,
 *   renderPrefix: function(string, string): string,
 *   renderInfix: function(string, string, string, number, boolean=): string,
 *   formatCondition: function(string): string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_;

/**
 * Shared textual precedence helper for string-based backend emitters.
 *
 * The helper scans already-rendered expressions and only adds grouping when a
 * caller requests it for precedence/parse correctness. Concrete backends keep
 * their own coercion helpers on top of this while reusing the same grouping
 * rules for infix/prefix rendering and statement conditions.
 *
 * @protected
 * @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_}
 */
Wasm2Lang.Backend.AbstractCodegen.Precedence_ = /** @type {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ ({
  PREC_ASSIGN_: 1,
  PREC_CONDITIONAL_: 2,
  PREC_BIT_OR_: 3,
  PREC_BIT_XOR_: 4,
  PREC_BIT_AND_: 5,
  PREC_EQUALITY_: 6,
  PREC_RELATIONAL_: 7,
  PREC_SHIFT_: 8,
  PREC_ADDITIVE_: 9,
  PREC_MULTIPLICATIVE_: 10,
  PREC_UNARY_: 11,
  PREC_PRIMARY_: 12,

  /**
   * @param {string} expr
   * @param {number} index
   * @return {boolean}
   */
  isUnaryPosition_: function (expr, index) {
    var /** @type {number} */ i = index - 1;

    while (0 <= i && /\s/.test(expr.charAt(i))) {
      --i;
    }
    if (0 > i) {
      return true;
    }

    return -1 !== '([?:=,+-*/%&|^!<>'.indexOf(expr.charAt(i));
  },

  /**
   * @param {string} expr
   * @return {boolean}
   */
  isFullyParenthesized: function (expr) {
    var /** @type {number} */ start = 0;
    var /** @type {number} */ end = expr.length - 1;
    var /** @type {number} */ depth = 0;
    var /** @type {number} */ i = 0;

    while (start <= end && /\s/.test(expr.charAt(start))) {
      start++;
    }
    while (end >= start && /\s/.test(expr.charAt(end))) {
      end--;
    }
    if (start >= end || '(' !== expr.charAt(start) || ')' !== expr.charAt(end)) {
      return false;
    }

    for (i = start; i <= end; ++i) {
      var /** @const {string} */ ch = expr.charAt(i);
      if ('(' === ch) {
        depth++;
      } else if (')' === ch) {
        depth--;
        if (0 === depth && i !== end) {
          return false;
        }
        if (0 > depth) {
          return false;
        }
      }
    }

    return 0 === depth;
  },

  /**
   * @param {string} expr
   * @return {number}
   */
  topLevel: function (expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @const {string} */ s = expr.replace(/^\s+|\s+$/g, '');
    var /** @type {number} */ depthParen = 0;
    var /** @type {number} */ depthBracket = 0;
    var /** @type {boolean} */ inSingle = false;
    var /** @type {boolean} */ inDouble = false;
    var /** @type {boolean} */ escaped = false;
    var /** @type {number} */ lowest = P.PREC_PRIMARY_;
    var /** @type {number} */ i = 0;

    if ('' === s || P.isFullyParenthesized(s)) {
      return P.PREC_PRIMARY_;
    }

    for (i = 0; i < s.length; ++i) {
      var /** @const {string} */ ch = s.charAt(i);
      var /** @const {string} */ next = s.charAt(i + 1);

      if (inSingle) {
        if (escaped) {
          escaped = false;
        } else if ('\\' === ch) {
          escaped = true;
        } else if ("'" === ch) {
          inSingle = false;
        }
        continue;
      }
      if (inDouble) {
        if (escaped) {
          escaped = false;
        } else if ('\\' === ch) {
          escaped = true;
        } else if ('"' === ch) {
          inDouble = false;
        }
        continue;
      }
      if ("'" === ch) {
        inSingle = true;
        continue;
      }
      if ('"' === ch) {
        inDouble = true;
        continue;
      }
      if ('(' === ch) {
        ++depthParen;
        continue;
      }
      if (')' === ch) {
        --depthParen;
        continue;
      }
      if ('[' === ch) {
        ++depthBracket;
        continue;
      }
      if (']' === ch) {
        --depthBracket;
        continue;
      }
      if (0 !== depthParen || 0 !== depthBracket) {
        continue;
      }

      if ('?' === ch) {
        lowest = Math.min(lowest, P.PREC_CONDITIONAL_);
        continue;
      }
      if ('|' === ch) {
        if ('|' !== next) {
          lowest = Math.min(lowest, P.PREC_BIT_OR_);
        }
        continue;
      }
      if ('^' === ch) {
        lowest = Math.min(lowest, P.PREC_BIT_XOR_);
        continue;
      }
      if ('&' === ch) {
        if ('&' !== next) {
          lowest = Math.min(lowest, P.PREC_BIT_AND_);
        }
        continue;
      }
      if ('=' === ch) {
        if ('=' === next) {
          lowest = Math.min(lowest, P.PREC_EQUALITY_);
          if ('=' === s.charAt(i + 2)) {
            i += 2;
          } else {
            i += 1;
          }
          continue;
        }
        if ('!' !== s.charAt(i - 1) && '<' !== s.charAt(i - 1) && '>' !== s.charAt(i - 1)) {
          lowest = Math.min(lowest, P.PREC_ASSIGN_);
        }
        continue;
      }
      if ('!' === ch) {
        if ('=' === next) {
          lowest = Math.min(lowest, P.PREC_EQUALITY_);
          if ('=' === s.charAt(i + 2)) {
            i += 2;
          } else {
            i += 1;
          }
          continue;
        }
        if (P.isUnaryPosition_(s, i)) {
          lowest = Math.min(lowest, P.PREC_UNARY_);
        }
        continue;
      }
      if ('<' === ch) {
        if ('<' === next) {
          lowest = Math.min(lowest, P.PREC_SHIFT_);
          i += 1;
        } else {
          lowest = Math.min(lowest, P.PREC_RELATIONAL_);
          if ('=' === next) {
            i += 1;
          }
        }
        continue;
      }
      if ('>' === ch) {
        if ('>' === next) {
          lowest = Math.min(lowest, P.PREC_SHIFT_);
          if ('>' === s.charAt(i + 2)) {
            i += 2;
          } else {
            i += 1;
          }
        } else {
          lowest = Math.min(lowest, P.PREC_RELATIONAL_);
          if ('=' === next) {
            i += 1;
          }
        }
        continue;
      }
      if ('+' === ch || '-' === ch) {
        if (!P.isUnaryPosition_(s, i)) {
          lowest = Math.min(lowest, P.PREC_ADDITIVE_);
        }
        continue;
      }
      if ('*' === ch || '/' === ch || '%' === ch) {
        lowest = Math.min(lowest, P.PREC_MULTIPLICATIVE_);
      }
    }

    return lowest;
  },

  /**
   * @param {string} expr
   * @param {number} requiredPrecedence
   * @param {boolean} allowEqual
   * @return {string}
   */
  wrap: function (expr, requiredPrecedence, allowEqual) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @const {number} */ actualPrecedence = P.topLevel(expr);

    if (
      P.isFullyParenthesized(expr) ||
      actualPrecedence > requiredPrecedence ||
      (allowEqual && actualPrecedence === requiredPrecedence)
    ) {
      return expr;
    }
    return '(' + expr + ')';
  },

  /**
   * @param {string} op
   * @param {string} expr
   * @return {string}
   */
  renderPrefix: function (op, expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return op + P.wrap(expr, P.PREC_UNARY_, true);
  },

  /**
   * @param {string} L
   * @param {string} op
   * @param {string} R
   * @param {number} precedence
   * @param {boolean=} opt_allowRightEqual
   * @return {string}
   */
  renderInfix: function (L, op, R, precedence, opt_allowRightEqual) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return P.wrap(L, precedence, true) + ' ' + op + ' ' + P.wrap(R, precedence, !!opt_allowRightEqual);
  },

  /**
   * @param {string} expr
   * @return {string}
   */
  formatCondition: function (expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    if ('' === expr) {
      return '(0)';
    }
    if (P.isFullyParenthesized(expr)) {
      return expr;
    }
    return '(' + expr + ')';
  }
});

/**
 * Collects every function export from the wasm module.  Non-function exports
 * (memories, globals, tables) are silently skipped.
 *
 * Returns descriptors in export index order so output is deterministic.
 * Multiple exports that target the same internal function will appear as
 * separate entries — callers handle deduplication.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectExportedFunctions_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numExports = wasmModule.getNumExports();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>} */ exports = [];

  for (var /** number */ e = 0; e !== numExports; ++e) {
    var /** @const {number} */ exportPtr = wasmModule.getExportByIndex(e);
    var /** @const {!BinaryenExportInfo} */ exportInfo = binaryen.getExportInfo(exportPtr);

    if (binaryen.ExternalFunction !== exportInfo.kind) {
      continue;
    }

    exports[exports.length] = {
      exportName: exportInfo.name,
      internalName: exportInfo.value,
      stubName: Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(exportInfo.value)
    };
  }

  return exports;
};

/**
 * Collects every non-imported function from the wasm module in module index
 * order.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Array<!BinaryenFunctionInfo>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectDefinedFunctions_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
  var /** @const {!Array<!BinaryenFunctionInfo>} */ functions = [];

  for (var /** number */ f = 0; f !== numFuncs; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    if ('' === funcInfo.base) {
      functions[functions.length] = funcInfo;
    }
  }

  return functions;
};

/**
 * Descriptor for a single wasm-level module global variable.
 *
 * @protected
 * @typedef {{
 *   globalName: string,
 *   globalType: number,
 *   globalMutable: boolean,
 *   globalInitValue: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_;

/**
 * Collects every non-imported global variable from the wasm module.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectGlobals_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numGlobals = wasmModule.getNumGlobals();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} */ globals = [];

  for (var /** number */ i = 0; i !== numGlobals; ++i) {
    var /** @const {number} */ globalPtr = wasmModule.getGlobalByIndex(i);
    var /** @const {!BinaryenGlobalInfo} */ globalInfo = binaryen.getGlobalInfo(globalPtr);
    if ('' !== globalInfo.base) {
      continue;
    }
    var /** @const {!BinaryenExpressionInfo} */ initExpr = binaryen.getExpressionInfo(globalInfo.init);
    globals[globals.length] = {
      globalName: globalInfo.name,
      globalType: globalInfo.type,
      globalMutable: !!globalInfo.mutable,
      globalInitValue: /** @type {number} */ (initExpr.value) || 0
    };
  }

  return globals;
};

/**
 * Builds a lookup table from internal wasm function name to import base name.
 *
 * @protected
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @return {!Object<string, string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectImportedNameMap_ = function (imports) {
  var /** @const {!Object<string, string>} */ importedNames = /** @type {!Object<string, string>} */ (Object.create(null));

  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    importedNames[imports[i].wasmFuncName] = imports[i].importBaseName;
  }

  return importedNames;
};

/**
 * Builds a lookup table from global name to wasm value type.
 *
 * @protected
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @return {!Object<string, number>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectGlobalTypeMap_ = function (globals) {
  var /** @const {!Object<string, number>} */ globalTypes = /** @type {!Object<string, number>} */ (Object.create(null));

  for (var /** number */ i = 0, /** @const {number} */ globalCount = globals.length; i !== globalCount; ++i) {
    globalTypes[globals[i].globalName] = globals[i].globalType;
  }

  return globalTypes;
};

/**
 * Collects the module-level metadata shared by concrete emitters.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectModuleCodegenInfo_ = function (wasmModule) {
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} */ imports =
      this.collectImportedFunctions_(wasmModule);
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} */ globals = this.collectGlobals_(wasmModule);

  return {
    imports: imports,
    importedNames: this.collectImportedNameMap_(imports),
    functionSignatures: this.collectFunctionSignatures_(wasmModule),
    globals: globals,
    globalTypes: this.collectGlobalTypeMap_(globals),
    exports: this.collectExportedFunctions_(wasmModule),
    functions: this.collectDefinedFunctions_(wasmModule)
  };
};

/**
 * Backend hook for wasm-type coercion used by the shared typed-string helpers.
 *
 * Concrete backends override this with target-language coercion rules.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderCoercionByType_ = function (binaryen, expr, wasmType) {
  void binaryen;
  void wasmType;
  return expr;
};

/**
 * Coerces {@code expr} to {@code wasmType}, skipping the coercion when
 * {@code cat} indicates the expression already satisfies the target type.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} expr
 * @param {number} cat  Expression category (I32Coercion constant or CAT_*).
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceToType_ = function (binaryen, expr, cat, wasmType) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    if (C.SIGNED === cat || C.FIXNUM === cat) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    if (A.CAT_F32 === cat) return expr;
  } else if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    if (A.CAT_F64 === cat) return expr;
  }
  return this.renderCoercionByType_(binaryen, expr, wasmType);
};

/**
 * Shared typed helper-call rendering for string-expression backends.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} helperName
 * @param {!Array<string>} args
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderHelperCall_ = function (binaryen, helperName, args, resultType) {
  this.markHelper_(helperName);
  return this.renderCoercionByType_(binaryen, helperName + '(' + args.join(', ') + ')', resultType);
};

/**
 * Backend hook returning the runtime helper prefix (for example {@code "$w2l_"}
 * in asm.js and {@code "_w2l_"} in PHP).
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '';
};

/**
 * Backend hook turning a relational-condition expression into an i32 result.
 *
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return conditionExpr;
};

/**
 * Shared rendering for non-i32 numeric binary operations.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_ADDITIVE_;

  if (info.isComparison) {
    return this.renderNumericComparisonResult_(P.renderInfix(L, info.operator, R, P.PREC_RELATIONAL_));
  }

  if ('mul' === info.name || 'div' === info.name) {
    precedence = P.PREC_MULTIPLICATIVE_;
  }

  if ('min' === info.name || 'max' === info.name || 'copysign' === info.name) {
    return this.renderHelperCall_(
      binaryen,
      this.getRuntimeHelperPrefix_() + info.name + '_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, info.resultType),
      [L, R],
      info.resultType
    );
  }

  return this.renderCoercionByType_(binaryen, P.renderInfix(L, info.operator, R, precedence), info.resultType);
};

/**
 * Shared rendering for non-i32 numeric unary operations and conversions.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ helperName = this.getRuntimeHelperPrefix_() + info.name;

  if ('neg' === info.name) {
    return this.renderCoercionByType_(binaryen, P.renderPrefix('-', valueExpr), info.resultType);
  }

  if (
    'abs' === info.name ||
    'ceil' === info.name ||
    'floor' === info.name ||
    'trunc' === info.name ||
    'nearest' === info.name ||
    'sqrt' === info.name
  ) {
    helperName += '_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, info.operandType);
  }

  return this.renderHelperCall_(binaryen, helperName, [valueExpr], info.resultType);
};

/**
 * Builds the coerced argument list for a direct wasm call expression.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Object<string, *>} expr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.buildCoercedCallArgs_ = function (
  binaryen,
  expr,
  childResults,
  functionSignatures
) {
  var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ callSig = functionSignatures[callTarget] || {
      params: [],
      results: /** @type {number} */ (expr['type'])
    };
  var /** @const {!Array<number>} */ operands = /** @type {!Array<number>} */ (expr['operands']) || [];
  var /** @const {!Array<string>} */ callArgs = [];

  for (var /** number */ ai = 0, /** @const {number} */ alen = childResults.length; ai !== alen; ++ai) {
    var /** @const {*} */ argValue = childResults[ai].childTraversalResult;
    var /** @type {string} */ argStr;
    var /** @type {number} */ argCat;
    if ('string' === typeof argValue) {
      argStr = argValue;
      argCat = Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
    } else if (argValue && 'string' === typeof argValue['s']) {
      argStr = /** @type {string} */ (argValue['s']);
      argCat =
        'number' === typeof argValue['c'] ? /** @type {number} */ (argValue['c']) : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
    } else {
      argStr = '0';
      argCat = Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
    }
    var /** @const {number} */ argType =
        ai < callSig.params.length ? callSig.params[ai] : binaryen.getExpressionInfo(operands[ai]).type;
    callArgs[callArgs.length] = this.coerceToType_(binaryen, argStr, argCat, argType);
  }

  return callArgs;
};

/**
 * Backend-provided renderers for i32 binary-op categories.
 *
 * Concrete backends supply target-language syntax for each category while the
 * shared dispatcher keeps the {@code I32Coercion.OP_*} switch in one place.
 *
 * @protected
 * @typedef {{
 *   renderArithmetic: function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string,
 *   renderMultiply: function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string,
 *   renderDivision: function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string,
 *   renderBitwise: function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string,
 *   renderRotate: function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string,
 *   renderComparison: function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string,
 *   renderUnknown: (function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string|undefined)
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_;

/**
 * Dispatches a classified i32 binary operation to backend-specific renderers.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @param {!Wasm2Lang.Backend.AbstractCodegen.BinaryOpRenderer_} renderer
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderBinaryOpByCategory_ = function (info, L, R, renderer) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;

  if (C.OP_ARITHMETIC === info.category) {
    return renderer.renderArithmetic.call(this, info, L, R);
  } else if (C.OP_MULTIPLY === info.category) {
    return renderer.renderMultiply.call(this, info, L, R);
  } else if (C.OP_DIVISION === info.category) {
    return renderer.renderDivision.call(this, info, L, R);
  } else if (C.OP_BITWISE === info.category) {
    return renderer.renderBitwise.call(this, info, L, R);
  } else if (C.OP_ROTATE === info.category) {
    return renderer.renderRotate.call(this, info, L, R);
  } else if (C.OP_COMPARISON === info.category) {
    return renderer.renderComparison.call(this, info, L, R);
  }

  if ('function' === typeof renderer.renderUnknown) {
    return renderer.renderUnknown.call(this, info, L, R);
  }
  return '(__unknown_binop(' + L + ', ' + R + '))';
};

/**
 * Walks a single function body with the provided visitor.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @return {*}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.walkFunctionBody_ = function (wasmModule, binaryen, funcInfo, visitor) {
  var /** @const {number} */ bodyPtr = funcInfo.body;
  if (0 === bodyPtr) {
    return '';
  }

  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
      binaryen: binaryen,
      treeModule: wasmModule,
      functionInfo: funcInfo,
      treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
      ancestors: []
    };

  return Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(bodyPtr, ctx, visitor);
};

/**
 * Maps a Binaryen expression ID to a short readable name for the skeleton
 * output.  Uses a lazily-cached lookup object instead of a long equality
 * chain.  Shared with other backends (e.g. AsmjsCodegen).
 *
 * @param {!Binaryen} binaryen
 * @param {number} id
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.idName_ = function (binaryen, id) {
  var /** @type {?Object<number, string>} */ names = Wasm2Lang.Backend.AbstractCodegen.idNames_;

  if (!names) {
    names = Object.create(null);
    names[binaryen.BlockId] = 'block';
    names[binaryen.IfId] = 'if';
    names[binaryen.LoopId] = 'loop';
    names[binaryen.BreakId] = 'br';
    names[binaryen.SwitchId] = 'br_table';
    names[binaryen.LocalGetId] = 'local.get';
    names[binaryen.LocalSetId] = 'local.set';
    names[binaryen.GlobalGetId] = 'global.get';
    names[binaryen.GlobalSetId] = 'global.set';
    names[binaryen.ConstId] = 'const';
    names[binaryen.UnaryId] = 'unary';
    names[binaryen.BinaryId] = 'binary';
    names[binaryen.SelectId] = 'select';
    names[binaryen.DropId] = 'drop';
    names[binaryen.ReturnId] = 'return';
    names[binaryen.CallId] = 'call';
    names[binaryen.CallIndirectId] = 'call_indirect';
    names[binaryen.LoadId] = 'load';
    names[binaryen.StoreId] = 'store';
    names[binaryen.NopId] = 'nop';
    names[binaryen.UnreachableId] = 'unreachable';
    names[binaryen.MemorySizeId] = 'memory.size';
    names[binaryen.MemoryGrowId] = 'memory.grow';
    Wasm2Lang.Backend.AbstractCodegen.idNames_ = names;
  }

  var /** @const {*} */ name = names[id];
  return 'string' === typeof name ? name : 'expr(' + id + ')';
};

/**
 * Mutable state threaded through the abstract codegen traversal enter callback.
 *
 * @private
 * @typedef {{
 *   nodeCount: number,
 *   seenIds: !Object<string, boolean>,
 *   seenIdNames: !Array<string>,
 *   binaryen: !Binaryen
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.TraversalState_;

/**
 * Visitor enter callback for the abstract codegen traversal.  Counts nodes and
 * records each distinct expression-id encountered.
 *
 * Designed to be partially applied via {@code .bind(null, state)} so the
 * resulting function matches the {@code TraversalEnterCallback} signature.
 *
 * @private
 * @param {!Wasm2Lang.Backend.AbstractCodegen.TraversalState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.traversalEnter_ = function (state, nodeCtx) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (
      nodeCtx.expression
    );
  var /** @const {number} */ id = expression.id;
  var /** @const {string} */ idKey = String(id);
  ++state.nodeCount;

  if (!state.seenIds[idKey]) {
    state.seenIds[idKey] = true;
    state.seenIdNames[state.seenIdNames.length] = this.idName_(state.binaryen, id);
  }

  return null;
};

/**
 * Traversal-driven backend emission.  Walks every non-imported function body
 * with the TraversalKernel and emits a skeleton string — one comment line per
 * function with the traversal node count.  Replace the visitor body with real
 * string-building logic to produce target language code.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode = function (wasmModule, options) {
  void options;
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {!Array<!BinaryenFunctionInfo>} */ functions = this.collectDefinedFunctions_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TraversalState_} */ traversalState = {
      nodeCount: 0,
      seenIds: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      seenIdNames: [],
      binaryen: binaryen
    };

  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
      enter: this.traversalEnter_.bind(this, traversalState)
    });

  for (var /** number */ f = 0, /** @const {number} */ funcCount = functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = functions[f];
    traversalState.nodeCount = 0;
    this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);

    outputParts[outputParts.length] = '// ' + funcInfo.name + ' [nodes:' + traversalState.nodeCount + ']';
  }

  outputParts[outputParts.length] =
    '// [ids seen: ' + (0 !== traversalState.seenIdNames.length ? traversalState.seenIdNames.join(', ') : '(none)') + ']';

  return outputParts.join('\n');
};
