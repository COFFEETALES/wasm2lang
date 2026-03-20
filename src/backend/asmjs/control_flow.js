'use strict';

// ---------------------------------------------------------------------------
// Code-gen traversal state.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   binaryen: !Binaryen,
 *   functionInfo: !BinaryenFunctionInfo,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globalTypes: !Object<string, number>,
 *   labelKinds: !Object<string, string>,
 *   labelMap: !Object<string, number>,
 *   importedNames: !Object<string, string>,
 *   indent: number,
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
Wasm2Lang.Backend.AsmjsCodegen.EmitState_;

// ---------------------------------------------------------------------------
// Expression emitter (leave callback).
// ---------------------------------------------------------------------------

/**
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
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
          : A.CAT_RAW;
      break;
    }
    case binaryen.LocalGetId:
      result = this.localN_(/** @type {number} */ (expr['index']));
      resultCat = A.CAT_RAW;
      break;

    case binaryen.GlobalGetId:
      result = this.n_('$g_' + /** @type {string} */ (expr['name']));
      resultCat = A.CAT_RAW;
      break;

    case binaryen.BinaryId: {
      var /** @const {number} */ binaryOp = /** @type {number} */ (expr['op']);
      var /** @const {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} */ binInfo = Wasm2Lang.Backend.I32Coercion.classifyBinaryOp(
          binaryen,
          binaryOp
        );
      if (binInfo) {
        result = this.renderBinaryOp_(binInfo, cr(0), cr(1));
        resultCat =
          C.OP_COMPARISON === binInfo.category
            ? C.FIXNUM
            : C.OP_BITWISE === binInfo.category && binInfo.unsigned
              ? C.UNSIGNED
              : C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ numericBinInfo =
            Wasm2Lang.Backend.NumericOps.classifyBinaryOp(binaryen, binaryOp);
        if (numericBinInfo) {
          result = this.renderNumericBinaryOp_(binaryen, numericBinInfo, cr(0), cr(1));
          resultCat = numericBinInfo.isComparison ? C.FIXNUM : A.catForCoercedType_(binaryen, numericBinInfo.retType);
        } else {
          result = '__unknown_binop_' + expr['op'] + '(' + cr(0) + ', ' + cr(1) + ')';
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
        // !expr produces fixnum (0 or 1) in asm.js — no |0 coercion needed.
        result = Wasm2Lang.Backend.AbstractCodegen.Precedence_.renderPrefix('!', cr(0));
        resultCat = C.FIXNUM;
      } else if (C.UNARY_CLZ === unCat) {
        this.markBinding_('Math_clz32');
        result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(this.n_('Math_clz32') + '(' + cr(0) + ')');
        resultCat = C.SIGNED;
      } else if (C.UNARY_CTZ === unCat) {
        result = this.renderHelperCall_(binaryen, '$w2l_ctz', [cr(0)], binaryen.i32);
        resultCat = C.SIGNED;
      } else if (C.UNARY_POPCNT === unCat) {
        result = this.renderHelperCall_(binaryen, '$w2l_popcnt', [cr(0)], binaryen.i32);
        resultCat = C.SIGNED;
      } else {
        var /** @const {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ numericUnInfo =
            Wasm2Lang.Backend.NumericOps.classifyUnaryOp(binaryen, /** @type {number} */ (expr['op']));
        if (numericUnInfo) {
          result = this.renderNumericUnaryOp_(binaryen, numericUnInfo, cr(0));
          resultCat = A.catForCoercedType_(binaryen, numericUnInfo.retType);
        } else {
          result = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_('__unknown_unop_' + expr['op'] + '(' + cr(0) + ')');
          resultCat = C.SIGNED;
        }
      }
      break;
    }
    case binaryen.LoadId: {
      var /** @const {number} */ loadType = /** @type {number} */ (expr['type']);
      var /** @const {string} */ loadPtr = Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr['offset'])
        );
      var /** @const {number} */ loadBytes = /** @type {number} */ (expr['bytes']);
      result = this.renderLoad_(
        binaryen,
        loadPtr,
        loadType,
        loadBytes,
        !!expr['isSigned'],
        /** @type {number} */ (expr['align']) || loadBytes
      );
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {number} */ storeType = /** @type {number} */ (expr['valueType']) || binaryen.i32;
      var /** @const {string} */ storePtr = Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_(
          cr(0),
          /** @type {number} */ (expr['offset'])
        );
      var /** @const {number} */ storeBytes = /** @type {number} */ (expr['bytes']);
      result =
        pad(ind) +
        this.renderStore_(
          binaryen,
          storePtr,
          cr(1),
          storeType,
          storeBytes,
          /** @type {number} */ (expr['align']) || storeBytes,
          cc(1)
        ) +
        '\n';
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
      result = lsResult.result;
      resultCat = lsResult.resultCat;
      break;
    }
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      result = pad(ind) + this.n_('$g_' + globalName) + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ importBase = state.importedNames[callTarget] || '';
      var /** @type {string} */ callName =
          '' !== importBase ? this.n_('$if_' + importBase) : this.n_(Wasm2Lang.Backend.AsmjsCodegen.asmjsSafeName_(callTarget));
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
      result = this.renderCoercionByType_(
        binaryen,
        '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
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
      var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ loopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
      if (loopPlan) {
        if ('for' === loopPlan.loopKind) {
          if (loopPlan.needsLabel) {
            result = pad(ind) + this.labelN_(state.labelMap, loopName) + ': for (;;) {\n' + cr(0) + pad(ind) + '}\n';
          } else {
            result = pad(ind) + 'for (;;) {\n' + cr(0) + pad(ind) + '}\n';
          }
        } else if ('dowhile' === loopPlan.loopKind) {
          var /** @const {string} */ dwCond = A.subWalkString_(
              A.subWalkExpression_(
                state.wasmModule,
                binaryen,
                state.functionInfo,
                /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor),
                loopPlan.conditionPtr
              )
            );
          if (loopPlan.needsLabel) {
            result =
              pad(ind) + this.labelN_(state.labelMap, loopName) + ': do {\n' + cr(0) + pad(ind) + '} while (' + dwCond + ');\n';
          } else {
            result = pad(ind) + 'do {\n' + cr(0) + pad(ind) + '} while (' + dwCond + ');\n';
          }
        } else {
          var /** @const {string} */ whCond = A.subWalkString_(
              A.subWalkExpression_(
                state.wasmModule,
                binaryen,
                state.functionInfo,
                /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor),
                loopPlan.conditionPtr
              )
            );
          if (loopPlan.needsLabel) {
            result =
              pad(ind) +
              this.labelN_(state.labelMap, loopName) +
              ': while ' +
              this.formatCondition_(whCond) +
              ' {\n' +
              cr(0) +
              pad(ind) +
              '}\n';
          } else {
            result = pad(ind) + 'while ' + this.formatCondition_(whCond) + ' {\n' + cr(0) + pad(ind) + '}\n';
          }
        }
      } else {
        result =
          pad(ind) +
          this.labelN_(state.labelMap, loopName) +
          ': while (1) {\n' +
          cr(0) +
          pad(ind + 1) +
          'break;\n' +
          pad(ind) +
          '}\n';
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
          var /** @const {boolean} */ rsIsTerminal = A.emitRootSwitchExitCode_(
              rsExitLines,
              state.wasmModule,
              binaryen,
              state.functionInfo,
              rsVis,
              rsExitPtrs,
              ind
            );
          if (!rsIsTerminal) {
            rsExitLines[rsExitLines.length] =
              pad(ind) + this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
          }
          if (0 !== brCondPtr) {
            result = pad(ind) + 'if ' + this.formatCondition_(cr(0)) + ' {\n' + rsExitLines.join('') + pad(ind) + '}\n';
          } else {
            result = rsExitLines.join('');
          }
          break;
        }
        if (brName === state.rootSwitchRsName) {
          var /** @const {string} */ rsBreakStmt = this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
          result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), rsBreakStmt);
          break;
        }
      }
      var /** @const {string} */ brStmt = this.resolveBreakTarget_(
          state.labelKinds,
          state.fusedBlockToLoop,
          state.labelMap,
          brName
        );
      result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), brStmt);
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr['names'] || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr['defaultName'] || '');
      var /** @const {string} */ switchCond = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(cr(0));
      var /** @const {!Array<string>} */ switchLines = [];
      switchLines[switchLines.length] = pad(ind) + 'switch (' + switchCond + ') {\n';
      var /** @type {number} */ si = 0;
      while (si < switchNames.length) {
        var /** @const {string} */ switchTarget = switchNames[si];
        while (si < switchNames.length && switchNames[si] === switchTarget) {
          switchLines[switchLines.length] = pad(ind + 1) + 'case ' + si + ':\n';
          ++si;
        }
        switchLines[switchLines.length] =
          pad(ind + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, switchTarget);
      }
      if ('' !== switchDefault) {
        switchLines[switchLines.length] = pad(ind + 1) + 'default:\n';
        switchLines[switchLines.length] =
          pad(ind + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, switchDefault);
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
 * Emits a flat switch statement for a br_table dispatch block annotated by the
 * SwitchDispatchDetectionPass.  Called from emitLeave_ when the BlockId name
 * starts with {@code sw$}.
 *
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  return this.emitLabeledFlatSwitch_(state, nodeCtx).result;
};

/**
 * Emits a root-switch-loop structure where the outer block wrappers are
 * eliminated and exit code is inlined into the switch cases.
 *
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  return this.emitLabeledRootSwitch_(state, nodeCtx);
};

/**
 * Enter callback: records label kinds and adjusts indent for scope nodes.
 *
 * @param {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  return this.emitLabeledEnter_(state, nodeCtx);
};
