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
  var /** @type {boolean} */ resultTerminalOverride = false;
  var /** @type {boolean} */ resultTerminalOverrideIsAuthoritative = false;

  var /** @const */ acc = A.makeChildAccessors_(childResults);
  var /** @const {function(number): string} */ cr = acc.cr;
  var /** @const {function(number): number} */ cc = acc.cc;

  var /** @const {?Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ terminal = this.propagateTerminalChild_(
      binaryen,
      expr,
      id,
      childResults,
      state.wasmModule,
      ind
    );
  if (terminal) return {decisionValue: terminal};

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ childControl = A.mergeChildControl_(childResults);
  var /** @type {boolean} */ resultMayExitFunction = childControl.mayExitFunction;
  var /** @type {!Array<string>} */ resultBranchTargets = childControl.branchTargets;

  var /** @const */ common = this.emitLeaveCommonCase_(
      binaryen,
      expr,
      id,
      ind,
      childResults,
      state.wasmModule,
      state.functionInfo
    );
  if (common) {
    return A.buildLeaveResult_(
      common.emittedString,
      common.resultCat,
      !!common.isTerminal,
      resultMayExitFunction || !!common.mayExitFunction,
      resultBranchTargets
    );
  }

  switch (id) {
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
      resultCat = this.catForValueTypeRead_(binaryen, globalGetType);
      break;
    }

    case binaryen.LoadId: {
      var /** @const {number} */ loadType = expr.type;
      var /** @const {number} */ loadBytes = /** @type {number} */ (expr.bytes);
      // Use the direct C API to read alignment — getExpressionInfo can
      // return a stale/incorrect value for sub-naturally aligned loads.
      var /** @const {number} */ loadAlign = binaryen.Load.getAlign(nodeCtx.expressionPointer) || loadBytes;
      var /** @const {string} */ loadPtr = this.renderCoercedPtrWithOffset_(cr(0), cc(0), /** @type {number} */ (expr.offset));
      result = this.renderLoad_(binaryen, loadPtr, loadType, loadBytes, !!expr.isSigned, loadAlign);
      resultCat = this.loadResultCat_(binaryen, loadType, loadBytes, loadAlign);
      break;
    }
    case binaryen.StoreId: {
      var /** @const {number} */ storeType = /** @type {number} */ (expr.valueType) || binaryen.i32;
      var /** @const {number} */ storeBytes = /** @type {number} */ (expr.bytes);
      // Use the direct C API to read alignment — getExpressionInfo can
      // return a stale/incorrect value for sub-naturally aligned stores.
      var /** @const {number} */ storeAlign = binaryen.Store.getAlign(nodeCtx.expressionPointer) || storeBytes;
      var /** @const {string} */ storePtr = this.renderCoercedPtrWithOffset_(cr(0), cc(0), /** @type {number} */ (expr.offset));
      result = pad(ind) + this.renderStore_(binaryen, storePtr, cr(1), storeType, storeBytes, storeAlign, cc(1)) + '\n';
      break;
    }
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      var /** @const {string} */ globalSetKey = '$g_' + this.safeName_(globalName);
      this.markBinding_(globalSetKey);
      result =
        pad(ind) +
        this.n_(globalSetKey) +
        ' = ' +
        A.Precedence_.stripForAssignment(this.coerceToType_(binaryen, cr(0), cc(0), globalType)) +
        ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
      var /** @const {number} */ callType = expr.type;

      // Direct-cast imports: emit an inline type conversion instead of a
      // call.  The actual inline shape is backend-specific: asm.js uses
      // {@code ~~}/{@code |0}/{@code Math.fround}; the JavaScript backend
      // bridges BigInt↔Number for i64/u64 variants.
      var /** @const {string|undefined} */ castBaseName = this.castNames_ ? this.castNames_[callTarget] : void 0;
      if (void 0 !== castBaseName) {
        var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ castSig = state.functionSignatures[
            callTarget
          ] || {sigParams: [], sigRetType: callType};
        var /** @const {number} */ castInputType = castSig.sigParams.length ? castSig.sigParams[0] : callType;
        var /** @const {{emittedString: string, resultCat: number}} */ castRendered = this.renderCastImportInline_(
            binaryen,
            castBaseName,
            castInputType,
            callType,
            cr(0),
            cc(0)
          );
        result = castRendered.emittedString;
        resultCat = castRendered.resultCat;
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
            callArgs[fai] = Wasm2Lang.Backend.JsCommonCodegen.renderDoubleCoercion_(callArgs[fai]);
          }
        }
      }
      var /** @const {string} */ callExpr = callName + '(' + callArgs.join(', ') + ')';
      if (binaryen.none === callType || 0 === callType) {
        result = pad(ind) + callExpr + ';\n';
      } else {
        result = this.coerceCallResult_(binaryen, callExpr, callType, '' !== importBase);
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
      var /** @type {string} */ ciCallExpr;
      if (this.callIndirectNeedsOrderedEvaluation_(binaryen, expr, state.wasmModule)) {
        // Target-language member-call syntax evaluates the table index before
        // its arguments.  Pass the index last to a typed dispatcher so wasm's
        // operand-left-to-right, then-index order is retained.
        ciArgs[ciArgs.length] = this.coerceAtBoundary_(binaryen, cr(0), cc(0), binaryen.i32);
        ciCallExpr = this.n_(this.getOrderedCallIndirectWrapperName_(ciSigKey)) + '(' + ciArgs.join(', ') + ')';
      } else {
        // asm.js requires the table index to be exactly (expr) & mask form.
        // Use the raw expression without |0 coercion since & mask serves as
        // int coercion.
        ciCallExpr = ciTableName + '[(' + cr(0) + ') & ' + ciMask + '](' + ciArgs.join(', ') + ')';
      }
      if (binaryen.none === ciRetType || 0 === ciRetType) {
        result = pad(ind) + ciCallExpr + ';\n';
      } else {
        result = this.coerceCallResult_(binaryen, ciCallExpr, ciRetType, false);
        resultCat = A.catForCoercedType_(binaryen, ciRetType);
      }
      break;
    }
    case binaryen.SelectId: {
      var /** @const {number} */ selectType = expr.type;
      var /** @const {string} */ selectTrue = this.coerceAtBoundary_(binaryen, cr(1), cc(1), selectType);
      var /** @const {string} */ selectFalse = this.coerceAtBoundary_(binaryen, cr(2), cc(2), selectType);
      var /** @const {string} */ selectCondition = this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32);
      if (this.selectNeedsEagerEvaluation_(binaryen, expr, state.wasmModule)) {
        var /** @const {string} */ selectHelper = this.getEagerSelectHelperName_(binaryen, selectType);
        this.markHelper_(selectHelper);
        result = this.coerceCallResult_(
          binaryen,
          this.n_(selectHelper) + '(' + selectTrue + ', ' + selectFalse + ', ' + selectCondition + ')',
          selectType,
          false
        );
        resultCat = A.catForCoercedType_(binaryen, selectType);
      } else {
        result = '(' + selectCondition + ' ? ' + selectTrue + ' : ' + selectFalse + ')';
        // Ternary produces INT for i32 (not SIGNED) — return/call sites add |0.
        resultCat = this.catForValueTypeRead_(binaryen, selectType);
      }
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
    case binaryen.MemoryCopyId:
      result = this.renderMemoryBulkOp_(binaryen, id, ind, childResults, '');
      break;

    case binaryen.BlockId: {
      var /** @const {?{w2lExprStr: string, w2lExprCat: number, w2lRootValueBlockPrefix: string}} */ rootValueShape =
          A.tryEmitRootValueBlock_(state, nodeCtx, childResults);
      if (rootValueShape) {
        return /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ ({decisionValue: rootValueShape});
      }
      result = this.emitBlockDispatch_(state, nodeCtx, childResults);
      var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ blockControl = A.summarizeBlockControl_(
          binaryen,
          expr,
          childResults
        );
      resultTerminalOverride = blockControl.isTerminal;
      resultTerminalOverrideIsAuthoritative = true;
      resultMayExitFunction = blockControl.mayExitFunction;
      resultBranchTargets = blockControl.branchTargets;
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
        var /** @const {string} */ rawLabel = state.usedLabels[loopName] ? this.labelN_(state.labelMap, loopName) + ': ' : '';
        result = this.emitRawInfiniteLoop_(ind, rawLabel, cr(0), true);
      }
      --state.breakableStack.length;
      var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ loopControl = A.summarizeLoopControl_(
          binaryen,
          expr,
          childResults
        );
      resultTerminalOverride = loopControl.isTerminal;
      resultTerminalOverrideIsAuthoritative = true;
      resultMayExitFunction = loopControl.mayExitFunction;
      resultBranchTargets = loopControl.branchTargets;
      break;
    }
    case binaryen.IfId: {
      var /** @const {number} */ ifType = expr.type;
      if (binaryen.none !== ifType && binaryen.unreachable !== ifType && 0 !== ifType) {
        var /** @const {string} */ ifTrue = this.coerceAtBoundary_(binaryen, cr(1), cc(1), ifType);
        var /** @const {string} */ ifFalse = this.coerceAtBoundary_(binaryen, cr(2), cc(2), ifType);
        result = '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ' ? ' + ifTrue + ' : ' + ifFalse + ')';
        // Ternary produces INT for i32 (not SIGNED) — return/call sites will add |0.
        resultCat = this.catForValueTypeRead_(binaryen, ifType);
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
      var /** @const {string} */ breakName = /** @type {string} */ (expr.name);
      result = this.emitBreakStatement_(
        state,
        ind,
        breakName,
        /** @type {number} */ (expr.condition),
        cr(0),
        cc(0)
      ).emittedString;
      A.appendUniqueBranchTargets_(resultBranchTargets, [breakName]);
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr.names || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr.defaultName || '');
      result = this.emitSwitchStatement_(state, ind, cr(0), switchNames, switchDefault, cc(0)).emittedString;
      A.appendUniqueBranchTargets_(resultBranchTargets, switchNames);
      if ('' !== switchDefault) A.appendUniqueBranchTargets_(resultBranchTargets, [switchDefault]);
      break;
    }
    default:
      result = '/* unknown expr id=' + id + ' */';
      break;
  }

  return A.buildLeaveResult_(
    result,
    resultCat,
    resultTerminalOverrideIsAuthoritative ? resultTerminalOverride : binaryen.unreachable === expr.type,
    resultMayExitFunction,
    resultBranchTargets
  );
};
