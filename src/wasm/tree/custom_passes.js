'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses = {};

/**
 * Pass: drop-const-elision  (phase: optimize)
 *
 * Replaces drop(const) with nop.  A const literal has no side effects so
 * dropping its value is always dead.  The kernel's applyChildReplacement_
 * propagates the new nop pointer back into the parent expression.
 *
 * @private
 * @return {!Wasm2Lang.Wasm.Tree.Pass}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.createDropConstElisionPass_ = function () {
  return {
    passName: 'drop-const-elision',
    phase: 'optimize',
    /**
     * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
     * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
     */
    createVisitor: function (funcMetadata) {
      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
        /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
          /**
           * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
           * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
           */
          enter: function (nodeCtx) {
            var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
            // prettier-ignore
            var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression =
              /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (nodeCtx.expression);

            if (Number(expression['id']) !== binaryen.DropId) {
              return null;
            }

            var /** @const {number} */ valuePtr = Number(expression['value'] || 0);
            if (0 === valuePtr) {
              return null;
            }

            var /** @const {!BinaryenExpressionInfo} */ valueInfo = binaryen.getExpressionInfo(valuePtr);
            if (Number(valueInfo['id']) !== binaryen.ConstId) {
              return null;
            }

            // drop(const X) → nop: eliminate the dead drop.
            // prettier-ignore
            var /** @const {!BinaryenModule} */ mod =
              /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
            var /** @const {number} */ nopPtr = mod.nop();
            var /** @const {number} */ elim =
                /** @type {number} */ (funcMetadata.dropConstEliminations || 0) + 1;
            funcMetadata.dropConstEliminations = elim;

            return {
              decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
              expressionPointer: nopPtr
            };
          }
        });
      return visitor;
    }
  };
};

/**
 * Pass: local-usage-analysis  (phase: analyze)
 *
 * Counts how many times each local-variable index is read (local.get) in the
 * function body.  Results are stored in funcMetadata.localGetCounts as an
 * Object<string, number> keyed by the stringified local index.
 *
 * @private
 * @return {!Wasm2Lang.Wasm.Tree.Pass}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.createLocalUsageAnalysisPass_ = function () {
  return {
    passName: 'local-usage-analysis',
    phase: 'analyze',
    /**
     * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
     * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
     */
    createVisitor: function (funcMetadata) {
      // prettier-ignore
      var /** @const {!Object<string, number>} */ localGetCounts = /** @const {!Object<string, number>} */ (Object.create(null));
      funcMetadata.localGetCounts = localGetCounts;

      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
        /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
          /**
           * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
           * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
           */
          enter: function (nodeCtx) {
            var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
            // prettier-ignore
            var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression =
              /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (nodeCtx.expression);

            if (Number(expression['id']) !== binaryen.LocalGetId) {
              return null;
            }

            var /** @const {string} */ idx = String(Number(expression['index'] || 0));
            localGetCounts[idx] = (localGetCounts[idx] || 0) + 1;

            return null;
          }
        });
      return visitor;
    }
  };
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
    Wasm2Lang.Wasm.Tree.CustomPasses.createLocalUsageAnalysisPass_(),
    Wasm2Lang.Wasm.Tree.CustomPasses.createDropConstElisionPass_()
  ];
};
