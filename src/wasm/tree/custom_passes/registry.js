'use strict';

/**
 * Returns validation passes run immediately after parsing input wasm.
 *
 * @return {!Wasm2Lang.Wasm.Tree.PassList}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.getInputValidationPasses = function () {
  return [new Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass()];
};

/**
 * Returns the ordered list of wasm2lang normalization passes to apply during
 * the wasm2lang:codegen bundle.
 *
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Wasm2Lang.Wasm.Tree.PassList}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.getNormalizationPasses = function (options) {
  void options;
  return [
    new Wasm2Lang.Wasm.Tree.CustomPasses.LocalUsageAnalysisPass(),
    new Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass()
  ];
};
