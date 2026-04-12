'use strict';

// ---------------------------------------------------------------------------
// Child-result normalization, label prefix constants, labeled emit state
// typedefs, labeled enter/leave helpers, block/switch/break/if/local.set
// helpers, and sub-walk utilities.
// ---------------------------------------------------------------------------

/**
 * Appends every non-empty line from {@code text} to {@code parts}.
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {*} text
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_ = function (parts, text) {
  if ('string' !== typeof text || '' === text) {
    return;
  }

  var /** @const {!Array<string>} */ lines = text.split('\n');
  for (var /** @type {number} */ i = 0, /** @const {number} */ lineCount = lines.length; i !== lineCount; ++i) {
    if ('' !== lines[i]) {
      parts[parts.length] = lines[i];
    }
  }
};

/**
 * Renders the coerced return expression for an implicit return statement.
 * The default implementation extracts the expression category and delegates
 * to {@code coerceToType_}.  Asm.js overrides to use
 * {@code renderCoercionByType_} which always applies the type annotation
 * regardless of category (required by the asm.js validator).
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} bodyResult  The traversal result (typed expression object).
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderImplicitReturn_ = function (binaryen, bodyResult, resultType) {
  var /** @const {string} */ implicitExpr = /** @type {string} */ (bodyResult['s']);
  var /** @const {number} */ implicitCat =
      'number' === typeof bodyResult['c']
        ? /** @type {number} */ (bodyResult['c'])
        : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  return this.coerceAtBoundary_(binaryen, implicitExpr, implicitCat, resultType);
};

/**
 * Appends a function body traversal result to the output parts array.
 * If the result is a typed expression and the function has a return type,
 * emits an implicit return statement.  Otherwise appends non-empty lines.
 *
 * Returns {@code true} when the appended body already ends with a
 * {@code return} statement, so callers can skip emitting a trailing
 * default return (avoids unreachable-code warnings).
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {*} bodyResult
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {string} padStr  Indentation string for the return statement.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.appendBodyResult_ = function (parts, bodyResult, binaryen, funcInfo, padStr) {
  if (
    bodyResult &&
    'string' !== typeof bodyResult &&
    'string' === typeof bodyResult['s'] &&
    binaryen.none !== funcInfo.results &&
    0 !== funcInfo.results
  ) {
    parts[parts.length] = padStr + 'return ' + this.renderImplicitReturn_(binaryen, bodyResult, funcInfo.results) + ';';
    return true;
  }
  var /** @const {number} */ beforeLen = parts.length;
  Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  if (parts.length > beforeLen) {
    return /^\s*return\b/.test(parts[parts.length - 1]);
  }
  return false;
};

/**
 * @private
 * @typedef {{
 *   hasExpression: boolean,
 *   expressionString: string,
 *   expressionCategory: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_;

/** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */
Wasm2Lang.Backend.AbstractCodegen.EMPTY_CHILD_RESULT_ = {
  hasExpression: false,
  expressionString: '0',
  expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
};

/**
 * Normalizes one traversal child result into the string/category shape used
 * by string-emitting backends.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} index
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_}
 */
Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_ = function (childResults, index) {
  if (index >= childResults.length) {
    return Wasm2Lang.Backend.AbstractCodegen.EMPTY_CHILD_RESULT_;
  }

  var /** @const {*} */ value = childResults[index];
  if ('string' === typeof value) {
    return {
      hasExpression: true,
      expressionString: value,
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }
  if (value && 'string' === typeof value['s']) {
    return {
      hasExpression: true,
      expressionString: /** @type {string} */ (value['s']),
      expressionCategory:
        'number' === typeof value['c'] ? /** @type {number} */ (value['c']) : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }

  return Wasm2Lang.Backend.AbstractCodegen.EMPTY_CHILD_RESULT_;
};

// ---------------------------------------------------------------------------
// Label prefix constants.
// ---------------------------------------------------------------------------

/**
 * Prefix for label-elided for(;;) loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LF_FORLOOP_PREFIX_ = 'w2l_ufor$';

/**
 * Prefix for label-elided do-while loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LE_DOWHILE_PREFIX_ = 'w2l_udowhile$';

/**
 * Prefix for label-elided while loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LY_WHILE_PREFIX_ = 'w2l_uwhile$';

/**
 * Returns true when {@code name} starts with {@code prefix}.
 *
 * Replaces the repeated {@code 0 === name.indexOf(prefix)} idiom across all
 * backend and pass code, improving readability without changing semantics.
 *
 * @protected
 * @param {string} name
 * @param {string} prefix
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.hasPrefix_ = function (name, prefix) {
  return 0 === name.indexOf(prefix);
};

/**
 * Returns true if the given loop name carries a label-elided prefix,
 * meaning backends should omit the label and emit plain break/continue.
 *
 * @protected
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isLabelElided = function (name) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  // prettier-ignore
  return A.hasPrefix_(name, A.LF_FORLOOP_PREFIX_) || A.hasPrefix_(name, A.LE_DOWHILE_PREFIX_) || A.hasPrefix_(name, A.LY_WHILE_PREFIX_);
};

/**
 * Returns true when an unlabeled break/continue would reach the same target,
 * meaning the explicit label can be omitted from both the jump statement and
 * the loop declaration.
 *
 * For {@code 'break'}: the target must be the innermost loop or switch on the
 * breakable stack (labeled blocks are not targets of unlabeled break).
 * For {@code 'continue'}: the target must be the innermost loop (switches are
 * transparent to continue).
 *
 * @protected
 * @param {!Array<string>} breakableStack  Stack of loop names and {@code '*'}
 *     sentinels for switches.
 * @param {string} keyword  {@code 'break'} or {@code 'continue'}.
 * @param {string} resolvedName  Already-resolved target name.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isBreakLabelImplicit_ = function (breakableStack, keyword, resolvedName) {
  var /** @const {number} */ len = breakableStack.length;
  if (0 === len) return false;
  if ('continue' === keyword) {
    for (var /** @type {number} */ i = len - 1; 0 <= i; --i) {
      if ('*' !== breakableStack[i]) {
        return breakableStack[i] === resolvedName;
      }
    }
    return false;
  }
  return breakableStack[len - 1] === resolvedName;
};

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */
Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_;

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */
Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_;

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo} */
Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_;

/**
 * Shared state shape for labeled-break backends (asm.js, Java).
 * Both AsmjsCodegen.EmitState_ and JavaCodegen.EmitState_ are structural
 * subtypes of this (they carry all these fields plus backend-specific ones).
 *
 * @protected
 * @typedef {{
 *   binaryen: !Binaryen,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   functionInfo: !BinaryenFunctionInfo,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   labelMap: !Object<string, number>,
 *   labelKinds: !Object<string, string>,
 *   fusedBlockToLoop: !Object<string, string>,
 *   pendingBlockFusion: string,
 *   currentLoopName: string,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string,
 *   breakableStack: !Array<string>,
 *   usedLabels: !Object<string, boolean>,
 *   lastExprIsTerminal: boolean,
 *   pendingLoopKind: string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_;

/**
 * Coerces the flat-switch condition expression before emission.
 * Default returns the expression unchanged; asm.js overrides to apply
 * signed coercion ({@code |0}).
 *
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return condStr;
};

/**
 * Default flat-switch emitter for labeled-break backends.
 * Java overrides to also set {@code lastExprIsTerminal}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const {string} */ r = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledFlatSwitch(
      this,
      state,
      nodeCtx
    ).emittedString;
  --state.breakableStack.length;
  return r;
};

/**
 * Default root-switch emitter for labeled-break backends.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const {string} */ r = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledRootSwitch(
      this,
      state,
      nodeCtx
    );
  --state.breakableStack.length;
  return r;
};

/**
 * IR-based fallback detection for block-loop fusion pattern A: a named block
 * whose sole child (or sole child + trailing unreachable) is a Loop.
 * Used when metadata-based detection fails after binary round-trip.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr  The block expression.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.detectBlockLoopFusionFromIR_ = function (binaryen, expr) {
  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || children.length < 1 || children.length > 2) return false;
  var /** @const {!BinaryenExpressionInfo} */ firstInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      children[0]
    );
  if (binaryen.LoopId !== firstInfo.id) return false;
  if (2 === children.length) {
    return binaryen.UnreachableId === Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[1]).id;
  }
  return true;
};

/**
 * IR-based fallback detection for loop simplification patterns.
 * Inspects the loop body structure to determine if it matches a while,
 * dowhile, or for pattern.  Used when metadata-based loop plans are
 * unavailable after binary round-trip.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr  The loop expression.
 * @param {string} enclosingFusedBlock  Name of the enclosing fused block
 *     (from IR-detected or metadata-detected block-loop fusion), or empty
 *     string if none.
 * @return {?string}  'while', 'dowhile', 'for', or null.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.detectLoopKindFromIR_ = function (binaryen, expr, enclosingFusedBlock) {
  var /** @const */ NS = Wasm2Lang.Wasm.Tree.NodeSchema;
  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
  if (!bodyPtr) return null;
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = NS.safeGetExpressionInfo(binaryen, bodyPtr);
  var /** @const {string} */ loopName = /** @type {string} */ (expr.name);

  // Direct conditional br_if body: do-while with empty body.
  if (binaryen.BreakId === bodyInfo.id) {
    if (/** @type {?string} */ (bodyInfo.name) === loopName && 0 !== /** @type {number} */ (bodyInfo.condition || 0)) {
      return 'dowhile';
    }
    return null;
  }

  // While-if variant: loop body is If with no else arm.
  if (binaryen.IfId === bodyInfo.id) {
    if (0 === /** @type {number} */ (bodyInfo.ifFalse || 0)) {
      var /** @const {number} */ ifTruePtr = /** @type {number} */ (bodyInfo.ifTrue || 0);
      if (ifTruePtr) {
        var /** @const {!BinaryenExpressionInfo} */ ifTrueInfo = NS.safeGetExpressionInfo(binaryen, ifTruePtr);
        if (binaryen.BlockId === ifTrueInfo.id) {
          var /** @const {!Array<number>|void} */ thenCh = /** @type {!Array<number>|void} */ (ifTrueInfo.children);
          if (thenCh && thenCh.length >= 1) {
            var /** @const {!BinaryenExpressionInfo} */ thenLast = NS.safeGetExpressionInfo(
                binaryen,
                thenCh[thenCh.length - 1]
              );
            if (
              binaryen.BreakId === thenLast.id &&
              /** @type {?string} */ (thenLast.name) === loopName &&
              0 === /** @type {number} */ (thenLast.condition || 0)
            ) {
              return 'while';
            }
          }
        }
      }
    }
    return null;
  }

  // Body must be Block for remaining patterns.
  if (binaryen.BlockId !== bodyInfo.id) return null;
  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (bodyInfo.children);
  if (!children || 0 === children.length) return null;
  var /** @const {number} */ len = children.length;
  var /** @const {!BinaryenExpressionInfo} */ lastInfo = NS.safeGetExpressionInfo(binaryen, children[len - 1]);

  if (binaryen.BreakId === lastInfo.id) {
    var /** @const {?string} */ lastName = /** @type {?string} */ (lastInfo.name);
    var /** @const {number} */ lastCond = /** @type {number} */ (lastInfo.condition || 0);

    // Do-while variant B: last child is conditional br_if targeting loop.
    if (lastName === loopName && 0 !== lastCond && len > 1) {
      return 'dowhile';
    }

    // Do-while variant A: second-to-last is conditional br_if to loop,
    // last is unconditional br to exit.
    if (lastName !== loopName && 0 === lastCond && len >= 2) {
      var /** @const {!BinaryenExpressionInfo} */ prevInfo = NS.safeGetExpressionInfo(binaryen, children[len - 2]);
      if (
        binaryen.BreakId === prevInfo.id &&
        /** @type {?string} */ (prevInfo.name) === loopName &&
        0 !== /** @type {number} */ (prevInfo.condition || 0) &&
        len > 2
      ) {
        return 'dowhile';
      }
    }

    // Self-continue: last child is unconditional br targeting loop.
    if (lastName === loopName && 0 === lastCond) {
      // While-block refinement: first child is br_if targeting enclosing fused block.
      if (len >= 2 && '' !== enclosingFusedBlock) {
        var /** @const {!BinaryenExpressionInfo} */ firstInfo = NS.safeGetExpressionInfo(binaryen, children[0]);
        if (
          binaryen.BreakId === firstInfo.id &&
          0 !== /** @type {number} */ (firstInfo.condition || 0) &&
          /** @type {?string} */ (firstInfo.name) !== loopName &&
          /** @type {?string} */ (firstInfo.name) === enclosingFusedBlock
        ) {
          return 'while';
        }
      }
      return 'for';
    }
  }

  return null;
};

/**
 * Default enter callback for labeled-break backends (asm.js, Java).
 * Records label kinds, handles block-loop fusion, and adjusts indent.
 * PHP overrides entirely (uses labelStack).
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr.name);
    if (bName) {
      state.labelKinds[bName] = 'block';
      var /** @const {string} */ fName = state.functionInfo.name;
      var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ fusionPlan = this.getBlockFusionPlan_(fName, bName);
      if (fusionPlan) {
        if ('a' === fusionPlan.fusionVariant) {
          // Variant 'a': block wraps a loop as its sole child.
          // After binary round-trip, metadata positions may drift, pointing
          // to a block that is NOT a simple block-loop wrapper.  Validate
          // the structure before accepting the fusion plan.
          if (this.detectBlockLoopFusionFromIR_(binaryen, expr)) {
            state.pendingBlockFusion = bName;
          } else {
            ++state.indent;
          }
        } else {
          state.fusedBlockToLoop[bName] = state.currentLoopName;
        }
      } else if (this.useSimplifications_ && this.detectBlockLoopFusionFromIR_(binaryen, expr)) {
        state.pendingBlockFusion = bName;
        if (this.irFusedBlocks_) this.irFusedBlocks_[fName + '\0' + bName] = 'a';
      } else if (this.isBlockRootSwitch_(fName, bName)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (this.isBlockSwitchDispatch_(fName, bName)) {
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else {
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
    state.labelKinds[loopName] = 'loop';
    state.currentLoopName = loopName;
    state.breakableStack[state.breakableStack.length] = loopName;
    ++state.indent;
    var /** @const {string} */ enclosingFusedBlock = state.pendingBlockFusion;
    if ('' !== state.pendingBlockFusion) {
      state.fusedBlockToLoop[state.pendingBlockFusion] = loopName;
      state.pendingBlockFusion = '';
    }
    var /** @type {?string} */ loopKind = null;
    var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ metaLoopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
    if (metaLoopPlan) loopKind = metaLoopPlan.simplifiedLoopKind;
    if (!loopKind && this.useSimplifications_) {
      loopKind = this.detectLoopKindFromIR_(binaryen, expr, enclosingFusedBlock);
    }
    if (loopKind) {
      state.pendingLoopKind = loopKind;
      return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
    }
  } else if (binaryen.IfId === id) {
    ++state.indent;
  }

  return null;
};

/**
 * Shared leave-callback indent adjustment for labeled-break backends.
 * Decrements state.indent for LoopId, IfId, and named blocks (excluding
 * fused blocks and root-switch blocks).  PHP overrides its leave callback
 * entirely because it additionally pops labelStack entries.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.adjustLeaveIndent_ = function (state, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  if (binaryen.IfId === id) {
    --state.indent;
  } else if (binaryen.LoopId === id) {
    if (!state.pendingLoopKind) {
      --state.indent;
    }
    // Simplified loops manage indent in emitLeave_ (emitSimplifiedLoopFromIR_).
  } else if (binaryen.BlockId === id && expr.name) {
    var /** @const {string} */ bn = /** @type {string} */ (expr.name);
    var /** @const {string} */ fn = state.functionInfo.name;
    var /** @const {string|undefined} */ fusedTarget = state.fusedBlockToLoop[bn];
    // '*' is the switch-sentinel redirect used by flat-switch emission; it
    // suppresses labeled breaks but does not represent a block-loop fusion,
    // so the enter/leave indent bump around the dispatch outer must still
    // balance here.  Real block-loop fusion keeps its leave decrement inside
    // the simplified-loop emitter instead.
    var /** @const {boolean} */ isFused = !!fusedTarget && fusedTarget !== '*';
    var /** @const {boolean} */ isRootSwitch = this.isBlockRootSwitch_(fn, bn);
    if (!isFused && !isRootSwitch) {
      --state.indent;
    }
  }
};

/**
 * Assembles child result strings into the body of a block node.
 * Shared across all three backends — the loop and semicolon-appending
 * logic is identical; only the final block wrapping differs per backend.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} emitCount  Number of children to assemble (may exclude
 *     trailing condition expression for do-while/while bodies).
 * @param {number} childInd   Indentation level for expression-statement lines.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.assembleBlockChildren_ = function (childResults, emitCount, childInd) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Array<string>} */ lines = [];
  for (var /** @type {number} */ bi = 0; bi < emitCount; ++bi) {
    var /** @const {string} */ childCode = A.getChildResultInfo_(childResults, bi).expressionString;
    if ('' !== childCode) {
      if (-1 === childCode.indexOf('\n')) {
        lines[lines.length] = pad(childInd) + childCode + ';\n';
      } else {
        lines[lines.length] = childCode;
      }
    }
  }
  return lines.join('');
};

/**
 * Wraps a single break/continue statement in a conditional if the break
 * expression has a condition pointer.  Shared across all three backends
 * for the common BreakId conditional-wrapping pattern.
 *
 * @protected
 * @param {number} ind   Current indentation level.
 * @param {number} condPtr  Condition pointer (0 = unconditional).
 * @param {string} condExpr  Rendered condition expression (from child result).
 * @param {string} stmt  The break/continue statement string (including trailing newline).
 * @param {number=} opt_condCat  Expression category of the condition.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitConditionalStatement_ = function (ind, condPtr, condExpr, stmt, opt_condCat) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  if (0 !== condPtr) {
    return pad(ind) + 'if ' + this.formatCondition_(condExpr, opt_condCat) + ' {\n' + pad(ind + 1) + stmt + pad(ind) + '}\n';
  }
  return pad(ind) + stmt;
};

/**
 * Emits a BreakId with root-switch exit interception for labeled-break backends.
 * Returns the rendered result string and whether the break is terminal (needed
 * by Java to suppress unreachable trailing break statements).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {number} indent
 * @param {string} brName
 * @param {number} brCondPtr
 * @param {string} condExpr
 * @param {number=} opt_condCat  Expression category of the condition.
 * @return {{emittedString: string, isTerminal: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBreakStatement_ = function (
  state,
  indent,
  brName,
  brCondPtr,
  condExpr,
  opt_condCat
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (state.rootSwitchExitMap) {
    if (brName in state.rootSwitchExitMap) {
      var /** @const {!Array<string>} */ rsExitLines = [];
      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ rsVis =
        /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
      var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
      var /** @const {boolean} */ rsIsTerminal = SDA.emitRootSwitchExitCode(
          rsExitLines,
          state.wasmModule,
          binaryen,
          state.functionInfo,
          rsVis,
          state.rootSwitchExitMap[brName],
          indent
        );
      if (!rsIsTerminal) {
        state.usedLabels[state.rootSwitchLoopName] = true;
        rsExitLines[rsExitLines.length] =
          pad(indent) + this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
      }
      var /** @type {string} */ rsResult;
      if (0 !== brCondPtr) {
        rsResult =
          pad(indent) +
          'if ' +
          this.formatCondition_(condExpr, opt_condCat) +
          ' {\n' +
          rsExitLines.join('') +
          pad(indent) +
          '}\n';
      } else {
        rsResult = rsExitLines.join('');
      }
      return {emittedString: rsResult, isTerminal: true};
    }
    if (brName === state.rootSwitchRsName) {
      state.usedLabels[state.rootSwitchLoopName] = true;
      var /** @const {string} */ rsBreakStmt = this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
      return {
        emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, rsBreakStmt, opt_condCat),
        isTerminal: 0 === brCondPtr
      };
    }
  }

  var /** @const {string} */ brKind = state.labelKinds[brName] || 'block';
  var /** @const {string} */ brActual = state.fusedBlockToLoop[brName] || brName;
  var /** @const {string} */ brKeyword = 'loop' === brKind ? 'continue' : 'break';
  var /** @type {string} */ brStmt;
  // When a break was redirected through fusedBlockToLoop, the target loop may
  // have a label-elided prefix (ly$, lf$, le$) because no direct br references
  // it.  Skip the elision check for redirected breaks — the label is required
  // when the loop is not the innermost breakable.  However, when the fused
  // block itself is the innermost breakable, an unlabeled break exits the
  // for/while/do-while construct that replaced the block+loop pair.
  var /** @const {boolean} */ isFusedRedirect = brActual !== brName;
  if (
    (!isFusedRedirect && A.isLabelElided(brActual)) ||
    A.isBreakLabelImplicit_(state.breakableStack, brKeyword, brActual) ||
    (isFusedRedirect && A.isBreakLabelImplicit_(state.breakableStack, brKeyword, brName))
  ) {
    brStmt = brKeyword + ';\n';
  } else {
    state.usedLabels[brActual] = true;
    brStmt = brKeyword + ' ' + this.labelN_(state.labelMap, brActual) + ';\n';
  }
  return {
    emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, brStmt, opt_condCat),
    isTerminal: 0 === brCondPtr
  };
};

/**
 * Emits a raw SwitchId (br_table not detected as flat-switch dispatch) for
 * labeled-break backends.  Returns the rendered switch and whether a default
 * case is present (needed by Java to track terminal state).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {number} indent
 * @param {string} condExpr
 * @param {!Array<string>} names
 * @param {string} defaultName
 * @param {number=} opt_condCat  Expression category of the condition.
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSwitchStatement_ = function (
  state,
  indent,
  condExpr,
  names,
  defaultName,
  opt_condCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ lines = [];
  var /** @type {string} */ switchCond = condExpr;
  if (Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32 === opt_condCat) {
    switchCond = this.renderNumericComparisonResult_(switchCond);
  }
  lines[lines.length] = pad(indent) + 'switch (' + this.coerceSwitchCondition_(switchCond) + ') {\n';
  var /** @type {number} */ si = 0;
  var /** @const {number} */ nameLen = names.length;
  while (si < nameLen) {
    var /** @const {string} */ target = names[si];
    while (si < nameLen && names[si] === target) {
      lines[lines.length] = pad(indent + 1) + 'case ' + si + ':\n';
      ++si;
    }
    var /** @const {string} */ swActual = state.fusedBlockToLoop[target] || target;
    state.usedLabels[swActual] = true;
    lines[lines.length] =
      pad(indent + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, target);
  }
  if ('' !== defaultName) {
    var /** @const {string} */ defActual = state.fusedBlockToLoop[defaultName] || defaultName;
    state.usedLabels[defActual] = true;
    lines[lines.length] = pad(indent + 1) + 'default:\n';
    lines[lines.length] =
      pad(indent + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, defaultName);
  }
  lines[lines.length] = pad(indent) + '}\n';
  return {emittedString: lines.join(''), hasDefault: '' !== defaultName};
};

/**
 * Dispatches a BlockId node to the appropriate emitter: root-switch,
 * flat-switch, or labeled block.  All three backends share this dispatch;
 * each may override the individual emitters.
 *
 * @suppress {checkTypes}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBlockDispatch_ = function (state, nodeCtx, childResults) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  if (blockName) {
    var /** @const {string} */ fnName = state.functionInfo.name;
    if (this.isBlockRootSwitch_(fnName, blockName)) {
      return this.emitRootSwitch_(state, nodeCtx);
    }
    if (this.isBlockSwitchDispatch_(fnName, blockName)) {
      return this.emitFlatSwitch_(state, nodeCtx);
    }
  }
  return this.emitLabeledBlock_(state, nodeCtx, childResults);
};

/**
 * Emits a BlockId node body for labeled-break backends (asm.js, Java).
 * Handles fused blocks and child assembly.  PHP overrides to use
 * {@code do { } while (false)} wrapping instead of labeled blocks.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLabeledBlock_ = function (state, nodeCtx, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  var /** @const {number} */ ind = state.indent;
  // Only check fusedBlockToLoop — the runtime fusion record.  The metadata-
  // based getBlockFusionPlan_ may return stale plans when DFS positions
  // drift after binary round-trip; fusedBlockToLoop is set only when the
  // block-loop fusion actually occurred in emitEnter_.
  var /** @const {boolean} */ isFused = !!blockName && !!state.fusedBlockToLoop[blockName];
  var /** @const {number} */ childInd = blockName && !isFused ? ind + 1 : ind;
  var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, childResults.length, childInd);
  if (isFused) {
    return blockBody;
  }
  if (blockName) {
    var /** @const {!Binaryen} */ binaryen = state.binaryen;
    var /** @const {number} */ blockType = expr.type;
    if (binaryen.none !== blockType && 0 !== blockType && binaryen.unreachable !== blockType) {
      throw new Error(
        "Wasm2Lang codegen: named block '" +
          blockName +
          '\' in function "' +
          state.functionInfo.name +
          '" has a value result type. ' +
          'The target language cannot use labeled blocks as expressions. ' +
          'Use binaryen:min normalization to flatten value-typed blocks before codegen.'
      );
    }
    return pad(ind) + this.labelN_(state.labelMap, blockName) + ': {\n' + blockBody + pad(ind) + '}\n';
  }
  return blockBody;
};

/**
 * Returns the infinite-loop header keyword.  Default is {@code 'for (;;)'}
 * for asm.js and Java; PHP overrides to {@code 'while (true)'}.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.infiniteLoopKeyword_ = function () {
  return 'for (;;)';
};

/**
 * Emits a simplified loop (for/dowhile/while) from a LoopPlan.
 * All three backends share this structure; the only variation is the label
 * prefix (labeled-break backends use {@code labelN_ + ': '}, PHP omits it)
 * and the raw-loop fallback (handled by each backend after this returns null).
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {!Wasm2Lang.Wasm.Tree.LoopPlan} loopPlan
 * @param {number} ind   Current indentation level.
 * @param {string} label  Label prefix string (e.g. {@code 'L0: '}) or empty for unlabeled.
 * @param {string} bodyCode  The rendered body from the child result.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSimplifiedLoop_ = function (state, loopPlan, ind, label, bodyCode) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  if ('for' === loopPlan.simplifiedLoopKind) {
    return pad(ind) + label + this.infiniteLoopKeyword_() + ' {\n' + bodyCode + pad(ind) + '}\n';
  }
  var /** @const {{s: string, c: number}} */ condResult = A.subWalkExpressionWithCategory_(state, loopPlan.conditionPtr);
  if ('dowhile' === loopPlan.simplifiedLoopKind) {
    return (
      pad(ind) + label + 'do {\n' + bodyCode + pad(ind) + '} while ' + this.formatCondition_(condResult.s, condResult.c) + ';\n'
    );
  }
  return pad(ind) + label + 'while ' + this.formatCondition_(condResult.s, condResult.c) + ' {\n' + bodyCode + pad(ind) + '}\n';
};

/**
 * Emits a simplified loop by inspecting the intact loop body IR directly.
 * Used when SKIP_SUBTREE was returned in enter — the leave callback has no
 * child results and must derive everything from the binaryen expression.
 *
 * The method inspects the body to determine which children are structural
 * (exit guard, self-continue) vs. real body, sub-walks only the real body
 * children and condition, and assembles the output.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSimplifiedLoopFromIR_ = function (state, nodeCtx, loopKind) {
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {string} */ loopName = /** @type {string} */ (expr.name);

  // state.indent is still at inner level (adjustLeaveIndent_ skipped decrement).
  var /** @const {number} */ innerInd = state.indent;
  var /** @const {number} */ outerInd = innerInd - 1;

  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, bodyPtr)
    );

  // Register the body block label so inner breaks resolve correctly.
  // Only labelKinds and fusedBlockToLoop are needed — the body block must NOT
  // be pushed onto breakableStack because in the output the block is fused
  // into the loop.  Pushing it would make the loop non-innermost, causing
  // isBreakLabelImplicit_ to emit unnecessary labels on break/continue
  // statements that target the fused pair.
  if (binaryen.BlockId === bodyInfo.id && bodyInfo.name) {
    var /** @const {string} */ bodyBlockName = /** @type {string} */ (bodyInfo.name);
    state.labelKinds[bodyBlockName] = 'block';
    state.fusedBlockToLoop[bodyBlockName] = loopName;
  }

  var /** @const {!Object} */ bc = this.computeSimplifiedLoopBodyAndCondition_(state, loopKind, bodyInfo, loopName, innerInd);

  // Label: check if any break/continue references this loop by name.
  // Computed AFTER body walk so usedLabels is populated.
  var /** @type {string} */ label = '';
  if (state.usedLabels[loopName]) {
    label = this.labelN_(state.labelMap, loopName) + ': ';
  }

  var /** @const {string} */ result = this.assembleSimplifiedLoop_(
      loopKind,
      outerInd,
      label,
      /** @type {string} */ (bc['bodyCode']),
      /** @type {string} */ (bc['condStr']),
      /** @type {number} */ (bc['condCat'])
    );

  // Clean up: decrement indent (adjustLeaveIndent_ skipped it).
  --state.indent;
  return result;
};

/**
 * Shared body/condition computation for simplified-loop emission.
 *
 * Identical across asm.js/Java/PHP backends: runs the loop-kind dispatch to
 * produce the inner body code and (for `while`/`dowhile`) the continuation
 * condition.  Split out so the enclosing `emitSimplifiedLoopFromIR_` method
 * can be specialized per backend for body-block registration and label
 * handling without duplicating this ~70-line dispatch.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} innerInd
 * @return {!Object}  {bodyCode, condStr, condCat}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.computeSimplifiedLoopBodyAndCondition_ = function (
  state,
  loopKind,
  bodyInfo,
  loopName,
  innerInd
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ NS = Wasm2Lang.Wasm.Tree.NodeSchema;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {!BinaryenModule} */ wm = state.wasmModule;
  var /** @const {!BinaryenFunctionInfo} */ fi = state.functionInfo;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);

  var /** @type {string} */ condStr = '';
  var /** @type {number} */ condCat = A.CAT_VOID;
  var /** @type {string} */ bodyCode = '';

  if ('while' === loopKind) {
    // Condition: for while-block variant, invert the exit guard condition.
    // For while-if variant, use the If condition directly.
    if (binaryen.IfId === bodyInfo.id) {
      bodyCode = this.emitWhileLoopBody_(state, binaryen, wm, fi, vis, bodyInfo, loopName, innerInd, 0);
      // while-if variant: If condition IS the continuation condition.
      var /** @const {{s: string, c: number}} */ wrc = A.subWalkExpressionWithCategory_(
          state,
          /** @type {number} */ (bodyInfo.condition || 0)
        );
      condStr = wrc.s;
      condCat = wrc.c;
    } else {
      // while-block variant: count consecutive exit guards and combine.
      var /** @const {!Array<number>} */ wch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
      var /** @const {number} */ wchLen = wch.length;
      var /** @const {!BinaryenExpressionInfo} */ guardInfo = /** @type {!BinaryenExpressionInfo} */ (
          NS.safeGetExpressionInfo(binaryen, wch[0])
        );
      var /** @const {?string} */ guardTarget = /** @type {?string} */ (guardInfo.name);
      var /** @type {number} */ irGuardCount = 1;
      for (var /** @type {number} */ gci = 1; gci < wchLen - 1; ++gci) {
        var /** @const {!BinaryenExpressionInfo} */ gcInfo = NS.safeGetExpressionInfo(binaryen, wch[gci]);
        if (
          binaryen.BreakId !== gcInfo.id ||
          /** @type {?string} */ (gcInfo.name) !== guardTarget ||
          0 === /** @type {number} */ (gcInfo.condition || 0)
        ) {
          break;
        }
        ++irGuardCount;
      }
      bodyCode = this.emitWhileLoopBody_(state, binaryen, wm, fi, vis, bodyInfo, loopName, innerInd, irGuardCount);
      var /** @type {number} */ combinedPtr = Wasm2Lang.Wasm.Tree.CustomPasses.invertCondition(
          binaryen,
          wm,
          /** @type {number} */ (guardInfo.condition || 0)
        );
      for (var /** @type {number} */ gdi = 1; gdi < irGuardCount; ++gdi) {
        var /** @const {!BinaryenExpressionInfo} */ gdInfo = NS.safeGetExpressionInfo(binaryen, wch[gdi]);
        combinedPtr = wm.i32.and(
          combinedPtr,
          Wasm2Lang.Wasm.Tree.CustomPasses.invertCondition(binaryen, wm, /** @type {number} */ (gdInfo.condition || 0))
        );
      }
      var /** @const {{s: string, c: number}} */ ic = A.subWalkExpressionWithCategory_(state, combinedPtr);
      condStr = ic.s;
      condCat = ic.c;
    }
  } else if ('dowhile' === loopKind) {
    var /** @const {!Object} */ dwResult = this.emitDoWhileLoopBody_(
        state,
        binaryen,
        wm,
        fi,
        vis,
        bodyInfo,
        loopName,
        innerInd
      );
    bodyCode = /** @type {string} */ (dwResult['body']);
    condStr = /** @type {string} */ (dwResult['condStr']);
    condCat = /** @type {number} */ (dwResult['condCat']);
  } else {
    // for-loop: emit all body children except trailing self-continue (if present).
    bodyCode = this.emitForLoopBody_(state, binaryen, wm, fi, vis, bodyInfo, loopName, innerInd);
  }

  return {'bodyCode': bodyCode, 'condStr': condStr, 'condCat': condCat};
};

/**
 * Assembles the final simplified-loop string from body + optional condition.
 * `label` is the label prefix (e.g. `"name: "`) or `""` for backends that use
 * numeric break/continue depths (PHP).
 *
 * @protected
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @param {number} outerInd
 * @param {string} label
 * @param {string} bodyCode
 * @param {string} condStr
 * @param {number} condCat
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.assembleSimplifiedLoop_ = function (
  loopKind,
  outerInd,
  label,
  bodyCode,
  condStr,
  condCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  if ('for' === loopKind) {
    return pad(outerInd) + label + this.infiniteLoopKeyword_() + ' {\n' + bodyCode + pad(outerInd) + '}\n';
  }
  if ('dowhile' === loopKind) {
    return (
      pad(outerInd) + label + 'do {\n' + bodyCode + pad(outerInd) + '} while ' + this.formatCondition_(condStr, condCat) + ';\n'
    );
  }
  return pad(outerInd) + label + 'while ' + this.formatCondition_(condStr, condCat) + ' {\n' + bodyCode + pad(outerInd) + '}\n';
};

/**
 * Sub-walks selected children of a while-loop body.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wm
 * @param {!BinaryenFunctionInfo} fi
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} ind
 * @param {number} guardCount  Number of leading exit guards to skip (0 for
 *     while-if variant, >= 1 for while-block variant).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitWhileLoopBody_ = function (
  state,
  binaryen,
  wm,
  fi,
  vis,
  bodyInfo,
  loopName,
  ind,
  guardCount
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Array<string>} */ lines = [];
  if (binaryen.IfId === bodyInfo.id) {
    // while-if variant: body is the If's then-arm block, minus trailing br.
    var /** @const {number} */ thenPtr = /** @type {number} */ (bodyInfo.ifTrue || 0);
    var /** @const {!BinaryenExpressionInfo} */ thenInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, thenPtr)
      );
    var /** @const {!Array<number>} */ thenCh = /** @type {!Array<number>} */ ((thenInfo.children || []).slice(0));
    var /** @const {number} */ thenLen = thenCh.length;
    // Last child is unconditional br $loop — skip it.
    var /** @const {number} */ endIdx = thenLen > 0 ? thenLen - 1 : 0;
    A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, thenCh, 0, endIdx, ind);
    return lines.join('');
  }
  // while-block variant: skip first guardCount children (exit guards) and
  // last child (self-continue).
  var /** @const {!Array<number>} */ ch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
  var /** @const {number} */ len = ch.length;
  var /** @const {number} */ bodyStart = guardCount > 0 ? guardCount : 1;
  A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, ch, bodyStart, len - 1, ind);
  return lines.join('');
};

/**
 * Sub-walks selected children of a do-while loop body.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wm
 * @param {!BinaryenFunctionInfo} fi
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} ind
 * @return {!Object}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitDoWhileLoopBody_ = function (
  state,
  binaryen,
  wm,
  fi,
  vis,
  bodyInfo,
  loopName,
  ind
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;

  // Bare br_if variant: body is a direct br_if, empty body.
  if (binaryen.BreakId === bodyInfo.id) {
    var /** @const {{s: string, c: number}} */ bareCond = A.subWalkExpressionWithCategory_(
        state,
        /** @type {number} */ (bodyInfo.condition || 0)
      );
    return {'body': '', 'condStr': bareCond.s, 'condCat': bareCond.c};
  }

  var /** @const {!Array<number>} */ ch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
  var /** @const {number} */ len = ch.length;

  // Determine variant: check if last child is conditional br_if targeting loop.
  var /** @type {number} */ bodyEnd = len;
  var /** @type {number} */ condChildIdx = -1;

  if (len > 0) {
    var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[len - 1])
      );
    if (
      binaryen.BreakId === lastInfo.id &&
      /** @type {?string} */ (lastInfo.name) === loopName &&
      /** @type {number} */ (lastInfo.condition || 0) !== 0
    ) {
      // Variant B: last child is conditional br_if self-continue.
      condChildIdx = len - 1;
      bodyEnd = len - 1;
    } else if (len > 1) {
      // Variant A: second-to-last is conditional br_if, last is unconditional br.
      var /** @const {!BinaryenExpressionInfo} */ penInfo = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[len - 2])
        );
      if (
        binaryen.BreakId === penInfo.id &&
        /** @type {?string} */ (penInfo.name) === loopName &&
        /** @type {number} */ (penInfo.condition || 0) !== 0
      ) {
        condChildIdx = len - 2;
        bodyEnd = len - 2;
      }
    }
  }

  var /** @const {!Array<string>} */ lines = [];
  A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, ch, 0, bodyEnd, ind);

  var /** @type {string} */ condStr = '';
  var /** @type {number} */ condCat = A.CAT_VOID;
  if (-1 !== condChildIdx) {
    var /** @const {!BinaryenExpressionInfo} */ condBrInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[condChildIdx])
      );
    var /** @const {{s: string, c: number}} */ cr = A.subWalkExpressionWithCategory_(
        state,
        /** @type {number} */ (condBrInfo.condition || 0)
      );
    condStr = cr.s;
    condCat = cr.c;
  }

  return {'body': lines.join(''), 'condStr': condStr, 'condCat': condCat};
};

/**
 * Sub-walks the body of a for-loop, skipping the trailing self-continue.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wm
 * @param {!BinaryenFunctionInfo} fi
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} ind
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitForLoopBody_ = function (
  state,
  binaryen,
  wm,
  fi,
  vis,
  bodyInfo,
  loopName,
  ind
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Array<number>} */ ch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
  var /** @const {number} */ len = ch.length;

  // Check if last child is unconditional br targeting the loop — skip it.
  var /** @type {number} */ emitEnd = len;
  if (len > 0) {
    var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[len - 1])
      );
    if (
      binaryen.BreakId === lastInfo.id &&
      /** @type {?string} */ (lastInfo.name) === loopName &&
      /** @type {number} */ (lastInfo.condition || 0) === 0 &&
      /** @type {number} */ (lastInfo.value || 0) === 0
    ) {
      emitEnd = len - 1;
    }
  }

  var /** @const {!Array<string>} */ lines = [];
  A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, ch, 0, emitEnd, ind);

  // For-loops that had no trailing br stripped need a trailing break to exit.
  // Skip if the last emitted child is terminal (Java rejects unreachable statements).
  if (emitEnd === len && !state.lastExprIsTerminal) {
    lines[lines.length] = A.pad_(ind) + 'break;\n';
  }

  return lines.join('');
};

/**
 * Sub-walks a single expression pointer through the given visitor, reusing the
 * same enter/leave callbacks as the main code-gen traversal.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {number} exprPtr
 * @return {*}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_ = function (wasmModule, binaryen, funcInfo, visitor, exprPtr) {
  if (0 === exprPtr) {
    return '';
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
      binaryen: binaryen,
      treeModule: wasmModule,
      functionInfo: funcInfo,
      treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
      ancestors: []
    };
  return Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(exprPtr, ctx, visitor);
};

/**
 * Extracts the code string from a sub-walk result (which may be a plain string
 * or a typed expression object {@code {s, c}}).
 *
 * @protected
 * @param {*} result
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkString_ = function (result) {
  if ('string' === typeof result) {
    return result;
  }
  if (result && 'object' === typeof result) {
    var /** @const {*} */ s = result['s'];
    if ('string' === typeof s) {
      return /** @type {string} */ (s);
    }
  }
  return '';
};

/**
 * Sub-walks an expression pointer and returns both string and category.
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {number} conditionPtr
 * @return {{s: string, c: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionWithCategory_ = function (state, conditionPtr) {
  var /** @const {*} */ raw = Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_(
      state.wasmModule,
      state.binaryen,
      state.functionInfo,
      /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor),
      conditionPtr
    );
  if (raw && 'object' === typeof raw && 'string' === typeof raw['s']) {
    return {
      s: /** @type {string} */ (raw['s']),
      c: 'number' === typeof raw['c'] ? /** @type {number} */ (raw['c']) : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }
  if ('string' === typeof raw) {
    return {s: /** @type {string} */ (raw), c: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID};
  }
  return {s: '', c: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID};
};

/**
 * Sub-walks an expression pointer and returns its string form.
 * Convenience wrapper combining subWalkExpression_ and subWalkString_.
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {number} conditionPtr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionString_ = function (state, conditionPtr) {
  return Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionWithCategory_(state, conditionPtr).s;
};

/**
 * Sub-walks a slice of child pointers and appends each rendered result to
 * {@code lines}.  Empty strings are skipped, single-line results are
 * wrapped as {@code pad(indent) + code + ';\n'}, and multi-line results
 * are appended verbatim.  Shared by the loop-body emitters (while-if,
 * while-block, do-while, for-loop) and by the switch dispatch action
 * emitter.
 *
 * @protected
 * @param {!Array<string>} lines
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {!Array<number>} ptrs
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number} indent
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.appendSubWalkedLines_ = function (
  lines,
  wasmModule,
  binaryen,
  funcInfo,
  visitor,
  ptrs,
  startIdx,
  endIdx,
  indent
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {string} */ padStr = A.pad_(indent);
  for (var /** @type {number} */ i = startIdx; i < endIdx; ++i) {
    var /** @const {string} */ code = A.subWalkString_(A.subWalkExpression_(wasmModule, binaryen, funcInfo, visitor, ptrs[i]));
    if ('' !== code) {
      lines[lines.length] = -1 === code.indexOf('\n') ? padStr + code + ';\n' : code;
    }
  }
};

/**
 * Emits an if/if-else statement.  All backends share the same structure;
 * only the condition formatting differs (dispatched via formatCondition_).
 *
 * @protected
 * @param {number} indent
 * @param {string} conditionExpr  Raw condition child result string.
 * @param {string} trueCode       True-branch child result string.
 * @param {number} ifFalsePtr     Binaryen pointer to else branch (0 if none).
 * @param {number} childCount     Number of child results.
 * @param {string=} opt_falseCode False-branch child result string.
 * @param {number=} opt_condCat   Expression category of the condition.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitIfStatement_ = function (
  indent,
  conditionExpr,
  trueCode,
  ifFalsePtr,
  childCount,
  opt_falseCode,
  opt_condCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ cond = this.formatCondition_(conditionExpr, opt_condCat);
  if (0 !== ifFalsePtr && 2 < childCount) {
    return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '} else {\n' + opt_falseCode + pad(indent) + '}\n';
  }
  return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '}\n';
};

/**
 * Emits a local.set or local.tee expression.  Shared across all backends —
 * name formatting dispatches through localN_; coercion through coerceToType_.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} functionInfo
 * @param {number} indent
 * @param {boolean} isTee
 * @param {number} localIndex
 * @param {string} valueExpr
 * @param {number} valueCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLocalSet_ = function (
  binaryen,
  functionInfo,
  indent,
  isTee,
  localIndex,
  valueExpr,
  valueCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {number} */ localType = Wasm2Lang.Backend.ValueType.getLocalType(binaryen, functionInfo, localIndex);
  var /** @const {string} */ setValue = this.coerceToType_(binaryen, valueExpr, valueCat, localType);
  if (isTee) {
    return {
      emittedString: '(' + this.localN_(localIndex) + ' = ' + setValue + ')',
      resultCat: A.catForCoercedType_(binaryen, localType)
    };
  }
  return {emittedString: pad(indent) + this.localN_(localIndex) + ' = ' + setValue + ';\n', resultCat: A.CAT_VOID};
};

/**
 * Wraps a result string and category into a TraversalDecisionInput suitable
 * for return from an emitLeave_ callback.
 *
 * @protected
 * @param {string} result
 * @param {number} resultCat
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.buildLeaveResult_ = function (result, resultCat) {
  if (resultCat !== Wasm2Lang.Backend.AbstractCodegen.CAT_VOID) {
    return {decisionValue: {'s': result, 'c': resultCat}};
  }
  return {decisionValue: result};
};

/**
 * Handles expression IDs whose emitLeave_ logic is identical across all
 * backends: ConstId, BinaryId, UnaryId, LocalSetId, ReturnId, NopId,
 * UnreachableId.  Returns null for IDs that require backend-specific handling.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {number} id
 * @param {number} indent
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {!BinaryenFunctionInfo} functionInfo
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLeaveCommonCase_ = function (
  binaryen,
  expr,
  id,
  indent,
  childResults,
  functionInfo
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ getInfo = A.getChildResultInfo_;

  if (binaryen.ConstId === id) {
    var /** @const {number} */ constType = expr.type;
    if (Wasm2Lang.Backend.ValueType.isI64(binaryen, constType)) {
      return {
        emittedString: this.renderI64Const_(binaryen, expr.value),
        resultCat: A.CAT_I64
      };
    }
    return {
      emittedString: this.renderConst_(binaryen, /** @type {number} */ (expr.value), constType),
      resultCat: A.catForConstType_(binaryen, constType)
    };
  }
  if (binaryen.BinaryId === id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ binL = getInfo(childResults, 0);
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ binR = getInfo(childResults, 1);
    return this.emitBinaryId_(
      binaryen,
      /** @type {number} */ (expr.op),
      binL.expressionString,
      binR.expressionString,
      binL.expressionCategory,
      binR.expressionCategory
    );
  }
  if (binaryen.UnaryId === id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ unOp = getInfo(childResults, 0);
    return this.emitUnaryId_(binaryen, /** @type {number} */ (expr.op), unOp.expressionString, unOp.expressionCategory);
  }
  if (binaryen.LocalSetId === id) {
    if (!expr.isTee && this.localInitOverridesActive_) {
      var /** @const {string} */ liIdx = String(expr.index);
      if (liIdx in this.localInitOverridesActive_.map && !(liIdx in this.localInitOverridesActive_.consumed)) {
        this.localInitOverridesActive_.consumed[liIdx] = true;
        return {emittedString: '', resultCat: A.CAT_VOID};
      }
    }
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ lsOp = getInfo(childResults, 0);
    return this.emitLocalSet_(
      binaryen,
      functionInfo,
      indent,
      !!expr.isTee,
      /** @type {number} */ (expr.index),
      lsOp.expressionString,
      lsOp.expressionCategory
    );
  }
  if (binaryen.ReturnId === id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ retOp = getInfo(childResults, 0);
    var /** @type {string} */ retStr;
    if (retOp.hasExpression) {
      retStr =
        A.pad_(indent) +
        'return ' +
        this.coerceAtBoundary_(binaryen, retOp.expressionString, retOp.expressionCategory, functionInfo.results) +
        ';\n';
    } else {
      retStr = A.pad_(indent) + 'return;\n';
    }
    return {emittedString: retStr, resultCat: A.CAT_VOID};
  }
  if (binaryen.NopId === id || binaryen.UnreachableId === id) {
    return {emittedString: '', resultCat: A.CAT_VOID};
  }
  return null;
};
