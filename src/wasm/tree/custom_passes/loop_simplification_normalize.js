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

// Marker prefixes: lc$/lf$ (for-loop, labeled/unlabeled), ld$/le$ (do-while),
// lw$/ly$ (while).  Defined in VARIANT_INFO_ below.

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
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, condPtr)
    );
  var /** @const {!BinaryenI32Api} */ i32 = module.i32;
  if (binaryen.BinaryId === info.id) {
    var /** @const {number} */ op = /** @type {number} */ (info.op);
    var /** @const {number} */ L = /** @type {number} */ (info.left);
    var /** @const {number} */ R = /** @type {number} */ (info.right);
    if (binaryen.EqInt32 === op) return i32.ne(L, R);
    if (binaryen.NeInt32 === op) return i32.eq(L, R);
    if (binaryen.LtSInt32 === op) return i32.ge_s(L, R);
    if (binaryen.GeSInt32 === op) return i32.lt_s(L, R);
    if (binaryen.GtSInt32 === op) return i32.le_s(L, R);
    if (binaryen.LeSInt32 === op) return i32.gt_s(L, R);
    if (binaryen.LtUInt32 === op) return i32.ge_u(L, R);
    if (binaryen.GeUInt32 === op) return i32.lt_u(L, R);
    if (binaryen.GtUInt32 === op) return i32.le_u(L, R);
    if (binaryen.LeUInt32 === op) return i32.gt_u(L, R);
    var /** @const {!BinaryenI64Api} */ i64 = module.i64;
    if (binaryen.EqInt64 === op) return i64.ne(L, R);
    if (binaryen.NeInt64 === op) return i64.eq(L, R);
    if (binaryen.LtSInt64 === op) return i64.ge_s(L, R);
    if (binaryen.GeSInt64 === op) return i64.lt_s(L, R);
    if (binaryen.GtSInt64 === op) return i64.le_s(L, R);
    if (binaryen.LeSInt64 === op) return i64.gt_s(L, R);
    if (binaryen.LtUInt64 === op) return i64.ge_u(L, R);
    if (binaryen.GeUInt64 === op) return i64.lt_u(L, R);
    if (binaryen.GtUInt64 === op) return i64.le_u(L, R);
    if (binaryen.LeUInt64 === op) return i64.gt_u(L, R);
  }
  if (binaryen.UnaryId === info.id && /** @type {number} */ (info.op) === binaryen.EqZInt32) {
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
 * Walks a subtree and returns true when {@code testFn} returns true for any
 * node.  {@code testFn} should return true/false to short-circuit or
 * {@code null} to let the walker recurse into children.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @param {function(!BinaryenExpressionInfo, number): ?boolean} testFn
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.walkSubtree_ = function (binaryen, ptr, testFn) {
  if (!ptr) {
    return false;
  }
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ptr)
    );
  var /** @const {number} */ id = info.id;
  var /** @const {?boolean} */ verdict = testFn(info, id);
  if (null !== verdict) {
    return verdict;
  }
  var /** @const {function(!Binaryen, number, function(!BinaryenExpressionInfo, number): ?boolean): boolean} */ walk =
      Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.walkSubtree_;
  if (binaryen.BlockId === id) {
    var /** @const {!Array<number>|undefined} */ ch = /** @type {!Array<number>|undefined} */ (info.children);
    if (ch) {
      for (var /** @type {number} */ ci = 0, /** @const {number} */ cLen = ch.length; ci < cLen; ++ci) {
        if (walk(binaryen, ch[ci], testFn)) {
          return true;
        }
      }
    }
    return false;
  }
  if (binaryen.LoopId === id) {
    return walk(binaryen, /** @type {number} */ (info.body || 0), testFn);
  }
  if (binaryen.IfId === id) {
    return (
      walk(binaryen, /** @type {number} */ (info.ifTrue || 0), testFn) ||
      walk(binaryen, /** @type {number} */ (info.ifFalse || 0), testFn)
    );
  }
  if (binaryen.DropId === id || binaryen.ReturnId === id || binaryen.LocalSetId === id || binaryen.GlobalSetId === id) {
    return walk(binaryen, /** @type {number} */ (info.value || 0), testFn);
  }
  return false;
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.containsBreakableNesting_ = function (binaryen, ptr) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.walkSubtree_(
    binaryen,
    ptr,
    /** @param {!BinaryenExpressionInfo} info @param {number} id @return {?boolean} */
    function (info, id) {
      if (binaryen.LoopId === id || binaryen.SwitchId === id) return true;
      if (binaryen.BlockId === id && info.name && 0 === /** @type {string} */ (info.name).indexOf('sw$')) return true;
      return null;
    }
  );
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @param {string} targetName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.containsTargetingBranch_ = function (binaryen, ptr, targetName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.walkSubtree_(
    binaryen,
    ptr,
    /** @param {!BinaryenExpressionInfo} info @param {number} id @return {?boolean} */
    function (info, id) {
      if (binaryen.BreakId === id) return /** @type {?string} */ (info.name) === targetName;
      if (binaryen.SwitchId === id) {
        var /** @const {!Array<string>} */ sn = /** @type {!Array<string>} */ (info.names || []);
        for (var /** @type {number} */ si = 0, /** @const {number} */ snLen = sn.length; si < snLen; ++si) {
          if (sn[si] === targetName) return true;
        }
        return /** @type {string} */ (info.defaultName || '') === targetName;
      }
      return null;
    }
  );
};

/**
 * Per-variant info: [marker, loopKind, needsLabel].
 * @private
 * @const {!Object<string, !Array>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.VARIANT_INFO_ = {
  'lc': ['lc$', 'for', true],
  'lcs': ['lc$', 'for', true],
  'lct': ['lc$', 'for', true],
  'lf': ['lf$', 'for', false],
  'lfs': ['lf$', 'for', false],
  'lft': ['lf$', 'for', false],
  'lda': ['ld$', 'dowhile', true],
  'ldb': ['ld$', 'dowhile', true],
  'lea': ['le$', 'dowhile', false],
  'leb': ['le$', 'dowhile', false],
  'lw': ['lw$', 'while', true],
  'ly': ['ly$', 'while', false],
  'lwi': ['lw$', 'while', true],
  'lyi': ['ly$', 'while', false]
};

/**
 * Stores a LoopPlan in the function metadata for a simplified loop.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.State_} state
 * @param {!Array} variantInfo
 * @param {string} loopName
 * @param {number} conditionPtr
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.storePlan_ = function (state, variantInfo, loopName, conditionPtr) {
  var /** @const {*} */ loopPlansRef = state.funcMetadata.loopPlans;
  if (loopPlansRef) {
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.LoopPlan>} */ (loopPlansRef)[variantInfo[0] + loopName] =
      /** @type {!Wasm2Lang.Wasm.Tree.LoopPlan} */ ({
        simplifiedLoopKind: /** @type {string} */ (variantInfo[1]),
        needsLabel: /** @type {boolean} */ (variantInfo[2]),
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
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;

  if (binaryen.LoopId !== id) {
    return null;
  }

  var /** @const {?string} */ loopName = /** @type {?string} */ (expr.name);
  if (!loopName) {
    return null;
  }

  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
  if (!bodyPtr) {
    return null;
  }

  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      bodyPtr
    );

  // Direct conditional br_if body (no block wrapper): do-while with empty body.
  // Side effects (local.tee, calls) live inside the condition expression.
  if (binaryen.BreakId === bodyInfo.id) {
    if (/** @type {?string} */ (bodyInfo.name) === loopName && 0 !== /** @type {number} */ (bodyInfo.condition || 0)) {
      // No block wrapper ⇒ no nested breakable constructs ⇒ unlabeled.
      state.simplifiedLoops[loopName] = 'leb';
      return null;
    }
    return null;
  }

  // Pattern LWI: if-guarded while — loop body is an If with no else arm,
  // where the then-arm is a Block whose last child is unconditional br $loop.
  // (loop $L (if (negated_cond) (then body... (br $L))))
  // Inverted to: while (cond) { body }
  if (binaryen.IfId === bodyInfo.id) {
    var /** @const {number} */ ifFalse = /** @type {number} */ (bodyInfo.ifFalse || 0);
    if (0 === ifFalse) {
      var /** @const {number} */ ifTruePtr = /** @type {number} */ (bodyInfo.ifTrue || 0);
      if (ifTruePtr) {
        var /** @const {!BinaryenExpressionInfo} */ ifTrueInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
            binaryen,
            ifTruePtr
          );
        if (binaryen.BlockId === ifTrueInfo.id) {
          var /** @const {!Array<number>|void} */ thenCh = /** @type {!Array<number>|void} */ (ifTrueInfo.children);
          if (thenCh && thenCh.length >= 1) {
            var /** @const {number} */ thenLen = thenCh.length;
            var /** @const {!BinaryenExpressionInfo} */ thenLastInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
                binaryen,
                thenCh[thenLen - 1]
              );
            if (
              binaryen.BreakId === thenLastInfo.id &&
              /** @type {?string} */ (thenLastInfo.name) === loopName &&
              0 === /** @type {number} */ (thenLastInfo.condition || 0)
            ) {
              var /** @type {boolean} */ lwiNeedsLabel = false;
              for (var /** @type {number} */ lwii = 0; lwii < thenLen - 1; ++lwii) {
                if (
                  Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass.containsTargetingBranch_(
                    binaryen,
                    thenCh[lwii],
                    loopName
                  )
                ) {
                  lwiNeedsLabel = true;
                  break;
                }
              }
              state.simplifiedLoops[loopName] = lwiNeedsLabel ? 'lwi' : 'lyi';
              return null;
            }
          }
        }
      }
    }
    return null;
  }

  if (binaryen.BlockId !== bodyInfo.id) {
    return null;
  }

  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (bodyInfo.children);
  if (!children || 0 === children.length) {
    return null;
  }

  var /** @const {number} */ len = children.length;
  var /** @const {!BinaryenExpressionInfo} */ lastInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      children[len - 1]
    );
  var /** @const {number} */ lastId = lastInfo.id;

  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;

  // Check whether the body contains nested breakable constructs.
  var /** @const {boolean} */ needsLabel = S.containsBreakableNesting_(binaryen, bodyPtr);

  if (binaryen.BreakId === lastId) {
    var /** @const {?string} */ lastName = /** @type {?string} */ (lastInfo.name);
    var /** @const {number} */ lastCond = /** @type {number} */ (lastInfo.condition || 0);

    // Pattern LD variant B: last child is conditional br_if targeting loop.
    if (lastName === loopName && 0 !== lastCond && len > 1) {
      state.simplifiedLoops[loopName] = needsLabel ? 'ldb' : 'leb';
      return null;
    }

    // Pattern LD variant A: second-to-last is conditional br_if $loop,
    // last is unconditional br to something else (exit).
    if (lastName !== loopName && 0 === lastCond && len >= 2) {
      var /** @const {!BinaryenExpressionInfo} */ prevInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
          binaryen,
          children[len - 2]
        );
      if (
        binaryen.BreakId === prevInfo.id &&
        /** @type {?string} */ (prevInfo.name) === loopName &&
        0 !== /** @type {number} */ (prevInfo.condition || 0) &&
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
        var /** @const {!BinaryenExpressionInfo} */ firstInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
            binaryen,
            children[0]
          );
        if (
          binaryen.BreakId === firstInfo.id &&
          0 !== /** @type {number} */ (firstInfo.condition || 0) &&
          /** @type {?string} */ (firstInfo.name) !== loopName
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
  if (binaryen.SwitchId === lastId) {
    var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (lastInfo.names || []);
    var /** @const {string} */ switchDefault = /** @type {string} */ (lastInfo.defaultName || '');
    var /** @type {boolean} */ hasSelfContinue = false;
    for (var /** @type {number} */ si = 0, /** @const {number} */ swNamesLen = switchNames.length; si < swNamesLen; ++si) {
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
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, nodeCtx.expressionPointer)
    );
  var /** @const {number} */ id = expr.id;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationPass;
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  // Rename break/switch targets pointing to simplified loops.
  var /** @const {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ renameResult =
      Wasm2Lang.Wasm.Tree.CustomPasses.applyMappedRenaming_(
        /** @param {string} name @return {?string} */ function (name) {
          return name in state.simplifiedLoops ? /** @type {string} */ (S.VARIANT_INFO_[state.simplifiedLoops[name]][0]) : null;
        },
        binaryen,
        module,
        expr
      );
  if (renameResult) {
    return renameResult;
  }

  // Modify the loop: rename label and restructure body block.
  if (binaryen.LoopId === id) {
    var /** @const {?string} */ loopName = /** @type {?string} */ (expr.name);
    if (!loopName || !(loopName in state.simplifiedLoops)) {
      return null;
    }
    var /** @const {string} */ kind = state.simplifiedLoops[loopName];
    var /** @const {!Array} */ variantInfo = S.VARIANT_INFO_[kind];
    var /** @const {string} */ marker = /** @type {string} */ (variantInfo[0]);

    var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
    var /** @const {!BinaryenExpressionInfo} */ bodyInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, bodyPtr)
      );
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
    var /** @const {number} */ len = children.length;
    var /** @type {number} */ planCondPtr = 0;

    // Compute trimmed children and condition pointer per variant.
    var /** @type {!Array<number>} */ bodyChildren = children;

    if ('lw' === kind || 'ly' === kind) {
      var /** @const {!BinaryenExpressionInfo} */ brIfInfo = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[0])
        );
      planCondPtr = S.invertCondition_(binaryen, module, /** @type {number} */ (brIfInfo.condition || 0));
      bodyChildren = children.slice(1, len - 1);
    } else if ('lwi' === kind || 'lyi' === kind) {
      // Body is IfId: invert the if condition, extract ifTrue block children minus trailing br.
      planCondPtr = S.invertCondition_(binaryen, module, /** @type {number} */ (bodyInfo.condition || 0));
      var /** @const {number} */ lwiIfTruePtr = /** @type {number} */ (bodyInfo.ifTrue || 0);
      var /** @const {!BinaryenExpressionInfo} */ lwiIfTrueInfo = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, lwiIfTruePtr)
        );
      var /** @const {!Array<number>} */ lwiThenCh = /** @type {!Array<number>} */ ((lwiIfTrueInfo.children || []).slice(0));
      lwiThenCh.length = lwiThenCh.length - 1;
      bodyChildren = lwiThenCh;
    } else if ('lc' === kind || 'lf' === kind) {
      children.length = len - 1;
    } else if ('ldb' === kind || 'leb' === kind) {
      if (len > 0) {
        var /** @const {!BinaryenExpressionInfo} */ brIfB = /** @type {!BinaryenExpressionInfo} */ (
            Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[len - 1])
          );
        planCondPtr = /** @type {number} */ (brIfB.condition || 0);
        children.length = len - 1;
      } else {
        // Body is directly a conditional br_if (no block wrapper).
        planCondPtr = /** @type {number} */ (bodyInfo.condition || 0);
      }
    } else if ('lda' === kind || 'lea' === kind) {
      var /** @const {!BinaryenExpressionInfo} */ brIfA = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[len - 2])
        );
      planCondPtr = /** @type {number} */ (brIfA.condition || 0);
      children.length = len - 2;
    }
    // else: lcs/lfs/lct/lft — keep all children as-is.

    var /** @const {?string} */ bodyBlockName = binaryen.BlockId === bodyInfo.id ? bodyInfo.name || null : null;
    var /** @const {number} */ newBody = module.block(bodyBlockName, bodyChildren, binaryen.none);
    S.storePlan_(state, variantInfo, loopName, planCondPtr);
    return {
      decisionAction: REPLACE_NODE,
      expressionPointer: module.loop(marker + loopName, newBody)
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
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterLeaveVisitor(this, this.enter_, this.leave_, state);
};
