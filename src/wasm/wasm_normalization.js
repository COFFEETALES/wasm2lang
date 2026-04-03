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

  for (var /** @type {number} */ i = 0, /** @const {number} */ passCount = validationPasses.length; i !== passCount; ++i) {
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
 * @param {boolean=} opt_skipI64Lowering  When true, the i64-to-i32 lowering
 *     passes are skipped (backend handles i64 natively).
 * @return {?Wasm2Lang.Wasm.Tree.PassRunResult}
 */
Wasm2Lang.Wasm.WasmNormalization.applyNormalizationBundles = function (wasmModule, options, opt_skipI64Lowering) {
  var /** @const {!Array<string>} */ bundles = options.normalizeWasm || ['binaryen:min'];
  if (0 === bundles.length) {
    return null;
  }

  var /** @const {!Array<string>} */ unknownBundles = [];

  for (var /** @type {number} */ i = bundles.length - 1; i !== -1; --i) {
    if ('object' !== typeof Wasm2Lang.Options.Schema.normalizeBundles[bundles[i]]) {
      unknownBundles[unknownBundles.length] = bundles.splice(i, 1).pop();
    }
  }

  if (0 !== unknownBundles.length) {
    throw new Error('Unknown normalization bundle(s): ' + unknownBundles.join(', '));
  }

  var /** @const {boolean} */ hasCodegen = -1 !== bundles.indexOf('wasm2lang:codegen');

  if (-1 === bundles.indexOf('binaryen:none')) {
    Wasm2Lang.Wasm.WasmNormalization.applyBinaryenNormalization_(
      wasmModule,
      -1 !== bundles.indexOf('binaryen:max'),
      !!opt_skipI64Lowering
    );
  }

  if (hasCodegen) {
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
 * @param {boolean} skipI64Lowering
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.applyBinaryenNormalization_ = function (wasmModule, aggressive, skipI64Lowering) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {!BinaryenFeatures} */ features = binaryen.Features;
  // Set the feature mask so binaryen's optimizer and passes recognize post-MVP
  // ops (bulk memory, sign-ext, non-trapping float-to-int).
  wasmModule.setFeatures(
    0 |
      features.NontrappingFPToInt |
      features.BulkMemory |
      features.BulkMemoryOpt |
      features.SignExt |
      features.MutableGlobals |
      features.SIMD128
  );

  if (aggressive) {
    // Run a full optimization pass before i64 lowering to inline small
    // functions, eliminate duplicates, and simplify instructions.
    binaryen.setOptimizeLevel(2);
    binaryen.setShrinkLevel(1);
    wasmModule.optimize();
  }
  // Lower i64 to pairs of i32 so backends only need to handle i32/f32/f64.
  // Backends that handle i64 natively (e.g. Java via `long`) skip this.
  // "remove-non-js-ops" converts i64 selects to if/else which the lowering
  // pass requires; both passes need flat IR so "flatten" runs before each.
  if (!skipI64Lowering) {
    wasmModule.runPasses(['flatten', 'remove-non-js-ops', 'flatten', 'i64-to-i32-lowering']);
  }
  if (aggressive) {
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
  // First round: "simplify-locals-nostructure" (tee allowed) folds
  // redundant set/get pairs that i64 lowering leaves behind.  The tee
  // nodes it creates are intentional — they let the simplifier see through
  // block boundaries and remove dead stores.  "coalesce-locals" then
  // merges locals whose live ranges no longer overlap, shrinking the
  // variable set further.  After that, a second "flatten" converts every
  // local.tee back to set+get, and "simplify-locals-notee-nostructure"
  // cleans up the final IR without reintroducing tee (which causes broken
  // multi-line ternaries in the codegen).
  // "reorder-locals" compacts local indices to a tighter layout.
  // "vacuum" removes unreachable code left by earlier passes.
  wasmModule.runPasses([
    'flatten',
    'simplify-locals-nostructure',
    'vacuum',
    'coalesce-locals',
    'vacuum',
    'flatten',
    'simplify-locals-notee-nostructure',
    'reorder-locals',
    'vacuum'
  ]);
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
