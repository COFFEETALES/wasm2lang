'use strict';

// ---------------------------------------------------------------------------
// Static memory collection, imported functions/globals, function signatures,
// globals, exports, defined functions, function tables, and module-level
// metadata aggregation.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// asm.js standard library symbol classification.
// ---------------------------------------------------------------------------

/**
 * Known asm.js stdlib Math functions.  Key: import base name,
 * value: arity (unused at classification time but available for backends).
 * @const {!Object<string, number>}
 */
Wasm2Lang.Backend.AbstractCodegen.STDLIB_MATH_FUNCTIONS_ = {
  'acos': 1,
  'asin': 1,
  'atan': 1,
  'cos': 1,
  'sin': 1,
  'tan': 1,
  'exp': 1,
  'log': 1,
  'ceil': 1,
  'floor': 1,
  'sqrt': 1,
  'abs': 1,
  'atan2': 2,
  'pow': 2,
  'min': 2,
  'max': 2,
  'imul': 2,
  'fround': 1,
  'clz32': 1
};

/**
 * Known asm.js stdlib Math constants.
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.AbstractCodegen.STDLIB_MATH_CONSTANTS_ = {
  'E': true,
  'LN10': true,
  'LN2': true,
  'LOG2E': true,
  'LOG10E': true,
  'PI': true,
  'SQRT1_2': true,
  'SQRT2': true
};

/**
 * Classifies a WASM import as an asm.js stdlib symbol.
 *
 * @param {string} importModule  The WASM import module name.
 * @param {string} importBaseName  The WASM import base name.
 * @return {string}  One of {@code 'math_func'}, {@code 'math_const'},
 *     {@code 'global_value'}, or empty string if not a stdlib symbol.
 */
Wasm2Lang.Backend.AbstractCodegen.classifyStdlibImport = function (importModule, importBaseName) {
  if ('Math' === importModule) {
    if (importBaseName in Wasm2Lang.Backend.AbstractCodegen.STDLIB_MATH_FUNCTIONS_) {
      return 'math_func';
    }
    if (importBaseName in Wasm2Lang.Backend.AbstractCodegen.STDLIB_MATH_CONSTANTS_) {
      return 'math_const';
    }
  }
  if ('Infinity' === importBaseName || 'NaN' === importBaseName) {
    return 'global_value';
  }
  return '';
};

/**
 * Descriptor for a single wasm-level imported global.
 *
 * @protected
 * @typedef {{
 *   globalName: string,
 *   importBaseName: string,
 *   importModule: string,
 *   globalType: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_;

/**
 * Collects every imported global from the wasm module.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectImportedGlobals_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ numGlobals = wasmModule.getNumGlobals();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_>} */ imports = [];

  for (var /** number */ i = 0; i !== numGlobals; ++i) {
    var /** @const {number} */ globalPtr = wasmModule.getGlobalByIndex(i);
    var /** @const {!BinaryenGlobalInfo} */ globalInfo = binaryen.getGlobalInfo(globalPtr);
    if ('' !== globalInfo.base) {
      imports[imports.length] = {
        globalName: globalInfo.name,
        importBaseName: globalInfo.base,
        importModule: globalInfo.module,
        globalType: globalInfo.type
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
 * A single entry in a function table.
 *
 * @protected
 * @typedef {{ functionName: (string|null) }}
 */
Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_;

/**
 * Describes one signature-specific function table.
 *
 * @protected
 * @typedef {{
 *   signatureKey: string,
 *   signatureParams: !Array<number>,
 *   signatureReturnType: number,
 *   tableEntries: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>,
 *   tableMask: number,
 *   stubNeeded: boolean
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_;

/**
 * Shared module-level metadata used by concrete backend emitters.
 *
 * @protected
 * @typedef {{
 *   impFuncs: !Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>,
 *   impGlobals: !Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_>,
 *   importedNames: !Object<string, string>,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globals: !Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>,
 *   globalTypes: !Object<string, number>,
 *   expFuncs: !Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>,
 *   functions: !Array<!BinaryenFunctionInfo>,
 *   functionTables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>,
 *   flatTableEntries: !Array<string|null>
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_;

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
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_>} */ impGlobals =
      this.collectImportedGlobals_(wasmModule);
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} */ globals = this.collectGlobals_(wasmModule);

  var /** @const {!Object<string, string>} */ importedNames = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** number */ i = 0, /** @const {number} */ importCount = imports.length; i !== importCount; ++i) {
    importedNames[imports[i].wasmFuncName] = imports[i].importBaseName;
  }

  var /** @const {!Object<string, number>} */ globalTypes = /** @type {!Object<string, number>} */ (Object.create(null));
  for (var /** number */ gi = 0, /** @const {number} */ globalCount = globals.length; gi !== globalCount; ++gi) {
    globalTypes[globals[gi].globalName] = globals[gi].globalType;
  }
  // Include imported global types so GlobalGetId/GlobalSetId resolve correctly.
  for (var /** number */ igi = 0, /** @const {number} */ igLen = impGlobals.length; igi !== igLen; ++igi) {
    globalTypes[impGlobals[igi].globalName] = impGlobals[igi].globalType;
  }

  var /** @const {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} */ functionSignatures =
      this.collectFunctionSignatures_(wasmModule);
  var /** @const {{tables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>, flatEntries: !Array<string|null>}} */ tableResult =
      this.collectFunctionTables_(wasmModule, functionSignatures);

  return {
    impFuncs: imports,
    impGlobals: impGlobals,
    importedNames: importedNames,
    functionSignatures: functionSignatures,
    globals: globals,
    globalTypes: globalTypes,
    expFuncs: this.collectExportedFunctions_(wasmModule),
    functions: this.collectDefinedFunctions_(wasmModule),
    functionTables: tableResult.tables,
    flatTableEntries: tableResult.flatEntries
  };
};

/**
 * Builds a signature key string from parameter types and return type.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Array<number>} paramTypes
 * @param {number} retType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.buildSignatureKey_ = function (binaryen, paramTypes, retType) {
  /** @param {number} t @return {string} */
  var c = function (t) {
    return binaryen.f32 === t ? 'f' : binaryen.f64 === t ? 'd' : 'i';
  };
  var /** @type {string} */ key = '';
  for (var /** number */ i = 0, /** @const {number} */ len = paramTypes.length; i !== len; ++i) {
    key += c(paramTypes[i]);
  }
  return key + '_' + (binaryen.none === retType || 0 === retType ? 'v' : c(retType));
};

/**
 * Collects function table information from the module's element segments.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @return {{tables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>, flatEntries: !Array<string|null>}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectFunctionTables_ = function (wasmModule, functionSignatures) {
  var /** @const {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>} */ tables =
      /** @type {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>} */ (Object.create(null));
  var /** @type {!Array<string|null>} */ flatEntries = [];

  var /** @const {number} */ numSegments = wasmModule.getNumElementSegments();
  if (0 === numSegments) {
    return {tables: tables, flatEntries: flatEntries};
  }

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {number} */ segPtr = wasmModule.getElementSegmentByIndex(0);
  var /** @const {!BinaryenElementSegmentInfo} */ segInfo = binaryen.getElementSegmentInfo(segPtr);
  var /** @const {!Array<string>} */ data = segInfo.data;

  // Evaluate offset expression to get base index.
  var /** @const {!Object<string, *>} */ offsetExpr = /** @type {!Object<string, *>} */ (
      binaryen.getExpressionInfo(segInfo.offset)
    );
  var /** @type {number} */ baseOffset = 0;
  if (
    /** @type {number} */ (offsetExpr['id']) === binaryen.ConstId &&
    Wasm2Lang.Backend.ValueType.isI32(binaryen, /** @type {number} */ (offsetExpr['type']))
  ) {
    baseOffset = /** @type {number} */ (offsetExpr['value']);
  }

  // Build flat entries array.
  for (var /** number */ p = 0; p < baseOffset; ++p) {
    flatEntries[flatEntries.length] = null;
  }
  for (var /** number */ d = 0, /** @const {number} */ dLen = data.length; d !== dLen; ++d) {
    flatEntries[flatEntries.length] = data[d];
  }

  // Group entries by signature.
  /** @type {!Object<string, {params: !Array<number>, retType: number, entries: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}>} */
  var sigGroups =
    /** @type {!Object<string, {params: !Array<number>, retType: number, entries: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}>} */ (
      Object.create(null)
    );

  for (var /** number */ e = 0, /** @const {number} */ eLen = flatEntries.length; e !== eLen; ++e) {
    var /** @const {string|null} */ funcName = flatEntries[e];
    if (null === funcName) continue;
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_|void} */ sig = functionSignatures[funcName];
    if (!sig) continue;
    var /** @const {string} */ sigKey = Wasm2Lang.Backend.AbstractCodegen.buildSignatureKey_(
        binaryen,
        sig.sigParams,
        sig.sigRetType
      );
    if (!sigGroups[sigKey]) {
      sigGroups[sigKey] = {params: sig.sigParams, retType: sig.sigRetType, entries: []};
    }
    var /** @const {{params: !Array<number>, retType: number, entries: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}} */ group =
        sigGroups[sigKey];
    // Pad with nulls up to index e.
    while (group.entries.length < e) {
      group.entries[group.entries.length] = {functionName: null};
    }
    group.entries[group.entries.length] = {functionName: funcName};
  }

  // Trim trailing nulls, pad to power-of-2, compute mask and stubNeeded.
  var /** @const {!Array<string>} */ sigKeys = Object.keys(sigGroups);
  for (var /** number */ s = 0, /** @const {number} */ sLen = sigKeys.length; s !== sLen; ++s) {
    var /** @const {string} */ sk = sigKeys[s];
    var /** @const {{params: !Array<number>, retType: number, entries: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}} */ sg =
        sigGroups[sk];
    // Trim trailing nulls.
    while (sg.entries.length > 0 && null === sg.entries[sg.entries.length - 1].functionName) {
      sg.entries.length--;
    }
    // Pad to next power of 2.
    var /** @type {number} */ size = 1;
    while (size < sg.entries.length) {
      size *= 2;
    }
    var /** @type {boolean} */ hasNulls = false;
    while (sg.entries.length < size) {
      sg.entries[sg.entries.length] = {functionName: null};
      hasNulls = true;
    }
    if (!hasNulls) {
      for (var /** number */ ni = 0, /** @const {number} */ niLen = sg.entries.length; ni !== niLen; ++ni) {
        if (null === sg.entries[ni].functionName) {
          hasNulls = true;
          break;
        }
      }
    }
    tables[sk] = {
      signatureKey: sk,
      signatureParams: sg.params,
      signatureReturnType: sg.retType,
      tableEntries: sg.entries,
      tableMask: size - 1,
      stubNeeded: hasNulls
    };
  }

  return {tables: tables, flatEntries: flatEntries};
};
