'use strict';

/**
 * Pass: redundant-block-removal  (phase: codegen-prep)
 *
 * Removes named blocks whose labels are never referenced in their subtree.
 *
 * Single-child case:
 *   (block $B child)  →  child          (when $B unreferenced)
 *
 * Multi-child case:
 *   (block $B c1 c2...)  →  (block c1 c2...)  (label removed, block kept)
 *
 * This pass runs last in the pipeline and cleans up blocks made redundant by
 * earlier passes (fusion, loop simplification, guard elision, etc.).
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'redundant-block-removal',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * @private
 * @typedef {{
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass.State_;

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass.prototype.leave_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, nodeCtx.expressionPointer)
    );

  if (binaryen.BlockId !== expr.id) {
    return null;
  }

  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  if (!blockName) {
    return null;
  }

  // Skip blocks with pass-specific prefixes — they carry semantic meaning.
  if (0 === blockName.indexOf('sw$') || 0 === blockName.indexOf('rs$')) {
    return null;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || 0 === children.length) {
    return null;
  }

  // -----------------------------------------------------------------------
  // Check whether blockName is referenced anywhere in the children.
  // -----------------------------------------------------------------------
  var /** @const {function(!Binaryen, number, string): boolean} */ hasRefFn =
      Wasm2Lang.Wasm.Tree.CustomPasses.hasReference;
  var /** @const {number} */ childCount = children.length;

  for (var /** @type {number} */ i = 0; i < childCount; ++i) {
    if (hasRefFn(binaryen, children[i], blockName)) {
      return null; // Label is still referenced — keep the block.
    }
  }

  // -----------------------------------------------------------------------
  // Store metadata.
  // -----------------------------------------------------------------------
  var /** @const {*} */ plansRef = state.funcMetadata.redundantBlockRemovals;
  if (plansRef) {
    /** @type {!Object<string, boolean>} */ (plansRef)[blockName] = 1 === childCount;
  }

  // -----------------------------------------------------------------------
  // Single child: unwrap entirely.
  // -----------------------------------------------------------------------
  if (1 === childCount) {
    return {
      decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
      expressionPointer: children[0]
    };
  }

  // -----------------------------------------------------------------------
  // Multiple children: remove the label (make the block unnamed).
  // -----------------------------------------------------------------------
  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: module.block(null, /** @type {!Array<number>} */ ([].slice.call(children)), expr.type)
  };
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass.prototype.createVisitor = function (funcMetadata) {
  funcMetadata.redundantBlockRemovals = /** @type {!Object<string, boolean>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass.State_} */ state =
    /** @type {!Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalPass.State_} */ ({
      funcMetadata: funcMetadata
    });
  return /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    leave: this.leave_.bind(this, state)
  });
};
