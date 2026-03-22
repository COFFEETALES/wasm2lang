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
  var /** @const {(function(new: Wasm2Lang.Backend.AbstractCodegen)|void)} */ ctor = Wasm2Lang.Backend.registry_[languageId];
  if (ctor) {
    return new ctor();
  }
  return new Wasm2Lang.Backend.AbstractCodegen();
};

// ---------------------------------------------------------------------------
// Mangler profile registry.
//
// Defined here (abstract_codegen.js) rather than in identifier_mangler.js so
// that concrete backends, which load before the mangler, can register their
// profiles at declaration time.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   reservedWords: !Object<string, boolean>,
 *   singleCharset: string,
 *   blockCharset: string,
 *   caseInsensitive: boolean
 * }}
 */
Wasm2Lang.Backend.ManglerProfile;

/**
 * Profile registry populated by backends via {@code registerManglerProfile}.
 *
 * @private
 * @const {!Object<string, !Wasm2Lang.Backend.ManglerProfile>}
 */
Wasm2Lang.Backend.manglerProfileRegistry_ = Object.create(null);

/**
 * Registers a mangler profile for a backend language.  Called by each
 * concrete backend alongside {@code Backend.registerBackend}.
 *
 * @param {string} languageId
 * @param {!Wasm2Lang.Backend.ManglerProfile} profile
 * @return {void}
 */
Wasm2Lang.Backend.registerManglerProfile = function (languageId, profile) {
  Wasm2Lang.Backend.manglerProfileRegistry_[languageId] = profile;
};

/**
 * Returns the mangler profile registered for the given language, or
 * {@code undefined} if none has been registered.
 *
 * @param {string} languageId
 * @return {!Wasm2Lang.Backend.ManglerProfile|void}
 */
Wasm2Lang.Backend.getManglerProfile = function (languageId) {
  return Wasm2Lang.Backend.manglerProfileRegistry_[languageId];
};

/**
 * Builds a reserved-word lookup table from an array of words.
 *
 * @param {!Array<string>} words
 * @return {!Object<string, boolean>}
 */
Wasm2Lang.Backend.buildReservedSet = function (words) {
  var /** @const {!Object<string, boolean>} */ set = /** @type {!Object<string, boolean>} */ (Object.create(null));
  for (var /** number */ i = 0, /** @const {number} */ wordLen = words.length; i < wordLen; ++i) {
    set[words[i]] = true;
  }
  return set;
};

/**
 * @constructor
 */
Wasm2Lang.Backend.AbstractCodegen = function () {
  /** @protected @type {?Object<string, boolean>} */
  this.usedHelpers_ = null;

  /** @protected @type {?Object<string, boolean>} */
  this.usedBindings_ = null;

  /** @protected @type {?Wasm2Lang.Backend.IdentifierMangler} */
  this.mangler_ = null;

  /** @private @type {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */
  this.passRunResultIndex_ = null;

  /**
   * When true, coerceToType_ skips f64 coercion for CAT_F32 expressions
   * (the language auto-widens float to double).  Set by Java and PHP.
   * @protected @type {boolean}
   */
  this.f32WidensToF64_ = false;
};

/**
 * Stores the pass-run result so backends can read per-function metadata
 * (e.g. localInitOverrides from LocalInitFoldingPass).
 *
 * @param {!Wasm2Lang.Wasm.Tree.PassRunResult} result
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.setPassRunResult_ = function (result) {
  // prettier-ignore
  var /** @const {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ index =
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ (Object.create(null));
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcs = result.functions;
  for (var /** number */ i = 0, /** @const {number} */ len = funcs.length; i !== len; ++i) {
    var /** @const {string|void} */ name = funcs[i].passFuncName;
    if (name) {
      index[name] = funcs[i];
    }
  }
  this.passRunResultIndex_ = index;
};

/**
 * Returns the local-init overrides for a given function, or null if none.
 * Delegates to LocalInitFoldingApplication.
 *
 * @protected
 * @param {string} funcName
 * @return {?Object<string, number>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getLocalInitOverrides_ = function (funcName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingApplication.getLocalInitOverrides(this.passRunResultIndex_, funcName);
};

/**
 * Returns the loop plan for a given function and loop name, or null if none.
 * Delegates to LoopSimplificationApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} loopName
 * @return {?Wasm2Lang.Wasm.Tree.LoopPlan}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getLoopPlan_ = function (funcName, loopName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.getLoopPlan(
    this.passRunResultIndex_,
    funcName,
    loopName
  );
};

/**
 * Returns the BlockFusionPlan for the given block, or null.
 * Delegates to BlockLoopFusionApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} blockName
 * @return {?Wasm2Lang.Wasm.Tree.BlockFusionPlan}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getBlockFusionPlan_ = function (funcName, blockName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication.getBlockFusionPlan(
    this.passRunResultIndex_,
    funcName,
    blockName
  );
};

/**
 * Returns true if the given block is a switch-dispatch block.
 * Delegates to SwitchDispatchApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.isBlockSwitchDispatch_ = function (funcName, blockName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.isBlockSwitchDispatch(
    this.passRunResultIndex_,
    funcName,
    blockName
  );
};

/**
 * Returns true if the given block is a root-switch block.
 * Delegates to SwitchDispatchApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.isBlockRootSwitch_ = function (funcName, blockName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.isBlockRootSwitch(
    this.passRunResultIndex_,
    funcName,
    blockName
  );
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

/**
 * Records a module-level binding name as used (heap views, stdlib imports).
 *
 * @protected
 * @param {string} name
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.markBinding_ = function (name) {
  if (this.usedBindings_) {
    this.usedBindings_[name] = true;
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
 *   segmentByteOffset_: number,
 *   segmentBuffer_: !ArrayBuffer,
 *   segmentByteLength_: number
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
      segmentByteOffset_: segInfo.offset,
      segmentBuffer_: segInfo.data,
      segmentByteLength_: segInfo.data.byteLength
    };
  }

  segments.sort(function (a, b) {
    return a.segmentByteOffset_ - b.segmentByteOffset_;
  });

  if (0 === segments.length) {
    // No data segments present — insert a minimal 4-byte placeholder so the
    // bounds computation below always has at least one entry to work from.
    segments[0] = {
      segmentByteOffset_: 0,
      segmentBuffer_: new ArrayBuffer(4),
      segmentByteLength_: 4
    };
  }

  var /** @const {number} */ startOffset = segments[0].segmentByteOffset_ & ~3;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemorySegment_} */ lastSeg = segments[segments.length - 1];
  var /** @const {number} */ totalLen = (lastSeg.segmentByteOffset_ + lastSeg.segmentByteLength_ - startOffset + 3) & ~3;

  var /** @const {!Uint8Array} */ byteArray = new Uint8Array(totalLen);

  for (var /** number */ j = 0, /** @const {number} */ segmentCount = segments.length; j !== segmentCount; ++j) {
    byteArray.set(new Uint8Array(segments[j].segmentBuffer_), segments[j].segmentByteOffset_ - startOffset);
  }

  return {
    startWordIndex: Math.trunc(segments[0].segmentByteOffset_ / 4),
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
      sigParams: binaryen.expandType(funcInfo.params),
      sigRetType: funcInfo.results
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
 *   sigParams: !Array<number>,
 *   sigRetType: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_;

/**
 * Shared module-level metadata used by concrete backend emitters.
 *
 * @protected
 * @typedef {{
 *   impFuncs: !Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>,
 *   importedNames: !Object<string, string>,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globals: !Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>,
 *   globalTypes: !Object<string, number>,
 *   expFuncs: !Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>,
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
 * Resolves a candidate identifier against a reserved-word set.  If the name
 * collides, appends {@code "_"} until it is no longer reserved.
 *
 * @protected
 * @param {string} name
 * @param {!Object<string, boolean>} reservedWords  Lookup table (keys are
 *     reserved words, all lowercase for case-insensitive languages).
 * @param {boolean=} opt_caseInsensitive  When true, the check lowercases
 *     the candidate before testing (for PHP-style case-insensitive keywords).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_ = function (name, reservedWords, opt_caseInsensitive) {
  var /** @type {string} */ check = opt_caseInsensitive ? name.toLowerCase() : name;
  while (reservedWords[check]) {
    name = name + '_';
    check = opt_caseInsensitive ? name.toLowerCase() : name;
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
  if (0 === value && 1 / value < 0) {
    return '-0.0';
  }
  var /** @const {string} */ s = String(value);
  if (Math.floor(value) === value && -1 === s.indexOf('e') && -1 === s.indexOf('E')) {
    return s + '.0';
  }
  return s;
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
 * @private
 * @typedef {{
 *   hasExpression: boolean,
 *   expressionString: string,
 *   expressionCategory: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_;

/**
 * Normalizes one traversal child result into the string/category shape used
 * by string-emitting backends.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} index
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_}
 */
Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_ = function (childResults, index) {
  if (index >= childResults.length) {
    return {
      hasExpression: false,
      expressionString: '0',
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }

  var /** @const {*} */ value = childResults[index].childTraversalResult;
  if ('string' === typeof value) {
    return {
      hasExpression: true,
      expressionString: value,
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }
  if (value && 'string' === typeof value['s']) {
    return {
      hasExpression: true,
      expressionString: /** @type {string} */ (value['s']),
      expressionCategory:
        'number' === typeof value['c'] ? /** @type {number} */ (value['c']) : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }

  return {
    hasExpression: false,
    expressionString: '0',
    expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
  };
};

// ---------------------------------------------------------------------------
// Switch-dispatch flat-switch extraction (shared by all backends).
// ---------------------------------------------------------------------------

/**
 * Marker prefix that the switch-dispatch-detection pass prepends to the outer
 * block of a br_table dispatch.  After the label-prefixing pass this becomes
 * {@code 'sw$'}.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.SW_DISPATCH_PREFIX_ = 'sw$';

/**
 * Prefix for blocks fused with their sole-child/sole-parent loop by the
 * BlockLoopFusionPass.  Backend emitters that see this prefix suppress the
 * block wrapper and redirect breaks targeting the block to the associated loop.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_ = 'lb$';

/**
 * Prefix for loops whose trailing self-continue was removed by the
 * LoopSimplificationPass.  Backend emitters emit `for(;;)` with no
 * trailing break.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LC_CONTINUE_PREFIX_ = 'lc$';

/**
 * Prefix for loops converted to do-while by the LoopSimplificationPass.
 * The body block's last child is the bare condition expression.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LD_DOWHILE_PREFIX_ = 'ld$';

/**
 * Prefix for label-elided for(;;) loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LF_FORLOOP_PREFIX_ = 'lf$';

/**
 * Prefix for label-elided do-while loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LE_DOWHILE_PREFIX_ = 'le$';

/**
 * Prefix for labeled while loops (condition hoisted from loop body).
 * The body block's last child is the inverted condition expression.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LW_WHILE_PREFIX_ = 'lw$';

/**
 * Prefix for label-elided while loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LY_WHILE_PREFIX_ = 'ly$';

/**
 * Prefix for the outermost block of a root-switch-loop pattern detected by
 * the RootSwitchDetectionPass.  Backend emitters that see this prefix
 * collapse the outer block wrappers into a single loop+switch with exit
 * paths inlined into the switch cases.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.RS_ROOT_SWITCH_PREFIX_ = 'rs$';

/**
 * Returns true when {@code name} starts with {@code prefix}.
 *
 * Replaces the repeated {@code 0 === name.indexOf(prefix)} idiom across all
 * backend and pass code, improving readability without changing semantics.
 *
 * @protected
 * @param {string} name
 * @param {string} prefix
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.hasPrefix_ = function (name, prefix) {
  return 0 === name.indexOf(prefix);
};

/**
 * Returns true if the given loop name carries a label-elided prefix,
 * meaning backends should omit the label and emit plain break/continue.
 * Delegates to LoopSimplificationApplication.
 *
 * @protected
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isLabelElided = function (name) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.isLabelElided(name);
};

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */
Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_;

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */
Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_;

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo} */
Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_;

/**
 * Shared state shape for labeled-break backends (asm.js, Java).
 * Both AsmjsCodegen.EmitState_ and JavaCodegen.EmitState_ are structural
 * subtypes of this (they carry all these fields plus backend-specific ones).
 *
 * @protected
 * @typedef {{
 *   binaryen: !Binaryen,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   functionInfo: !BinaryenFunctionInfo,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   labelMap: !Object<string, number>,
 *   labelKinds: !Object<string, string>,
 *   fusedBlockToLoop: !Object<string, string>,
 *   pendingBlockFusion: string,
 *   currentLoopName: string,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_;

/**
 * Coerces the flat-switch condition expression before emission.
 * Default returns the expression unchanged; asm.js overrides to apply
 * signed coercion ({@code |0}).
 *
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return condStr;
};

/**
 * Shared enter callback for labeled-break backends (asm.js, Java).
 * Records label kinds, handles block-loop fusion, and adjusts indent.
 * PHP overrides its own {@code emitEnter_} entirely (uses labelStack).
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLabeledEnter_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ hp = A.hasPrefix_;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr['name']);
    if (bName) {
      state.labelKinds[bName] = 'block';
      var /** @const {string} */ fName = state.functionInfo.name;
      var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ fusionPlan = this.getBlockFusionPlan_(fName, bName);
      if (fusionPlan) {
        if ('a' === fusionPlan.fusionVariant) {
          state.pendingBlockFusion = bName;
        } else {
          state.fusedBlockToLoop[bName] = state.currentLoopName;
        }
      } else if (this.isBlockRootSwitch_(fName, bName)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (this.isBlockSwitchDispatch_(fName, bName)) {
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.LB_FUSION_PREFIX_)) {
        // Prefix fallback for when plans are not available.
        var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (expr['children']);
        if (ch && 1 === ch.length && binaryen.getExpressionInfo(ch[0]).id === binaryen.LoopId) {
          state.pendingBlockFusion = bName;
        } else {
          state.fusedBlockToLoop[bName] = state.currentLoopName;
        }
      } else if (hp(bName, A.RS_ROOT_SWITCH_PREFIX_)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.SW_DISPATCH_PREFIX_)) {
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else {
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
    state.labelKinds[loopName] = 'loop';
    state.currentLoopName = loopName;
    ++state.indent;
    if ('' !== state.pendingBlockFusion) {
      state.fusedBlockToLoop[state.pendingBlockFusion] = loopName;
      state.pendingBlockFusion = '';
    }
  } else if (binaryen.IfId === id) {
    ++state.indent;
  }

  return null;
};

/**
 * Default flat-switch emitter for labeled-break backends.
 * Java overrides to also set {@code lastExprIsTerminal}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledFlatSwitch(this, state, nodeCtx).emittedString;
};

/**
 * Default root-switch emitter for labeled-break backends.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledRootSwitch(this, state, nodeCtx);
};

/**
 * Default enter callback for labeled-break backends.
 * PHP overrides entirely (uses labelStack).
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  return this.emitLabeledEnter_(state, nodeCtx);
};

/**
 * Shared leave-callback indent adjustment for labeled-break backends.
 * Decrements state.indent for LoopId, IfId, and named blocks (excluding
 * fused blocks and root-switch blocks).  PHP overrides its leave callback
 * entirely because it additionally pops labelStack entries.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.adjustLeaveIndent_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  if (binaryen.LoopId === id || binaryen.IfId === id) {
    --state.indent;
  } else if (binaryen.BlockId === id && expr['name']) {
    var /** @const {string} */ bn = /** @type {string} */ (expr['name']);
    var /** @const {string} */ fn = state.functionInfo.name;
    var /** @const {boolean} */ isFused =
        !!this.getBlockFusionPlan_(fn, bn) || 0 === bn.indexOf(Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_);
    var /** @const {boolean} */ isRootSwitch =
        this.isBlockRootSwitch_(fn, bn) || 0 === bn.indexOf(Wasm2Lang.Backend.AbstractCodegen.RS_ROOT_SWITCH_PREFIX_);
    if (!isFused && !isRootSwitch) {
      --state.indent;
    }
  }
};

/**
 * Assembles child result strings into the body of a block node.
 * Shared across all three backends — the loop and semicolon-appending
 * logic is identical; only the final block wrapping differs per backend.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} emitCount  Number of children to assemble (may exclude
 *     trailing condition expression for do-while/while bodies).
 * @param {number} childInd   Indentation level for expression-statement lines.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.assembleBlockChildren_ = function (childResults, emitCount, childInd) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Array<string>} */ lines = [];
  for (var /** number */ bi = 0; bi < emitCount; ++bi) {
    var /** @const {string} */ childCode = A.getChildResultInfo_(childResults, bi).expressionString;
    if ('' !== childCode) {
      if (-1 === childCode.indexOf('\n')) {
        lines[lines.length] = pad(childInd) + childCode + ';\n';
      } else {
        lines[lines.length] = childCode;
      }
    }
  }
  return lines.join('');
};

/**
 * Wraps a single break/continue statement in a conditional if the break
 * expression has a condition pointer.  Shared across all three backends
 * for the common BreakId conditional-wrapping pattern.
 *
 * @protected
 * @param {number} ind   Current indentation level.
 * @param {number} condPtr  Condition pointer (0 = unconditional).
 * @param {string} condExpr  Rendered condition expression (from child result).
 * @param {string} stmt  The break/continue statement string (including trailing newline).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitConditionalStatement_ = function (ind, condPtr, condExpr, stmt) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  if (0 !== condPtr) {
    return pad(ind) + 'if ' + this.formatCondition_(condExpr) + ' {\n' + pad(ind + 1) + stmt + pad(ind) + '}\n';
  }
  return pad(ind) + stmt;
};

/**
 * Emits a BreakId with root-switch exit interception for labeled-break backends.
 * Returns the rendered result string and whether the break is terminal (needed
 * by Java to suppress unreachable trailing break statements).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {number} indent
 * @param {string} brName
 * @param {number} brCondPtr
 * @param {string} condExpr
 * @return {{emittedString: string, isTerminal: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBreakStatement_ = function (state, indent, brName, brCondPtr, condExpr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (state.rootSwitchExitMap) {
    if (brName in state.rootSwitchExitMap) {
      var /** @const {!Array<string>} */ rsExitLines = [];
      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ rsVis =
        /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
      var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
      var /** @const {boolean} */ rsIsTerminal = SDA.emitRootSwitchExitCode(
          rsExitLines,
          state.wasmModule,
          binaryen,
          state.functionInfo,
          rsVis,
          state.rootSwitchExitMap[brName],
          indent
        );
      if (!rsIsTerminal) {
        rsExitLines[rsExitLines.length] =
          pad(indent) + this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
      }
      var /** @type {string} */ rsResult;
      if (0 !== brCondPtr) {
        rsResult = pad(indent) + 'if ' + this.formatCondition_(condExpr) + ' {\n' + rsExitLines.join('') + pad(indent) + '}\n';
      } else {
        rsResult = rsExitLines.join('');
      }
      return {emittedString: rsResult, isTerminal: true};
    }
    if (brName === state.rootSwitchRsName) {
      var /** @const {string} */ rsBreakStmt = this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
      return {
        emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, rsBreakStmt),
        isTerminal: 0 === brCondPtr
      };
    }
  }

  var /** @const {string} */ brStmt = this.resolveBreakTarget_(
      state.labelKinds,
      state.fusedBlockToLoop,
      state.labelMap,
      brName
    );
  return {emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, brStmt), isTerminal: 0 === brCondPtr};
};

/**
 * Emits a raw SwitchId (br_table not detected as flat-switch dispatch) for
 * labeled-break backends.  Returns the rendered switch and whether a default
 * case is present (needed by Java to track terminal state).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {number} indent
 * @param {string} condExpr
 * @param {!Array<string>} names
 * @param {string} defaultName
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSwitchStatement_ = function (state, indent, condExpr, names, defaultName) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ lines = [];
  lines[lines.length] = pad(indent) + 'switch (' + this.coerceSwitchCondition_(condExpr) + ') {\n';
  var /** @type {number} */ si = 0;
  var /** @const {number} */ nameLen = names.length;
  while (si < nameLen) {
    var /** @const {string} */ target = names[si];
    while (si < nameLen && names[si] === target) {
      lines[lines.length] = pad(indent + 1) + 'case ' + si + ':\n';
      ++si;
    }
    lines[lines.length] =
      pad(indent + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, target);
  }
  if ('' !== defaultName) {
    lines[lines.length] = pad(indent + 1) + 'default:\n';
    lines[lines.length] =
      pad(indent + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, defaultName);
  }
  lines[lines.length] = pad(indent) + '}\n';
  return {emittedString: lines.join(''), hasDefault: '' !== defaultName};
};

/**
 * Emits a BlockId node body for labeled-break backends (asm.js, Java).
 * Handles fused blocks, do-while/while body detection, and child assembly.
 * Callers handle prefix dispatch (root-switch, flat-switch) before calling.
 * PHP handles BlockId directly because it uses different block wrapping.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLabeledBlock_ = function (state, nodeCtx, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr['name']);
  var /** @const {number} */ ind = state.indent;
  var /** @const {boolean} */ isFused =
      !!blockName &&
      (!!this.getBlockFusionPlan_(state.functionInfo.name, blockName) || A.hasPrefix_(blockName, A.LB_FUSION_PREFIX_));
  var /** @const {number} */ childInd = blockName && !isFused ? ind + 1 : ind;
  var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, childResults.length, childInd);
  if (isFused) {
    return blockBody;
  }
  if (blockName) {
    return pad(ind) + this.labelN_(state.labelMap, blockName) + ': {\n' + blockBody + pad(ind) + '}\n';
  }
  return blockBody;
};

/**
 * Sub-walks a single expression pointer through the given visitor, reusing the
 * same enter/leave callbacks as the main code-gen traversal.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {number} exprPtr
 * @return {*}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_ = function (wasmModule, binaryen, funcInfo, visitor, exprPtr) {
  if (0 === exprPtr) {
    return '';
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
      binaryen: binaryen,
      treeModule: wasmModule,
      functionInfo: funcInfo,
      treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
      ancestors: []
    };
  return Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(exprPtr, ctx, visitor);
};

/**
 * Extracts the code string from a sub-walk result (which may be a plain string
 * or a typed expression object {@code {s, c}}).
 *
 * @protected
 * @param {*} result
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkString_ = function (result) {
  if ('string' === typeof result) {
    return result;
  }
  if (result && 'object' === typeof result) {
    var /** @const {*} */ s = result['s'];
    if ('string' === typeof s) {
      return /** @type {string} */ (s);
    }
  }
  return '';
};

/**
 * Sub-walks an expression pointer and returns its string form.
 * Convenience wrapper combining subWalkExpression_ and subWalkString_.
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {number} conditionPtr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionString_ = function (state, conditionPtr) {
  return Wasm2Lang.Backend.AbstractCodegen.subWalkString_(
    Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_(
      state.wasmModule,
      state.binaryen,
      state.functionInfo,
      /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor),
      conditionPtr
    )
  );
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
      ++start;
    }
    while (end >= start && /\s/.test(expr.charAt(end))) {
      --end;
    }
    if (start >= end || '(' !== expr.charAt(start) || ')' !== expr.charAt(end)) {
      return false;
    }

    for (i = start; i <= end; ++i) {
      var /** @const {string} */ ch = expr.charAt(i);
      if ('(' === ch) {
        ++depth;
      } else if (')' === ch) {
        --depth;
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
    var /** @const {number} */ sLen = s.length;
    var /** @type {string} */ next = '';

    if ('' === s || P.isFullyParenthesized(s)) {
      return P.PREC_PRIMARY_;
    }

    for (i = 0; i < sLen; ++i) {
      var /** @const {string} */ ch = s.charAt(i);

      // --- string literal pass-through ---
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

      // --- structural / nesting characters ---
      switch (ch) {
        case "'":
          inSingle = true;
          continue;
        case '"':
          inDouble = true;
          continue;
        case '(':
          ++depthParen;
          continue;
        case ')':
          --depthParen;
          continue;
        case '[':
          ++depthBracket;
          continue;
        case ']':
          --depthBracket;
          continue;
        default:
          break;
      }

      if (0 !== depthParen || 0 !== depthBracket) {
        continue;
      }

      // --- operator precedence detection (top-level only) ---
      next = s.charAt(i + 1);
      switch (ch) {
        case '?':
          lowest = Math.min(lowest, P.PREC_CONDITIONAL_);
          break;
        case '|':
          if ('|' !== next) {
            lowest = Math.min(lowest, P.PREC_BIT_OR_);
          }
          break;
        case '^':
          lowest = Math.min(lowest, P.PREC_BIT_XOR_);
          break;
        case '&':
          if ('&' !== next) {
            lowest = Math.min(lowest, P.PREC_BIT_AND_);
          }
          break;
        case '=':
          if ('=' === next) {
            lowest = Math.min(lowest, P.PREC_EQUALITY_);
            i += '=' === s.charAt(i + 2) ? 2 : 1;
          } else if ('!' !== s.charAt(i - 1) && '<' !== s.charAt(i - 1) && '>' !== s.charAt(i - 1)) {
            lowest = Math.min(lowest, P.PREC_ASSIGN_);
          }
          break;
        case '!':
          if ('=' === next) {
            lowest = Math.min(lowest, P.PREC_EQUALITY_);
            i += '=' === s.charAt(i + 2) ? 2 : 1;
          } else if (P.isUnaryPosition_(s, i)) {
            lowest = Math.min(lowest, P.PREC_UNARY_);
          }
          break;
        case '<':
          if ('<' === next) {
            lowest = Math.min(lowest, P.PREC_SHIFT_);
            i += 1;
          } else {
            lowest = Math.min(lowest, P.PREC_RELATIONAL_);
            if ('=' === next) {
              i += 1;
            }
          }
          break;
        case '>':
          if ('>' === next) {
            lowest = Math.min(lowest, P.PREC_SHIFT_);
            i += '>' === s.charAt(i + 2) ? 2 : 1;
          } else {
            lowest = Math.min(lowest, P.PREC_RELATIONAL_);
            if ('=' === next) {
              i += 1;
            }
          }
          break;
        case '+':
        case '-':
          if (!P.isUnaryPosition_(s, i)) {
            lowest = Math.min(lowest, P.PREC_ADDITIVE_);
          }
          break;
        case '*':
        case '/':
        case '%':
          lowest = Math.min(lowest, P.PREC_MULTIPLICATIVE_);
          break;
        default:
          break;
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
 * Formats an expression for use as a boolean condition in control flow
 * (if, while, do-while).  Default delegates to the Precedence_ helper;
 * Java overrides to produce {@code (expr != 0)} form.
 *
 * @protected
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.formatCondition_ = function (expr) {
  return Wasm2Lang.Backend.AbstractCodegen.Precedence_.formatCondition(expr);
};

/**
 * Emits an if/if-else statement.  All backends share the same structure;
 * only the condition formatting differs (dispatched via formatCondition_).
 *
 * @protected
 * @param {number} indent
 * @param {string} conditionExpr  Raw condition child result string.
 * @param {string} trueCode       True-branch child result string.
 * @param {number} ifFalsePtr     Binaryen pointer to else branch (0 if none).
 * @param {number} childCount     Number of child results.
 * @param {string=} opt_falseCode False-branch child result string.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitIfStatement_ = function (
  indent,
  conditionExpr,
  trueCode,
  ifFalsePtr,
  childCount,
  opt_falseCode
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ cond = this.formatCondition_(conditionExpr);
  if (0 !== ifFalsePtr && 2 < childCount) {
    return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '} else {\n' + opt_falseCode + pad(indent) + '}\n';
  }
  return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '}\n';
};

/**
 * Emits a local.set or local.tee expression.  Shared across all backends —
 * name formatting dispatches through localN_; coercion through coerceToType_.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} functionInfo
 * @param {number} indent
 * @param {boolean} isTee
 * @param {number} localIndex
 * @param {string} valueExpr
 * @param {number} valueCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLocalSet_ = function (
  binaryen,
  functionInfo,
  indent,
  isTee,
  localIndex,
  valueExpr,
  valueCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {number} */ localType = Wasm2Lang.Backend.ValueType.getLocalType(binaryen, functionInfo, localIndex);
  var /** @const {string} */ setValue = this.coerceToType_(binaryen, valueExpr, valueCat, localType);
  if (isTee) {
    return {
      emittedString: '(' + this.localN_(localIndex) + ' = ' + setValue + ')',
      resultCat: A.catForCoercedType_(binaryen, localType)
    };
  }
  return {emittedString: pad(indent) + this.localN_(localIndex) + ' = ' + setValue + ';\n', resultCat: A.CAT_VOID};
};

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

  var /** @const {!Object<string, string>} */ importedNames = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    importedNames[imports[i].wasmFuncName] = imports[i].importBaseName;
  }

  var /** @const {!Object<string, number>} */ globalTypes = /** @type {!Object<string, number>} */ (Object.create(null));
  for (var /** number */ gi = 0, /** @const {number} */ globalCount = globals.length; gi !== globalCount; ++gi) {
    globalTypes[globals[gi].globalName] = globals[gi].globalType;
  }

  return {
    impFuncs: imports,
    importedNames: importedNames,
    functionSignatures: this.collectFunctionSignatures_(wasmModule),
    globals: globals,
    globalTypes: globalTypes,
    expFuncs: this.collectExportedFunctions_(wasmModule),
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
    // Languages where float widens to double automatically (Java, PHP)
    // can skip the explicit f64 cast when the source is already f32.
    if (A.CAT_F32 === cat && this.f32WidensToF64_) return expr;
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
  var /** @const {string} */ callName = this.n_(helperName);
  return this.renderCoercionByType_(binaryen, callName + '(' + args.join(', ') + ')', resultType);
};

// ---------------------------------------------------------------------------
// Shared identifier mangling infrastructure.
// ---------------------------------------------------------------------------

/**
 * Returns a mangled module-scope name when the mangler is active, or the
 * original identifier unchanged.  Concrete backends may override this to
 * add sigil logic (e.g. PHP adds {@code $} prefix).
 *
 * @protected
 * @param {string} originalName
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.n_ = function (originalName) {
  return this.mangler_ ? this.mangler_.mn(originalName) : originalName;
};

/**
 * Returns a mangled local-scope name when the mangler is active, or the
 * default {@code $l{index}} identifier.
 *
 * @protected
 * @param {number} index
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.localN_ = function (index) {
  return this.mangler_ ? this.mangler_.ln(index) : '$l' + index;
};

/**
 * Returns a mangled label name for a binaryen block/loop label.
 *
 * When the mangler is active, the label's pool index ({@code labelOffset +
 * sequenceNumber}) is resolved via the local pool.  When inactive, the
 * original binaryen name is returned with a {@code $} prefix.
 *
 * @protected
 * @param {!Object<string, number>} labelMap  Per-function map of binaryen
 *     label name → sequence number (mutated on first encounter).
 * @param {string} binaryenName  Raw label name from binaryen.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.labelN_ = function (labelMap, binaryenName) {
  if (!this.mangler_) {
    return '$' + binaryenName;
  }
  var /** @type {number|void} */ seq = labelMap[binaryenName];
  if ('number' !== typeof seq) {
    seq = Object.keys(labelMap).length;
    labelMap[binaryenName] = seq;
  }
  return this.localN_(seq);
};

/**
 * Formats a {@code break} or {@code continue} statement targeting a resolved
 * label name, eliding the label when the prefix allows it.
 *
 * @protected
 * @param {!Object<string, number>} labelMap
 * @param {string} keyword  {@code 'break'} or {@code 'continue'}.
 * @param {string} resolvedName  Already-resolved target (after fusion lookup).
 * @return {string}  Statement string ending in {@code ';\n'}.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderLabeledJump_ = function (labelMap, keyword, resolvedName) {
  return Wasm2Lang.Backend.AbstractCodegen.isLabelElided(resolvedName)
    ? keyword + ';\n'
    : keyword + ' ' + this.labelN_(labelMap, resolvedName) + ';\n';
};

/**
 * Resolves a target label to its break/continue statement string, looking up
 * the label kind and block-to-loop fusion redirection.
 *
 * Used by asm.js and Java backends for BreakId, SwitchId, and flat-switch
 * external-target handling where the same 4-line resolution pattern was
 * previously repeated.
 *
 * @protected
 * @param {!Object<string, string>} labelKinds   Map of label name → 'block'|'loop'.
 * @param {!Object<string, string>} fusedBlockToLoop  Fused block → loop name.
 * @param {!Object<string, number>} labelMap
 * @param {string} targetName
 * @return {string}  Statement string ending in {@code ';\n'}.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resolveBreakTarget_ = function (
  labelKinds,
  fusedBlockToLoop,
  labelMap,
  targetName
) {
  var /** @const {string} */ kind = labelKinds[targetName] || 'block';
  var /** @const {string} */ actual = fusedBlockToLoop[targetName] || targetName;
  var /** @const {string} */ keyword = 'loop' === kind ? 'continue' : 'break';
  return this.renderLabeledJump_(labelMap, keyword, actual);
};

/**
 * Counts the number of named block/loop labels in a function body.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.countFunctionLabels_ = function (wasmModule, binaryen, funcInfo) {
  if (0 === funcInfo.body) {
    return 0;
  }
  var /** @const {!Object<string, boolean>} */ seen = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @type {number} */ count = 0;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
      enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) {
        var /** @const {!Object<string, *>} */ e = /** @type {!Object<string, *>} */ (nc.expression);
        var /** @const {number} */ eId = /** @type {number} */ (e['id']);
        if ((binaryen.BlockId === eId || binaryen.LoopId === eId) && e['name']) {
          var /** @const {string} */ n = /** @type {string} */ (e['name']);
          if (!seen[n]) {
            seen[n] = true;
            ++count;
          }
        }
        return null;
      },
      leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) { void nc; void cr; return null; }
    });
  this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
  return count;
};

/**
 * Backend hook: number of inline temporary variables injected into function
 * bodies (e.g. store/load scratch vars).  These occupy local-pool indices
 * after numParams + numVars and must not collide with wasm locals.
 *
 * @protected
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getInlineTempCount_ = function () {
  return 0;
};

/**
 * Backend hook: returns all fixed module-scope identifiers that should be
 * registered with the mangler.  Concrete backends override this.
 *
 * @protected
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getFixedModuleBindings_ = function (options) {
  void options;
  return [];
};

/**
 * Backend hook: returns all possible helper function names that could be
 * emitted.  Concrete backends override this.
 *
 * @protected
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getAllHelperNames_ = function () {
  return [];
};

/**
 * Precomputes mangled names for all identifiers in the module.
 *
 * Collects module-scope identifiers from: backend fixed bindings, all
 * possible helpers, globals, imports, and internal functions.  Then
 * precomputes the local pool to cover the largest function scope.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Promise<void>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.precomputeMangledNames_ = function (wasmModule, options) {
  this.mangler_ = new Wasm2Lang.Backend.IdentifierMangler(/** @type {string} */ (options.mangler), options.languageOut);

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);

  // Register all module-scope identifiers in deterministic order.
  // Frequently-referenced names (fixed bindings, globals, imports,
  // functions) are registered first so they claim shorter identifiers.
  // Helper function names are registered last — they appear at most once
  // each as declarations and rarely in call sites.
  var /** @const {!Array<string>} */ keys = [];

  // 1. Backend-specific fixed bindings (sorted for determinism).
  var /** @const {!Array<string>} */ fixed = this.getFixedModuleBindings_(options);
  for (var /** number */ fi = 0, /** @const {number} */ fLen = fixed.length; fi !== fLen; ++fi) {
    keys[keys.length] = fixed[fi];
  }

  // 2. Globals (module order).
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    keys[keys.length] = '$g_' + this.safeName_(moduleInfo.globals[gi].globalName);
  }

  // 3. Import bindings (module order).
  for (var /** number */ ii = 0, /** @const {number} */ iLen = moduleInfo.impFuncs.length; ii !== iLen; ++ii) {
    keys[keys.length] = '$if_' + this.safeName_(moduleInfo.impFuncs[ii].importBaseName);
  }

  // 4. Internal function names (module order).
  for (var /** number */ fn = 0, /** @const {number} */ fnLen = moduleInfo.functions.length; fn !== fnLen; ++fn) {
    keys[keys.length] = this.safeName_(moduleInfo.functions[fn].name);
  }

  // 5. All possible helper function names (sorted for determinism).
  // Registered last: helpers appear at most once as declarations.
  var /** @const {!Array<string>} */ helpers = this.getAllHelperNames_();
  for (var /** number */ hi = 0, /** @const {number} */ hLen = helpers.length; hi !== hLen; ++hi) {
    keys[keys.length] = helpers[hi];
  }

  this.mangler_.registerModuleBindings(keys);

  // Compute local pool size: max(params + vars + labels) across all
  // functions, with a minimum of 5 for helper function locals.
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @type {number} */ maxLocals = 5;
  for (var /** number */ f = 0, /** @const {number} */ fCount = moduleInfo.functions.length; f !== fCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    var /** @const {number} */ numParams = binaryen.expandType(funcInfo.params).length;
    var /** @const {number} */ numVars = /** @type {!Array<number>} */ (funcInfo.vars || []).length;
    var /** @const {number} */ numLabels = this.countFunctionLabels_(wasmModule, binaryen, funcInfo);
    var /** @const {number} */ numInlineTemps = this.getInlineTempCount_();
    if (numParams + numVars + numInlineTemps > maxLocals) {
      maxLocals = numParams + numVars + numInlineTemps;
    }
    if (numLabels > maxLocals) {
      maxLocals = numLabels;
    }
  }

  return this.mangler_.precompute(maxLocals);
};

/**
 * Backend hook: sanitises a raw binaryen name for the target language,
 * applying invalid-character replacement, leading-digit guard, and
 * reserved-word resolution.  Backends override with their own rules.
 *
 * @protected
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.safeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name);
};

/**
 * Backend hook returning the runtime helper prefix.
 * Default: {@code "$w2l_"} (used by asm.js and Java); PHP overrides to {@code "_w2l_"}.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '$w2l_';
};

/**
 * Backend hook turning a relational-condition expression into an i32 result.
 *
 * @protected
 * @param {string} conditionExpr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericComparisonResult_ = function (conditionExpr) {
  return '(' + conditionExpr + ' ? 1 : 0)';
};

/**
 * Shared rendering for non-i32 numeric binary operations.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @param {number=} opt_catL
 * @param {number=} opt_catR
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericBinaryOp_ = function (binaryen, info, L, R, opt_catL, opt_catR) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {number} */ precedence = P.PREC_ADDITIVE_;

  if (info.isComparison) {
    return this.renderNumericComparisonResult_(P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_));
  }

  if ('mul' === info.opName || 'div' === info.opName) {
    precedence = P.PREC_MULTIPLICATIVE_;
  }

  if ('min' === info.opName || 'max' === info.opName || 'copysign' === info.opName) {
    return this.renderHelperCall_(
      binaryen,
      this.getRuntimeHelperPrefix_() + info.opName + '_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, info.retType),
      [L, R],
      info.retType
    );
  }

  return this.renderCoercionByType_(binaryen, P.renderInfix(L, info.opStr, R, precedence), info.retType);
};

/**
 * Shared rendering for non-i32 numeric unary operations and conversions.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @type {string} */ helperName = this.getRuntimeHelperPrefix_() + info.opName;

  if ('neg' === info.opName) {
    return this.renderCoercionByType_(binaryen, P.renderPrefix('-', valueExpr), info.retType);
  }

  if (
    'abs' === info.opName ||
    'ceil' === info.opName ||
    'floor' === info.opName ||
    'trunc' === info.opName ||
    'nearest' === info.opName ||
    'sqrt' === info.opName
  ) {
    helperName += '_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, info.operandType);
  }

  return this.renderHelperCall_(binaryen, helperName, [valueExpr], info.retType);
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
      sigParams: [],
      sigRetType: /** @type {number} */ (expr['type'])
    };
  var /** @const {!Array<number>} */ operands = /** @type {!Array<number>} */ (expr['operands']) || [];
  var /** @const {!Array<string>} */ callArgs = [];

  for (var /** number */ ai = 0, /** @const {number} */ alen = childResults.length; ai !== alen; ++ai) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ argInfo =
        Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_(childResults, ai);
    var /** @const {number} */ argType =
        ai < callSig.sigParams.length ? callSig.sigParams[ai] : binaryen.getExpressionInfo(operands[ai]).type;
    callArgs[callArgs.length] = this.coerceToType_(binaryen, argInfo.expressionString, argInfo.expressionCategory, argType);
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
 *   renderUnknown: (function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string|void)
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
  // OP_* constants are 0–5 — direct index into dispatch table.
  var /** @const {!Array<function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string>} */ dispatch =
      [
        renderer.renderArithmetic,
        renderer.renderMultiply,
        renderer.renderDivision,
        renderer.renderBitwise,
        renderer.renderRotate,
        renderer.renderComparison
      ];

  var /** @const {function(this:Wasm2Lang.Backend.AbstractCodegen, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string|void} */ fn =
      dispatch[info.category];
  if (fn) {
    return fn.call(this, info, L, R);
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
 * @return {string|!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
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
