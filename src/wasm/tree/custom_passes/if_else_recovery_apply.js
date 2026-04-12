'use strict';

/**
 * Application logic for the if-else recovery pass.
 *
 * This module owns the accessor for IfElseRecoveryPlan metadata produced by
 * IfElseRecoveryPass, plus the analysis descriptor for postbuild testing.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryApplication = {};

/** @const {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} */
var extractIfElseRecoveries_ = /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
  return fm.ifElseRecoveries;
};

/**
 * Returns the IfElseRecoveryPlan for the given block, or null.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {?Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.IfElseRecoveryApplication.getIfElseRecoveryPlan = function (
  passRunResultIndex,
  funcName,
  blockName
) {
  return /** @type {?Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(passRunResultIndex, funcName, extractIfElseRecoveries_, blockName)
  );
};

Wasm2Lang.Wasm.Tree.CustomPasses.registerProjectedPlanAnalysis_(
  'ifElseRecovery',
  extractIfElseRecoveries_,
  /** @param {*} plan @return {!Object} */ function (plan) {
    var /** @const {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ p = /** @type {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ (
        plan
      );
    return {'chainLength': p.chainLength, 'labelRemoved': p.labelRemoved};
  }
);
