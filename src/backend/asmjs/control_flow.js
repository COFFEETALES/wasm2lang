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
 *   stdlibNames: ?Object<string, string>,
 *   stdlibGlobals: ?Object<string, string>,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   functionTables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>,
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

  var /** @const */ common = this.emitLeaveCommonCase_(binaryen, expr, id, ind, childResults, state.functionInfo);
  if (common) return A.buildLeaveResult_(common.emittedString, common.resultCat);

  switch (id) {
    case binaryen.LocalGetId:
      result = this.localN_(/** @type {number} */ (expr['index']));
      resultCat = C.SIGNED;
      break;

    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      if (state.stdlibGlobals && state.stdlibGlobals[globalGetName]) {
        result = this.n_(state.stdlibGlobals[globalGetName]);
      } else {
        var /** @const {string} */ globalGetKey = '$g_' + this.safeName_(globalGetName);
        result = this.n_(globalGetKey);
        this.markBinding_(globalGetKey);
      }
      resultCat = A.catForCoercedType_(binaryen, globalGetType);
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
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr['name']);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      var /** @const {string} */ globalSetKey = '$g_' + this.safeName_(globalName);
      this.markBinding_(globalSetKey);
      result = pad(ind) + this.n_(globalSetKey) + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr['target']);
      var /** @const {string} */ stdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
      var /** @const {string} */ importBase = stdlibName ? '' : state.importedNames[callTarget] || '';
      var /** @type {string} */ callName;
      if ('' !== stdlibName) {
        callName = this.n_(stdlibName);
      } else if ('' !== importBase) {
        callName = this.n_('$if_' + importBase);
        this.markBinding_('$if_' + importBase);
      } else {
        callName = this.n_(this.safeName_(callTarget));
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
      var /** @const {!Array<number>} */ ciParamTypes = binaryen.expandType(/** @type {number} */ (expr['params']));
      var /** @const {number} */ ciRetType = /** @type {number} */ (expr['type']);
      var /** @const {string} */ ciSigKey = A.buildSignatureKey_(binaryen, ciParamTypes, ciRetType);
      var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_|void} */ ciDesc =
          state.functionTables[ciSigKey];
      var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
      var /** @const {number} */ ciMask = ciDesc ? ciDesc.tableMask : 0;
      var /** @const {string} */ ciTableName = this.n_('$ftable_' + ciSigKey);
      // asm.js requires the table index to be exactly (expr) & mask form.
      // Use the raw expression without |0 coercion since & mask serves as int coercion.
      var /** @const {string} */ ciCallExpr = ciTableName + '[(' + cr(0) + ') & ' + ciMask + '](' + ciArgs.join(', ') + ')';
      if (ciRetType === binaryen.none || 0 === ciRetType) {
        result = pad(ind) + ciCallExpr + ';\n';
      } else {
        result = this.renderCoercionByType_(binaryen, ciCallExpr, ciRetType);
        resultCat = A.catForCoercedType_(binaryen, ciRetType);
      }
      break;
    }
    case binaryen.DropId:
      result = pad(ind) + cr(0) + ';\n';
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
      result = String(this.heapPageCount_);
      resultCat = C.FIXNUM;
      break;

    case binaryen.MemoryGrowId:
      this.markHelper_('$w2l_memory_grow');
      result = this.n_('$w2l_memory_grow') + '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ')|0';
      resultCat = C.SIGNED;
      break;

    case binaryen.MemoryFillId:
    case binaryen.MemoryCopyId: {
      var /** @const {string} */ memHelperName = id === binaryen.MemoryFillId ? '$w2l_memory_fill' : '$w2l_memory_copy';
      this.markHelper_(memHelperName);
      result =
        pad(ind) +
        this.n_(memHelperName) +
        '(' +
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
      var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
      var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ loopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
      if (loopPlan) {
        var /** @const {string} */ loopLabel = loopPlan.needsLabel ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        result = this.emitSimplifiedLoop_(state, loopPlan, ind, loopLabel, cr(0));
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
    case binaryen.IfId: {
      var /** @const {number} */ ifType = /** @type {number} */ (expr['type']);
      if (ifType !== binaryen.none && ifType !== binaryen.unreachable && 0 !== ifType) {
        result = this.renderCoercionByType_(
          binaryen,
          '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ' ? ' + cr(1) + ' : ' + cr(2) + ')',
          ifType
        );
        resultCat = A.catForCoercedType_(binaryen, ifType);
      } else {
        result = this.emitIfStatement_(
          ind,
          cr(0),
          cr(1),
          /** @type {number} */ (expr['ifFalse']),
          childResults.length,
          cr(2),
          cc(0)
        );
      }
      break;
    }
    case binaryen.BreakId: {
      result = this.emitBreakStatement_(
        state,
        ind,
        /** @type {string} */ (expr['name']),
        /** @type {number} */ (expr['condition']),
        cr(0),
        cc(0)
      ).emittedString;
      break;
    }
    case binaryen.SwitchId:
      result = this.emitSwitchStatement_(
        state,
        ind,
        cr(0),
        /** @type {!Array<string>} */ (expr['names'] || []),
        /** @type {string} */ (expr['defaultName'] || ''),
        cc(0)
      ).emittedString;
      break;
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  return A.buildLeaveResult_(result, resultCat);
};
