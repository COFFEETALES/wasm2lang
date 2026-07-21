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
 * Pattern A — named block whose child is a loop (optionally followed by
 *   unreachable, which binaryen may append after infinite loops):
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
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER = 'w2l_fused$';

/**
 * @private
 * @typedef {{
 *   fusionBlocks: !Object<string, boolean>,
 *   stripTrailingUnreachable: !Object<string, boolean>,
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_;

/**
 * Returns true when the loop body can only re-enter the loop or transfer
 * control out of it.  This proves that an {@code unreachable} immediately
 * following the loop is dead.  The proof deliberately accepts only a
 * trailing unconditional self-branch, optionally nested in blocks whose
 * labels cannot be used to bypass that branch.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {number} ptr
 * @param {string} loopName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.hasUnavoidableSelfBackEdge_ = function (
  binaryen,
  wasmModule,
  ptr,
  loopName
) {
  if (!ptr) return false;
  var /** @const {!BinaryenExpressionInfo} */ info = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ptr);
  if (binaryen.BreakId === info.id) {
    return /** @type {?string} */ (info.name) === loopName && 0 === /** @type {number} */ (info.condition || 0);
  }
  if (binaryen.BlockId !== info.id) {
    return false;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (info.children);
  if (!children || 0 === children.length) {
    return false;
  }
  var /** @const {number} */ lastIndex = children.length - 1;
  var /** @const {?string} */ blockName = /** @type {?string} */ (info.name);
  if (blockName) {
    for (var /** @type {number} */ i = 0; i < lastIndex; ++i) {
      if (Wasm2Lang.Wasm.Tree.CustomPasses.hasReference(binaryen, wasmModule, children[i], blockName)) {
        return false;
      }
    }
  }
  return Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.hasUnavoidableSelfBackEdge_(
    binaryen,
    wasmModule,
    children[lastIndex],
    loopName
  );
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.prototype.enter_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;

  if (binaryen.BlockId === id) {
    // Pattern A: named block whose sole child is a loop.
    var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
    if (!blockName) {
      return null;
    }
    var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
    if (!children || 0 === children.length || children.length > 2) {
      return null;
    }
    var /** @const {!BinaryenExpressionInfo} */ child = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
        binaryen,
        children[0]
      );
    if (binaryen.LoopId === child.id) {
      // Accept [loop] directly.  Binaryen may also retain [loop,
      // unreachable], but that suffix may only be discarded when every local
      // fallthrough path ends in an unavoidable self-backedge.  A branch to
      // a named tail block can bypass the backedge and makes the trap live.
      if (
        2 === children.length &&
        binaryen.UnreachableId !== Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[1]).id
      ) {
        return null;
      }
      if (2 === children.length) {
        var /** @const {?string} */ loopName = /** @type {?string} */ (child.name);
        var /** @const {number} */ loopBody = /** @type {number} */ (child.body || 0);
        if (
          !loopName ||
          !Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.hasUnavoidableSelfBackEdge_(
            binaryen,
            module,
            loopBody,
            loopName
          )
        ) {
          return null;
        }
        state.stripTrailingUnreachable[blockName] = true;
      }
      state.fusionBlocks[blockName] = true;
      var /** @const {*} */ fbRef = state.funcMetadata.fusedBlocks;
      if (fbRef) {
        /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (fbRef)[
          Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER + blockName
        ] = /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ ({fusionVariant: 'a'});
      }
    }
  } else if (binaryen.LoopId === id) {
    // Pattern B: loop whose sole body is a named block.
    var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
    if (!bodyPtr) {
      return null;
    }
    var /** @const {!BinaryenExpressionInfo} */ body = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, bodyPtr);
    if (binaryen.BlockId === body.id) {
      var /** @const {?string} */ bodyName = /** @type {?string} */ (body.name);
      if (bodyName) {
        state.fusionBlocks[bodyName] = true;
        var /** @const {*} */ fbRefB = state.funcMetadata.fusedBlocks;
        if (fbRefB) {
          /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (fbRefB)[
            Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER + bodyName
          ] = /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ ({fusionVariant: 'b'});
        }
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
  var /** @const {!BinaryenExpressionInfo} */ expr = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      nodeCtx.expressionPointer
    );
  if (binaryen.BlockId === expr.id) {
    var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
    if (blockName && blockName in state.stripTrailingUnreachable) {
      var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (expr.children || []);
      return {
        decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
        expressionPointer: module.block(
          Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER + blockName,
          [children[0]],
          expr.type
        )
      };
    }
  }
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyLeaveRenaming_(
    Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER,
    state.fusionBlocks,
    null,
    nodeCtx
  );
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.prototype.createVisitor = function (funcMetadata) {
  funcMetadata.fusedBlocks = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.BlockFusionPlan>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} */ state =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.State_} */ ({
      fusionBlocks: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      stripTrailingUnreachable: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      funcMetadata: funcMetadata
    });
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterLeaveVisitor(this, this.enter_, this.leave_, state);
};
