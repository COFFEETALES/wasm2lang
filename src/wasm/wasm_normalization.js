'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.WasmNormalization = {};

/**
 * @param {(string|!Uint8Array|null)} inputData
 * @param {!Binaryen=} opt_binaryen  Injected binaryen instance.
 * @return {!BinaryenModule}
 */
Wasm2Lang.Wasm.WasmNormalization.readWasmModule = function (inputData, opt_binaryen) {
  var /** @const {!Binaryen} */ binaryen = opt_binaryen || Wasm2Lang.Processor.getBinaryen();
  var /** @type {?BinaryenModule} */ wasmModule = null;

  if ('string' === typeof inputData) {
    wasmModule = binaryen.parseText(inputData);
  } else if ('object' === typeof inputData) {
    // prettier-ignore
    wasmModule = binaryen.readBinary(/** @const {!Uint8Array} */ (inputData));
  } else {
    throw new Error('Unsupported input data type for WebAssembly input.');
  }

  Wasm2Lang.Wasm.WasmNormalization.validateInputModule_(/** @type {!BinaryenModule} */ (wasmModule));
  // prettier-ignore
  return /** @const {!BinaryenModule} */ (wasmModule);
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.validateInputModule_ = function (wasmModule) {
  var /** @const {!Wasm2Lang.Wasm.Tree.PassList} */ validationPasses =
      Wasm2Lang.Wasm.Tree.CustomPasses.getInputValidationPasses();

  for (var /** number */ i = 0, /** @const {number} */ passCount = validationPasses.length; i !== passCount; ++i) {
    var /** @const {!Wasm2Lang.Wasm.Tree.Pass} */ pass = validationPasses[i];
    if ('function' === typeof pass.validateModule) {
      /** @type {!Wasm2Lang.Wasm.Tree.PassModuleHook} */ (pass.validateModule)(wasmModule);
    }
  }

  Wasm2Lang.Wasm.Tree.PassRunner.runOnModule(wasmModule, validationPasses);
};

/**
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {?Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.WasmNormalization.applyNormalizationBundles = function (wasmModule, options) {
  var /** @const {!Array<string>} */ bundles = options.normalizeWasm || ['binaryen:min'];
  if (0 === bundles.length) {
    return null;
  }

  var /** @const {!Array<string>} */ unknownBundles = [];

  for (var /** number */ i = bundles.length - 1; i !== -1; --i) {
    if ('object' !== typeof Wasm2Lang.Options.Schema.normalizeBundles[bundles[i]]) {
      unknownBundles[unknownBundles.length] = bundles.splice(i, 1).pop();
    }
  }

  if (0 !== unknownBundles.length) {
    throw new Error('Unknown normalization bundle(s): ' + unknownBundles.join(', '));
  }

  if (-1 === bundles.indexOf('binaryen:none')) {
    Wasm2Lang.Wasm.WasmNormalization.applyBinaryenNormalization_(wasmModule, -1 !== bundles.indexOf('binaryen:max'));
  }

  if (-1 !== bundles.indexOf('wasm2lang:codegen')) {
    return Wasm2Lang.Wasm.WasmNormalization.applyWasm2LangNormalization_(wasmModule, options);
  }
  return null;
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.WasmNormalization.applyWasm2LangNormalization_ = function (wasmModule, options) {
  var /** @const {!Wasm2Lang.Wasm.Tree.PassList} */ passes = Wasm2Lang.Wasm.Tree.CustomPasses.getNormalizationPasses(options);
  return Wasm2Lang.Wasm.Tree.PassRunner.runOnModule(wasmModule, passes);
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {boolean} aggressive
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.applyBinaryenNormalization_ = function (wasmModule, aggressive) {
  if (aggressive) {
    var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
    var /** @const {!BinaryenFeatures} */ features = binaryen.Features;
    // Set the feature mask so binaryen's optimizer recognizes post-MVP ops.
    wasmModule.setFeatures(0 | features.NontrappingFPToInt | features.BulkMemory | features.BulkMemoryOpt | features.SignExt);
    // Run a full optimization pass before i64 lowering to inline small
    // functions, eliminate duplicates, and simplify instructions.
    binaryen.setOptimizeLevel(2);
    binaryen.setShrinkLevel(1);
    wasmModule.optimize();
    // Lower i64 to pairs of i32 so backends only need to handle i32/f32/f64.
    // "remove-non-js-ops" converts i64 selects to if/else which the lowering
    // pass requires; both passes need flat IR so "flatten" runs before each.
    wasmModule.runPasses(['flatten', 'remove-non-js-ops', 'flatten', 'i64-to-i32-lowering']);
    // Cleanup passes before the final flatten to reduce dead code and simplify.
    wasmModule.runPasses([
      'optimize-instructions',
      'precompute',
      'dce',
      'remove-unused-brs',
      'remove-unused-names',
      'simplify-globals',
      'duplicate-function-elimination'
    ]);
  }
  // "flatten" inserts explicit returns at block ends so later codegen sees
  // concrete control flow.
  // "simplify-locals-nostructure" merges redundant local set/get patterns
  // without restructuring control flow — unlike "simplify-locals-notee" it
  // never re-nests blocks/ifs with result values, so the flat invariant holds.
  // "reorder-locals" compacts local indices to a tighter layout.
  // "vacuum" removes unreachable code left by earlier passes.
  wasmModule.runPasses(['flatten', 'simplify-locals-nostructure', 'reorder-locals', 'vacuum']);
};

/**
 * @param {!BinaryenModule} wasmModule
 * @param {string} mode
 * @return {string|!Uint8Array}
 */
Wasm2Lang.Wasm.WasmNormalization.emitNormalizedWasm = function (wasmModule, mode) {
  if ('text' === mode) {
    return wasmModule.emitText();
  }

  var /** @const {!Uint8Array} */ binaryOutput = wasmModule.emitBinary();
  return new Uint8Array(binaryOutput.buffer);
};
