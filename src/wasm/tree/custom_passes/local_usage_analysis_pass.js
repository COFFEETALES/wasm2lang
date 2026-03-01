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
  /** @type {string} */
  this.passName = 'local-usage-analysis';
  /** @type {string} */
  this.phase = Wasm2Lang.Wasm.Tree.PassRunner.Phase.ANALYZE;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassModuleHook|undefined)} */
  this.validateModule = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionEnter = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionLeave = void 0;
};

/**
 * @private
 * @param {!Object<string, number>} localGetCounts
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalUsageAnalysisPass.prototype.enter_ = function (localGetCounts, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
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

  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: this.enter_.bind(this, localGetCounts)
  });
};
