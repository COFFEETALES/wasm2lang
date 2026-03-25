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
 *   rootSwitchLoopName: string
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
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  var /** @type {string} */ result = '';
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ hp = A.hasPrefix_;
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

  switch (id) {
    case binaryen.ConstId: {
      var /** @const {number} */ constType = /** @type {number} */ (expr['type']);
      result = this.renderConst_(binaryen, /** @type {number} */ (expr['value']), constType);
      resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, constType)
        ? C.FIXNUM
        : Wasm2Lang.Backend.ValueType.isF32(binaryen, constType)
          ? A.CAT_F32
          : Wasm2Lang.Backend.ValueType.isF64(binaryen, constType)
            ? A.CAT_F64
            : A.CAT_RAW;
      break;
    }
    case binaryen.LocalGetId: {
      var /** @const {number} */ localGetIdx = /** @type {number} */ (expr['index']);
      var /** @const {number} */ localGetType = Wasm2Lang.Backend.ValueType.getLocalType(
          binaryen,
          state.functionInfo,
          localGetIdx
        );
      result = this.localN_(localGetIdx);
      resultCat = Wasm2Lang.Backend.ValueType.isF64(binaryen, localGetType)
        ? A.CAT_F64
        : Wasm2Lang.Backend.ValueType.isF32(binaryen, localGetType)
          ? A.CAT_F32
          : C.SIGNED;
      break;
    }
    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      var /** @const {string} */ javaStdlibGlobal = state.stdlibGlobals ? state.stdlibGlobals[globalGetName] || '' : '';
      result = '' !== javaStdlibGlobal ? javaStdlibGlobal : 'this.' + this.n_('$g_' + this.safeName_(globalGetName));
      resultCat = Wasm2Lang.Backend.ValueType.isF64(binaryen, globalGetType)
        ? A.CAT_F64
        : Wasm2Lang.Backend.ValueType.isF32(binaryen, globalGetType)
          ? A.CAT_F32
          : C.SIGNED;
      break;
    }

    case binaryen.BinaryId: {
      var /** @const {number} */ binaryOp = /** @type {number} */ (expr['op']);
      var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = Wasm2Lang.Backend.I32Coercion.classifyBinaryOp(
          binaryen,
          binaryOp
        );
      if (binInfo) {
        result = this.renderBinaryOp_(binInfo, cr(0), cr(1));
        resultCat = C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ numericBinInfo =
            Wasm2Lang.Backend.NumericOps.classifyBinaryOp(binaryen, binaryOp);
        if (numericBinInfo) {
          result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1), cc(0), cc(1));
          resultCat = A.catForCoercedType_(binaryen, numericBinInfo.retType);
        } else {
          result = '0 /* unknown binop ' + expr['op'] + ' */';
          resultCat = A.CAT_RAW;
        }
      }
      break;
    }
    case binaryen.UnaryId: {
      var /** @const {number} */ unCat = Wasm2Lang.Backend.I32Coercion.classifyUnaryOp(
          binaryen,
          /** @type {number} */ (expr['op'])
        );
      if (C.UNARY_EQZ === unCat) {
        var /** @const */ Pe = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        result = '(' + Pe.renderInfix(cr(0), '==', '0', Pe.PREC_EQUALITY_) + ' ? 1 : 0)';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CLZ === unCat) {
        result = 'Integer.numberOfLeadingZeros(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CTZ === unCat) {
        result = 'Integer.numberOfTrailingZeros(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_POPCNT === unCat) {
        result = 'Integer.bitCount(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numericUnInfo =
            Wasm2Lang.Backend.NumericOps.classifyUnaryOp(binaryen, /** @type {number} */ (expr['op']));
        if (numericUnInfo) {
          result = this.renderNumericUnaryOp_(binaryen, numericUnInfo, cr(0), cc(0));
          resultCat = A.catForCoercedType_(binaryen, numericUnInfo.retType);
        } else {
          result = '0 /* unknown unop ' + expr['op'] + ' */';
          resultCat = A.CAT_RAW;
        }
      }
      break;
    }
    case binaryen.LoadId: {
      var /** @const {string} */ loadPtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr['offset'])
        );
      var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);
      result = this.renderLoad_(binaryen, loadPtr, loadType, /** @type {number} */ (expr['bytes']), !!expr['isSigned']);
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;
      var /** @const {string} */ storePtr = Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr['offset'])
        );
      result =
        pad(ind) + this.renderStore_(binaryen, storePtr, cr(1), storeType, /** @type {number} */ (expr['bytes']), cc(1)) + '\n';
      break;
    }
    case binaryen.LocalSetId: {
      var /** @const */ lsResult = this.emitLocalSet_(
          binaryen,
          state.functionInfo,
          ind,
          !!expr['isTee'],
          /** @type {number} */ (expr['index']),
          cr(0),
          cc(0)
        );
      result = lsResult.emittedString;
      resultCat = lsResult.resultCat;
      break;
    }
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      result =
        pad(ind) +
        'this.' +
        this.n_('$g_' + this.safeName_(globalName)) +
        ' = ' +
        this.coerceToType_(binaryen, cr(0), cc(0), globalType) +
        ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ javaStdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
      var /** @const {string} */ importBase = javaStdlibName ? '' : state.importedNames[callTarget] || '';
      var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
          binaryen,
          expr,
          childResults,
          state.functionSignatures
        );
      var /** @const {number} */ callType = /** @type {number} */ (expr['type']);
      var /** @type {string} */ callExpr;
      if ('' !== javaStdlibName) {
        callExpr = javaStdlibName + '(' + callArgs.join(', ') + ')';
      } else if ('' !== importBase) {
        callExpr = this.renderImportCallExpr_(binaryen, importBase, callArgs, callType);
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
        result = this.renderCoercionByType_(binaryen, callExpr, callType);
        resultCat = A.catForCoercedType_(binaryen, callType);
      }
      break;
    }
    case binaryen.CallIndirectId: {
      var /** @const {!Array<number>} */ ciParamTypes = binaryen.expandType(/** @type {number} */ (expr['params']));
      var /** @const {number} */ ciRetType = /** @type {number} */ (expr['type']);
      var /** @const {string} */ ciSigKey = A.buildSignatureKey_(binaryen, ciParamTypes, ciRetType);
      var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
      var /** @const {string} */ ciTableName = this.n_('$ftable_' + ciSigKey);
      var /** @const {string} */ ciIndexExpr = this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32);
      var /** @const {string} */ ciCallExpr = 'this.' + ciTableName + '[' + ciIndexExpr + '].call(' + ciArgs.join(', ') + ')';
      if (ciRetType === binaryen.none || 0 === ciRetType) {
        result = pad(ind) + ciCallExpr + ';\n';
      } else {
        result = this.renderCoercionByType_(binaryen, ciCallExpr, ciRetType);
        resultCat = A.catForCoercedType_(binaryen, ciRetType);
      }
      break;
    }
    case binaryen.ReturnId:
      if (childResultAt(0).hasExpression) {
        result = pad(ind) + 'return ' + this.coerceToType_(binaryen, cr(0), cc(0), state.functionInfo.results) + ';\n';
      } else {
        result = pad(ind) + 'return;\n';
      }
      state.lastExprIsTerminal = true;
      break;

    case binaryen.DropId: {
      // Java only allows method calls, assignments, etc. as expression statements.
      // Emit only when the child is a call (side-effectful); skip pure expressions.
      var /** @const {number} */ dropValuePtr = /** @type {number} */ (expr['value']);
      var /** @const {number} */ dropValueId = dropValuePtr ? binaryen.getExpressionInfo(dropValuePtr).id : 0;
      if (dropValueId === binaryen.CallId || dropValueId === binaryen.CallIndirectId) {
        result = pad(ind) + cr(0) + ';\n';
      }
      break;
    }
    case binaryen.NopId:
    case binaryen.UnreachableId:
      break;

    case binaryen.SelectId: {
      var /** @const {number} */ selectType = /** @type {number} */ (expr['type']);
      var /** @const */ Ps = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      result = this.renderCoercionByType_(
        binaryen,
        '(' + Ps.renderInfix(cr(0), '!=', '0', Ps.PREC_EQUALITY_) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
        selectType
      );
      resultCat = A.catForCoercedType_(binaryen, selectType);
      break;
    }
    case binaryen.MemorySizeId:
      result = '0';
      resultCat = C.FIXNUM;
      break;

    case binaryen.MemoryGrowId:
      result = pad(ind) + cr(0) + ';\n';
      break;

    case binaryen.BlockId: {
      var /** @const {?string} */ blockName = /** @type {?string} */ (expr['name']);
      var /** @const {string} */ fnName = state.functionInfo.name;
      if (blockName && (this.isBlockRootSwitch_(fnName, blockName) || hp(blockName, A.RS_ROOT_SWITCH_PREFIX_))) {
        result = this.emitRootSwitch_(state, nodeCtx);
        break;
      }
      if (blockName && (this.isBlockSwitchDispatch_(fnName, blockName) || hp(blockName, A.SW_DISPATCH_PREFIX_))) {
        result = this.emitFlatSwitch_(state, nodeCtx);
        break;
      }
      result = this.emitLabeledBlock_(state, nodeCtx, childResults);
      break;
    }
    case binaryen.LoopId: {
      var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
      var /** @const {string} */ loopBody = cr(0);
      var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ loopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
      if (loopPlan) {
        var /** @const {string} */ loopLabel = loopPlan.needsLabel ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        if ('for' === loopPlan.simplifiedLoopKind) {
          result = pad(ind) + loopLabel + 'for (;;) {\n' + loopBody + pad(ind) + '}\n';
        } else if ('dowhile' === loopPlan.simplifiedLoopKind) {
          var /** @const {string} */ dwCond = A.subWalkExpressionString_(state, loopPlan.conditionPtr);
          result = pad(ind) + loopLabel + 'do {\n' + loopBody + pad(ind) + '} while ' + this.formatCondition_(dwCond) + ';\n';
        } else {
          var /** @const {string} */ whCond = A.subWalkExpressionString_(state, loopPlan.conditionPtr);
          result = pad(ind) + loopLabel + 'while ' + this.formatCondition_(whCond) + ' {\n' + loopBody + pad(ind) + '}\n';
        }
      } else {
        // Raw loop fallback (unsimplified): named body blocks can complete
        // normally via `break $blockName`, so the trailing `break;` is
        // always reachable and required.
        var /** @const {number} */ loopBodyPtr = /** @type {number} */ (expr['body']);
        var /** @const {!Object<string, *>} */ loopBodyInfo = /** @type {!Object<string, *>} */ (
            binaryen.getExpressionInfo(loopBodyPtr)
          );
        var /** @const {boolean} */ bodyBlockIsNamed =
            /** @type {number} */ (loopBodyInfo['id']) === binaryen.BlockId && !!loopBodyInfo['name'];
        var /** @const {boolean} */ needsTrailingBreak = bodyBlockIsNamed || !bodyWasTerminal;
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': while (true) {\n' +
          loopBody +
          (needsTrailingBreak ? pad(ind + 1) + 'break;\n' : '') +
          pad(ind) +
          '}\n';
      }
      break;
    }
    case binaryen.IfId: {
      var /** @const {number} */ ifType = /** @type {number} */ (expr['type']);
      if (ifType !== binaryen.none && 0 !== ifType) {
        var /** @const */ IfPs = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        result = this.renderCoercionByType_(
          binaryen,
          '(' + IfPs.renderInfix(cr(0), '!=', '0', IfPs.PREC_EQUALITY_) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
          ifType
        );
        resultCat = A.catForCoercedType_(binaryen, ifType);
      } else {
        result = this.emitIfStatement_(ind, cr(0), cr(1), /** @type {number} */ (expr['ifFalse']), childResults.length, cr(2));
      }
      break;
    }
    case binaryen.BreakId: {
      var /** @const */ brResult = this.emitBreakStatement_(
          state,
          ind,
          /** @type {string} */ (expr['name']),
          /** @type {number} */ (expr['condition']),
          cr(0)
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
          /** @type {!Array<string>} */ (expr['names'] || []),
          /** @type {string} */ (expr['defaultName'] || '')
        );
      result = swResult.emittedString;
      state.lastExprIsTerminal = swResult.hasDefault;
      break;
    }
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  if (resultCat !== A.CAT_VOID) {
    return {decisionValue: {'s': result, 'c': resultCat}};
  }
  return {decisionValue: result};
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
  var /** @const */ fsResult = SDA.emitLabeledFlatSwitch(this, state, nodeCtx);
  state.lastExprIsTerminal = fsResult.hasDefault;
  return fsResult.emittedString;
};
