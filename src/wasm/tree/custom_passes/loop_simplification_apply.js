'use strict';

/**
 * Application logic for the loop simplification detection pass.
 *
 * This module owns the accessor for LoopPlan metadata produced by
 * LoopSimplificationPass, plus the label-elision utility.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication = {};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Returns the loop plan for a given function and loop name, or null if none.
 * Loop plans are produced by the LoopSimplificationPass and encode the
 * optimization kind (for-loop, do-while, while) and label-elision decision
 * as structured data, eliminating the need for prefix-string parsing.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} loopName
 * @return {?Wasm2Lang.Wasm.Tree.LoopPlan}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.getLoopPlan = function (passRunResultIndex, funcName, loopName) {
  return /** @type {?Wasm2Lang.Wasm.Tree.LoopPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(
      passRunResultIndex,
      funcName,
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.loopPlans;
      },
      loopName
    )
  );
};

// ---------------------------------------------------------------------------
// Analysis descriptor
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'loopSimplification',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.loopPlans;
  },
  /** @param {!Object} raw @return {!Object} */ function (raw) {
    return Wasm2Lang.Wasm.Tree.CustomPasses.serializeProjectedPlanMap(
      raw,
      /** @param {*} plan @return {!Object} */ function (plan) {
        return {'loopKind': /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ (plan).simplifiedLoopKind};
      }
    );
  }
);
