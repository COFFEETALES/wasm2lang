'use strict';

// ---------------------------------------------------------------------------
// Code-gen traversal state.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   lbl: string,
 *   lk: string,
 *   alias: (string|undefined)
 * }}
 */
Wasm2Lang.Backend.Php64Codegen.LabelEntry_;

/**
 * @typedef {{
 *   binaryen: !Binaryen,
 *   functionInfo: !BinaryenFunctionInfo,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globalTypes: !Object<string, number>,
 *   inlineTempOffset: number,
 *   labelStack: !Array<!Wasm2Lang.Backend.Php64Codegen.LabelEntry_>,
 *   importedNames: !Object<string, string>,
 *   stdlibNames: ?Object<string, string>,
 *   stdlibGlobals: ?Object<string, string>,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   pendingBlockFusion: string,
 *   usedCaptures: !Object<string, boolean>,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string
 * }}
 */
Wasm2Lang.Backend.Php64Codegen.EmitState_;

/**
 * Builds a PHP multi-byte pack+byte-copy store statement.
 *
 * @param {string} padStr    Indentation string.
 * @param {string} tP        Pointer temp variable.
 * @param {string} ptrExpr   Pointer expression.
 * @param {string} tS        Pack-result temp variable.
 * @param {string} packFmt   PHP pack() format string (e.g. "'e'").
 * @param {string} valueExpr Packed value expression.
 * @param {string} buf       Buffer variable name.
 * @param {number} byteCount Number of bytes to copy.
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderPackStore_ = function (padStr, tP, ptrExpr, tS, packFmt, valueExpr, buf, byteCount) {
  var /** @type {string} */ s = padStr + tP + ' = ' + ptrExpr + '; ' + tS + ' = pack(' + packFmt + ', ' + valueExpr + '); ';
  for (var /** number */ i = 0; i < byteCount; ++i) {
    s += buf + '[' + tP + (0 < i ? ' + ' + i : '') + '] = ' + tS + '[' + i + ']; ';
  }
  return s.slice(0, -1) + '\n';
};

/**
 * Scans the label stack from top to bottom to find the given target name.
 * Returns an object with the resolved depth and label kind.
 *
 * @param {!Array<!Wasm2Lang.Backend.Php64Codegen.LabelEntry_>} labelStack
 * @param {string} targetName
 * @return {{resolvedDepth: number, resolvedLabelKind: string}}
 */
Wasm2Lang.Backend.Php64Codegen.resolveLabelDepth_ = function (labelStack, targetName) {
  var /** @type {number} */ depth = 0;
  for (var /** number */ i = labelStack.length - 1; 0 <= i; --i) {
    ++depth;
    if (labelStack[i].lbl === targetName) {
      return {resolvedDepth: depth, resolvedLabelKind: labelStack[i].lk};
    }
    if (labelStack[i].alias === targetName) {
      return {resolvedDepth: depth, resolvedLabelKind: 'block'};
    }
  }
  return {resolvedDepth: depth, resolvedLabelKind: 'block'};
};

/**
 * Renders a PHP break/continue statement targeting the given label.
 *
 * @param {!Array<!Wasm2Lang.Backend.Php64Codegen.LabelEntry_>} labelStack
 * @param {string} targetName
 * @param {number} extraDepth  Additional depth offset (e.g. 1 for switch nesting).
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.renderPhpJump_ = function (labelStack, targetName, extraDepth) {
  var /** @const {{resolvedDepth: number, resolvedLabelKind: string}} */ resolved =
      Wasm2Lang.Backend.Php64Codegen.resolveLabelDepth_(labelStack, targetName);
  var /** @const {number} */ totalDepth = resolved.resolvedDepth + extraDepth;
  return ('loop' === resolved.resolvedLabelKind ? 'continue' : 'break') + (1 < totalDepth ? ' ' + totalDepth : '') + ';\n';
};

// ---------------------------------------------------------------------------
// Expression emitter (leave callback).
// ---------------------------------------------------------------------------

/**
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
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
  var /** @const */ self = this;
  /** @param {number} tempIndex @return {string} */
  var inlineTemp = function (tempIndex) {
    return self.localN_(state.inlineTempOffset + tempIndex);
  };

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
          : A.CAT_F64;
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
      var /** @const {string} */ stdlibGlobal = state.stdlibGlobals ? state.stdlibGlobals[globalGetName] || '' : '';
      if ('' !== stdlibGlobal) {
        result = stdlibGlobal;
      } else {
        var /** @const {string} */ globalGetVar = this.phpVar_('$g_' + this.safeName_(globalGetName));
        state.usedCaptures[globalGetVar] = true;
        result = globalGetVar;
      }
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
          resultCat = numericBinInfo.isComparison ? C.FIXNUM : A.catForCoercedType_(binaryen, numericBinInfo.retType);
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
        var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        result = '(' + P.renderInfix('0', '===', cr(0), P.PREC_EQUALITY_) + ' ? 1 : 0)';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CLZ === unCat) {
        this.markHelper_('_w2l_clz');
        result = this.n_('_w2l_clz') + '(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_CTZ === unCat) {
        this.markHelper_('_w2l_ctz');
        result = this.n_('_w2l_ctz') + '(' + cr(0) + ')';
        resultCat = C.SIGNED;
      } else if (C.UNARY_POPCNT === unCat) {
        this.markHelper_('_w2l_popcnt');
        result = this.n_('_w2l_popcnt') + '(' + cr(0) + ')';
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
      var /** @const {string} */ loadPtr = this.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr['offset']));
      var /** @const {number} */ loadBytes = /** @type {number} */ (expr['bytes']);
      var /** @const {boolean} */ loadSigned = !!expr['isSigned'];
      var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);
      var /** @const {string} */ nBuf = this.phpVar_('buffer');
      state.usedCaptures[nBuf] = true;

      if (Wasm2Lang.Backend.ValueType.isF64(binaryen, loadType)) {
        result = "unpack('e', " + nBuf + ', ' + loadPtr + ')[1]';
      } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, loadType)) {
        result = this.n_('_w2l_f32') + "(unpack('g', " + nBuf + ', ' + loadPtr + ')[1])';
      } else if (4 === loadBytes) {
        result = this.n_('_w2l_i') + "(unpack('V', " + nBuf + ', ' + loadPtr + ')[1])';
      } else if (2 === loadBytes) {
        if (loadSigned) {
          var /** @const {string} */ tV16 = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_V_);
          result =
            '((' + tV16 + " = unpack('v', " + nBuf + ', ' + loadPtr + ')[1]) > 32767 ? ' + tV16 + ' - 65536 : ' + tV16 + ')';
        } else {
          result = "unpack('v', " + nBuf + ', ' + loadPtr + ')[1]';
        }
      } else {
        if (loadSigned) {
          var /** @const {string} */ tV8 = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_V_);
          result = '((' + tV8 + ' = ord(' + nBuf + '[' + loadPtr + '])) > 127 ? ' + tV8 + ' - 256 : ' + tV8 + ')';
        } else {
          result = 'ord(' + nBuf + '[' + loadPtr + '])';
        }
      }
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {string} */ storePtr = this.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr['offset']));
      var /** @const {number} */ storeBytes = /** @type {number} */ (expr['bytes']);
      var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;
      var /** @const {string} */ sBuf = this.phpVar_('buffer');
      state.usedCaptures[sBuf] = true;

      var /** @const {string} */ tP = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_P_);
      var /** @const {string} */ tS = inlineTemp(Wasm2Lang.Backend.Php64Codegen.TEMP_S_);
      var /** @const */ rps = Wasm2Lang.Backend.Php64Codegen.renderPackStore_;
      if (Wasm2Lang.Backend.ValueType.isF64(binaryen, storeType)) {
        result = rps(pad(ind), tP, storePtr, tS, "'e'", this.coerceToType_(binaryen, cr(1), cc(1), storeType), sBuf, 8);
      } else if (Wasm2Lang.Backend.ValueType.isF32(binaryen, storeType)) {
        result = rps(pad(ind), tP, storePtr, tS, "'g'", this.coerceToType_(binaryen, cr(1), cc(1), storeType), sBuf, 4);
      } else if (4 === storeBytes) {
        result = rps(pad(ind), tP, storePtr, tS, "'V'", this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32), sBuf, 4);
      } else if (2 === storeBytes) {
        result = rps(
          pad(ind),
          tP,
          storePtr,
          tS,
          "'v'",
          '(' + this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) + ') & 0xFFFF',
          sBuf,
          2
        );
      } else {
        result =
          pad(ind) +
          sBuf +
          '[' +
          storePtr +
          '] = chr((' +
          this.coerceToType_(binaryen, cr(1), cc(1), binaryen.i32) +
          ') & 0xFF);\n';
      }
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
      var /** @const {string} */ globalSetVar = this.phpVar_('$g_' + this.safeName_(globalName));
      state.usedCaptures[globalSetVar] = true;
      result = pad(ind) + globalSetVar + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ phpStdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
      var /** @const {string} */ importBase = phpStdlibName ? '' : state.importedNames[callTarget] || '';
      var /** @type {string} */ callName;
      if ('' !== phpStdlibName) {
        callName = phpStdlibName;
      } else if ('' !== importBase) {
        callName = this.phpVar_('$if_' + this.safeName_(importBase));
        state.usedCaptures[callName] = true;
      } else {
        callName = this.phpVar_(this.safeName_(callTarget));
        state.usedCaptures[callName] = true;
      }
      var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
          binaryen,
          expr,
          childResults,
          state.functionSignatures
        );
      var /** @const {string} */ callExpr = callName + '(' + callArgs.join(', ') + ')';
      var /** @const {number} */ callType = /** @type {number} */ (expr['type']);
      if (callType === binaryen.none || 0 === callType) {
        result = pad(ind) + callExpr + ';\n';
      } else {
        result = this.renderCoercionByType_(binaryen, callExpr, callType);
        resultCat = A.catForCoercedType_(binaryen, callType);
      }
      break;
    }
    case binaryen.CallIndirectId: {
      var /** @const {string} */ ftableVar = this.phpVar_('ftable');
      state.usedCaptures[ftableVar] = true;
      var /** @const {number} */ ciRetType = /** @type {number} */ (expr['type']);
      var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
      var /** @const {string} */ ciIndexExpr = this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32);
      var /** @const {string} */ ciCallExpr = this.phpVar_('ftable') + '[' + ciIndexExpr + '](' + ciArgs.join(', ') + ')';
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
      break;

    case binaryen.DropId:
      result = pad(ind) + cr(0) + ';\n';
      break;

    case binaryen.NopId:
    case binaryen.UnreachableId:
      break;

    case binaryen.SelectId: {
      var /** @const {number} */ selectType = /** @type {number} */ (expr['type']);
      result = this.renderCoercionByType_(binaryen, '(' + cr(0) + ' ? ' + cr(1) + ' : ' + cr(2) + ')', selectType);
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
      var /** @const {boolean} */ isFusedBlock =
          !!blockName && (!!this.getBlockFusionPlan_(fnName, blockName) || hp(blockName, A.LB_FUSION_PREFIX_));
      var /** @const {number} */ childInd = blockName && !isFusedBlock ? ind + 1 : ind;
      var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, childResults.length, childInd);
      if (isFusedBlock) {
        result = blockBody;
      } else if (blockName) {
        result = pad(ind) + 'do {\n' + blockBody + pad(ind) + '} while (false);\n';
      } else {
        result = blockBody;
      }
      break;
    }
    case binaryen.LoopId: {
      var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
      var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ loopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
      if (loopPlan) {
        if ('for' === loopPlan.simplifiedLoopKind) {
          result = pad(ind) + 'while (true) {\n' + cr(0) + pad(ind) + '}\n';
        } else if ('dowhile' === loopPlan.simplifiedLoopKind) {
          var /** @const {string} */ dwCond = A.subWalkExpressionString_(state, loopPlan.conditionPtr);
          result = pad(ind) + 'do {\n' + cr(0) + pad(ind) + '} while ' + this.formatCondition_(dwCond) + ';\n';
        } else {
          var /** @const {string} */ whCond = A.subWalkExpressionString_(state, loopPlan.conditionPtr);
          result = pad(ind) + 'while ' + this.formatCondition_(whCond) + ' {\n' + cr(0) + pad(ind) + '}\n';
        }
      } else {
        result = pad(ind) + 'while (true) {\n' + cr(0) + pad(ind + 1) + 'break;\n' + pad(ind) + '}\n';
      }
      break;
    }

    case binaryen.IfId:
      result = this.emitIfStatement_(ind, cr(0), cr(1), /** @type {number} */ (expr['ifFalse']), childResults.length, cr(2));
      break;
    case binaryen.BreakId: {
      var /** @const {string} */ brName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ brCondPtr = /** @type {number} */ (expr['condition']);
      // Root-switch exit interception.
      if (state.rootSwitchExitMap) {
        if (brName in state.rootSwitchExitMap) {
          var /** @const {!Array<number>} */ rsExitPtrs = state.rootSwitchExitMap[brName];
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
              rsExitPtrs,
              ind
            );
          if (!rsIsTerminal) {
            var /** @const {number} */ rsLoopDepth = Wasm2Lang.Backend.Php64Codegen.resolveLabelDepth_(
                state.labelStack,
                state.rootSwitchLoopName
              ).resolvedDepth;
            rsExitLines[rsExitLines.length] = pad(ind) + 'break' + (1 < rsLoopDepth ? ' ' + rsLoopDepth : '') + ';\n';
          }
          if (0 !== brCondPtr) {
            result = pad(ind) + 'if ' + this.formatCondition_(cr(0)) + ' {\n' + rsExitLines.join('') + pad(ind) + '}\n';
          } else {
            result = rsExitLines.join('');
          }
          break;
        }
        if (brName === state.rootSwitchRsName) {
          var /** @const {number} */ rsBreakDepth = Wasm2Lang.Backend.Php64Codegen.resolveLabelDepth_(
              state.labelStack,
              state.rootSwitchLoopName
            ).resolvedDepth;
          var /** @const {string} */ rsBrStmt = 'break' + (1 < rsBreakDepth ? ' ' + rsBreakDepth : '') + ';\n';
          result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), rsBrStmt);
          break;
        }
      }
      var /** @const {string} */ brStmt = Wasm2Lang.Backend.Php64Codegen.renderPhpJump_(state.labelStack, brName, 0);
      result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), brStmt);
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr['names'] || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr['defaultName'] || '');
      var /** @const {!Array<string>} */ switchLines = [];
      switchLines[switchLines.length] = pad(ind) + 'switch (' + cr(0) + ') {\n';
      var /** @type {number} */ swIdx = 0;
      var /** @const {number} */ swNameLen = switchNames.length;
      while (swIdx < swNameLen) {
        var /** @const {string} */ switchTarget = switchNames[swIdx];
        while (swIdx < swNameLen && switchNames[swIdx] === switchTarget) {
          switchLines[switchLines.length] = pad(ind + 1) + 'case ' + swIdx + ':\n';
          ++swIdx;
        }
        switchLines[switchLines.length] =
          pad(ind + 2) + Wasm2Lang.Backend.Php64Codegen.renderPhpJump_(state.labelStack, switchTarget, 1);
      }
      if ('' !== switchDefault) {
        switchLines[switchLines.length] = pad(ind + 1) + 'default:\n';
        switchLines[switchLines.length] =
          pad(ind + 2) + Wasm2Lang.Backend.Php64Codegen.renderPhpJump_(state.labelStack, switchDefault, 1);
      }
      switchLines[switchLines.length] = pad(ind) + '}\n';
      result = switchLines.join('');
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
 * Emits the body of a single case group (actions + trailing break/external
 * target) in a PHP flat switch.  Shared by both regular groups and default.
 *
 * @private
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Array<string>} lines
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} group
 * @param {number} ind
 * @param {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} info
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitPhpFlatSwitchGroupBody_ = function (
  state,
  lines,
  binaryen,
  vis,
  group,
  ind,
  info
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const */ pad = A.pad_;
  var /** @const {number} */ savedIndent = state.indent;
  state.indent = ind + 2;
  var /** @const {boolean} */ strippedBreak = SDA.emitSwitchCaseActions(
      lines,
      state.wasmModule,
      binaryen,
      state.functionInfo,
      vis,
      group.actionPtrs,
      ind + 2,
      info.outerName
    );
  if (group.externalTarget) {
    var /** @const {string} */ etCode = A.subWalkExpressionString_(state, state.wasmModule.break(group.externalTarget, 0, 0));
    if ('' !== etCode) {
      if (-1 === etCode.indexOf('\n')) {
        lines[lines.length] = pad(ind + 2) + etCode + ';\n';
      } else {
        lines[lines.length] = etCode;
      }
    }
  } else if (group.needsBreak || strippedBreak) {
    SDA.emitFlatSwitchBreak(lines, ind + 2, '', info);
  }
  state.indent = savedIndent;
};

/**
 * Emits a flat switch for a br_table dispatch block (PHP variant).
 *
 * PHP uses {@code break N} (numeric depth) instead of labeled breaks.  The
 * outer block becomes {@code do { switch (...) { ... } } while (false);} so
 * that {@code break 2;} inside a case exits both the switch and the do-while.
 *
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
  // prettier-ignore
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} */ info =
    /** @type {!Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_} */ (
      SDA.extractStructure(binaryen, nodeCtx.expressionPointer)
    );

  // The leave wrapper already popped the outer block from labelStack.
  // Re-push it as a single entry so that breaks targeting the outer name
  // resolve to depth 1 (= exit the switch).  No do-while wrapper needed
  // because the flat switch consumes the entire outer block with no tail code.
  state.labelStack[state.labelStack.length] = {lbl: info.outerName, lk: 'block'};

  // Sub-walk the switch condition.
  var /** @const {string} */ condStr = A.subWalkExpressionString_(state, info.conditionPtr);

  var /** @const {!Array<string>} */ lines = [];
  SDA.emitFlatSwitchHeader(lines, ind, condStr, '', info);

  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_>} */ groups = info.caseGroups;
  for (var /** number */ gi = 0, /** @const {number} */ groupLen = groups.length; gi < groupLen; ++gi) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ group = groups[gi];
    var /** @const {!Array<number>} */ indices = group.caseIndices;
    for (var /** number */ ii = 0, /** @const {number} */ idxLen = indices.length; ii < idxLen; ++ii) {
      lines[lines.length] = pad(ind + 1) + 'case ' + indices[ii] + ':\n';
    }
    this.emitPhpFlatSwitchGroupBody_(state, lines, binaryen, vis, group, ind, info);
  }

  if (info.defaultGroup) {
    lines[lines.length] = pad(ind + 1) + 'default:\n';
    this.emitPhpFlatSwitchGroupBody_(state, lines, binaryen, vis, info.defaultGroup, ind, info);
  }

  lines[lines.length] = pad(ind) + '}\n';

  // Remove the outer block entry we re-pushed.
  state.labelStack.pop();

  return lines.join('');
};

/**
 * Emits a root-switch-loop structure where the outer block wrappers are
 * eliminated and exit code is inlined into the switch cases.
 *
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_} */ info =
    /** @type {!Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_} */ (
      SDA.extractRootSwitchStructure(binaryen, nodeCtx.expressionPointer)
    );

  // Set up root-switch state for BreakId interception.
  state.rootSwitchExitMap = info.exitPaths;
  state.rootSwitchRsName = info.rsBlockName;
  state.rootSwitchLoopName = info.loopName;

  // Sub-walk the loop — its enter/leave produce the complete loop code
  // (the loop enter pushes to labelStack, the loop leave pops it).
  var /** @const {string} */ loopCode = A.subWalkExpressionString_(state, info.loopPtr);

  // Clear root-switch state.
  state.rootSwitchExitMap = null;
  state.rootSwitchRsName = '';
  state.rootSwitchLoopName = '';

  return loopCode;
};

/**
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitEnter_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ hp = A.hasPrefix_;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr['name']);
    if (bName) {
      var /** @const {string} */ fName = state.functionInfo.name;
      var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ fusionPlan = this.getBlockFusionPlan_(fName, bName);
      if (fusionPlan) {
        if ('a' === fusionPlan.fusionVariant) {
          state.pendingBlockFusion = bName;
        } else {
          state.labelStack[state.labelStack.length - 1].alias = bName;
        }
      } else if (this.isBlockRootSwitch_(fName, bName)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (this.isBlockSwitchDispatch_(fName, bName)) {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.LB_FUSION_PREFIX_)) {
        // Prefix fallback for when plans are not available.
        var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (expr['children']);
        if (ch && 1 === ch.length && binaryen.getExpressionInfo(ch[0]).id === binaryen.LoopId) {
          state.pendingBlockFusion = bName;
        } else {
          state.labelStack[state.labelStack.length - 1].alias = bName;
        }
      } else if (hp(bName, A.RS_ROOT_SWITCH_PREFIX_)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.SW_DISPATCH_PREFIX_)) {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
    if ('' !== state.pendingBlockFusion) {
      state.labelStack[state.labelStack.length] = {lbl: loopName, lk: 'loop', alias: state.pendingBlockFusion};
      state.pendingBlockFusion = '';
    } else {
      state.labelStack[state.labelStack.length] = {lbl: loopName, lk: 'loop'};
    }
    ++state.indent;
  } else if (binaryen.IfId === id) {
    ++state.indent;
  }

  return null;
};
