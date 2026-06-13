'use strict';

/**
 * C# emit state: the shared labeled-break shape plus {@code usedExitLabels}.
 * C# has no labeled {@code break}/{@code continue}; a labeled 'continue'
 * becomes {@code goto} to a label placed on the loop statement itself
 * (re-entering a {@code for (;;)} or {@code while (cond)} statement is
 * exactly the continue semantics), and a labeled 'break' becomes {@code goto}
 * to an exit label placed after the construct.  {@code usedLabels} therefore
 * tracks continue-targets only and {@code usedExitLabels} break-targets.
 *
 * @typedef {{
 *   binaryen: !Binaryen,
 *   functionInfo: !BinaryenFunctionInfo,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globalTypes: !Object<string, number>,
 *   labelKinds: !Object<string, string>,
 *   labelMap: !Object<string, number>,
 *   importedNames: !Object<string, string>,
 *   stdlibNames: ?Object<string, string>,
 *   stdlibGlobals: ?Object<string, string>,
 *   exportNameMap: !Object<string, string>,
 *   functionTables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>,
 *   indent: number,
 *   lastExprIsTerminal: boolean,
 *   wasmModule: !BinaryenModule,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   fusedBlockToLoop: !Object<string, string>,
 *   pendingBlockFusion: string,
 *   currentLoopName: string,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string,
 *   breakableStack: !Array<string>,
 *   usedLabels: !Object<string, boolean>,
 *   usedExitLabels: !Object<string, boolean>,
 *   pendingLoopKind: string
 * }}
 */
Wasm2Lang.Backend.CsharpCodegen.EmitState_;

// ---------------------------------------------------------------------------
// Labeled-jump rendering: every labeled jump funnels through the three
// methods below, so the goto scheme stays in one place.
// ---------------------------------------------------------------------------

/**
 * Records keyword-specific label usage: 'continue' jumps need the label on
 * the loop statement ({@code usedLabels}); 'break' jumps need the exit label
 * after the construct ({@code usedExitLabels}).
 *
 * @suppress {checkTypes}
 * @private
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {string} keyword
 * @param {string} resolvedName
 * @return {void}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.csMarkJump_ = function (state, keyword, resolvedName) {
  if ('break' === keyword) {
    state.usedExitLabels[resolvedName] = true;
  } else {
    state.usedLabels[resolvedName] = true;
  }
};

/**
 * @override
 * @protected
 * @param {!Object<string, number>} labelMap
 * @param {string} keyword
 * @param {string} resolvedName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderLabeledJump_ = function (labelMap, keyword, resolvedName) {
  if (Wasm2Lang.Backend.AbstractCodegen.isLabelElided(resolvedName)) {
    return keyword + ';\n';
  }
  var /** @const {string} */ target =
      'break' === keyword ? this.csExitLabelN_(labelMap, resolvedName) : this.labelN_(labelMap, resolvedName);
  return 'goto ' + target + ';\n';
};

/**
 * @suppress {checkTypes}
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} keyword
 * @param {string} resolvedName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.markAndRenderLabeledJump_ = function (state, keyword, resolvedName) {
  if (!Wasm2Lang.Backend.AbstractCodegen.isLabelElided(resolvedName)) {
    this.csMarkJump_(/** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state), keyword, resolvedName);
  }
  return this.renderLabeledJump_(state.labelMap, keyword, resolvedName);
};

/**
 * @suppress {checkTypes}
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} keyword
 * @param {string} resolvedName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderRequiredLabeledJump_ = function (state, keyword, resolvedName) {
  this.csMarkJump_(/** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state), keyword, resolvedName);
  var /** @const {string} */ target =
      'break' === keyword ? this.csExitLabelN_(state.labelMap, resolvedName) : this.labelN_(state.labelMap, resolvedName);
  return 'goto ' + target + ';\n';
};

/**
 * Renders the exit-label line for a construct whose name received at least
 * one break-goto, or the empty string.  The label carries an empty statement
 * so it can close out any statement position.
 *
 * @suppress {checkTypes}
 * @protected
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {string} name
 * @param {number} indent
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.csExitLabelLine_ = function (state, name, indent) {
  if (!state.usedExitLabels[name]) {
    return '';
  }
  return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + this.csExitLabelN_(state.labelMap, name) + ': ;\n';
};

/**
 * Emits a named block as a plain brace block followed by a conditional exit
 * label — C# cannot label a block for {@code break}, so breaks targeting the
 * block were rendered as {@code goto <exit>} and the label lands here.
 *
 * @suppress {checkTypes}
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitLabeledBlock_ = function (state, nodeCtx, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  var /** @const {number} */ ind = state.indent;
  var /** @const {boolean} */ isFused = !!blockName && !!state.fusedBlockToLoop[blockName];
  var /** @const {boolean} */ canDirectLabel = !!blockName && this.canDirectLabelNamedBlock_(state.binaryen, expr);
  var /** @const {number} */ childInd = blockName && !isFused && !canDirectLabel ? ind + 1 : ind;
  var /** @const {number} */ emitCount = A.reachableBlockChildCount_(state.binaryen, expr);
  var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, emitCount, childInd);
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
    var /** @const {string} */ exitLine = this.csExitLabelLine_(
        /** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state),
        blockName,
        ind
      );
    if (canDirectLabel) {
      return blockBody + exitLine;
    }
    return pad(ind) + '{\n' + blockBody + pad(ind) + '}\n' + exitLine;
  }
  return blockBody;
};

/**
 * Appends the exit label after a simplified loop.  The continue-label prefix
 * is handled by the shared emitter via {@code usedLabels} (C# loop-statement
 * labels are valid continue-goto targets for {@code for (;;)} and
 * {@code while (cond)} headers; do-while bodies never carry interior
 * back-branches by construction, so the prefix never lands on one).
 *
 * @suppress {checkTypes}
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {string} loopKind
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitSimplifiedLoopFromIR_ = function (state, nodeCtx, loopKind) {
  var /** @const {string} */ loopName = /** @type {string} */ (nodeCtx.expression.name);
  var /** @const {string} */ result = Wasm2Lang.Backend.AbstractCodegen.prototype.emitSimplifiedLoopFromIR_.call(
      this,
      state,
      nodeCtx,
      loopKind
    );
  // state.indent was decremented by the base emitter — it is the outer level.
  return (
    result + this.csExitLabelLine_(/** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state), loopName, state.indent)
  );
};

/**
 * C# only allows calls, assignments, etc. as expression statements.
 * Restrict drop emission to call children (the side-effectful case); pure
 * expressions are dropped silently.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} dropValuePtr
 * @return {boolean}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.shouldEmitDropChild_ = function (binaryen, dropValuePtr) {
  if (!dropValuePtr) return false;
  var /** @const {number} */ childId = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, dropValuePtr).id;
  return binaryen.CallId === childId || binaryen.CallIndirectId === childId;
};

/**
 * Wasm {@code unreachable} aborts execution; throwing matches the trap
 * semantics and keeps C#'s definite-return analysis satisfied on paths that
 * end in unreachable.
 *
 * @override
 * @protected
 * @param {number} indent
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderUnreachableStatement_ = function (indent) {
  return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + 'throw new System.InvalidOperationException();\n';
};

/**
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  var /** @type {string} */ result = '';
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;

  // Reset terminal flag for all non-Block expressions (Block propagates from
  // its last child).  Terminal handlers (Return, unconditional Break, Switch
  // with default) override to true so callers (e.g. SwitchId default-case
  // detection) can suppress an unreachable trailing statement.
  if (binaryen.BlockId !== id) {
    state.lastExprIsTerminal = false;
  }

  var /** @const */ acc = A.makeChildAccessors_(childResults);
  var /** @const {function(number): string} */ cr = acc.cr;
  var /** @const {function(number): number} */ cc = acc.cc;

  var /** @const */ common = this.emitLeaveCommonCase_(binaryen, expr, id, ind, childResults, state.functionInfo);
  if (common) {
    if (binaryen.ReturnId === id) state.lastExprIsTerminal = true;
    return A.buildLeaveResult_(common.emittedString, common.resultCat);
  }

  switch (id) {
    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      var /** @const {string} */ csStdlibGlobal = state.stdlibGlobals ? state.stdlibGlobals[globalGetName] || '' : '';
      if ('' !== csStdlibGlobal) {
        result = csStdlibGlobal;
      } else {
        var /** @const {string} */ csGlobalGetKey = '$g_' + this.safeName_(globalGetName);
        this.markBinding_(csGlobalGetKey);
        result = 'this.' + this.n_(csGlobalGetKey);
      }
      resultCat = A.catForCoercedType_(binaryen, globalGetType);
      break;
    }

    case binaryen.LoadId: {
      var /** @const {string} */ loadPtr = Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr.offset)
        );
      var /** @const {number} */ loadType = expr.type;
      result = this.renderLoad_(binaryen, loadPtr, loadType, /** @type {number} */ (expr.bytes), !!expr.isSigned);
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {number} */ storeType = /** @type {number} */ (expr.valueType) || binaryen.i32;
      var /** @const {string} */ storePtr = Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr.offset)
        );
      result =
        pad(ind) + this.renderStore_(binaryen, storePtr, cr(1), storeType, /** @type {number} */ (expr.bytes), cc(1)) + '\n';
      break;
    }
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      var /** @const {string} */ csGlobalSetKey = '$g_' + this.safeName_(globalName);
      this.markBinding_(csGlobalSetKey);
      result =
        pad(ind) +
        'this.' +
        this.n_(csGlobalSetKey) +
        ' = ' +
        A.Precedence_.stripForAssignment(this.coerceToType_(binaryen, cr(0), cc(0), globalType)) +
        ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
      var /** @const {number} */ callType = expr.type;

      // Direct-cast imports: emit native language-level type cast instead of a call.
      // No helpers, no range checks — just the raw target-language cast.
      var /** @const {string|undefined} */ castBaseName = this.castNames_ ? this.castNames_[callTarget] : void 0;
      if (void 0 !== castBaseName) {
        if (Wasm2Lang.Backend.ValueType.isI32(binaryen, callType)) {
          // float → i32/u32: (int)(long) wraps like JS ~~x|0. Plain (int) would
          // saturate (or throw in checked contexts) at INT_MAX/MIN.  The
          // unchecked(...) keeps the same wrap when the operand is a constant
          // expression the compiler folds in checked mode (CS0221).
          result = 'unchecked((int)(long)' + A.Precedence_.wrap_(cr(0), A.Precedence_.PREC_UNARY_, true) + ')';
          resultCat = C.SIGNED;
        } else if (Wasm2Lang.Backend.ValueType.isI64(binaryen, callType)) {
          // float → i64/u64: plain (long) cast, unchecked for folded constants.
          result = 'unchecked((long)' + A.Precedence_.wrap_(cr(0), A.Precedence_.PREC_UNARY_, true) + ')';
          resultCat = A.CAT_I64;
        } else if (-1 !== castBaseName.indexOf('u32_to_f')) {
          // u32 → float/double: unsigned reinterpretation via (uint).
          result =
            (Wasm2Lang.Backend.ValueType.isF32(binaryen, callType) ? '(float)' : '(double)') +
            Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('uint', cr(0));
          resultCat = A.catForCoercedType_(binaryen, callType);
        } else {
          // i32/i64/u64 → float/double: plain coercion.
          result = this.coerceToType_(binaryen, cr(0), cc(0), callType);
          resultCat = A.catForCoercedType_(binaryen, callType);
        }
        break;
      }

      var /** @const {string} */ csStdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
      var /** @const {string} */ importBase = csStdlibName ? '' : state.importedNames[callTarget] || '';
      var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
          binaryen,
          expr,
          childResults,
          state.functionSignatures
        );
      var /** @type {string} */ callExpr;
      if ('' !== csStdlibName) {
        callExpr = csStdlibName + '(' + callArgs.join(', ') + ')';
      } else if ('' !== importBase) {
        this.markBinding_('$if_' + this.safeName_(importBase));
        var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ impSig = state.functionSignatures[
            callTarget
          ] || {sigParams: [], sigRetType: callType};
        callExpr = this.renderImportCallExpr_(binaryen, importBase, callArgs, callType, impSig.sigParams);
      } else {
        var /** @const {boolean} */ callIsExported = callTarget in state.exportNameMap;
        var /** @const {string} */ resolvedName = callIsExported ? state.exportNameMap[callTarget] : callTarget;
        var /** @const {string} */ callMethodName = callIsExported
            ? this.safeName_(resolvedName)
            : this.n_(this.safeName_(resolvedName));
        callExpr = callMethodName + '(' + callArgs.join(', ') + ')';
      }
      if (binaryen.none === callType || 0 === callType) {
        result = pad(ind) + callExpr + ';\n';
      } else {
        result = callExpr;
        resultCat = A.catForCoercedType_(binaryen, callType);
      }
      break;
    }
    case binaryen.CallIndirectId: {
      var /** @const {!Array<number>} */ ciParamTypes = binaryen.expandType(/** @type {number} */ (expr.params));
      var /** @const {number} */ ciRetType = expr.type;
      var /** @const {string} */ ciSigKey = A.buildSignatureKey_(binaryen, ciParamTypes, ciRetType);
      var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
      var /** @const {string} */ ciTableName = this.n_('$ftable_' + ciSigKey);
      var /** @const {string} */ ciIndexExpr = this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32);
      var /** @const {string} */ ciCallExpr = 'this.' + ciTableName + '[' + ciIndexExpr + '](' + ciArgs.join(', ') + ')';
      if (binaryen.none === ciRetType || 0 === ciRetType) {
        result = pad(ind) + ciCallExpr + ';\n';
      } else {
        result = ciCallExpr;
        resultCat = A.catForCoercedType_(binaryen, ciRetType);
      }
      break;
    }
    case binaryen.SelectId: {
      var /** @const {number} */ selectType = expr.type;
      var /** @const */ Ps = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      var /** @type {string} */ selCondStr;
      if (A.CAT_BOOL_I32 === cc(0)) {
        selCondStr = Ps.wrap_(cr(0), Ps.PREC_CONDITIONAL_, false);
      } else {
        selCondStr = Ps.renderInfix(cr(0), '!=', '0', Ps.PREC_EQUALITY_);
      }
      result = '(' + selCondStr + ' ? ' + cr(1) + ' : ' + cr(2) + ')';
      resultCat = A.catForCoercedType_(binaryen, selectType);
      break;
    }
    case binaryen.MemorySizeId:
      result = 'this.' + this.n_('buffer') + '.Length / 65536';
      resultCat = C.SIGNED;
      break;

    case binaryen.MemoryGrowId:
      this.markHelper_('$w2l_memory_grow');
      result = 'this.' + this.n_('$w2l_memory_grow') + '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ')';
      resultCat = C.SIGNED;
      break;

    case binaryen.MemoryFillId:
    case binaryen.MemoryCopyId:
      result = this.renderMemoryBulkOp_(binaryen, id, ind, childResults, 'this.' + this.n_('buffer'));
      break;

    case binaryen.BlockId: {
      var /** @const {?{w2lExprStr: string, w2lExprCat: number, w2lRootValueBlockPrefix: string}} */ rootValueShape =
          A.tryEmitRootValueBlock_(state, nodeCtx, childResults);
      if (rootValueShape) {
        return /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ ({decisionValue: rootValueShape});
      }
      result = this.emitBlockDispatch_(state, nodeCtx, childResults);
      break;
    }
    case binaryen.LoopId: {
      var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
      var /** @type {?string} */ loopKind = null;
      if ('' !== state.pendingLoopKind) {
        loopKind = state.pendingLoopKind;
        state.pendingLoopKind = '';
      }
      if (loopKind) {
        result = this.emitSimplifiedLoopFromIR_(state, nodeCtx, loopKind);
      } else {
        // Raw loop fallback (unsimplified) — see the Java backend for the
        // trailing-break rationale.  The continue label sits on the loop
        // statement (goto re-enters the for (;;)); the exit label follows it.
        var /** @const {!BinaryenExpressionInfo} */ loopBodyInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
            binaryen,
            /** @type {number} */ (expr.body)
          );
        var /** @const {boolean} */ needsTrailingBreak = binaryen.unreachable !== loopBodyInfo.type;
        var /** @const {string} */ rawLabel = state.usedLabels[loopName] ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        result =
          this.emitRawInfiniteLoop_(ind, rawLabel, cr(0), needsTrailingBreak) + this.csExitLabelLine_(state, loopName, ind);
      }
      --state.breakableStack.length;
      break;
    }
    case binaryen.IfId: {
      var /** @const {number} */ ifType = expr.type;
      if (binaryen.none !== ifType && binaryen.unreachable !== ifType && 0 !== ifType) {
        var /** @const */ IfPs = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        var /** @type {string} */ ifCondStr;
        if (A.CAT_BOOL_I32 === cc(0)) {
          ifCondStr = IfPs.wrap_(cr(0), IfPs.PREC_CONDITIONAL_, false);
        } else {
          ifCondStr = IfPs.renderInfix(cr(0), '!=', '0', IfPs.PREC_EQUALITY_);
        }
        result = '(' + ifCondStr + ' ? ' + cr(1) + ' : ' + cr(2) + ')';
        resultCat = A.catForCoercedType_(binaryen, ifType);
      } else {
        result = this.emitIfStatement_(
          ind,
          cr(0),
          cr(1),
          /** @type {number} */ (expr.ifFalse),
          childResults.length,
          cr(2),
          cc(0)
        );
      }
      break;
    }
    case binaryen.BreakId: {
      var /** @const */ brResult = this.emitBreakStatement_(
          state,
          ind,
          /** @type {string} */ (expr.name),
          /** @type {number} */ (expr.condition),
          cr(0),
          cc(0)
        );
      result = brResult.emittedString;
      if (brResult.isTerminal) {
        state.lastExprIsTerminal = true;
      }
      break;
    }
    case binaryen.SwitchId: {
      var /** @const */ swResult = this.emitSwitchStatement_(
          state,
          ind,
          cr(0),
          /** @type {!Array<string>} */ (expr.names || []),
          /** @type {string} */ (expr.defaultName || ''),
          cc(0)
        );
      result = swResult.emittedString;
      state.lastExprIsTerminal = swResult.hasDefault;
      break;
    }
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  return A.buildLeaveResult_(result, resultCat);
};

// ---------------------------------------------------------------------------
// Flat-switch emission.  The shared emitLabeledFlatSwitch wraps the switch in
// Java-style labeled blocks, which C# does not have — this variant keeps the
// shared structure extraction, chain-redirect bookkeeping, and case-group
// walking, but places goto exit labels after the switch / epilogue instead.
// ---------------------------------------------------------------------------

/**
 * Emits a case/default group's action code and exit statement.  Mirrors
 * {@code SwitchDispatchApplication.emitLabeledGroupBody_} with one change:
 * the fallthrough-preventing break is always the plain {@code break;} —
 * exiting the switch in C# lands exactly where the labeled variants land in
 * Java (before the epilogue, or after the construct when there is none).
 *
 * @suppress {accessControls, checkTypes}
 * @private
 * @param {!Array<string>} lines
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} group
 * @param {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} info
 * @param {number} indent
 * @return {void}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.csEmitGroupBody_ = function (lines, state, vis, group, info, indent) {
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {?Object<string, !Array<number>>} */ rsExitMap = state.rootSwitchExitMap;
  var /** @const {string} */ rsRsName = state.rootSwitchRsName;
  var /** @const {string} */ rsLoopName = state.rootSwitchLoopName;

  var /** @const {number} */ savedIndent = state.indent;
  state.indent = indent;
  var /** @const {boolean} */ strippedBreak = S.emitSwitchCaseActions(
      lines,
      state.wasmModule,
      binaryen,
      state.functionInfo,
      vis,
      group.actionPtrs,
      indent,
      info.outerName
    );
  state.indent = savedIndent;

  if (group.externalTarget) {
    if (rsExitMap && group.externalTarget in rsExitMap) {
      var /** @const {number} */ savedInd2 = state.indent;
      state.indent = indent;
      var /** @const {boolean} */ terminal = S.emitRootSwitchExitCode(
          lines,
          state.wasmModule,
          binaryen,
          state.functionInfo,
          vis,
          rsExitMap[group.externalTarget],
          indent
        );
      state.indent = savedInd2;
      if (!terminal) {
        lines[lines.length] = pad(indent) + this.markAndRenderLabeledJump_(state, 'break', rsLoopName);
      }
    } else if (rsRsName && group.externalTarget === rsRsName) {
      lines[lines.length] = pad(indent) + this.markAndRenderLabeledJump_(state, 'break', rsLoopName);
    } else {
      lines[lines.length] = pad(indent) + this.resolveBreakTarget_(state, group.externalTarget);
    }
  } else if (group.needsBreak || strippedBreak) {
    lines[lines.length] = pad(indent) + 'break;\n';
  }
};

/**
 * Emits a flat switch statement for a br_table dispatch block.
 *
 * @suppress {accessControls, checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const */ fsResult = this.csEmitLabeledFlatSwitch_(state, nodeCtx);
  --state.breakableStack.length;
  state.lastExprIsTerminal = fsResult.hasDefault;
  return fsResult.emittedString;
};

/**
 * C# variant of {@code SwitchDispatchApplication.emitLabeledFlatSwitch}.
 *
 * @suppress {accessControls, checkTypes}
 * @private
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.csEmitLabeledFlatSwitch_ = function (state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ S = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
  // prettier-ignore
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} */ info =
    /** @type {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} */ (
      S.extractStructure(binaryen, nodeCtx.expressionPointer)
    );
  // Register the outer name in the label map (alias targets below reuse its
  // sequence number, mirroring the shared emitter's bookkeeping).
  this.labelN_(state.labelMap, info.outerName);
  var /** @const {!Array<string>} */ cn = info.chainNames;
  var /** @const {number} */ cnLen = cn.length;
  var /** @const {boolean} */ hasEpilogue = info.epiloguePtrs.length > 0;

  // Same three-way chain-name redirect bookkeeping as the shared emitter:
  //  - labeled epilogue: chain breaks exit to just-after-the-switch (the
  //    epilogue start), outer breaks past the epilogue;
  //  - label required, no epilogue: chain breaks redirect to the outer name
  //    (exit label after the switch);
  //  - otherwise: redirect everything to the '*' switch sentinel so breaks
  //    degrade to the unlabeled `break;` that exits the switch.
  var /** @const {boolean} */ labeledEpilogue = hasEpilogue && info.requiresLabel;
  var /** @type {string} */ innerChainName = '';
  if (labeledEpilogue) {
    for (var /** @type {number} */ fi = 0; fi < cnLen; ++fi) {
      if (cn[fi] !== info.outerName) {
        innerChainName = cn[fi];
        break;
      }
    }
    if ('' !== innerChainName) {
      state.labelKinds[innerChainName] = 'block';
      state.breakableStack[state.breakableStack.length] = innerChainName;
      this.labelN_(state.labelMap, innerChainName);
      var /** @const {number|void} */ innerMapSeq = state.labelMap[innerChainName];
      for (var /** @type {number} */ ci = 0; ci < cnLen; ++ci) {
        if (cn[ci] !== info.outerName && cn[ci] !== innerChainName) {
          if (!(cn[ci] in state.labelMap)) {
            state.labelMap[cn[ci]] = /** @type {number} */ (innerMapSeq);
          }
          if (!(cn[ci] in state.fusedBlockToLoop)) {
            state.fusedBlockToLoop[cn[ci]] = innerChainName;
          }
        }
      }
    }
  } else if (info.requiresLabel) {
    var /** @const {number|void} */ outerSeq = state.labelMap[info.outerName];
    for (var /** @type {number} */ ci2 = 0; ci2 < cnLen; ++ci2) {
      if (cn[ci2] !== info.outerName) {
        if (!(cn[ci2] in state.labelMap)) {
          state.labelMap[cn[ci2]] = /** @type {number} */ (outerSeq);
        }
        if (!(cn[ci2] in state.fusedBlockToLoop)) {
          state.fusedBlockToLoop[cn[ci2]] = info.outerName;
        }
      }
    }
  } else {
    for (var /** @type {number} */ ci3 = 0; ci3 < cnLen; ++ci3) {
      if (!(cn[ci3] in state.fusedBlockToLoop)) {
        state.fusedBlockToLoop[cn[ci3]] = '*';
      }
    }
  }

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ condResult = A.subWalkExpressionWithCategory_(
      state,
      info.conditionPtr
    );
  var /** @type {string} */ condInput = condResult.w2lExprStr;
  if (A.CAT_BOOL_I32 === condResult.w2lExprCat) {
    condInput = this.renderNumericComparisonResult_(condInput);
  }
  var /** @const {string} */ condStr = this.coerceSwitchCondition_(condInput);

  var /** @const {!Array<string>} */ lines = [];
  lines[lines.length] = pad(ind) + 'switch (' + condStr + ') {\n';

  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_>} */ groups = info.caseGroups;
  for (var /** @type {number} */ gi = 0, /** @const {number} */ groupLen = groups.length; gi < groupLen; ++gi) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ group = groups[gi];
    var /** @const {!Array<number>} */ indices = group.caseIndices;
    for (var /** @type {number} */ ii = 0, /** @const {number} */ idxLen = indices.length; ii < idxLen; ++ii) {
      lines[lines.length] = pad(ind + 1) + 'case ' + indices[ii] + ':\n';
    }
    this.csEmitGroupBody_(lines, state, vis, group, info, ind + 2);
  }

  var /** @type {?Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ defGroup = info.defaultGroup;
  if (defGroup) {
    lines[lines.length] = pad(ind + 1) + 'default:\n';
    this.csEmitGroupBody_(lines, state, vis, defGroup, info, ind + 2);
  }

  lines[lines.length] = pad(ind) + '}\n';

  // Epilogue: pop the switch sentinel (and the inner chain entry) so break
  // label-elision inside the epilogue resolves against the real outer stack,
  // mirroring the shared emitter.  The inner exit label lands between the
  // switch and the epilogue; the outer exit label lands after everything.
  if (hasEpilogue) {
    if (labeledEpilogue && '' !== innerChainName) {
      lines[lines.length] = this.csExitLabelLine_(state, innerChainName, ind);
      --state.breakableStack.length;
    }
    --state.breakableStack.length;
    S.emitSubWalkedExpressions_(
      lines,
      /** @type {!BinaryenModule} */ (state.wasmModule),
      binaryen,
      state.functionInfo,
      vis,
      info.epiloguePtrs,
      info.epiloguePtrs.length,
      ind
    );
    state.breakableStack[state.breakableStack.length] = '*';
  }
  lines[lines.length] = this.csExitLabelLine_(state, info.outerName, ind);

  return {emittedString: lines.join(''), hasDefault: !!defGroup};
};
