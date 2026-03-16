'use strict';

/**
 * Pass: block-loop-fusion  (phase: codegen-prep)
 *
 * Detects two redundant block+loop nesting patterns and marks the block by
 * prepending `lb$` to its label.  After the label-prefixing pass the marker
 * becomes `lb$…`, which backend emitters recognise and use to
 * suppress the block wrapper, collapsing the two nesting levels into one
 * `while` loop.
 *
 * Pattern A — named block whose sole child is a loop:
 *   (block $b (loop $l body))  →  mark $b
 *   br $b  = exit block = break out of the loop
 *   br $l  = re-enter loop = continue
 *
 * Pattern B — loop whose sole child (body) is a named block:
 *   (loop $l (block $b body))  →  mark $b
 *   br $b  = exit block → loop body done → loop exits = break
 *   br $l  = re-enter loop = continue
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'block-loop-fusion',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * Label prefix added to fused blocks.
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER = 'lb$';

/**
 * @private
 * @typedef {{
 *   fusionBlocks: !Object<string, boolean>
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_;

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.prototype.enter_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);

  if (binaryen.BlockId === id) {
    // Pattern A: named block whose sole child is a loop.
    var /** @const {?string} */ blockName = /** @type {?string} */ (expr['name']);
    if (!blockName) {
      return null;
    }
    var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr['children']);
    if (!children || 1 !== children.length) {
      return null;
    }
    var /** @const {!Object<string, *>} */ child = /** @type {!Object<string, *>} */ (binaryen.getExpressionInfo(children[0]));
    if (child['id'] === binaryen.LoopId) {
      state.fusionBlocks[blockName] = true;
    }
  } else if (binaryen.LoopId === id) {
    // Pattern B: loop whose sole body is a named block.
    var /** @const {number} */ bodyPtr = /** @type {number} */ (expr['body']);
    if (!bodyPtr) {
      return null;
    }
    var /** @const {!Object<string, *>} */ body = /** @type {!Object<string, *>} */ (binaryen.getExpressionInfo(bodyPtr));
    if (body['id'] === binaryen.BlockId) {
      var /** @const {?string} */ bodyName = /** @type {?string} */ (body['name']);
      if (bodyName) {
        state.fusionBlocks[bodyName] = true;
      }
    }
  }

  return null;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.prototype.leave_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
      binaryen.getExpressionInfo(nodeCtx.expressionPointer)
    );
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyMarkerRenaming_(
    Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER,
    state.fusionBlocks,
    null,
    binaryen,
    module,
    expr
  );
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.prototype.createVisitor = function (funcMetadata) {
  void funcMetadata;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} */ state =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} */ ({
      fusionBlocks: /** @type {!Object<string, boolean>} */ (Object.create(null))
    });
  var /** @const */ self = this;

  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.enter_(state, nc); },
    leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList=} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) { void cr; return self.leave_(state, nc); }
  });
};
