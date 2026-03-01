'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.WasmNormalization = {};

/**
 * @param {(string|!Uint8Array|null)} inputData
 * @return {!BinaryenModule}
 */
Wasm2Lang.Wasm.WasmNormalization.readWasmModule = function (inputData) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
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
  return /** @const {!BinaryenModule} */ (wasmModule);
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.validateInputModule_ = function (wasmModule) {
  // prettier-ignore
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
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.applyNormalizationBundles = function (wasmModule, options) {
  var /** @const {!Array<string>} */ bundles = options.normalizeWasm || ['binaryen:min'];
  if (0 === bundles.length) {
    return;
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
    Wasm2Lang.Wasm.WasmNormalization.applyWasm2LangNormalization_(wasmModule, options);
  }
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.applyWasm2LangNormalization_ = function (wasmModule, options) {
  var /** @const {!Wasm2Lang.Wasm.Tree.PassList} */ passes = Wasm2Lang.Wasm.Tree.CustomPasses.getNormalizationPasses(options);
  Wasm2Lang.Wasm.Tree.PassRunner.runOnModule(wasmModule, passes);
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {boolean} aggressive
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.applyBinaryenNormalization_ = function (wasmModule, aggressive) {
  // "flatten" inserts explicit returns at block ends so later codegen sees concrete control flow.
  // "simplify-locals" merges redundant local set patterns to reduce local noise.
  // "reorder-locals" compacts local indices to a tighter layout.
  // "vacuum" removes unreachable code left by earlier passes.
  wasmModule.runPasses(['flatten', 'simplify-locals', 'reorder-locals', 'vacuum']);
};

// /**
//  * @private
//  * @param {!BinaryenModule} wasmModule
//  * @param {!Array<string>} passList
//  * @return {void}
//  */
// Wasm2Lang.Wasm.WasmNormalization.runBinaryenFunctionPasses_ = function (wasmModule, passList) {
//   var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
//   var /** @const {number} */ functionCount = wasmModule.getNumFunctions();
//
//   for (var /** number */ i = 0; i !== functionCount; ++i) {
//     var /** @const {number} */ funcPtr = wasmModule.getFunctionByIndex(i);
//     var /** @const {!BinaryenFunctionInfo} */ funcInfo = binaryen.getFunctionInfo(funcPtr);
//     if ('' === funcInfo['base']) {
//       wasmModule.runPassesOnFunction(funcInfo.name, passList);
//     }
//   }
// };

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
