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

  function scanRepeat() {
    repeatEnd = index + 1;
    while (repeatEnd !== endIndex && i32[repeatEnd] === i32[index]) {
      ++repeatEnd;
    }
  }

  function emitFill() {
    ops[ops.length] = {
      opKind: 'fill',
      startWordIndex: startWordIndex + index,
      fillValueI32: i32[index],
      fillCountWords: repeatEnd - index,
      setWordsI32: []
    };
  }

  while (index !== endIndex) {
    if (0 === i32[index]) {
      ++index;
      continue;
    }

    scanRepeat();

    if (fillThreshold <= repeatEnd - index) {
      emitFill();
      index = repeatEnd;
      continue;
    }

    var /** @const {number} */ setStart = index;
    var /** @const {!Array<number>} */ setWords = [];

    while (index !== endIndex) {
      if (0 === i32[index]) {
        break;
      }

      scanRepeat();

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
    emitFill();
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
 * Probes whether a data segment with the given name exists.  Binaryen's
 * {@code getMemorySegmentInfo} calls C++ {@code Fatal()} on lookup failure,
 * which prints "Fatal: invalid segment name." to stderr and sets
 * {@code process.exitCode = 1} even though the JS exception IS catchable.
 * This wrapper suppresses both side effects so that probing does not
 * pollute stderr output or corrupt the process exit code.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.probeSegmentName_ = function (wasmModule, name) {
  /** @type {?function((!Buffer|string), string=, function(*=): ?=): boolean} */
  var origWrite = null;
  var /** @type {number|undefined} */ savedExitCode;
  if (Wasm2Lang.Utilities.Environment.isNode()) {
    origWrite = /** @type {function((!Buffer|string), string=, function(*=): ?=): boolean} */ (process.stderr.write);
    savedExitCode = process.exitCode;
    process.stderr.write = /** @type {function((!Buffer|string), string=, function(*=): ?=): boolean} */ (
      function () {
        return true;
      }
    );
  }
  try {
    wasmModule.getMemorySegmentInfo(name);
    return true;
  } catch (e) {
    return false;
  } finally {
    if (null !== origWrite) {
      process.stderr.write = origWrite;
      process.exitCode = savedExitCode || 0;
    }
  }
};

/**
 * Resolves all data segment names for a module.  Binaryen names segments
 * differently depending on whether the WAT source uses explicit names:
 *   - unnamed segments: "0", "1", "2", ...
 *   - named segments:   "d0", "d0.1", ..., "d1", "d1.1", ...
 * The sub-segment naming ("d0.1") appears after passes like remove-non-js-ops
 * that split a single passive segment into multiple active segments.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {number} numSegments
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.resolveSegmentNames_ = function (wasmModule, numSegments) {
  if (0 === numSegments) {
    return [];
  }

  var /** @const {function(!BinaryenModule, string):boolean} */ probe = Wasm2Lang.Backend.AbstractCodegen.probeSegmentName_;

  // Fast path: try implicit numeric naming ("0", "1", ...).
  if (probe(wasmModule, '0')) {
    var /** @const {!Array<string>} */ numericNames = [];
    for (var /** @type {number} */ ni = 0; ni !== numSegments; ++ni) {
      numericNames[numericNames.length] = String(ni);
    }
    return numericNames;
  }

  // Named-segment enumeration: "d0", "d0.1", "d0.2", ..., "d1", ...
  var /** @const {!Array<string>} */ names = [];
  for (var /** @type {number} */ base = 0; names.length < numSegments; ++base) {
    var /** @const {string} */ baseName = 'd' + base;
    if (!probe(wasmModule, baseName)) {
      continue;
    }
    names[names.length] = baseName;
    for (var /** @type {number} */ sub = 1; names.length < numSegments; ++sub) {
      var /** @const {string} */ subName = 'd' + base + '.' + sub;
      if (!probe(wasmModule, subName)) {
        break;
      }
      names[names.length] = subName;
    }
  }

  return names;
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
  var /** @const {!Array<string>} */ segNames = Wasm2Lang.Backend.AbstractCodegen.resolveSegmentNames_(wasmModule, numSegments);
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.StaticMemorySegment_>} */ segments = [];

  for (var /** @type {number} */ i = 0, /** @const {number} */ nameCount = segNames.length; i !== nameCount; ++i) {
    var /** @const {!BinaryenMemorySegmentInfo} */ segInfo = wasmModule.getMemorySegmentInfo(segNames[i]);
    if (segInfo.passive) {
      continue;
    }
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

  for (var /** @type {number} */ j = 0, /** @const {number} */ segmentCount = segments.length; j !== segmentCount; ++j) {
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

// collectImportedFunctions_: inlined into collectModuleCodegenInfo_.

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
 * asm.js-specific Math functions excluded by non-asm.js backends.
 * @private
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.AbstractCodegen.ASMJS_ONLY_MATH_FUNCS_ = {
  'imul': true,
  'fround': true,
  'clz32': true
};

/**
 * Resolves stdlib imports into target-language binding names.  Functions are
 * mapped as {@code funcPrefix + baseName}; asm.js-only functions are excluded.
 * Constants use the provided {@code constMap}; Infinity/NaN use the provided
 * literal expressions.
 *
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} impFuncs
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_>} impGlobals
 * @param {string} funcPrefix
 * @param {!Object<string, string>} constMap
 * @param {string} infinityExpr
 * @param {string} nanExpr
 * @return {{names: !Object<string, string>, globals: !Object<string, string>}}
 */
Wasm2Lang.Backend.AbstractCodegen.resolveStdlibBindings_ = function (
  impFuncs,
  impGlobals,
  funcPrefix,
  constMap,
  infinityExpr,
  nanExpr
) {
  var /** @const */ classify = Wasm2Lang.Backend.AbstractCodegen.classifyStdlibImport;
  var /** @const */ skip = Wasm2Lang.Backend.AbstractCodegen.ASMJS_ONLY_MATH_FUNCS_;
  var /** @const {!Object<string, string>} */ names = /** @type {!Object<string, string>} */ (Object.create(null));
  var /** @const {!Object<string, string>} */ globals = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = impFuncs.length; i !== len; ++i) {
    var /** @const {string} */ baseName = impFuncs[i].importBaseName;
    if ('math_func' === classify(impFuncs[i].importModule, baseName) && !skip[baseName]) {
      names[impFuncs[i].wasmFuncName] = funcPrefix + baseName;
    }
  }
  for (var /** @type {number} */ g = 0, /** @const {number} */ glen = impGlobals.length; g !== glen; ++g) {
    var /** @const {string} */ gBase = impGlobals[g].importBaseName;
    var /** @const {string} */ kind = classify(impGlobals[g].importModule, gBase);
    if ('math_const' === kind) {
      var /** @type {string|void} */ mapped = constMap[gBase];
      if (mapped) globals[impGlobals[g].globalName] = mapped;
    } else if ('global_value' === kind) {
      globals[impGlobals[g].globalName] = 'Infinity' === gBase ? infinityExpr : nanExpr;
    }
  }
  return {names: names, globals: globals};
};

/**
 * Known direct-cast import base names (module = 'cast').
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.AbstractCodegen.CAST_IMPORTS_ = {
  'i32_to_f32': true,
  'i32_to_f64': true,
  'f32_to_i32': true,
  'f64_to_i32': true,
  'i64_to_f32': true,
  'i64_to_f64': true,
  'f32_to_i64': true,
  'f64_to_i64': true,
  'f32_to_u32': true,
  'f64_to_u32': true,
  'u32_to_f32': true,
  'u32_to_f64': true,
  'f32_to_u64': true,
  'f64_to_u64': true,
  'u64_to_f32': true,
  'u64_to_f64': true
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

// collectImportedGlobals_: inlined into collectModuleCodegenInfo_.

// collectFunctionSignatures_: inlined into collectModuleCodegenInfo_.

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
 * Descriptor for a single wasm-level exported global.
 *
 * @protected
 * @typedef {{
 *   exportName: string,
 *   internalName: string,
 *   globalType: number,
 *   globalMutable: boolean
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ExportedGlobalInfo_;

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
 * @typedef {{ boundName: (string|null) }}
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
 *   expGlobals: !Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedGlobalInfo_>,
 *   functions: !Array<!BinaryenFunctionInfo>,
 *   functionTables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>,
 *   flatTableEntries: !Array<string|null>,
 *   castNames: !Object<string, string>
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_;

// collectExportedFunctions_: inlined into collectModuleCodegenInfo_.

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

  for (var /** @type {number} */ f = 0; f !== numFuncs; ++f) {
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
 *   globalInitValue: *
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_;

// collectGlobals_: inlined into collectModuleCodegenInfo_.

/**
 * Collects the module-level metadata shared by concrete emitters.
 * Iterates functions, globals, and exports once each to build all index
 * structures in a single pass (previously split across five standalone
 * methods that each re-iterated the same module data).
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.collectModuleCodegenInfo_ = function (wasmModule) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();

  // -- Functions: imports, defined, signatures in one pass. --
  var /** @const {number} */ numFuncs = wasmModule.getNumFunctions();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} */ impFuncs = [];
  var /** @const {!Array<!BinaryenFunctionInfo>} */ functions = [];
  // prettier-ignore
  var /** @const {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} */ functionSignatures =
      /** @type {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} */ (Object.create(null));
  var /** @const {!Object<string, string>} */ importedNames = /** @type {!Object<string, string>} */ (Object.create(null));
  var /** @const {!Object<string, string>} */ castNames = /** @type {!Object<string, string>} */ (Object.create(null));
  var /** @const {!Object<string, boolean>} */ castImports = Wasm2Lang.Backend.AbstractCodegen.CAST_IMPORTS_;
  for (var /** @type {number} */ f = 0; f !== numFuncs; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(wasmModule.getFunctionByIndex(f));
    functionSignatures[funcInfo.name] = {sigParams: binaryen.expandType(funcInfo.params), sigRetType: funcInfo.results};
    if ('' !== funcInfo.base) {
      impFuncs[impFuncs.length] = {wasmFuncName: funcInfo.name, importBaseName: funcInfo.base, importModule: funcInfo.module};
      if ('cast' === funcInfo.module && funcInfo.base in castImports) {
        castNames[funcInfo.name] = funcInfo.base;
      } else {
        importedNames[funcInfo.name] = funcInfo.base;
      }
    } else {
      functions[functions.length] = funcInfo;
    }
  }

  // -- Globals: imported + defined in one pass. --
  var /** @const {number} */ numGlobals = wasmModule.getNumGlobals();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedGlobalInfo_>} */ impGlobals = [];
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} */ globals = [];
  var /** @const {!Object<string, number>} */ globalTypes = /** @type {!Object<string, number>} */ (Object.create(null));
  var /** @const {!Object<string, boolean>} */ globalMutableMap = /** @type {!Object<string, boolean>} */ (Object.create(null));
  for (var /** @type {number} */ gi = 0; gi !== numGlobals; ++gi) {
    var /** @const {!BinaryenGlobalInfo} */ globalInfo = binaryen.getGlobalInfo(wasmModule.getGlobalByIndex(gi));
    globalTypes[globalInfo.name] = globalInfo.type;
    globalMutableMap[globalInfo.name] = !!globalInfo.mutable;
    if ('' !== globalInfo.base) {
      impGlobals[impGlobals.length] = {
        globalName: globalInfo.name,
        importBaseName: globalInfo.base,
        importModule: globalInfo.module,
        globalType: globalInfo.type
      };
    } else {
      var /** @const {!BinaryenExpressionInfo} */ initExpr = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
          binaryen,
          globalInfo.init
        );
      globals[globals.length] = {
        globalName: globalInfo.name,
        globalType: globalInfo.type,
        globalMutable: !!globalInfo.mutable,
        globalInitValue: initExpr.value || 0
      };
    }
  }

  // -- Exports. --
  var /** @const {number} */ numExports = wasmModule.getNumExports();
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedFunctionInfo_>} */ expFuncs = [];
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedGlobalInfo_>} */ expGlobals = [];
  for (var /** @type {number} */ e = 0; e !== numExports; ++e) {
    var /** @const {!BinaryenExportInfo} */ exportInfo = binaryen.getExportInfo(wasmModule.getExportByIndex(e));
    if (binaryen.ExternalFunction === exportInfo.kind) {
      expFuncs[expFuncs.length] = {
        exportName: exportInfo.name,
        internalName: exportInfo.value,
        stubName: Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(exportInfo.value)
      };
    } else if (binaryen.ExternalGlobal === exportInfo.kind) {
      expGlobals[expGlobals.length] = {
        exportName: exportInfo.name,
        internalName: exportInfo.value,
        globalType: globalTypes[exportInfo.value] || binaryen.i32,
        globalMutable: !!globalMutableMap[exportInfo.value]
      };
    }
  }

  // prettier-ignore
  var /** @const */ tableResult = this.collectFunctionTables_(wasmModule, functionSignatures);
  return {
    impFuncs: impFuncs,
    impGlobals: impGlobals,
    importedNames: importedNames,
    functionSignatures: functionSignatures,
    globals: globals,
    globalTypes: globalTypes,
    expFuncs: expFuncs,
    expGlobals: expGlobals,
    functions: functions,
    functionTables: tableResult.tables,
    flatTableEntries: tableResult.flatEntries,
    castNames: castNames
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
    return binaryen.f32 === t ? 'f' : binaryen.f64 === t ? 'd' : binaryen.i64 === t ? 'l' : 'i';
  };
  var /** @type {string} */ key = '';
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = paramTypes.length; i !== len; ++i) {
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
  var /** @const {!BinaryenExpressionInfo} */ offsetExpr = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      segInfo.offset
    );
  var /** @type {number} */ baseOffset = 0;
  if (binaryen.ConstId === offsetExpr.id && Wasm2Lang.Backend.ValueType.isI32(binaryen, offsetExpr.type)) {
    baseOffset = /** @type {number} */ (offsetExpr.value);
  }

  // Build flat entries array.
  for (var /** @type {number} */ p = 0; p < baseOffset; ++p) {
    flatEntries[flatEntries.length] = null;
  }
  for (var /** @type {number} */ d = 0, /** @const {number} */ dLen = data.length; d !== dLen; ++d) {
    flatEntries[flatEntries.length] = data[d];
  }

  // Group entries by signature.
  /** @type {!Object<string, {sigParamTypes: !Array<number>, retType: number, slots: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}>} */
  var sigGroups =
    /** @type {!Object<string, {sigParamTypes: !Array<number>, retType: number, slots: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}>} */ (
      Object.create(null)
    );

  for (var /** @type {number} */ e = 0, /** @const {number} */ eLen = flatEntries.length; e !== eLen; ++e) {
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
      sigGroups[sigKey] = {sigParamTypes: sig.sigParams, retType: sig.sigRetType, slots: []};
    }
    var /** @const {{sigParamTypes: !Array<number>, retType: number, slots: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}} */ group =
        sigGroups[sigKey];
    // Pad with nulls up to index e.
    while (group.slots.length < e) {
      group.slots[group.slots.length] = {boundName: null};
    }
    group.slots[group.slots.length] = {boundName: funcName};
  }

  // Trim trailing nulls, pad to power-of-2, compute mask and stubNeeded.
  var /** @const {!Array<string>} */ sigKeys = Object.keys(sigGroups);
  for (var /** @type {number} */ s = 0, /** @const {number} */ sLen = sigKeys.length; s !== sLen; ++s) {
    var /** @const {string} */ sk = sigKeys[s];
    var /** @const {{sigParamTypes: !Array<number>, retType: number, slots: !Array<!Wasm2Lang.Backend.AbstractCodegen.FunctionTableEntry_>}} */ sg =
        sigGroups[sk];
    // Trim trailing nulls.
    while (sg.slots.length > 0 && null === sg.slots[sg.slots.length - 1].boundName) {
      sg.slots.length--;
    }
    // Pad to next power of 2.
    var /** @type {number} */ size = 1;
    while (size < sg.slots.length) {
      size *= 2;
    }
    var /** @type {boolean} */ hasNulls = false;
    while (sg.slots.length < size) {
      sg.slots[sg.slots.length] = {boundName: null};
      hasNulls = true;
    }
    if (!hasNulls) {
      for (var /** @type {number} */ ni = 0, /** @const {number} */ niLen = sg.slots.length; ni !== niLen; ++ni) {
        if (null === sg.slots[ni].boundName) {
          hasNulls = true;
          break;
        }
      }
    }
    tables[sk] = {
      signatureKey: sk,
      signatureParams: sg.sigParamTypes,
      signatureReturnType: sg.retType,
      tableEntries: sg.slots,
      tableMask: size - 1,
      stubNeeded: hasNulls
    };
  }

  return {tables: tables, flatEntries: flatEntries};
};
