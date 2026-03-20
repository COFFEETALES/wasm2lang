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
  if (!passRunResultIndex) {
    return null;
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata|void} */ fm = passRunResultIndex[funcName];
  if (!fm) {
    return null;
  }
  var /** @const {*} */ plans = fm.loopPlans;
  if (!plans) {
    return null;
  }
  return /** @type {?Wasm2Lang.Wasm.Tree.LoopPlan} */ (
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (plans)[loopName] || null
  );
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Returns true if the given loop name carries a label-elided prefix,
 * meaning backends should omit the label and emit plain break/continue.
 *
 * @suppress {accessControls}
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.isLabelElided = function (name) {
  var /** @const */ hp = Wasm2Lang.Backend.AbstractCodegen.hasPrefix_;
  return (
    hp(name, Wasm2Lang.Backend.AbstractCodegen.LF_FORLOOP_PREFIX_) ||
    hp(name, Wasm2Lang.Backend.AbstractCodegen.LE_DOWHILE_PREFIX_) ||
    hp(name, Wasm2Lang.Backend.AbstractCodegen.LY_WHILE_PREFIX_)
  );
};
