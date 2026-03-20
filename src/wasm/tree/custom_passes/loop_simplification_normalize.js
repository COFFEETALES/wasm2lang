'use strict';

/**
 * Pass: loop-simplification  (phase: codegen-prep)
 *
 * Detects loop patterns and marks them via label prefix so backend
 * emitters can produce cleaner control flow.
 *
 * Pattern LC — trailing self-continue:
 *   (loop $L (block $body ... (br $L)))
 *   Last child is an unconditional br to the loop itself.  Backends emit
 *   `for(;;)` and omit the redundant trailing `continue`.
 *   Also covers SwitchId-terminated loops (br_table with loop as target)
 *   and terminal-exit loops (unconditional exit break, with internal
 *   continue paths via other branches).
 *
 * Pattern LD — do-while:
 *   Variant A:  (loop $L (block ... (br_if $L cond) (br $outer)))
 *   Variant B:  (loop $L (block ... (br_if $L cond)))
 *   Conditional self-continue at the end, optionally followed by an
 *   unconditional exit.  The pass replaces the trailing branch(es) with the
 *   bare condition expression so backends can emit `do { } while (cond)`.
 *
 * Label elision: when the loop body contains no nested breakable constructs
 * (inner loops or sw$-prefixed switch-dispatch blocks), every break/continue
 * targeting the loop is at nesting depth 1 and can be expressed as a plain
 * `break`/`continue` in the output language.  These loops get a distinct
 * prefix (`lf$` / `le$`) so backends can omit the label entirely.
 * While-loops use a smarter check: the label is elided when no branch in
 * the body (excluding the entry guard and trailing continue) targets the
 * loop name.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass = function () {
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'loop-simplification',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP
  );
};

/**
 * Label prefix for trailing-continue loops (emitted as labeled for(;;)).
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.LC_MARKER = 'lc$';

/**
 * Label prefix for do-while loops (labeled).
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.LD_MARKER = 'ld$';

/**
 * Label prefix for trailing-continue loops that need no label (unlabeled for(;;)).
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.LF_MARKER = 'lf$';

/**
 * Label prefix for do-while loops that need no label (unlabeled do-while).
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.LE_MARKER = 'le$';

/**
 * Label prefix for while loops (labeled).
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.LW_MARKER = 'lw$';

/**
 * Label prefix for while loops that need no label (unlabeled while).
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.LY_MARKER = 'ly$';

/**
 * Inverts a boolean condition expression at the IR level.
 *
 * For i32 comparisons the complement op is used (e.g. ge_s → lt_s).
 * For i32.eqz the inner value is unwrapped.
 * Otherwise the condition is wrapped with i32.eqz.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} module
 * @param {number} condPtr
 * @return {number}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.invertCondition_ = function (binaryen, module, condPtr) {
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (
      binaryen.getExpressionInfo(condPtr)
    );
  var /** @const {!BinaryenI32Api} */ i32 = module.i32;
  if (info.id === binaryen.BinaryId) {
    var /** @const {number} */ op = /** @type {number} */ (info.op);
    var /** @const {number} */ L = /** @type {number} */ (info.left);
    var /** @const {number} */ R = /** @type {number} */ (info.right);
    if (op === binaryen.EqInt32) return i32.ne(L, R);
    if (op === binaryen.NeInt32) return i32.eq(L, R);
    if (op === binaryen.LtSInt32) return i32.ge_s(L, R);
    if (op === binaryen.GeSInt32) return i32.lt_s(L, R);
    if (op === binaryen.GtSInt32) return i32.le_s(L, R);
    if (op === binaryen.LeSInt32) return i32.gt_s(L, R);
    if (op === binaryen.LtUInt32) return i32.ge_u(L, R);
    if (op === binaryen.GeUInt32) return i32.lt_u(L, R);
    if (op === binaryen.GtUInt32) return i32.le_u(L, R);
    if (op === binaryen.LeUInt32) return i32.gt_u(L, R);
  }
  if (info.id === binaryen.UnaryId && /** @type {number} */ (info.op) === binaryen.EqZInt32) {
    return /** @type {number} */ (info.value);
  }
  return i32.eqz(condPtr);
};

/**
 * @private
 * @typedef {{
 *   simplifiedLoops: !Object<string, string>,
 *   funcMetadata: !Wasm2Lang.Wasm.Tree.PassMetadata
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_;

/**
 * Returns true if the subtree rooted at {@code ptr} contains a nested
 * breakable construct — an inner loop or a sw$-prefixed switch-dispatch
 * block.  When the body of a simplified loop has no such nesting, every
 * break/continue targeting the loop resolves to the innermost breakable
 * scope and the loop label can be elided.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.containsBreakableNesting_ = function (binaryen, ptr) {
  if (!ptr) {
    return false;
  }
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (binaryen.getExpressionInfo(ptr));
  var /** @const {number} */ id = info.id;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;

  if (id === binaryen.LoopId || id === binaryen.SwitchId) {
    return true;
  }
  if (id === binaryen.BlockId) {
    var /** @const {?string} */ bName = /** @type {?string} */ (info.name);
    if (bName && 0 === bName.indexOf('sw$')) {
      return true;
    }
    var /** @const {!Array<number>|undefined} */ ch = /** @type {!Array<number>|undefined} */ (info.children);
    if (ch) {
      for (var /** number */ ci = 0, /** @const {number} */ cLen = ch.length; ci < cLen; ++ci) {
        if (S.containsBreakableNesting_(binaryen, ch[ci])) {
          return true;
        }
      }
    }
    return false;
  }
  if (id === binaryen.IfId) {
    return (
      S.containsBreakableNesting_(binaryen, /** @type {number} */ (info.ifTrue || 0)) ||
      S.containsBreakableNesting_(binaryen, /** @type {number} */ (info.ifFalse || 0))
    );
  }
  if (id === binaryen.DropId || id === binaryen.ReturnId || id === binaryen.LocalSetId || id === binaryen.GlobalSetId) {
    return S.containsBreakableNesting_(binaryen, /** @type {number} */ (info.value || 0));
  }
  return false;
};

/**
 * Returns true if the subtree rooted at {@code ptr} contains a BreakId or
 * SwitchId whose target label matches {@code targetName}.  Used for smarter
 * label-elision decisions: when no branch inside the loop body references the
 * loop name, the label can be omitted.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @param {string} targetName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.containsTargetingBranch_ = function (binaryen, ptr, targetName) {
  if (!ptr) {
    return false;
  }
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (binaryen.getExpressionInfo(ptr));
  var /** @const {number} */ id = info.id;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;

  if (id === binaryen.BreakId) {
    return /** @type {?string} */ (info.name) === targetName;
  }
  if (id === binaryen.SwitchId) {
    var /** @const {!Array<string>} */ sNames = /** @type {!Array<string>} */ (info.names || []);
    for (var /** @type {number} */ si = 0; si < sNames.length; ++si) {
      if (sNames[si] === targetName) {
        return true;
      }
    }
    return /** @type {string} */ (info.defaultName || '') === targetName;
  }
  if (id === binaryen.BlockId) {
    var /** @const {!Array<number>|undefined} */ ch = /** @type {!Array<number>|undefined} */ (info.children);
    if (ch) {
      for (var /** @type {number} */ ci = 0, /** @const {number} */ cLen = ch.length; ci < cLen; ++ci) {
        if (S.containsTargetingBranch_(binaryen, ch[ci], targetName)) {
          return true;
        }
      }
    }
    return false;
  }
  if (id === binaryen.LoopId) {
    return S.containsTargetingBranch_(binaryen, /** @type {number} */ (info.body || 0), targetName);
  }
  if (id === binaryen.IfId) {
    return (
      S.containsTargetingBranch_(binaryen, /** @type {number} */ (info.ifTrue || 0), targetName) ||
      S.containsTargetingBranch_(binaryen, /** @type {number} */ (info.ifFalse || 0), targetName)
    );
  }
  if (id === binaryen.DropId || id === binaryen.ReturnId || id === binaryen.LocalSetId || id === binaryen.GlobalSetId) {
    return S.containsTargetingBranch_(binaryen, /** @type {number} */ (info.value || 0), targetName);
  }
  return false;
};

/**
 * Returns the label marker prefix for a given simplification kind.
 *
 * @private
 * @param {string} kind
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.markerForKind_ = function (kind) {
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;
  if ('lc' === kind || 'lcs' === kind || 'lct' === kind) {
    return S.LC_MARKER;
  }
  if ('lf' === kind || 'lfs' === kind || 'lft' === kind) {
    return S.LF_MARKER;
  }
  if ('lda' === kind || 'ldb' === kind) {
    return S.LD_MARKER;
  }
  if ('lw' === kind) {
    return S.LW_MARKER;
  }
  if ('ly' === kind) {
    return S.LY_MARKER;
  }
  return S.LE_MARKER;
};

/**
 * Returns the LoopPlan loopKind for a given simplification variant.
 *
 * @private
 * @param {string} kind
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.loopKindForVariant_ = function (kind) {
  if ('lda' === kind || 'ldb' === kind || 'lea' === kind || 'leb' === kind) {
    return 'dowhile';
  }
  if ('lw' === kind || 'ly' === kind) {
    return 'while';
  }
  return 'for';
};

/**
 * Returns whether the loop variant needs a label in the output.
 *
 * @private
 * @param {string} kind
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.needsLabelForVariant_ = function (kind) {
  return 'lc' === kind || 'lcs' === kind || 'lct' === kind || 'lda' === kind || 'ldb' === kind || 'lw' === kind;
};

/**
 * Stores a LoopPlan in the function metadata for a simplified loop.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_} state
 * @param {string} marker
 * @param {string} loopName
 * @param {string} kind
 * @param {number} conditionPtr
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.storePlan_ = function (state, marker, loopName, kind, conditionPtr) {
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;
  var /** @const {*} */ loopPlansRef = state.funcMetadata.loopPlans;
  if (loopPlansRef) {
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (loopPlansRef)[marker + loopName] =
      /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ ({
        loopKind: S.loopKindForVariant_(kind),
        needsLabel: S.needsLabelForVariant_(kind),
        conditionPtr: conditionPtr
      });
  }
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.prototype.enter_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);

  if (binaryen.LoopId !== id) {
    return null;
  }

  var /** @const {?string} */ loopName = /** @type {?string} */ (expr['name']);
  if (!loopName) {
    return null;
  }

  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr['body']);
  if (!bodyPtr) {
    return null;
  }

  var /** @const {!Object<string, *>} */ bodyInfo = /** @type {!Object<string, *>} */ (binaryen.getExpressionInfo(bodyPtr));
  if (/** @type {number} */ (bodyInfo['id']) !== binaryen.BlockId) {
    return null;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (bodyInfo['children']);
  if (!children || 0 === children.length) {
    return null;
  }

  var /** @const {number} */ len = children.length;
  var /** @const {!Object<string, *>} */ lastInfo = /** @type {!Object<string, *>} */ (
      binaryen.getExpressionInfo(children[len - 1])
    );
  var /** @const {number} */ lastId = /** @type {number} */ (lastInfo['id']);

  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;

  // Check whether the body contains nested breakable constructs.
  var /** @const {boolean} */ needsLabel = S.containsBreakableNesting_(binaryen, bodyPtr);

  if (lastId === binaryen.BreakId) {
    var /** @const {?string} */ lastName = /** @type {?string} */ (lastInfo['name']);
    var /** @const {number} */ lastCond = /** @type {number} */ (lastInfo['condition'] || 0);

    // Pattern LD variant B: last child is conditional br_if targeting loop.
    if (lastName === loopName && 0 !== lastCond && len > 1) {
      state.simplifiedLoops[loopName] = needsLabel ? 'ldb' : 'leb';
      return null;
    }

    // Pattern LD variant A: second-to-last is conditional br_if $loop,
    // last is unconditional br to something else (exit).
    if (lastName !== loopName && 0 === lastCond && len >= 2) {
      var /** @const {!Object<string, *>} */ prevInfo = /** @type {!Object<string, *>} */ (
          binaryen.getExpressionInfo(children[len - 2])
        );
      if (
        /** @type {number} */ (prevInfo['id']) === binaryen.BreakId &&
        /** @type {?string} */ (prevInfo['name']) === loopName &&
        0 !== /** @type {number} */ (prevInfo['condition'] || 0) &&
        len > 2
      ) {
        state.simplifiedLoops[loopName] = needsLabel ? 'lda' : 'lea';
        return null;
      }

      // Terminal-exit: unconditional break to outer, body has continue paths.
      var /** @type {boolean} */ hasInternalContinue = false;
      for (var /** @type {number} */ ti = 0; ti < len - 1; ++ti) {
        if (S.containsTargetingBranch_(binaryen, children[ti], loopName)) {
          hasInternalContinue = true;
          break;
        }
      }
      if (hasInternalContinue) {
        state.simplifiedLoops[loopName] = needsLabel ? 'lct' : 'lft';
        return null;
      }
    }

    // Pattern LC: last child is unconditional br targeting loop (self-continue).
    if (lastName === loopName && 0 === lastCond) {
      // While-loop refinement: first child is br_if targeting an exit (not the
      // loop itself).  When matched, the loop becomes while(!exitCond) { body }.
      if (len >= 2) {
        var /** @const {!Object<string, *>} */ firstInfo = /** @type {!Object<string, *>} */ (
            binaryen.getExpressionInfo(children[0])
          );
        if (
          /** @type {number} */ (firstInfo['id']) === binaryen.BreakId &&
          0 !== /** @type {number} */ (firstInfo['condition'] || 0) &&
          /** @type {?string} */ (firstInfo['name']) !== loopName
        ) {
          // Smarter label check: only need label if body actually references
          // the loop name (e.g. continue $loop inside nested control flow).
          var /** @type {boolean} */ whileNeedsLabel = false;
          for (var /** @type {number} */ wi = 1; wi < len - 1; ++wi) {
            if (S.containsTargetingBranch_(binaryen, children[wi], loopName)) {
              whileNeedsLabel = true;
              break;
            }
          }
          state.simplifiedLoops[loopName] = whileNeedsLabel ? 'lw' : 'ly';
          return null;
        }
      }
      state.simplifiedLoops[loopName] = needsLabel ? 'lc' : 'lf';
    }

    return null;
  }

  // SwitchId as last child: br_table dispatch at end of loop.
  if (lastId === binaryen.SwitchId) {
    var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (lastInfo['names'] || []);
    var /** @const {string} */ switchDefault = /** @type {string} */ (lastInfo['defaultName'] || '');
    var /** @type {boolean} */ hasSelfContinue = false;
    for (var /** @type {number} */ si = 0; si < switchNames.length; ++si) {
      if (switchNames[si] === loopName) {
        hasSelfContinue = true;
        break;
      }
    }
    if (!hasSelfContinue && switchDefault === loopName) {
      hasSelfContinue = true;
    }
    if (hasSelfContinue) {
      state.simplifiedLoops[loopName] = needsLabel ? 'lcs' : 'lfs';
    }
    return null;
  }

  return null;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.prototype.leave_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
      binaryen.getExpressionInfo(nodeCtx.expressionPointer)
    );
  var /** @const {number} */ id = expr.id;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  // Rename break targets pointing to simplified loops.
  if (id === binaryen.BreakId) {
    var /** @const {?string} */ breakName = /** @type {?string} */ (expr.name);
    if (breakName && breakName in state.simplifiedLoops) {
      var /** @const {string} */ brM = S.markerForKind_(state.simplifiedLoops[breakName]);
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.break(
          brM + breakName,
          /** @type {number} */ (expr.condition || 0),
          /** @type {number} */ (expr.value || 0)
        )
      };
    }
  }

  // Rename switch targets pointing to simplified loops.
  if (id === binaryen.SwitchId) {
    var /** @const {!Array<string>} */ names = /** @type {!Array<string>} */ ((expr.names || []).slice(0));
    var /** @const {number} */ nameCount = names.length;
    var /** @type {boolean} */ hasChanges = false;
    var /** @type {number} */ i = 0;

    for (i = 0; i !== nameCount; ++i) {
      if (names[i] in state.simplifiedLoops) {
        names[i] = S.markerForKind_(state.simplifiedLoops[names[i]]) + names[i];
        hasChanges = true;
      }
    }

    var /** @const {string} */ defaultName = /** @type {string} */ (expr.defaultName || '');
    var /** @type {string} */ newDefault = defaultName;
    if ('' !== defaultName && defaultName in state.simplifiedLoops) {
      newDefault = S.markerForKind_(state.simplifiedLoops[defaultName]) + defaultName;
      hasChanges = true;
    }

    if (hasChanges) {
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.switch(
          names,
          newDefault,
          /** @type {number} */ (expr.condition || 0),
          /** @type {number} */ (expr.value || 0)
        )
      };
    }
  }

  // Modify the loop: rename label and restructure body block.
  if (id === binaryen.LoopId) {
    var /** @const {?string} */ loopName = /** @type {?string} */ (expr.name);
    if (!loopName || !(loopName in state.simplifiedLoops)) {
      return null;
    }
    var /** @const {string} */ kind = state.simplifiedLoops[loopName];
    var /** @const {string} */ marker = S.markerForKind_(kind);

    var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
    var /** @const {!BinaryenExpressionInfo} */ bodyInfo = /** @type {!BinaryenExpressionInfo} */ (
        binaryen.getExpressionInfo(bodyPtr)
      );
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
    var /** @const {number} */ len = children.length;
    var /** @type {number} */ planCondPtr = 0;

    if ('lw' === kind || 'ly' === kind) {
      // While loop: first child is br_if $exit cond, last is trailing br $loop.
      // Remove both and invert the condition.
      var /** @const {!BinaryenExpressionInfo} */ brIfInfo = /** @type {!BinaryenExpressionInfo} */ (
          binaryen.getExpressionInfo(children[0])
        );
      var /** @const {number} */ whileCondPtr = /** @type {number} */ (brIfInfo.condition || 0);
      planCondPtr = S.invertCondition_(binaryen, module, whileCondPtr);
      var /** @const {!Array<number>} */ whileChildren = children.slice(1, len - 1);
      var /** @const {number} */ newBodyW = module.block(bodyInfo.name || null, whileChildren, binaryen.none);
      S.storePlan_(state, marker, loopName, kind, planCondPtr);
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.loop(marker + loopName, newBodyW)
      };
    }

    if ('lc' === kind || 'lf' === kind) {
      // Remove the trailing unconditional self-continue.
      children.length = len - 1;
      var /** @const {number} */ newBody = module.block(bodyInfo.name || null, children, binaryen.none);
      S.storePlan_(state, marker, loopName, kind, 0);
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.loop(marker + loopName, newBody)
      };
    }

    if ('lcs' === kind || 'lfs' === kind || 'lct' === kind || 'lft' === kind) {
      // SwitchId-terminated or terminal-exit for(;;): keep all children.
      var /** @const {number} */ newBodyFull = module.block(bodyInfo.name || null, children, binaryen.none);
      S.storePlan_(state, marker, loopName, kind, 0);
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.loop(marker + loopName, newBodyFull)
      };
    }

    // Do-while: extract condition and rebuild body without it.
    if ('ldb' === kind || 'leb' === kind) {
      // Variant B: last child is conditional br_if.
      var /** @const {!BinaryenExpressionInfo} */ brIfB = /** @type {!BinaryenExpressionInfo} */ (
          binaryen.getExpressionInfo(children[len - 1])
        );
      planCondPtr = /** @type {number} */ (brIfB.condition || 0);
      children.length = len - 1;
    } else {
      // Variant A: second-to-last is conditional br_if, last is exit br.
      var /** @const {!BinaryenExpressionInfo} */ brIfA = /** @type {!BinaryenExpressionInfo} */ (
          binaryen.getExpressionInfo(children[len - 2])
        );
      planCondPtr = /** @type {number} */ (brIfA.condition || 0);
      children.length = len - 2;
    }

    var /** @const {number} */ newBodyDW = module.block(bodyInfo.name || null, children, binaryen.none);
    S.storePlan_(state, marker, loopName, kind, planCondPtr);
    return {
      decisionAction: REPLACE_NODE,
      expressionPointer: module.loop(marker + loopName, newBodyDW)
    };
  }

  return null;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.prototype.createVisitor = function (funcMetadata) {
  funcMetadata.loopPlans = /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (Object.create(null));
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_} */ state =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_} */ ({
      simplifiedLoops: /** @type {!Object<string, string>} */ (Object.create(null)),
      funcMetadata: funcMetadata
    });
  var /** @const */ self = this;

  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.enter_(state, nc); },
    leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList=} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) { void cr; return self.leave_(state, nc); }
  });
};
