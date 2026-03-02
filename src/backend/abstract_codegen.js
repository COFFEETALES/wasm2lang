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
Wasm2Lang.Backend.AbstractCodegen = function () {};

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
 *   name: string,
 *   base: string,
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
        name: funcInfo.name,
        base: funcInfo.base,
        importModule: funcInfo.module
      };
    }
  }

  return imports;
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
 * Returns a safe identifier for use as a function/variable name.  Names that
 * start with a digit are prefixed with {@code "fn_"}.
 *
 * @private
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
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
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

  for (var /** number */ f = 0; f !== numFuncs; ++f) {
    var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(f);
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);

    // Skip imported functions — they have a non-empty import base name.
    if ('' !== funcInfo.base) {
      continue;
    }

    traversalState.nodeCount = 0;
    var /** @const {number} */ bodyPtr = funcInfo.body;

    if (0 !== bodyPtr) {
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
          binaryen: binaryen,
          treeModule: wasmModule,
          functionInfo: funcInfo,
          treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
          ancestors: []
        };

      Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(bodyPtr, ctx, visitor);
    }

    outputParts[outputParts.length] = '// ' + funcInfo.name + ' [nodes:' + traversalState.nodeCount + ']';
  }

  outputParts[outputParts.length] =
    '// [ids seen: ' + (0 !== traversalState.seenIdNames.length ? traversalState.seenIdNames.join(', ') : '(none)') + ']';

  return outputParts.join('\n');
};
