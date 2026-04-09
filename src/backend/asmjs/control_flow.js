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
 *   rootSwitchLoopName: string,
 *   breakableStack: !Array<string>,
 *   usedLabels: !Object<string, boolean>,
 *   lastExprIsTerminal: boolean,
 *   pendingLoopKind: string
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
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
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
    case binaryen.LocalGetId: {
      var /** @const {number} */ localGetIdx = /** @type {number} */ (expr.index);
      var /** @const {number} */ localGetType = Wasm2Lang.Backend.ValueType.getLocalType(
          binaryen,
          state.functionInfo,
          localGetIdx
        );
      result = this.localN_(localGetIdx);
      resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, localGetType)
        ? C.INT
        : A.catForCoercedType_(binaryen, localGetType);
      break;
    }

    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      if (state.stdlibGlobals && state.stdlibGlobals[globalGetName]) {
        result = this.n_(state.stdlibGlobals[globalGetName]);
      } else {
        var /** @const {string} */ globalGetKey = '$g_' + this.safeName_(globalGetName);
        result = this.n_(globalGetKey);
        this.markBinding_(globalGetKey);
      }
      resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, globalGetType)
        ? C.INT
        : A.catForCoercedType_(binaryen, globalGetType);
      break;
    }

    case binaryen.LoadId: {
      var /** @const {number} */ loadType = expr.type;
      var /** @const {number} */ loadOffset = /** @type {number} */ (expr.offset);
      // When a non-zero offset is present, the base+offset addition requires
      // both operands to be int.  Intish bases (from arithmetic/div/rem) must
      // be coerced to signed first.
      var /** @type {string} */ loadBase = cr(0);
      if (0 !== loadOffset && C.INTISH === cc(0)) {
        loadBase = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(loadBase);
      }
      var /** @const {string} */ loadPtr = Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_(loadBase, loadOffset);
      var /** @const {number} */ loadBytes = /** @type {number} */ (expr.bytes);
      // Use the direct C API to read alignment — getExpressionInfo can
      // return a stale/incorrect value for sub-naturally aligned loads.
      var /** @const {number} */ loadAlign = binaryen.Load.getAlign(nodeCtx.expressionPointer) || loadBytes;
      result = this.renderLoad_(binaryen, loadPtr, loadType, loadBytes, !!expr.isSigned, loadAlign);
      resultCat = A.catForCoercedType_(binaryen, loadType);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {number} */ storeType = /** @type {number} */ (expr.valueType) || binaryen.i32;
      var /** @const {number} */ storeOffset = /** @type {number} */ (expr.offset);
      var /** @type {string} */ storeBase = cr(0);
      if (0 !== storeOffset && C.INTISH === cc(0)) {
        storeBase = Wasm2Lang.Backend.AsmjsCodegen.renderSignedCoercion_(storeBase);
      }
      var /** @const {string} */ storePtr = Wasm2Lang.Backend.AsmjsCodegen.renderPtrWithOffset_(storeBase, storeOffset);
      var /** @const {number} */ storeBytes = /** @type {number} */ (expr.bytes);
      // Use the direct C API to read alignment — getExpressionInfo can
      // return a stale/incorrect value for sub-naturally aligned stores.
      var /** @const {number} */ storeAlign = binaryen.Store.getAlign(nodeCtx.expressionPointer) || storeBytes;
      result = pad(ind) + this.renderStore_(binaryen, storePtr, cr(1), storeType, storeBytes, storeAlign, cc(1)) + '\n';
      break;
    }
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      var /** @const {string} */ globalSetKey = '$g_' + this.safeName_(globalName);
      this.markBinding_(globalSetKey);
      result = pad(ind) + this.n_(globalSetKey) + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
      var /** @const {number} */ callType = expr.type;

      // Direct-cast imports: emit native type coercion instead of a call.
      // asm.js type rules: fround(int) invalid, float|0 invalid, double|0 invalid.
      // int→float: coerce to signed first (or unsigned for u32_to_f*), then fround/double.
      // float/double→int: use ~~ truncation (same pattern as trunc helpers).
      var /** @const {string|undefined} */ castBaseName = this.castNames_ ? this.castNames_[callTarget] : void 0;
      if (void 0 !== castBaseName) {
        var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ castSig = state.functionSignatures[
            callTarget
          ] || {sigParams: [], sigRetType: callType};
        var /** @const {number} */ castInputType = castSig.sigParams.length ? castSig.sigParams[0] : callType;
        if (Wasm2Lang.Backend.ValueType.isI32(binaryen, callType)) {
          // float/double → i32: promote float to double with +, then ~~ truncation.
          var /** @type {string} */ castTruncInput = cr(0);
          if (Wasm2Lang.Backend.ValueType.isF32(binaryen, castInputType)) {
            castTruncInput = Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_(castTruncInput);
          }
          result = '~~' + Wasm2Lang.Backend.AbstractCodegen.Precedence_.wrap(castTruncInput, A.Precedence_.PREC_UNARY_, false);
          resultCat = C.SIGNED;
        } else {
          // int → float/double: coerce to signed (i32) or unsigned (u32), then apply target coercion.
          var /** @const {boolean} */ castIsUnsigned = -1 !== castBaseName.indexOf('u');
          var /** @const {string} */ castInput = castIsUnsigned
              ? Wasm2Lang.Backend.AsmjsCodegen.renderUnsignedCoercion_(cr(0))
              : this.coerceAtBoundary_(binaryen, cr(0), cc(0), castInputType);
          result = this.renderCoercionByType_(binaryen, castInput, callType);
          resultCat = A.catForCoercedType_(binaryen, callType);
        }
        break;
      }

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
      // asm.js FFI calls accept int or double args only — promote f32 to double.
      if ('' !== importBase) {
        var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ ffiSig = state.functionSignatures[
            callTarget
          ] || {sigParams: [], sigRetType: 0};
        for (var /** @type {number} */ fai = 0; fai < callArgs.length; ++fai) {
          if (fai < ffiSig.sigParams.length && binaryen.f32 === ffiSig.sigParams[fai]) {
            callArgs[fai] = Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_(callArgs[fai]);
          }
        }
      }
      var /** @const {string} */ callExpr = callName + '(' + callArgs.join(', ') + ')';
      if (binaryen.none === callType || 0 === callType) {
        result = pad(ind) + callExpr + ';\n';
      } else if ('' !== importBase && binaryen.f32 === callType) {
        // asm.js FFI calls return int or double only — coerce to double
        // first, then apply fround.
        result = this.renderCoercionByType_(binaryen, Wasm2Lang.Backend.AsmjsCodegen.renderDoubleCoercion_(callExpr), callType);
        resultCat = A.catForCoercedType_(binaryen, callType);
      } else {
        result = this.renderCoercionByType_(binaryen, callExpr, callType);
        resultCat = A.catForCoercedType_(binaryen, callType);
      }
      break;
    }
    case binaryen.CallIndirectId: {
      var /** @const {!Array<number>} */ ciParamTypes = binaryen.expandType(/** @type {number} */ (expr.params));
      var /** @const {number} */ ciRetType = expr.type;
      var /** @const {string} */ ciSigKey = A.buildSignatureKey_(binaryen, ciParamTypes, ciRetType);
      var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_|void} */ ciDesc =
          state.functionTables[ciSigKey];
      var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
      var /** @const {number} */ ciMask = ciDesc ? ciDesc.tableMask : 0;
      var /** @const {string} */ ciTableName = this.n_('$ftable_' + ciSigKey);
      // asm.js requires the table index to be exactly (expr) & mask form.
      // Use the raw expression without |0 coercion since & mask serves as int coercion.
      var /** @const {string} */ ciCallExpr = ciTableName + '[(' + cr(0) + ') & ' + ciMask + '](' + ciArgs.join(', ') + ')';
      if (binaryen.none === ciRetType || 0 === ciRetType) {
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
      var /** @const {number} */ selectType = expr.type;
      var /** @const {string} */ selectTrue = this.coerceAtBoundary_(binaryen, cr(1), cc(1), selectType);
      var /** @const {string} */ selectFalse = this.coerceAtBoundary_(binaryen, cr(2), cc(2), selectType);
      result = '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ' ? ' + selectTrue + ' : ' + selectFalse + ')';
      // Ternary produces INT for i32 (not SIGNED) — return/call sites will add |0.
      resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, selectType) ? C.INT : A.catForCoercedType_(binaryen, selectType);
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
      var /** @const {string} */ memHelperName = binaryen.MemoryFillId === id ? '$w2l_memory_fill' : '$w2l_memory_copy';
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
      var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
      var /** @type {?string} */ loopKind = null;
      if ('' !== state.pendingLoopKind) {
        loopKind = state.pendingLoopKind;
        state.pendingLoopKind = '';
      }
      if (loopKind) {
        result = this.emitSimplifiedLoopFromIR_(state, nodeCtx, loopKind);
      } else {
        var /** @const {string} */ rawLabel = state.usedLabels[loopName] ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        result = pad(ind) + rawLabel + 'for (;;) {\n' + cr(0) + pad(ind + 1) + 'break;\n' + pad(ind) + '}\n';
      }
      --state.breakableStack.length;
      break;
    }
    case binaryen.IfId: {
      var /** @const {number} */ ifType = expr.type;
      if (binaryen.none !== ifType && binaryen.unreachable !== ifType && 0 !== ifType) {
        var /** @const {string} */ ifTrue = this.coerceAtBoundary_(binaryen, cr(1), cc(1), ifType);
        var /** @const {string} */ ifFalse = this.coerceAtBoundary_(binaryen, cr(2), cc(2), ifType);
        result = '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ' ? ' + ifTrue + ' : ' + ifFalse + ')';
        // Ternary produces INT for i32 (not SIGNED) — return/call sites will add |0.
        resultCat = Wasm2Lang.Backend.ValueType.isI32(binaryen, ifType) ? C.INT : A.catForCoercedType_(binaryen, ifType);
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
      result = this.emitBreakStatement_(
        state,
        ind,
        /** @type {string} */ (expr.name),
        /** @type {number} */ (expr.condition),
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
        /** @type {!Array<string>} */ (expr.names || []),
        /** @type {string} */ (expr.defaultName || ''),
        cc(0)
      ).emittedString;
      break;
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  return A.buildLeaveResult_(result, resultCat);
};
