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

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

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
    Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(
      passRunResultIndex,
      funcName,
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.ifElseRecoveries;
      },
      blockName
    )
  );
};

// ---------------------------------------------------------------------------
// Analysis descriptor
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'ifElseRecovery',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.ifElseRecoveries;
  },
  /** @param {!Object} raw @return {!Object} */ function (raw) {
    return Wasm2Lang.Wasm.Tree.CustomPasses.serializeProjectedPlanMap(
      raw,
      /** @param {*} plan @return {!Object} */ function (plan) {
        return {
          'chainLength': /** @type {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ (plan).chainLength,
          'labelRemoved': /** @type {!Wasm2Lang.Wasm.Tree.IfElseRecoveryPlan} */ (plan).labelRemoved
        };
      }
    );
  }
);
