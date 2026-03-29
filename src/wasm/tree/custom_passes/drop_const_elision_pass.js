'use strict';

/**
 * Pass: drop-const-elision  (phase: optimize)
 *
 * Replaces drop(const) with nop.  A const literal has no side effects so
 * dropping its value is always dead.  The kernel's applyChildReplacement_
 * propagates the new nop pointer back into the parent expression.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'drop-const-elision',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.OPTIMIZE
  );
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass.prototype.enter_ = function (funcMetadata, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression =
    /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (nodeCtx.expression);

  if (expression.id !== binaryen.DropId) {
    return null;
  }

  var /** @const {number} */ valuePtr = expression.value || 0;
  if (0 === valuePtr) {
    return null;
  }

  var /** @const {!BinaryenExpressionInfo} */ valueInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      valuePtr
    );
  if (valueInfo.id !== binaryen.ConstId) {
    return null;
  }

  // drop(const X) -> nop: eliminate the dead drop.
  // prettier-ignore
  var /** @const {!BinaryenModule} */ mod =
    /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {number} */ nopPtr = mod.nop();
  var /** @const {number} */ elim = /** @type {number} */ (funcMetadata.dropConstEliminations || 0) + 1;
  funcMetadata.dropConstEliminations = elim;

  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: nopPtr
  };
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass.prototype.createVisitor = function (funcMetadata) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor(this, this.enter_, funcMetadata);
};
