'use strict';

/**
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
 *   usedLabels: !Object<string, boolean>
 * }}
 */
Wasm2Lang.Backend.JavaCodegen.EmitState_;

/**
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  var /** @type {string} */ result = '';
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;

  // Capture terminal flag before reset — LoopId reads the flag set by its
  // body's last child (propagated through Block).
  var /** @const {boolean} */ bodyWasTerminal = state.lastExprIsTerminal;

  // Reset terminal flag for all non-Block expressions (Block propagates from
  // its last child).  Terminal handlers (Return, unconditional Break, Switch
  // with default) override to true so LoopId can omit an unreachable break.
  if (id !== binaryen.BlockId) {
    state.lastExprIsTerminal = false;
  }

  var /** @const {function(number): !Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ childResultAt = function (i) {
      return A.getChildResultInfo_(childResults, i);
    };

  var /** @const {function(number): string} */ cr = function (i) {
      return childResultAt(i).expressionString;
    };

  var /** @const {function(number): number} */ cc = function (i) {
      return childResultAt(i).expressionCategory;
    };

  var /** @const */ common = this.emitLeaveCommonCase_(binaryen, expr, id, ind, childResults, state.functionInfo);
  if (common) {
    if (id === binaryen.ReturnId) state.lastExprIsTerminal = true;
    return A.buildLeaveResult_(common.emittedString, common.resultCat);
  }

  switch (id) {
    case binaryen.LocalGetId: {
      var /** @const {number} */ localGetIdx = /** @type {number} */ (expr.index);
      var /** @const {number} */ localGetType = Wasm2Lang.Backend.ValueType.getLocalType(
          binaryen,
          state.functionInfo,
          localGetIdx
        );
      result = this.localN_(localGetIdx);
      resultCat = A.catForCoercedType_(binaryen, localGetType);
      break;
    }
    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      var /** @const {string} */ javaStdlibGlobal = state.stdlibGlobals ? state.stdlibGlobals[globalGetName] || '' : '';
      if ('' !== javaStdlibGlobal) {
        result = javaStdlibGlobal;
      } else {
        var /** @const {string} */ javaGlobalGetKey = '$g_' + this.safeName_(globalGetName);
        this.markBinding_(javaGlobalGetKey);
        result = 'this.' + this.n_(javaGlobalGetKey);
      }
      resultCat = A.catForCoercedType_(binaryen, globalGetType);
      break;
    }

    case binaryen.LoadId: {
      var /** @const {string} */ loadPtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
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
      var /** @const {string} */ storePtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
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
      var /** @const {string} */ javaGlobalSetKey = '$g_' + this.safeName_(globalName);
      this.markBinding_(javaGlobalSetKey);
      result =
        pad(ind) + 'this.' + this.n_(javaGlobalSetKey) + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
      var /** @const {number} */ callType = expr.type;

      // Direct-cast imports: emit native type cast instead of a call.
      // Java's renderCoercionByType_ for i32 is a no-op, so float/double→int
      // needs an explicit (int) cast.
      var /** @const {number|undefined} */ castRetType = this.castNames_ ? this.castNames_[callTarget] : void 0;
      if (void 0 !== castRetType) {
        if (Wasm2Lang.Backend.ValueType.isI32(binaryen, callType)) {
          result = '(int)' + A.Precedence_.wrap(cr(0), A.Precedence_.PREC_UNARY_, true);
        } else {
          result = this.coerceToType_(binaryen, cr(0), cc(0), callType);
        }
        resultCat = A.catForCoercedType_(binaryen, callType);
        break;
      }

      var /** @const {string} */ javaStdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
      var /** @const {string} */ importBase = javaStdlibName ? '' : state.importedNames[callTarget] || '';
      var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
          binaryen,
          expr,
          childResults,
          state.functionSignatures
        );
      var /** @type {string} */ callExpr;
      if ('' !== javaStdlibName) {
        callExpr = javaStdlibName + '(' + callArgs.join(', ') + ')';
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
      if (callType === binaryen.none || 0 === callType) {
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
      var /** @const {string} */ ciCallExpr = 'this.' + ciTableName + '[' + ciIndexExpr + '].call(' + ciArgs.join(', ') + ')';
      if (ciRetType === binaryen.none || 0 === ciRetType) {
        result = pad(ind) + ciCallExpr + ';\n';
      } else {
        result = ciCallExpr;
        resultCat = A.catForCoercedType_(binaryen, ciRetType);
      }
      break;
    }
    case binaryen.DropId: {
      // Java only allows method calls, assignments, etc. as expression statements.
      // Emit only when the child is a call (side-effectful); skip pure expressions.
      var /** @const {number} */ dropValuePtr = /** @type {number} */ (expr.value);
      var /** @const {number} */ dropValueId = dropValuePtr
          ? Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, dropValuePtr).id
          : 0;
      if (dropValueId === binaryen.CallId || dropValueId === binaryen.CallIndirectId) {
        result = pad(ind) + cr(0) + ';\n';
      }
      break;
    }
    case binaryen.SelectId: {
      var /** @const {number} */ selectType = expr.type;
      var /** @const */ Ps = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      var /** @type {string} */ selCondStr;
      if (A.CAT_BOOL_I32 === cc(0)) {
        selCondStr = Ps.wrap(cr(0), Ps.PREC_CONDITIONAL_, false);
      } else {
        selCondStr = Ps.renderInfix(cr(0), '!=', '0', Ps.PREC_EQUALITY_);
      }
      result = '(' + selCondStr + ' ? ' + cr(1) + ' : ' + cr(2) + ')';
      resultCat = A.catForCoercedType_(binaryen, selectType);
      break;
    }
    case binaryen.MemorySizeId:
      result = 'this.' + this.n_('buffer') + '.capacity() / 65536';
      resultCat = C.SIGNED;
      break;

    case binaryen.MemoryGrowId:
      this.markHelper_('$w2l_memory_grow');
      result = 'this.' + this.n_('$w2l_memory_grow') + '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ')';
      resultCat = C.SIGNED;
      break;

    case binaryen.MemoryFillId:
    case binaryen.MemoryCopyId: {
      var /** @const {string} */ javaMemHelper = id === binaryen.MemoryFillId ? '$w2l_memory_fill' : '$w2l_memory_copy';
      this.markHelper_(javaMemHelper);
      result =
        pad(ind) +
        this.n_(javaMemHelper) +
        '(this.' +
        this.n_('buffer') +
        ', ' +
        this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) +
        ', ' +
        this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
        ', ' +
        this.coerceToType_(binaryen, cr(2), cc(2), binaryen.i32) +
        ');\n';
      break;
    }

    case binaryen.BlockId:
      result = this.emitBlockDispatch_(state, nodeCtx, childResults);
      break;
    case binaryen.LoopId: {
      var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
      var /** @const {string} */ loopBody = cr(0);
      var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ loopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
      if (loopPlan) {
        var /** @const {string} */ loopLabel =
            loopPlan.needsLabel || state.usedLabels[loopName] ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        result = this.emitSimplifiedLoop_(state, loopPlan, ind, loopLabel, loopBody);
      } else {
        // Raw loop fallback (unsimplified): named body blocks can complete
        // normally via `break $blockName`, so the trailing `break;` is
        // always reachable and required.
        var /** @const {number} */ loopBodyPtr = /** @type {number} */ (expr.body);
        var /** @const {!BinaryenExpressionInfo} */ loopBodyInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
            binaryen,
            loopBodyPtr
          );
        var /** @const {boolean} */ bodyBlockIsNamed = loopBodyInfo.id === binaryen.BlockId && !!loopBodyInfo.name;
        var /** @const {boolean} */ needsTrailingBreak = bodyBlockIsNamed || !bodyWasTerminal;
        var /** @const {string} */ rawLabel = state.usedLabels[loopName] ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        result =
          pad(ind) +
          rawLabel +
          'for (;;) {\n' +
          loopBody +
          (needsTrailingBreak ? pad(ind + 1) + 'break;\n' : '') +
          pad(ind) +
          '}\n';
      }
      --state.breakableStack.length;
      break;
    }
    case binaryen.IfId: {
      var /** @const {number} */ ifType = expr.type;
      if (ifType !== binaryen.none && ifType !== binaryen.unreachable && 0 !== ifType) {
        var /** @const */ IfPs = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        var /** @type {string} */ ifCondStr;
        if (A.CAT_BOOL_I32 === cc(0)) {
          ifCondStr = IfPs.wrap(cr(0), IfPs.PREC_CONDITIONAL_, false);
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
    case binaryen.SIMDExtractId: {
      this.markBinding_('$v128');
      var /** @const {number} */ seIndex = /** @type {number} */ (expr.index);
      result = cr(0) + '.lane(' + seIndex + ')';
      resultCat = A.catForCoercedType_(binaryen, expr.type);
      break;
    }
    case binaryen.SIMDReplaceId: {
      this.markBinding_('$v128');
      var /** @const {number} */ srIndex = /** @type {number} */ (expr.index);
      result = cr(0) + '.withLane(' + srIndex + ', ' + cr(1) + ')';
      resultCat = A.CAT_V128;
      break;
    }
    case binaryen.SIMDShuffleId: {
      this.markBinding_('$v128');
      var /** @const {!Array<number>} */ shuffleMask = /** @type {!Array<number>} */ (expr.mask);
      // Convert 16-byte mask to 4-lane i32 shuffle indices.
      var /** @const {!Array<number>} */ shuffleLanes = [];
      for (var /** @type {number} */ si = 0; si < 4; ++si) {
        shuffleLanes[si] = shuffleMask[si * 4] >> 2;
      }
      result =
        cr(0) + '.rearrange(VectorShuffle.fromValues(IntVector.SPECIES_128, ' + shuffleLanes.join(', ') + '), ' + cr(1) + ')';
      resultCat = A.CAT_V128;
      break;
    }
    case binaryen.SIMDTernaryId: {
      this.markBinding_('$v128');
      // Bitselect: (a & c) | (b & ~c)
      result =
        cr(0) +
        '.lanewise(VectorOperators.AND, ' +
        cr(2) +
        ').lanewise(VectorOperators.OR, ' +
        cr(1) +
        '.lanewise(VectorOperators.AND, ' +
        cr(2) +
        '.lanewise(VectorOperators.NOT)))';
      resultCat = A.CAT_V128;
      break;
    }
    case binaryen.SIMDShiftId: {
      this.markBinding_('$v128');
      var /** @const {number} */ shiftOp = /** @type {number} */ (expr.op);
      var /** @const {string} */ shiftExpr = cr(1);
      var /** @type {string} */ shiftVecOp = 'LSHL';
      if (
        shiftOp === binaryen.ShrSVecI8x16 ||
        shiftOp === binaryen.ShrSVecI16x8 ||
        shiftOp === binaryen.ShrSVecI32x4 ||
        shiftOp === binaryen.ShrSVecI64x2
      ) {
        shiftVecOp = 'ASHR';
      } else if (
        shiftOp === binaryen.ShrUVecI8x16 ||
        shiftOp === binaryen.ShrUVecI16x8 ||
        shiftOp === binaryen.ShrUVecI32x4 ||
        shiftOp === binaryen.ShrUVecI64x2
      ) {
        shiftVecOp = 'LSHR';
      }
      result = cr(0) + '.lanewise(VectorOperators.' + shiftVecOp + ', ' + shiftExpr + ')';
      resultCat = A.CAT_V128;
      break;
    }
    case binaryen.SIMDLoadId: {
      this.markBinding_('$v128');
      var /** @const {string} */ slPtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr.offset)
        );
      this.markHelper_('$w2l_v128_load');
      result = this.n_('$w2l_v128_load') + '(this.' + this.n_('buffer') + ', ' + slPtr + ')';
      resultCat = A.CAT_V128;
      break;
    }
    case binaryen.SIMDLoadStoreLaneId: {
      this.markBinding_('$v128');
      var /** @const {number} */ lslOp = /** @type {number} */ (expr.op);
      var /** @const {string} */ lslPtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr.offset)
        );
      var /** @const {boolean} */ isLslStore =
          lslOp === binaryen.Store8LaneVec128 ||
          lslOp === binaryen.Store16LaneVec128 ||
          lslOp === binaryen.Store32LaneVec128 ||
          lslOp === binaryen.Store64LaneVec128;
      if (isLslStore) {
        var /** @const {number} */ storeLane = /** @type {number} */ (expr.index);
        result = pad(ind) + 'this.' + this.n_('buffer') + '.putInt(' + lslPtr + ', ' + cr(1) + '.lane(' + storeLane + '));\n';
      } else {
        var /** @const {number} */ loadLane = /** @type {number} */ (expr.index);
        result = cr(1) + '.withLane(' + loadLane + ', this.' + this.n_('buffer') + '.getInt(' + lslPtr + '))';
        resultCat = A.CAT_V128;
      }
      break;
    }
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  return A.buildLeaveResult_(result, resultCat);
};

/**
 * Emits a flat switch statement for a br_table dispatch block.
 *
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const */ fsResult = SDA.emitLabeledFlatSwitch(this, state, nodeCtx);
  --state.breakableStack.length;
  state.lastExprIsTerminal = fsResult.hasDefault;
  return fsResult.emittedString;
};
