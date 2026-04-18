'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.WasmNormalization = {};

/**
 * Feature mask shared by {@code readWasmModule} (early, so validation sees
 * post-MVP ops) and {@code applyBinaryenNormalization_} (for optimizer
 * passes).
 *
 * @private
 * @param {!Binaryen} binaryen
 * @return {number}
 */
Wasm2Lang.Wasm.WasmNormalization.getFeatureMask_ = function (binaryen) {
  var /** @const {!BinaryenFeatures} */ f = binaryen.Features;
  return 0 | f.NontrappingFPToInt | f.BulkMemory | f.BulkMemoryOpt | f.SignExt | f.MutableGlobals | f.SIMD128;
};

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

  // Enable post-MVP features early so the validation pass can traverse
  // sign-ext, mutable-globals, bulk-memory, etc. without errors.
  wasmModule.setFeatures(Wasm2Lang.Wasm.WasmNormalization.getFeatureMask_(binaryen));

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
      !!opt_skipI64Lowering,
      options.languageOut || 'asmjs'
    );
  }

  if (hasCodegen) {
    var /** @const {!Wasm2Lang.Wasm.Tree.PassRunResult} */ passRunResult =
        Wasm2Lang.Wasm.WasmNormalization.applyWasm2LangNormalization_(wasmModule, options);
    var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
    Wasm2Lang.Wasm.Tree.CustomPasses.MetadataSection.serializePassRunResult(wasmModule, passRunResult, binaryen);
    // Enable debug info so the "name" custom section is emitted in the
    // binary output.  The metadata section identifies functions by name,
    // and the name section is required for those names to survive the
    // binary round-trip.
    binaryen.setDebugInfo(true);
    return passRunResult;
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
 * @param {string} targetLanguage
 * @return {void}
 */
Wasm2Lang.Wasm.WasmNormalization.applyBinaryenNormalization_ = function (
  wasmModule,
  aggressive,
  skipI64Lowering,
  targetLanguage
) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {boolean} */ isJsTarget = 'asmjs' === targetLanguage;
  // Feature mask already set by readWasmModule; refresh in case the caller
  // bypassed that entry point.
  wasmModule.setFeatures(Wasm2Lang.Wasm.WasmNormalization.getFeatureMask_(binaryen));

  // Phase 1 — Pre-lowering.
  if (isJsTarget) {
    // Simplify ops that map poorly to JS (e.g. reinterprets, copysign)
    // before any lowering touches the IR.
    wasmModule.runPasses(['optimize-for-js']);
  }

  // Phase 2 — i64 lowering.
  // Lower i64 to pairs of i32 so backends only need to handle i32/f32/f64.
  // Backends that handle i64 natively (e.g. Java via `long`) skip this.
  // "remove-non-js-ops" converts i64 selects to if/else which the lowering
  // pass requires; both passes need flat IR so "flatten" runs before each.
  if (!skipI64Lowering) {
    wasmModule.runPasses(['flatten', 'remove-non-js-ops', 'flatten', 'i64-to-i32-lowering']);
  }

  // Phase 3 — Post-lowering optimization (aggressive only).
  // Following wasm2js's approach: propagate constants first (especially
  // effective on i64 lowering artifacts), then run a full optimization
  // pass to inline, simplify, and eliminate dead code.
  var /** @type {boolean} */ optimizeSucceeded = false;
  if (aggressive) {
    var /** @const {!Array<string>} */ postLoweringPasses = ['simplify-locals-nonesting', 'precompute-propagate'];
    if (isJsTarget) {
      // Avoid-reinterprets benefits from propagation; run before and after
      // full optimization since the optimizer can reintroduce patterns.
      postLoweringPasses[postLoweringPasses.length] = 'avoid-reinterprets';
    }
    wasmModule.runPasses(postLoweringPasses);
    binaryen.setOptimizeLevel(2);
    binaryen.setShrinkLevel(1);
    try {
      wasmModule.optimize();
      optimizeSucceeded = true;
    } catch (e) {
      // Binaryen's optimizer can Fatal() on certain IR patterns produced
      // by i64 lowering.  The module is still usable in its pre-optimize
      // state — skip the full optimization and continue.
    }
    if (isJsTarget) {
      wasmModule.runPasses(['avoid-reinterprets']);
    }
  }

  // Phase 4 — Final IR preparation (shared).
  // "flatten" inserts explicit returns at block ends so later codegen sees
  // concrete control flow.
  // First round: "simplify-locals-nostructure" (tee allowed) folds
  // redundant set/get pairs that i64 lowering leaves behind.  The tee
  // nodes it creates are intentional — they let the simplifier see through
  // block boundaries and remove dead stores.  A second "flatten" converts
  // every local.tee back to set+get, and "simplify-locals-notee-nostructure"
  // cleans up the final IR without reintroducing tee (which causes broken
  // multi-line ternaries in the codegen).
  // "merge-blocks" merges adjacent blocks, reducing nesting.
  // "optimize-instructions" peepholes algebraic patterns (e.g.
  // {@code sub(x, -C)} → {@code add(x, C)}) on the stabilized IR.
  // "reorder-locals" compacts local indices to a tighter layout.
  // "remove-unused-names" strips unreferenced block/loop labels.
  // "vacuum" removes unreachable code left by earlier passes.
  // Phase 4a — Flatten + simplify pair.  This is the stage that inflates the
  // per-function local count (flatten lifts every nested expression into a
  // temp local); the subsequent simplify-locals-* passes reclaim most of
  // them but can leave thousands behind on very large functions.
  wasmModule.runPasses(['flatten', 'simplify-locals-nostructure', 'vacuum', 'merge-blocks']);
  wasmModule.runPasses(['flatten', 'simplify-locals-notee-nostructure']);

  // Phase 4b — coalesce-locals (optional).  The interference graph is O(L²)
  // per function.  Real-world modules produced by i64 lowering + flatten
  // have been observed with a single function of 60k+ locals, which makes
  // coalesce-locals run effectively forever.  Gate it on a per-function
  // local-count probe taken AFTER Phase 4a — this reflects the actual
  // input the pass sees.
  //
  // TODO: revisit / drop this gate once upstream binaryen makes
  // coalesce-locals resilient to very large local counts.  The check is
  // purely a defensive workaround — if the pass itself becomes cheap, the
  // threshold can be removed and coalesce-locals re-enabled unconditionally
  // when {@code optimizeSucceeded} is true.
  if (optimizeSucceeded && !Wasm2Lang.Wasm.WasmNormalization.hasPathologicalLocalCount_(wasmModule, binaryen, 2000)) {
    wasmModule.runPasses(['coalesce-locals']);
  }

  // Phase 4c — peephole + final cleanup.
  wasmModule.runPasses(['optimize-instructions', 'reorder-locals', 'remove-unused-names', 'vacuum']);
  if (aggressive) {
    // remove-unused-module-elements + DCE at the end ensures all IR nodes
    // have valid types before wasm2lang custom passes.  Run separately
    // because remove-unused-module-elements can Fatal() on certain
    // i64-lowered IR patterns.
    try {
      wasmModule.runPasses(['remove-unused-module-elements', 'dce']);
    } catch (e) {
      // Fall back to DCE alone — it handles most cleanup on its own.
      wasmModule.runPasses(['dce']);
    }
  }
};

/**
 * Returns true when any function in the module has at least {@code threshold}
 * locals (params + vars).  Used to gate coalesce-locals on oversized
 * post-flatten IRs — see the Phase 4b comment in applyBinaryenNormalization_.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {number} threshold
 * @return {boolean}
 */
Wasm2Lang.Wasm.WasmNormalization.hasPathologicalLocalCount_ = function (wasmModule, binaryen, threshold) {
  var /** @const {number} */ functionCount = wasmModule.getNumFunctions();
  for (var /** @type {number} */ i = 0; i !== functionCount; ++i) {
    var /** @const {number} */ functionPtr = wasmModule.getFunctionByIndex(i);
    var /** @const {!BinaryenFunctionInfo} */ info = /** @type {!BinaryenFunctionInfo} */ (
        binaryen.getFunctionInfo(functionPtr)
      );
    var /** @const {!Array} */ vars = /** @type {!Array} */ (info.vars || []);
    var /** @const {!Array} */ paramTypes = /** @type {!Array} */ (binaryen.expandType(info.params));
    if (paramTypes.length + vars.length >= threshold) {
      return true;
    }
  }
  return false;
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
