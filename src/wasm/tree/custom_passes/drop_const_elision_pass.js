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
  /** @type {string} */
  this.passName = 'drop-const-elision';
  /** @type {string} */
  this.phase = Wasm2Lang.Wasm.Tree.PassRunner.Phase.OPTIMIZE;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassModuleHook|undefined)} */
  this.validateModule = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionEnter = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionLeave = void 0;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass.prototype.enter_ = function (funcMetadata, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
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

  var /** @const {!BinaryenExpressionInfo} */ valueInfo = binaryen.getExpressionInfo(valuePtr);
  if (valueInfo.id !== binaryen.ConstId) {
    return null;
  }

  // drop(const X) -> nop: eliminate the dead drop.
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
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.DropConstElisionPass.prototype.createVisitor = function (funcMetadata) {
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: this.enter_.bind(this, funcMetadata)
  });
};
