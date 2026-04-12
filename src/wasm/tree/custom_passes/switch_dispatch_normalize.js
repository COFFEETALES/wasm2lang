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
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER = 'w2l_switch$';

/**
 * @private
 * @typedef {{
 *   switchOuterBlocks: !Object<string, boolean>,
 *   switchNeedsWrapping: !Object<string, boolean>,
 *   chainBlocks: !Object<string, boolean>,
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_;

/**
 * Detects whether a named Block is the outermost block of a br_table dispatch
 * pattern and, when it is, returns the set of all block names in the chain.
 * Returns null when the pattern is not matched.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} blockExpr
 * @return {?Object<string, boolean>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.prototype.isBrTableDispatch_ = function (binaryen, blockExpr) {
  var /** @const {?string} */ outerName = /** @type {?string} */ (blockExpr.name);
  if (!outerName) {
    return null;
  }

  var /** @const {!Array<number>|void} */ outerChildren = /** @type {!Array<number>|void} */ (blockExpr.children);
  if (!outerChildren || 2 > outerChildren.length) {
    return null;
  }

  var /** @const {!Object<string, boolean>} */ blockNameSet = /** @type {!Object<string, boolean>} */ (Object.create(null));
  blockNameSet[outerName] = true;

  var /** @type {!BinaryenExpressionInfo} */ current = blockExpr;
  var /** @type {boolean} */ isOutermost = true;

  for (;;) {
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (current.children);
    var /** @const {number} */ firstChildPtr = children[0];
    if (!firstChildPtr) {
      return null;
    }

    var /** @const {!BinaryenExpressionInfo} */ firstChild = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, firstChildPtr)
      );
    if (binaryen.BlockId !== firstChild.id) {
      return null;
    }

    var /** @const {?string} */ childName = /** @type {?string} */ (firstChild.name);
    if (!childName) {
      return null;
    }
    blockNameSet[childName] = true;

    // Non-outermost blocks must end with an unconditional terminator —
    // an unconditional Break (to a loop continue, outer exit, etc.), a
    // Return, or an Unreachable.  Terminator-ended blocks let control
    // flow match the br_table dispatch pattern even when intermediate
    // cases don't break to the next chain level.
    if (!isOutermost) {
      var /** @const {number} */ lastPtr = children[children.length - 1];
      var /** @const {!BinaryenExpressionInfo} */ lastExpr = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, lastPtr)
        );
      if (!Wasm2Lang.Wasm.Tree.CustomPasses.isUnconditionalTerminator(binaryen, lastExpr)) {
        return null;
      }
    }

    // Check if firstChild is the innermost block (sole child = Switch).
    var /** @const {!Array<number>|void} */ fcChildren = /** @type {!Array<number>|void} */ (firstChild.children);
    if (fcChildren && 1 === fcChildren.length) {
      var /** @const {!BinaryenExpressionInfo} */ sole = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fcChildren[0])
        );
      if (binaryen.SwitchId === sole.id) {
        var /** @const {!Array<string>} */ names = /** @type {!Array<string>} */ (sole.names || []);
        for (var /** @type {number} */ i = 0, /** @const {number} */ nameLen = names.length; i < nameLen; ++i) {
          if (!(names[i] in blockNameSet)) {
            return null;
          }
        }
        // Default target is allowed to be outside the chain (external exit).
        return blockNameSet;
      }
    }

    isOutermost = false;
    current = firstChild;
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

  if (binaryen.BlockId !== expr.id) {
    return null;
  }

  var /** @const {?string} */ checkName = /** @type {?string} */ (expr.name);
  if (checkName && checkName in state.chainBlocks) {
    return null;
  }

  var /** @const {?Object<string, boolean>} */ chainNames = this.isBrTableDispatch_(binaryen, expr);
  if (!chainNames) {
    return null;
  }

  var /** @const {string} */ name = /** @type {string} */ (checkName);
  state.switchOuterBlocks[name] = true;
  var /** @const {*} */ sdRef = state.funcMetadata.switchDispatchNames;
  if (sdRef) {
    /** @type {!Object<string, boolean>} */ (sdRef)[
      Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER + name
    ] = true;
  }

  // Mark all chain block names so intermediate blocks are not re-detected.
  for (var /** @type {string} */ cn in chainNames) {
    state.chainBlocks[cn] = true;
  }

  // Check if the dispatch chain needs parent wrapping: the chain is the first
  // child of a parent block that has additional trailing children (the
  // outermost case's actions live outside the chain).
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionAncestorList} */ ancestors = nodeCtx.ancestors;
  if (0 < ancestors.length) {
    var /** @const {!BinaryenExpressionInfo} */ parentExpr = /** @type {!BinaryenExpressionInfo} */ (
        ancestors[ancestors.length - 1]
      );
    if (binaryen.BlockId === parentExpr.id) {
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
  var /** @const {string} */ M = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER;
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  // Suppress ALL marker renaming — use switchOuterBlocks as its own exclusion
  // set so no BreakId/SwitchId/BlockId referencing a dispatch outer is renamed.
  // Instead, non-wrapping outers get a new wrapper block (consistent with the
  // wrapping case which already uses a wrapper without renaming).
  var /** @const {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ renameResult =
      Wasm2Lang.Wasm.Tree.CustomPasses.applyLeaveRenaming_(M, state.switchOuterBlocks, state.switchOuterBlocks, nodeCtx);
  if (renameResult) {
    return renameResult;
  }

  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  // prettier-ignore
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  // prettier-ignore
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
    Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,nodeCtx.expressionPointer)
  );

  if (binaryen.BlockId !== expr.id) {
    return null;
  }

  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);

  // --- Non-wrapping dispatch outer: wrap in a marker block ---
  // The original block keeps its name; breaks inside action code continue to
  // target it.  The wrapper provides the w2l_switch$ marker the backend uses
  // for detection.  An explicit br to the wrapper name at the end of the
  // inner block ensures the outermost case body terminates in the JS switch.
  if (blockName && blockName in state.switchOuterBlocks && !(blockName in state.switchNeedsWrapping)) {
    var /** @const {!Array<number>} */ innerChildren = /** @type {!Array<number>} */ ((expr.children || []).slice(0));
    innerChildren[innerChildren.length] = module.break(M + blockName, 0, 0);
    var /** @const {number} */ innerBlock = module.block(blockName, innerChildren, expr.type);
    return {
      decisionAction: REPLACE_NODE,
      expressionPointer: module.block(M + blockName, [innerBlock], expr.type)
    };
  }

  // --- Wrapping dispatch outer: add explicit terminal break ---
  // Ensures the outermost case body terminates when emitted as a JS switch
  // case.  The break targets the block's own name (exits to the epilogue
  // inside the wrapper that the parent creates).  Return/Unreachable tails
  // also count as terminators — no additional synthetic break is needed.
  if (blockName && blockName in state.switchNeedsWrapping) {
    var /** @const {!Array<number>} */ wrapChildren = /** @type {!Array<number>} */ ((expr.children || []).slice(0));
    var /** @type {boolean} */ hasTerminal = false;
    if (wrapChildren.length > 0) {
      var /** @const {!BinaryenExpressionInfo} */ tailInfo = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, wrapChildren[wrapChildren.length - 1])
        );
      hasTerminal = Wasm2Lang.Wasm.Tree.CustomPasses.isUnconditionalTerminator(binaryen, tailInfo);
    }
    if (!hasTerminal) {
      wrapChildren[wrapChildren.length] = module.break(blockName, 0, 0);
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.block(blockName, wrapChildren, expr.type)
      };
    }
  }

  // --- Parent wrapping: first child is a dispatch outer needing a wrapper ---
  // Wrap the chain + trailing siblings in a new w2l_switch$ block, optionally
  // excluding a trailing unconditional break so the loop simplification pass
  // can still detect the LC (for(;;)) pattern.
  var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (expr.children || []);
  if (children.length > 1) {
    var /** @const {number} */ fcPtr = children[0];
    var /** @const {!BinaryenExpressionInfo} */ fcInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fcPtr)
      );
    if (binaryen.BlockId === fcInfo.id) {
      var /** @const {?string} */ fcName = /** @type {?string} */ (fcInfo.name);
      if (fcName && fcName in state.switchNeedsWrapping) {
        var /** @const {!Array<number>} */ allChildren = children.slice(0);
        var /** @type {!Array<number>} */ wrapperChildren;

        var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
            Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, allChildren[allChildren.length - 1])
          );
        var /** @const {boolean} */ excludeLast =
            binaryen.BreakId === lastInfo.id && 0 === /** @type {number} */ (lastInfo.condition || 0);
        wrapperChildren = excludeLast ? allChildren.slice(0, allChildren.length - 1) : allChildren;

        // Wrapper type must stay {@code none} so binary round-trip does not
        // collapse the outer unnamed parent block into the wrapper.  When
        // parent and wrapper carry identical non-{@code none} types, binaryen
        // may flatten the parent — shifting every DFS position inside the
        // function and invalidating the {@code w2l_codegen_meta} pointers.
        // Trailing children here always terminate (return / unreachable /
        // unconditional break), so their {@code unreachable} tail type already
        // satisfies any enclosing block type regardless of the wrapper's own.
        var /** @const {number} */ wrapperBlock = module.block(M + fcName, wrapperChildren, binaryen.none);
        var /** @const {!Array<number>} */ outerChildren = excludeLast
            ? [wrapperBlock, allChildren[allChildren.length - 1]]
            : [wrapperBlock];
        return {
          decisionAction: REPLACE_NODE,
          expressionPointer: module.block(blockName || null, outerChildren, expr.type)
        };
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
  funcMetadata.switchDispatchNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_} */ state =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.State_} */ ({
      switchOuterBlocks: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      switchNeedsWrapping: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      chainBlocks: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      funcMetadata: funcMetadata
    });
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterLeaveVisitor(this, this.enter_, this.leave_, state);
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
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.MARKER = 'w2l_rootsw$';

/**
 * @private
 * @typedef {{
 *   rootSwitchOuters: !Object<string, boolean>,
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
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
  var /** @type {!BinaryenExpressionInfo} */ cur = blockExpr;
  for (;;) {
    var /** @const {!Array<number>} */ curChildren = /** @type {!Array<number>} */ (cur.children);
    var /** @const {number} */ fcPtr = curChildren[0];
    var /** @const {!BinaryenExpressionInfo} */ fcInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, fcPtr);
    var /** @const {number} */ fcId = fcInfo.id;
    var /** @const {?string} */ fcName = /** @type {?string} */ (fcInfo.name || null);

    // Check for loop (direct child).
    if (binaryen.LoopId === fcId) {
      return this.checkLoopBody_(binaryen, fcInfo, chainNames);
    }

    if (binaryen.BlockId !== fcId || !fcName) {
      return false;
    }

    // Check for fused block (lb$ prefix) containing a loop.
    if (0 === fcName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionPass.MARKER)) {
      chainNames[fcName] = true;
      var /** @const {!Array<number>|void} */ fusedChildren = /** @type {!Array<number>|void} */ (fcInfo.children);
      if (!fusedChildren || 1 !== fusedChildren.length) {
        return false;
      }
      var /** @const {!BinaryenExpressionInfo} */ fusedChild = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
          binaryen,
          fusedChildren[0]
        );
      if (binaryen.LoopId !== fusedChild.id) {
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
 * @param {!BinaryenExpressionInfo} loopInfo
 * @param {!Object<string, boolean>} chainNames
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.checkLoopBody_ = function (binaryen, loopInfo, chainNames) {
  var /** @const {number} */ bodyPtr = /** @type {number} */ (loopInfo.body);
  if (0 === bodyPtr) {
    return false;
  }
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      bodyPtr
    );
  if (binaryen.BlockId !== bodyInfo.id) {
    return false;
  }
  var /** @const {!Array<number>|void} */ bodyChildren = /** @type {!Array<number>|void} */ (bodyInfo.children);
  if (!bodyChildren || bodyChildren.length < 2) {
    return false;
  }

  // First child must be a sw$-prefixed block.
  var /** @const {!BinaryenExpressionInfo} */ firstChild = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      bodyChildren[0]
    );
  if (binaryen.BlockId !== firstChild.id) {
    return false;
  }
  var /** @const {?string} */ fcName = /** @type {?string} */ (firstChild.name || null);
  if (!fcName || 0 !== fcName.indexOf(Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchDetectionPass.MARKER)) {
    return false;
  }

  // Last child must be an unconditional br targeting one of the chain blocks.
  var /** @const {!BinaryenExpressionInfo} */ lastChild = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      bodyChildren[bodyChildren.length - 1]
    );
  if (binaryen.BreakId !== lastChild.id) {
    return false;
  }
  if (0 !== /** @type {number} */ (lastChild.condition || 0)) {
    return false;
  }
  var /** @const {string} */ brTarget = /** @type {string} */ (lastChild.name);
  return true === chainNames[brTarget];
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} st
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.enter_ = function (st, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expression = nodeCtx.expression;
  var /** @const {number} */ id = expression.id;
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ name = /** @type {?string} */ (expression.name || null);
    if (
      name &&
      !st.rootSwitchOuters[name] &&
      this.isRootSwitchOuter_(binaryen, /** @type {!BinaryenExpressionInfo} */ (expression))
    ) {
      st.rootSwitchOuters[name] = true;
      var /** @const {*} */ rsRef = st.funcMetadata.rootSwitchNames;
      if (rsRef) {
        /** @type {!Object<string, boolean>} */ (rsRef)[
          Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.MARKER + name
        ] = true;
      }
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
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyLeaveRenaming_(
    Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.MARKER,
    st.rootSwitchOuters,
    null,
    nodeCtx
  );
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.prototype.createVisitor = function (funcMetadata) {
  funcMetadata.rootSwitchNames = /** @type {!Object<string, boolean>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} */ st =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.RootSwitchDetectionPass.State_} */ ({
      rootSwitchOuters: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      funcMetadata: funcMetadata
    });
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterLeaveVisitor(this, this.enter_, this.leave_, st);
};
