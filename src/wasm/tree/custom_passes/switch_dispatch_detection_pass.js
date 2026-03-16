'use strict';

/**
 * Pass: switch-dispatch-detection  (phase: codegen-prep)
 *
 * Detects the common br_table dispatch pattern — nested named blocks with a
 * Switch at the innermost level whose case targets are all in the nesting
 * chain — and marks the outermost block by prepending `sw$` to its label.
 *
 * When the dispatch chain is a first child of a parent block that has trailing
 * siblings (e.g. the outermost case's actions live outside the chain, common in
 * loop+switch state machines), the pass creates a wrapper block named
 * `sw$<chainOuter>` that includes the chain plus the trailing siblings, while
 * leaving any trailing unconditional break outside the wrapper so that the
 * loop simplification pass can still detect the LC (for(;;)) pattern.
 *
 * This file also contains RootSwitchDetectionPass (rs$ marker), which detects
 * root-level loop+switch structures above sw$ dispatch chains.  Both passes
 * share the same architectural concern — dispatch structure analysis — but
 * require separate traversals because rs$ detection depends on sw$ markers
 * being applied first.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'switch-dispatch-detection',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * Label prefix added to the outermost block of a br_table dispatch.
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER = 'sw$';

/**
 * @private
 * @typedef {{
 *   switchOuterBlocks: !Object<string, boolean>,
 *   switchNeedsWrapping: !Object<string, boolean>,
 *   chainBlocks: !Object<string, boolean>
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_;

/**
 * Detects whether a named Block is the outermost block of a br_table dispatch
 * pattern.  Returns true only when:
 *   - The block is named and has >= 2 children.
 *   - A chain of first-child named blocks leads to a block whose sole child
 *     is a Switch.
 *   - Every Switch case target (names array) is one of the blocks in the chain.
 *   - Every non-outermost intermediate block ends with an unconditional Break
 *     (to any target — not required to be the outermost block name).
 *   - The Switch default target may be outside the chain (external exit).
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} blockExpr
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.prototype.isBrTableDispatch_ = function (binaryen, blockExpr) {
  var /** @const {?string} */ outerName = /** @type {?string} */ (blockExpr.name);
  if (!outerName) {
    return false;
  }

  var /** @const {!Array<number>|void} */ outerChildren = /** @type {!Array<number>|void} */ (blockExpr.children);
  if (!outerChildren || 2 > outerChildren.length) {
    return false;
  }

  var /** @const {!Object<string, boolean>} */ blockNameSet = /** @type {!Object<string, boolean>} */ (Object.create(null));
  blockNameSet[outerName] = true;

  var /** @type {!BinaryenExpressionInfo} */ current = blockExpr;
  var /** @type {boolean} */ isOutermost = true;

  for (;;) {
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (current.children);
    var /** @const {number} */ firstChildPtr = children[0];
    if (!firstChildPtr) {
      return false;
    }

    var /** @const {!BinaryenExpressionInfo} */ firstChild = /** @type {!BinaryenExpressionInfo} */ (
        binaryen.getExpressionInfo(firstChildPtr)
      );
    if (firstChild.id !== binaryen.BlockId) {
      return false;
    }

    var /** @const {?string} */ childName = /** @type {?string} */ (firstChild.name);
    if (!childName) {
      return false;
    }
    blockNameSet[childName] = true;

    // Non-outermost blocks must end with an unconditional break.
    // The target can be anything (loop continue, outer exit, etc.).
    if (!isOutermost) {
      var /** @const {number} */ lastPtr = children[children.length - 1];
      var /** @const {!BinaryenExpressionInfo} */ lastExpr = /** @type {!BinaryenExpressionInfo} */ (
          binaryen.getExpressionInfo(lastPtr)
        );
      if (lastExpr.id !== binaryen.BreakId || 0 !== /** @type {number} */ (lastExpr.condition || 0)) {
        return false;
      }
    }

    // Check if firstChild is the innermost block (sole child = Switch).
    var /** @const {!Array<number>|void} */ fcChildren = /** @type {!Array<number>|void} */ (firstChild.children);
    if (fcChildren && 1 === fcChildren.length) {
      var /** @const {!BinaryenExpressionInfo} */ sole = /** @type {!BinaryenExpressionInfo} */ (
          binaryen.getExpressionInfo(fcChildren[0])
        );
      if (sole.id === binaryen.SwitchId) {
        var /** @const {!Array<string>} */ names = /** @type {!Array<string>} */ (sole.names || []);
        for (var /** number */ i = 0; i < names.length; ++i) {
          if (!(names[i] in blockNameSet)) {
            return false;
          }
        }
        // Default target is allowed to be outside the chain (external exit).
        return true;
      }
    }

    isOutermost = false;
    current = firstChild;
  }
};

/**
 * Collects the names of all blocks in a dispatch chain (including the
 * innermost wrapper) into the provided set.  This prevents intermediate
 * chain blocks from being independently detected as dispatch outers.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} blockExpr
 * @param {!Object<string, boolean>} out
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.prototype.collectChainBlockNames_ = function (
  binaryen,
  blockExpr,
  out
) {
  var /** @type {!BinaryenExpressionInfo} */ current = blockExpr;
  for (;;) {
    var /** @const {?string} */ curName = /** @type {?string} */ (current.name);
    if (curName) {
      out[curName] = true;
    }
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (current.children);
    var /** @const {number} */ fcPtr = children[0];
    if (!fcPtr) {
      return;
    }
    var /** @const {!BinaryenExpressionInfo} */ fc = /** @type {!BinaryenExpressionInfo} */ (binaryen.getExpressionInfo(fcPtr));
    if (fc.id !== binaryen.BlockId) {
      return;
    }
    current = fc;
  }
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.prototype.enter_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);

  if (expr.id !== binaryen.BlockId) {
    return null;
  }

  var /** @const {?string} */ checkName = /** @type {?string} */ (expr.name);
  if (checkName && checkName in state.chainBlocks) {
    return null;
  }

  if (!this.isBrTableDispatch_(binaryen, expr)) {
    return null;
  }

  var /** @const {string} */ name = /** @type {string} */ (checkName);
  state.switchOuterBlocks[name] = true;

  // Mark all chain block names so intermediate blocks are not re-detected.
  this.collectChainBlockNames_(binaryen, expr, state.chainBlocks);

  // Check if the dispatch chain needs parent wrapping: the chain is the first
  // child of a parent block that has additional trailing children (the
  // outermost case's actions live outside the chain).
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionAncestorList} */ ancestors = nodeCtx.ancestors;
  if (0 < ancestors.length) {
    var /** @const {!BinaryenExpressionInfo} */ parentExpr = /** @type {!BinaryenExpressionInfo} */ (
        ancestors[ancestors.length - 1]
      );
    if (parentExpr.id === binaryen.BlockId) {
      var /** @const {!Array<number>|void} */ parentChildren = /** @type {!Array<number>|void} */ (parentExpr.children);
      if (parentChildren && parentChildren.length > 1 && parentChildren[0] === nodeCtx.expressionPointer) {
        state.switchNeedsWrapping[name] = true;
      }
    }
  }

  return null;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.prototype.leave_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
      binaryen.getExpressionInfo(nodeCtx.expressionPointer)
    );
  var /** @const {string} */ M = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER;

  // Standard marker renaming for BreakId, SwitchId, and non-wrapping BlockId.
  var /** @const {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ renameResult =
      Wasm2Lang.Wasm.Tree.CustomPasses.applyMarkerRenaming_(
        M,
        state.switchOuterBlocks,
        state.switchNeedsWrapping,
        binaryen,
        module,
        expr
      );
  if (renameResult) {
    return renameResult;
  }

  // Parent wrapping: this block's first child is a dispatch chain outer
  // that needs wrapping.  Wrap the chain + trailing siblings in a new sw$
  // block, optionally excluding a trailing unconditional break so the loop
  // simplification pass can still detect the LC (for(;;)) pattern.
  if (expr.id === binaryen.BlockId) {
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (expr.children || []);
    if (children.length > 1) {
      var /** @const {number} */ fcPtr = children[0];
      var /** @const {!BinaryenExpressionInfo} */ fcInfo = /** @type {!BinaryenExpressionInfo} */ (
          binaryen.getExpressionInfo(fcPtr)
        );
      if (fcInfo.id === binaryen.BlockId) {
        var /** @const {?string} */ fcName = /** @type {?string} */ (fcInfo.name);
        if (fcName && fcName in state.switchNeedsWrapping) {
          var /** @const {!Array<number>} */ allChildren = children.slice(0);
          var /** @type {!Array<number>} */ wrapperChildren;

          var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
              binaryen.getExpressionInfo(allChildren[allChildren.length - 1])
            );
          if (lastInfo.id === binaryen.BreakId && 0 === /** @type {number} */ (lastInfo.condition || 0)) {
            wrapperChildren = allChildren.slice(0, allChildren.length - 1);
          } else {
            wrapperChildren = allChildren;
          }

          var /** @const {number} */ wrapperBlock = module.block(M + fcName, wrapperChildren, binaryen.none);
          var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);

          if (wrapperChildren.length < allChildren.length) {
            return {
              decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
              expressionPointer: module.block(blockName || null, [wrapperBlock, allChildren[allChildren.length - 1]], expr.type)
            };
          }
          return {
            decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
            expressionPointer: module.block(blockName || null, [wrapperBlock], expr.type)
          };
        }
      }
    }
  }

  return null;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.prototype.createVisitor = function (funcMetadata) {
  void funcMetadata;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_} */ state =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_} */ ({
      switchOuterBlocks: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      switchNeedsWrapping: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      chainBlocks: /** @type {!Object<string, boolean>} */ (Object.create(null))
    });
  var /** @const */ self = this;

  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.enter_(state, nc); },
    leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList=} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) { void cr; return self.leave_(state, nc); }
  });
};

// ===========================================================================================
// Phase 2: Root Switch Detection (rs$ marker)
//
// Detects a chain of outer blocks wrapping a loop whose body is a sw$-marked
// flat-switch dispatch.  Depends on sw$ markers from Phase 1 above.
// Registered as a separate pass because sw$ renaming must complete before
// rs$ detection can see the sw$ prefixes on inner blocks.
// ===========================================================================================

/**
 * Pass: root-switch-detection  (phase: codegen-prep)
 *
 * Detects a chain of outer blocks wrapping a loop whose body is a sw$-marked
 * flat-switch dispatch followed by an unconditional break to one of the outer
 * blocks.  The outermost block is marked with `rs$` so that backend emitters
 * can collapse the entire structure into a single loop+switch with inlined
 * exit paths — eliminating the outer block wrappers entirely.
 *
 * Expected input structure (after SwitchDispatchDetection + BlockLoopFusion):
 *
 *   block $A [                              // ← will be marked rs$
 *     block $B [
 *       block lb$C [                        // fused with loop (or plain block)
 *         loop $L [
 *           unnamed-block [sw$..., br $A]   // switch dispatch + fall-through br
 *         ]
 *       ]
 *       ... exit code for br lb$C ...
 *     ]
 *     ... exit code for br $B ...
 *   ]
 *   ... exit code for br $A ...             // (in parent's children after $A)
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'root-switch-detection',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * Label prefix added to the outermost block of a root-switch-loop pattern.
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.MARKER = 'rs$';

/**
 * @private
 * @typedef {{
 *   rootSwitchOuters: !Object<string, boolean>
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_;

/**
 * Checks whether a named block is the outermost block of a root-switch-loop
 * pattern.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} blockExpr
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.isRootSwitchOuter_ = function (binaryen, blockExpr) {
  var /** @const {?string} */ outerName = /** @type {?string} */ (blockExpr.name);
  if (!outerName) {
    return false;
  }
  // Must not already carry a recognized prefix.
  if (
    0 === outerName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER) ||
    0 === outerName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER)
  ) {
    return false;
  }

  var /** @const {!Array<number>|void} */ outerChildren = /** @type {!Array<number>|void} */ (blockExpr.children);
  if (!outerChildren || outerChildren.length < 2) {
    return false;
  }

  // Collect chain names for verifying the fall-through br target.
  var /** @const {!Object<string, boolean>} */ chainNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
  chainNames[outerName] = true;

  // Walk the first-child chain.
  var /** @type {!Object<string, *>} */ cur = blockExpr;
  for (;;) {
    var /** @const {!Array<number>} */ curChildren = /** @type {!Array<number>} */ (cur['children']);
    var /** @const {number} */ fcPtr = curChildren[0];
    var /** @const {!Object<string, *>} */ fcInfo = /** @type {!Object<string, *>} */ (binaryen.getExpressionInfo(fcPtr));
    var /** @const {number} */ fcId = /** @type {number} */ (fcInfo['id']);
    var /** @const {?string} */ fcName = /** @type {?string} */ (fcInfo['name'] || null);

    // Check for loop (direct child).
    if (fcId === binaryen.LoopId) {
      return this.checkLoopBody_(binaryen, fcInfo, chainNames);
    }

    if (fcId !== binaryen.BlockId || !fcName) {
      return false;
    }

    // Check for fused block (lb$ prefix) containing a loop.
    if (0 === fcName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER)) {
      chainNames[fcName] = true;
      var /** @const {!Array<number>|void} */ fusedChildren = /** @type {!Array<number>|void} */ (fcInfo['children']);
      if (!fusedChildren || 1 !== fusedChildren.length) {
        return false;
      }
      var /** @const {!Object<string, *>} */ fusedChild = /** @type {!Object<string, *>} */ (
          binaryen.getExpressionInfo(fusedChildren[0])
        );
      if (/** @type {number} */ (fusedChild['id']) !== binaryen.LoopId) {
        return false;
      }
      return this.checkLoopBody_(binaryen, fusedChild, chainNames);
    }

    // Skip sw$-prefixed blocks in the chain — already handled.
    if (0 === fcName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER)) {
      return false;
    }

    // Regular named block — must have exit code (children.length >= 2 in parent).
    if (curChildren.length < 2) {
      return false;
    }
    chainNames[fcName] = true;
    cur = fcInfo;
  }
};

/**
 * Verifies the loop body matches: [sw$block, ..., unconditional-br-to-chain].
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!Object<string, *>} loopInfo
 * @param {!Object<string, boolean>} chainNames
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.checkLoopBody_ = function (binaryen, loopInfo, chainNames) {
  var /** @const {number} */ bodyPtr = /** @type {number} */ (loopInfo['body']);
  if (0 === bodyPtr) {
    return false;
  }
  var /** @const {!Object<string, *>} */ bodyInfo = /** @type {!Object<string, *>} */ (binaryen.getExpressionInfo(bodyPtr));
  if (/** @type {number} */ (bodyInfo['id']) !== binaryen.BlockId) {
    return false;
  }
  var /** @const {!Array<number>|void} */ bodyChildren = /** @type {!Array<number>|void} */ (bodyInfo['children']);
  if (!bodyChildren || bodyChildren.length < 2) {
    return false;
  }

  // First child must be a sw$-prefixed block.
  var /** @const {!Object<string, *>} */ firstChild = /** @type {!Object<string, *>} */ (
      binaryen.getExpressionInfo(bodyChildren[0])
    );
  if (/** @type {number} */ (firstChild['id']) !== binaryen.BlockId) {
    return false;
  }
  var /** @const {?string} */ fcName = /** @type {?string} */ (firstChild['name'] || null);
  if (!fcName || 0 !== fcName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER)) {
    return false;
  }

  // Last child must be an unconditional br targeting one of the chain blocks.
  var /** @const {!Object<string, *>} */ lastChild = /** @type {!Object<string, *>} */ (
      binaryen.getExpressionInfo(bodyChildren[bodyChildren.length - 1])
    );
  if (/** @type {number} */ (lastChild['id']) !== binaryen.BreakId) {
    return false;
  }
  if (0 !== /** @type {number} */ (lastChild['condition'] || 0)) {
    return false;
  }
  var /** @const {string} */ brTarget = /** @type {string} */ (lastChild['name']);
  return true === chainNames[brTarget];
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} st
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.enter_ = function (st, nodeCtx) {
  var /** @const {!Object<string, *>} */ expression = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expression['id']);
  var /** @const {!Binaryen} */ binaryen = /** @type {!Binaryen} */ (nodeCtx.binaryen);

  if (id === binaryen.BlockId) {
    var /** @const {?string} */ name = /** @type {?string} */ (expression['name'] || null);
    if (
      name &&
      !st.rootSwitchOuters[name] &&
      this.isRootSwitchOuter_(binaryen, /** @type {!BinaryenExpressionInfo} */ (expression))
    ) {
      st.rootSwitchOuters[name] = true;
    }
  }

  return null;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} st
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.leave_ = function (st, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
      binaryen.getExpressionInfo(nodeCtx.expressionPointer)
    );
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyMarkerRenaming_(
    Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.MARKER,
    st.rootSwitchOuters,
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
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.createVisitor = function (funcMetadata) {
  void funcMetadata;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} */ st =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} */ ({
      rootSwitchOuters: /** @type {!Object<string, boolean>} */ (Object.create(null))
    });
  var /** @const */ self = this;

  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.enter_(st, nc); },
    leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList=} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) { void cr; return self.leave_(st, nc); }
  });
};
