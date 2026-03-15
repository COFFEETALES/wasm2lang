'use strict';

/**
 * Pass: local-usage-analysis  (phase: analyze)
 *
 * Counts how many times each local-variable index is read (local.get) in the
 * function body.  Results are stored in funcMetadata.localGetCounts as an
 * Object<string, number> keyed by the stringified local index.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalUsageAnalysisPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'local-usage-analysis',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.ANALYZE
  );
};

/**
 * @private
 * @param {!Object<string, number>} localGetCounts
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalUsageAnalysisPass.prototype.enter_ = function (localGetCounts, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression =
    /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (nodeCtx.expression);

  if (expression.id !== binaryen.LocalGetId) {
    return null;
  }

  var /** @const {string} */ idx = String(expression.index || 0);
  localGetCounts[idx] = (localGetCounts[idx] || 0) + 1;

  return null;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalUsageAnalysisPass.prototype.createVisitor = function (funcMetadata) {
  // prettier-ignore
  var /** @const {!Object<string, number>} */ localGetCounts = /** @const {!Object<string, number>} */ (Object.create(null));
  funcMetadata.localGetCounts = localGetCounts;

  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor(this, this.enter_, localGetCounts);
};
