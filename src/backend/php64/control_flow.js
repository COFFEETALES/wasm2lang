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
 *   rootSwitchLoopName: string,
 *   pendingLoopKind: string
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
  for (var /** @type {number} */ i = 0; i < byteCount; ++i) {
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
  for (var /** @type {number} */ i = labelStack.length - 1; 0 <= i; --i) {
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

/**
 * Returns the PHP variable name for the shared {@code $buffer} capture and
 * marks it as used so the enclosing closure's {@code use (...)} clause
 * pulls it in by reference.
 *
 * @private
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.usePhpBuffer_ = function (state) {
  var /** @const {string} */ bufVar = this.phpVar_('buffer');
  state.usedCaptures[bufVar] = true;
  return bufVar;
};

// ---------------------------------------------------------------------------
// Leave-callback indent and label-stack adjustment (overrides base class).
// ---------------------------------------------------------------------------

/**
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 */
Wasm2Lang.Backend.Php64Codegen.prototype.adjustLeaveIndent_ = function (state, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (binaryen.LoopId === id) {
    if (!state.pendingLoopKind) {
      --state.indent;
      state.labelStack.pop();
    }
    // Simplified loops manage indent and labelStack in emitSimplifiedLoopFromIR_.
  } else if (binaryen.IfId === id) {
    --state.indent;
  } else if (binaryen.BlockId === id && expr.name) {
    var /** @const {string} */ bn = /** @type {string} */ (expr.name);
    var /** @const {string} */ fn = state.functionInfo.name;
    var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ lfp = this.getBlockFusionPlan_(fn, bn);
    // For variant 'a', match the emitEnter_ structural validation: if the
    // block's structure doesn't match a block-loop wrapper, it was NOT
    // fused (metadata position drift), so we must undo indent + pop.
    var /** @type {boolean} */ isFused =
        !!lfp && (!('a' === lfp.fusionVariant) || this.detectBlockLoopFusionFromIR_(binaryen, expr));
    var /** @const {boolean} */ isRootSwitch = this.isBlockRootSwitch_(fn, bn);
    if (!isFused && !isRootSwitch) {
      --state.indent;
      state.labelStack.pop();
    }
  }
};

/**
 * PHP override: uses labelStack alias instead of fusedBlockToLoop/breakableStack.
 *
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {string} loopKind
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitSimplifiedLoopFromIR_ = function (state, nodeCtx, loopKind) {
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {string} */ loopName = /** @type {string} */ (expr.name);

  var /** @const {number} */ innerInd = state.indent;
  var /** @const {number} */ outerInd = innerInd - 1;

  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, bodyPtr)
    );

  // Register body block alias on the loop's label stack entry.
  if (binaryen.BlockId === bodyInfo.id && bodyInfo.name) {
    state.labelStack[state.labelStack.length - 1].alias = /** @type {string} */ (bodyInfo.name);
  }

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_} */ bc = this.computeSimplifiedLoopBodyAndCondition_(
      state,
      loopKind,
      bodyInfo,
      loopName,
      innerInd
    );

  // PHP uses numeric break/continue depths, so no label prefix is emitted.
  var /** @const {string} */ result = this.assembleSimplifiedLoop_(
      loopKind,
      outerInd,
      '',
      bc.w2lLoopBody,
      bc.w2lLoopCondStr,
      bc.w2lLoopCondCat
    );

  // Clean up: decrement indent and pop labelStack (adjustLeaveIndent_ skipped).
  --state.indent;
  state.labelStack.pop();
  return result;
};

/**
 * PHP labeled-block override: wraps named blocks in {@code do { } while (false)}
 * instead of labeled blocks, since PHP uses numeric break/continue depths.
 *
 * @suppress {checkTypes}
 * @override
 * @param {!Wasm2Lang.Backend.Php64Codegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitLabeledBlock_ = function (state, nodeCtx, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  var /** @const {number} */ ind = state.indent;
  // Match the emitEnter_ structural validation: use labelStack alias presence
  // instead of raw metadata, since metadata positions may drift.
  var /** @type {boolean} */ isFused = false;
  if (blockName) {
    var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ bfp = this.getBlockFusionPlan_(state.functionInfo.name, blockName);
    isFused = !!bfp && (!('a' === bfp.fusionVariant) || this.detectBlockLoopFusionFromIR_(state.binaryen, expr));
  }
  var /** @const {number} */ childInd = blockName && !isFused ? ind + 1 : ind;
  var /** @const {number} */ emitCount = A.reachableBlockChildCount_(state.binaryen, expr);
  var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, emitCount, childInd);
  if (isFused) return blockBody;
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
    return pad(ind) + 'do {\n' + blockBody + pad(ind) + '} while (false);\n';
  }
  return blockBody;
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
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  var /** @type {string} */ result = '';
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;
  var /** @const */ self = this;
  /** @param {number} tempIndex @return {string} */
  var inlineTemp = function (tempIndex) {
    return self.localN_(state.inlineTempOffset + tempIndex);
  };

  var /** @const */ acc = A.makeChildAccessors_(childResults);
  var /** @const {function(number): string} */ cr = acc.cr;
  var /** @const {function(number): number} */ cc = acc.cc;

  var /** @const */ common = this.emitLeaveCommonCase_(binaryen, expr, id, ind, childResults, state.functionInfo);
  if (common) return A.buildLeaveResult_(common.emittedString, common.resultCat);

  switch (id) {
    case binaryen.GlobalGetId: {
      var /** @const {string} */ globalGetName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
      var /** @const {string} */ stdlibGlobal = state.stdlibGlobals ? state.stdlibGlobals[globalGetName] || '' : '';
      if ('' !== stdlibGlobal) {
        result = stdlibGlobal;
      } else {
        var /** @const {string} */ globalGetKey = '$g_' + this.safeName_(globalGetName);
        var /** @const {string} */ globalGetVar = this.phpVar_(globalGetKey);
        state.usedCaptures[globalGetVar] = true;
        this.markBinding_(globalGetKey);
        result = globalGetVar;
      }
      resultCat = A.catForCoercedType_(binaryen, globalGetType);
      break;
    }

    case binaryen.LoadId: {
      var /** @const {string} */ loadPtr = this.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr.offset));
      var /** @const {number} */ loadBytes = /** @type {number} */ (expr.bytes);
      var /** @const {boolean} */ loadSigned = !!expr.isSigned;
      var /** @const {number} */ loadType = expr.type;
      var /** @const {string} */ nBuf = this.usePhpBuffer_(state);

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
      var /** @const {string} */ storePtr = this.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr.offset));
      var /** @const {number} */ storeBytes = /** @type {number} */ (expr.bytes);
      var /** @const {number} */ storeType = /** @type {number} */ (expr.valueType) || binaryen.i32;
      var /** @const {string} */ sBuf = this.usePhpBuffer_(state);

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
    case binaryen.GlobalSetId: {
      var /** @const {string} */ globalName = /** @type {string} */ (expr.name);
      var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
      var /** @const {string} */ globalSetKey = '$g_' + this.safeName_(globalName);
      var /** @const {string} */ globalSetVar = this.phpVar_(globalSetKey);
      state.usedCaptures[globalSetVar] = true;
      this.markBinding_(globalSetKey);
      result = pad(ind) + globalSetVar + ' = ' + this.coerceToType_(binaryen, cr(0), cc(0), globalType) + ';\n';
      break;
    }
    case binaryen.CallId: {
      var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
      var /** @const {number} */ callType = expr.type;

      // Direct-cast imports: emit native type cast instead of a call.
      // u32→float needs & 0xFFFFFFFF to reinterpret signed i32 as unsigned on PHP 64-bit.
      var /** @const {string|undefined} */ castBaseName = this.castNames_ ? this.castNames_[callTarget] : void 0;
      if (void 0 !== castBaseName) {
        if (-1 !== castBaseName.indexOf('u32_to_f')) {
          // Mask to unsigned 32-bit, then coerce to target float type.
          // renderCoercionByType_ uses _w2l_f32 for f32 (actual f32 precision)
          // and (float) for f64. Plain (float) would lose f32 rounding in chains.
          result = this.renderCoercionByType_(binaryen, cr(0) + ' & 0xFFFFFFFF', callType);
          resultCat = A.catForCoercedType_(binaryen, callType);
        } else {
          result = this.coerceToType_(binaryen, cr(0), cc(0), callType);
          resultCat = A.catForCoercedType_(binaryen, callType);
        }
        break;
      }

      var /** @const {string} */ phpStdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
      var /** @const {string} */ importBase = phpStdlibName ? '' : state.importedNames[callTarget] || '';
      var /** @type {string} */ callName;
      if ('' !== phpStdlibName) {
        callName = phpStdlibName;
      } else if ('' !== importBase) {
        var /** @const {string} */ phpImpKey = '$if_' + this.safeName_(importBase);
        callName = this.phpVar_(phpImpKey);
        state.usedCaptures[callName] = true;
        this.markBinding_(phpImpKey);
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
      if (binaryen.none === callType || 0 === callType) {
        result = pad(ind) + callExpr + ';\n';
      } else if ('' !== importBase || '' !== phpStdlibName) {
        result = this.renderCoercionByType_(binaryen, callExpr, callType);
        resultCat = A.catForCoercedType_(binaryen, callType);
      } else {
        result = callExpr;
        resultCat = A.catForCoercedType_(binaryen, callType);
      }
      break;
    }
    case binaryen.CallIndirectId: {
      var /** @const {string} */ ftableVar = this.phpVar_('ftable');
      state.usedCaptures[ftableVar] = true;
      var /** @const {number} */ ciRetType = expr.type;
      var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
      var /** @const {string} */ ciIndexExpr = this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32);
      var /** @const {string} */ ciCallExpr = this.phpVar_('ftable') + '[' + ciIndexExpr + '](' + ciArgs.join(', ') + ')';
      if (binaryen.none === ciRetType || 0 === ciRetType) {
        result = pad(ind) + ciCallExpr + ';\n';
      } else {
        result = this.renderCoercionByType_(binaryen, ciCallExpr, ciRetType);
        resultCat = A.catForCoercedType_(binaryen, ciRetType);
      }
      break;
    }
    case binaryen.SelectId: {
      var /** @const {number} */ selectType = expr.type;
      var /** @const */ selP = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      result = this.renderCoercionByType_(
        binaryen,
        '(' +
          selP.wrap_(cr(0), selP.PREC_CONDITIONAL_, false) +
          ' ? ' +
          cr(1) +
          ' : ' +
          selP.wrap_(cr(2), selP.PREC_CONDITIONAL_, false) +
          ')',
        selectType
      );
      resultCat = A.catForCoercedType_(binaryen, selectType);
      break;
    }
    case binaryen.MemorySizeId:
      result = '(int)(strlen(' + this.usePhpBuffer_(state) + ') / 65536)';
      resultCat = C.SIGNED;
      break;

    case binaryen.MemoryGrowId: {
      this.markHelper_('_w2l_memory_grow');
      result =
        this.n_('_w2l_memory_grow') +
        '(' +
        this.usePhpBuffer_(state) +
        ', ' +
        this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) +
        ')';
      resultCat = C.SIGNED;
      break;
    }

    case binaryen.MemoryFillId:
    case binaryen.MemoryCopyId:
      result = this.renderMemoryBulkOp_(binaryen, id, ind, childResults, this.usePhpBuffer_(state));
      break;

    case binaryen.BlockId: {
      var /** @const {?{s: string, c: number, prefix: string}} */ rootValueShape = A.tryEmitRootValueBlock_(
          /** @type {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} */ (state),
          nodeCtx,
          childResults
        );
      if (rootValueShape) {
        return /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ ({decisionValue: rootValueShape});
      }
      result = this.emitBlockDispatch_(
        /** @type {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} */ (state),
        nodeCtx,
        childResults
      );
      break;
    }
    case binaryen.LoopId: {
      var /** @type {?string} */ loopKind = null;
      if ('' !== state.pendingLoopKind) {
        loopKind = state.pendingLoopKind;
        state.pendingLoopKind = '';
      }
      if (loopKind) {
        result = this.emitSimplifiedLoopFromIR_(state, nodeCtx, loopKind);
      } else {
        result = this.emitRawInfiniteLoop_(ind, '', cr(0), true);
      }
      break;
    }

    case binaryen.IfId: {
      var /** @const {number} */ ifType = expr.type;
      if (binaryen.none !== ifType && binaryen.unreachable !== ifType && 0 !== ifType) {
        var /** @const */ ifP = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
        result = this.renderCoercionByType_(
          binaryen,
          ifP.wrap_(cr(0), ifP.PREC_CONDITIONAL_, false) +
            ' ? ' +
            cr(1) +
            ' : ' +
            ifP.wrap_(cr(2), ifP.PREC_CONDITIONAL_, false),
          ifType
        );
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
      var /** @const {string} */ brName = /** @type {string} */ (expr.name);
      var /** @const {number} */ brCondPtr = /** @type {number} */ (expr.condition);
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
            result = pad(ind) + 'if ' + this.formatCondition_(cr(0), cc(0)) + ' {\n' + rsExitLines.join('') + pad(ind) + '}\n';
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
          result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), rsBrStmt, cc(0));
          break;
        }
      }
      var /** @const {string} */ brStmt = Wasm2Lang.Backend.Php64Codegen.renderPhpJump_(state.labelStack, brName, 0);
      result = this.emitConditionalStatement_(ind, brCondPtr, cr(0), brStmt, cc(0));
      break;
    }
    case binaryen.SwitchId: {
      var /** @const {!Array<string>} */ switchNames = /** @type {!Array<string>} */ (expr.names || []);
      var /** @const {string} */ switchDefault = /** @type {string} */ (expr.defaultName || '');
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

  return A.buildLeaveResult_(result, resultCat);
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
  // resolve to depth 1 (= exit the switch).
  //
  // In the wrapping scenario (epilogue exists), action code breaks target
  // the original chain outer name (e.g. "swLabelExit"), not the sw$-prefixed
  // wrapper.  Push the original name so label resolution finds it.
  var /** @const {boolean} */ hasEpilogue = info.epiloguePtrs.length > 0;
  var /** @type {string} */ breakTargetName = info.outerName;
  if (hasEpilogue) {
    var /** @const {!Array<string>} */ cn = info.chainNames;
    for (var /** @type {number} */ fi = 0, /** @const {number} */ cnLen = cn.length; fi < cnLen; ++fi) {
      if (cn[fi] !== info.outerName) {
        breakTargetName = cn[fi];
        break;
      }
    }
  }
  state.labelStack[state.labelStack.length] = {lbl: breakTargetName, lk: 'block'};

  // Sub-walk the switch condition.
  var /** @const {string} */ condStr = A.subWalkExpressionString_(state, info.conditionPtr);

  var /** @const {!Array<string>} */ lines = [];
  SDA.emitFlatSwitchHeader(lines, ind, condStr, '', info);

  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_>} */ groups = info.caseGroups;
  for (var /** @type {number} */ gi = 0, /** @const {number} */ groupLen = groups.length; gi < groupLen; ++gi) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ group = groups[gi];
    var /** @const {!Array<number>} */ indices = group.caseIndices;
    for (var /** @type {number} */ ii = 0, /** @const {number} */ idxLen = indices.length; ii < idxLen; ++ii) {
      lines[lines.length] = pad(ind + 1) + 'case ' + indices[ii] + ':\n';
    }
    this.emitPhpFlatSwitchGroupBody_(state, lines, binaryen, vis, group, ind, info);
  }

  if (info.defaultGroup) {
    lines[lines.length] = pad(ind + 1) + 'default:\n';
    this.emitPhpFlatSwitchGroupBody_(state, lines, binaryen, vis, info.defaultGroup, ind, info);
  }

  lines[lines.length] = pad(ind) + '}\n';

  // Remove the switch block entry before emitting the epilogue.  The epilogue
  // runs outside the switch, so break depth calculations must not count the
  // switch as an enclosing level.
  state.labelStack.pop();

  // Emit epilogue (trailing children of the wrapper block) after the switch.
  if (hasEpilogue) {
    SDA.emitSubWalkedExpressions_(
      lines,
      /** @type {!BinaryenModule} */ (state.wasmModule),
      binaryen,
      state.functionInfo,
      vis,
      info.epiloguePtrs,
      info.epiloguePtrs.length,
      ind
    );
  }

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
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr.name);
    if (bName) {
      var /** @const {string} */ fName = state.functionInfo.name;
      var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ fusionPlan = this.getBlockFusionPlan_(fName, bName);
      if (fusionPlan) {
        if ('a' === fusionPlan.fusionVariant) {
          // Validate structure before accepting — metadata positions may
          // drift after binary round-trip.
          if (this.detectBlockLoopFusionFromIR_(binaryen, expr)) {
            state.pendingBlockFusion = bName;
          } else {
            state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
            ++state.indent;
          }
        } else {
          state.labelStack[state.labelStack.length - 1].alias = bName;
        }
      } else if (this.useSimplifications_ && this.detectBlockLoopFusionFromIR_(binaryen, expr)) {
        state.pendingBlockFusion = bName;
        if (this.irFusedBlocks_) this.irFusedBlocks_[fName + '\0' + bName] = 'a';
      } else if (this.isBlockRootSwitch_(fName, bName)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (this.isBlockSwitchDispatch_(fName, bName)) {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else {
        state.labelStack[state.labelStack.length] = {lbl: bName, lk: 'block'};
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
    var /** @const {string} */ phpEnclosingFused = state.pendingBlockFusion;
    if ('' !== state.pendingBlockFusion) {
      state.labelStack[state.labelStack.length] = {lbl: loopName, lk: 'loop', alias: state.pendingBlockFusion};
      state.pendingBlockFusion = '';
    } else {
      state.labelStack[state.labelStack.length] = {lbl: loopName, lk: 'loop'};
    }
    ++state.indent;
    var /** @type {?string} */ phpLoopKind = null;
    var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ phpMetaLoop = this.getLoopPlan_(state.functionInfo.name, loopName);
    if (phpMetaLoop) phpLoopKind = phpMetaLoop.simplifiedLoopKind;
    if (!phpLoopKind && this.useSimplifications_) {
      phpLoopKind = this.detectLoopKindFromIR_(binaryen, expr, phpEnclosingFused);
    }
    if (phpLoopKind) {
      state.pendingLoopKind = phpLoopKind;
      return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
    }
  } else if (binaryen.IfId === id) {
    ++state.indent;
  }

  return null;
};
