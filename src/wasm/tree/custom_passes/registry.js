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
 * the wasm2lang:codegen bundle. Passes listed in {@code options.disabledPasses}
 * are skipped so individual transformations can be bisected.
 *
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Wasm2Lang.Wasm.Tree.PassList}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.getNormalizationPasses = function (options) {
  var /** @const {!Array<string>} */ disabled = options.disabledPasses || [];
  var /** @const {!Wasm2Lang.Wasm.Tree.PassList} */ all = [
      new Wasm2Lang.Wasm.Tree.CustomPasses.LocalUsageAnalysisPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.ConstConditionFoldingPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryPass(),
      new Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass()
    ];
  if (0 === disabled.length) {
    return all;
  }
  return /** @type {!Wasm2Lang.Wasm.Tree.PassList} */ (
    all.filter(function (pass) {
      var /** @const {string} */ passName = pass.passName || '';
      var /** @const {string} */ camel = Wasm2Lang.Wasm.Tree.CustomPasses.toCamelCasePassName_(passName);
      for (var /** @type {number} */ i = 0, /** @const {number} */ len = disabled.length; i !== len; ++i) {
        var /** @const {string} */ token = disabled[i];
        if (token === passName || token === camel || token === camel + 'Pass' || token + 'Pass' === camel) {
          return false;
        }
      }
      return true;
    })
  );
};

/**
 * Converts a kebab-case pass name ("if-else-recovery") to CamelCase
 * ("IfElseRecovery") so disable-pass tokens can match either form.
 *
 * @private
 * @param {string} passName
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.toCamelCasePassName_ = function (passName) {
  var /** @const {!Array<string>} */ parts = passName.split('-');
  var /** @type {string} */ out = '';
  for (var /** @type {number} */ i = 0, /** @const {number} */ n = parts.length; i !== n; ++i) {
    var /** @const {string} */ part = parts[i];
    if (0 !== part.length) {
      out += part.charAt(0).toUpperCase() + part.substring(1);
    }
  }
  return out;
};
