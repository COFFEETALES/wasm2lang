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
 * @typedef {!Wasm2Lang.Backend.AbstractCodegen.ClassEmitState_}
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
 * Renders a named block as a plain brace block followed by a conditional exit
 * label — C# cannot label a block for {@code break}, so breaks targeting the
 * block were rendered as {@code goto <exit>} and the label lands here.  The
 * shared {@code emitLabeledBlock_} handles fusion, elision and the
 * value-typed refusal before dispatching here.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} blockName
 * @param {string} blockBody
 * @param {number} ind
 * @param {boolean} canDirectLabel
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderNamedBlockWrapper_ = function (
  state,
  blockName,
  blockBody,
  ind,
  canDirectLabel
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ exitLine = this.csExitLabelLine_(
      /** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state),
      blockName,
      ind
    );
  if (canDirectLabel) {
    return blockBody + exitLine;
  }
  return pad(ind) + '{\n' + blockBody + pad(ind) + '}\n' + exitLine;
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
  return this.classShouldEmitDropChild_(binaryen, dropValuePtr);
};

/**
 * Wasm {@code unreachable} aborts execution; throwing matches the trap
 * semantics and keeps C#'s definite-return analysis satisfied on paths that
 * end in unreachable.
 *
 * @override
 * @protected
 * @param {number} indent
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderUnreachableStatement_ = function (indent, siteId) {
  return this.renderThrowTrapStatement_(indent, Wasm2Lang.Backend.TrapKind.UNREACHABLE, siteId);
};

/**
 * The leave emitter is the shared class-backend body; everything C# spells
 * differently arrives through the hooks below.
 *
 * @param {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
  return this.emitClassLeave_(state, nodeCtx, childResults);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} castBaseName
 * @param {number} callType
 * @param {string} valStr
 * @param {number} valCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderClassCastImport_ = function (binaryen, castBaseName, callType, valStr, valCat) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, callType)) {
    // float → i32/u32: (int)(long) wraps like JS ~~x|0. Plain (int) would
    // saturate (or throw in checked contexts) at INT_MAX/MIN.  The
    // unchecked(...) keeps the same wrap when the operand is a constant
    // expression the compiler folds in checked mode (CS0221).
    return {
      emittedString: 'unchecked((int)(long)' + A.Precedence_.wrap_(valStr, A.Precedence_.PREC_UNARY_, true) + ')',
      resultCat: C.SIGNED
    };
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, callType)) {
    // float → i64/u64: plain (long) cast, unchecked for folded constants.
    return {
      emittedString: 'unchecked((long)' + A.Precedence_.wrap_(valStr, A.Precedence_.PREC_UNARY_, true) + ')',
      resultCat: A.CAT_I64
    };
  }
  if (-1 !== castBaseName.indexOf('u32_to_f')) {
    // u32 → float/double: unsigned reinterpretation via (uint).
    return {
      emittedString:
        (Wasm2Lang.Backend.ValueType.isF32(binaryen, callType) ? '(float)' : '(double)') +
        Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('uint', valStr),
      resultCat: A.catForCoercedType_(binaryen, callType)
    };
  }
  // i32/i64/u64 → float/double: plain coercion.
  return {
    emittedString: this.coerceToType_(binaryen, valStr, valCat, callType),
    resultCat: A.catForCoercedType_(binaryen, callType)
  };
};

/**
 * The continue label sits on the loop statement (goto re-enters the
 * {@code for (;;)}); the exit label follows it.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} loopName
 * @param {number} ind
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.classRawLoopSuffix_ = function (state, loopName, ind) {
  return this.csExitLabelLine_(/** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state), loopName, ind);
};

/**
 * C#-specific leave cases: the SIMD lane operations in the
 * {@code System.Runtime.Intrinsics.Vector128} vocabulary.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {function(number): string} cr
 * @param {function(number): number} cc
 * @param {number} ind
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitClassLeaveBackendCase_ = function (state, nodeCtx, childResults, cr, cc, ind) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;

  switch (id) {
    case binaryen.SIMDExtractId: {
      var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ exOp = this.classifyLaneOpOrRefuse_(
          Wasm2Lang.Backend.SIMDOps.classifyExtractOp,
          binaryen,
          /** @type {number} */ (expr.op),
          'extract_lane'
        );
      // extract_lane_u reads the lane through the unsigned view so the widen
      // to i32 zero-extends; extract_lane_s reads it signed.  Getting this
      // backwards silently changes the value of every high-bit-set lane.
      var /** @const {boolean} */ exUnsigned = 'extract_u' === exOp.kind;
      return {
        emittedString:
          'System.Runtime.Intrinsics.Vector128.GetElement(' +
          Wasm2Lang.Backend.CsharpCodegen.laneView_(cr(0), exOp.laneType, exUnsigned) +
          ', ' +
          String(/** @type {number} */ (expr.index)) +
          ')',
        resultCat: A.catForCoercedType_(binaryen, expr.type)
      };
    }
    case binaryen.SIMDReplaceId: {
      var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ rpOp = this.classifyLaneOpOrRefuse_(
          Wasm2Lang.Backend.SIMDOps.classifyReplaceOp,
          binaryen,
          /** @type {number} */ (expr.op),
          'replace_lane'
        );
      var /** @const {string} */ rpElem = Wasm2Lang.Backend.CsharpCodegen.laneElemType_(rpOp.laneType, false);
      var /** @const {string} */ rpValue = Wasm2Lang.Backend.SIMDOps.laneNeedsNarrowingCast(rpOp.laneType)
          ? Wasm2Lang.Backend.CsharpCodegen.narrowingCast_(rpElem, cr(1))
          : cr(1);
      return {
        emittedString: Wasm2Lang.Backend.CsharpCodegen.toCarrier_(
          'System.Runtime.Intrinsics.Vector128.WithElement(' +
            Wasm2Lang.Backend.CsharpCodegen.laneView_(cr(0), rpOp.laneType, false) +
            ', ' +
            String(/** @type {number} */ (expr.index)) +
            ', ' +
            rpValue +
            ')'
        ),
        resultCat: A.CAT_V128
      };
    }
    case binaryen.SIMDShiftId: {
      var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ shOp = this.classifyLaneOpOrRefuse_(
          Wasm2Lang.Backend.SIMDOps.classifyShiftOp,
          binaryen,
          /** @type {number} */ (expr.op),
          'shift'
        );
      return {
        emittedString: this.renderSIMDShift_(binaryen, shOp, cr(0), cr(1), cc(1)),
        resultCat: A.CAT_V128
      };
    }
    case binaryen.SIMDShuffleId: {
      // This case did not exist.  i8x16.shuffle fell through to the default
      // branch and emitted `/* unknown expr id=32 */` into EXPRESSION position —
      // C# source that does not compile, produced with no diagnostic at all.  It
      // survived because the only shuffle fixture in the suite was Java-only.
      //
      // wasm concatenates the two operands into 32 bytes and picks 16 of them by
      // index.  Vector128.Shuffle takes one vector and yields ZERO for any index
      // outside it (the same rule swizzle relies on above), so the two halves are
      // selected independently and OR-ed: each mask is built so the indices that
      // belong to the other operand fall out of range and contribute nothing.
      // Each operand is named once, so this stays an expression.
      var /** @const {!Array<number>} */ sfMask = /** @type {!Array<number>} */ (expr.mask);
      var /** @const {!Array<string>} */ sfLeftIdx = [];
      var /** @const {!Array<string>} */ sfRightIdx = [];
      for (var /** @type {number} */ sfi = 0; sfi !== 16; ++sfi) {
        var /** @const {number} */ sfByte = sfMask[sfi];
        sfLeftIdx.push('(byte)' + (sfByte < 16 ? String(sfByte) : '255'));
        sfRightIdx.push('(byte)' + (sfByte >= 16 ? String(sfByte - 16) : '255'));
      }
      var /** @const {string} */ sfV = 'System.Runtime.Intrinsics.Vector128';
      return {
        emittedString: Wasm2Lang.Backend.CsharpCodegen.toCarrier_(
          sfV +
            '.BitwiseOr(' +
            sfV +
            '.Shuffle(' +
            Wasm2Lang.Backend.CsharpCodegen.laneView_(cr(0), 'i8x16', true) +
            ', ' +
            sfV +
            '.Create(' +
            sfLeftIdx.join(', ') +
            ')), ' +
            sfV +
            '.Shuffle(' +
            Wasm2Lang.Backend.CsharpCodegen.laneView_(cr(1), 'i8x16', true) +
            ', ' +
            sfV +
            '.Create(' +
            sfRightIdx.join(', ') +
            ')))'
        ),
        resultCat: A.CAT_V128
      };
    }
    case binaryen.SIMDTernaryId: {
      // The only SIMDTernary wasm defines is v128.bitselect(a, b, c), whose
      // result is (a & c) | (b & ~c).  ConditionalSelect(mask, left, right)
      // computes exactly that with mask = c, so the operands reorder rather
      // than needing an AND/OR/NOT expansion.
      return {
        emittedString: Wasm2Lang.Backend.CsharpCodegen.toCarrier_(
          'System.Runtime.Intrinsics.Vector128.ConditionalSelect(' + cr(2) + ', ' + cr(0) + ', ' + cr(1) + ')'
        ),
        resultCat: A.CAT_V128
      };
    }
    // Each of these reads FEWER than 16 bytes and then splats, extends or
    // zero-fills, so none is a plain v128 load; rendering one as a full-width
    // load returns the wrong 16 bytes.  The helper bodies are in
    // emitSIMDMemoryHelpers_.  An op with no helper still refuses by name
    // rather than reaching the default branch, whose `/* unknown expr id */`
    // comment is not a diagnostic and does not even compile.  Both emitters are
    // shared with java (see AbstractCodegen.emitSIMDLoad_); csharp's helpers are
    // instance methods, so it takes the default empty receiver.
    case binaryen.SIMDLoadId: {
      return {emittedString: this.emitSIMDLoad_(binaryen, expr, cr(0)), resultCat: A.CAT_V128};
    }
    case binaryen.SIMDLoadStoreLaneId: {
      var /** @const */ lsl = this.emitSIMDLoadStoreLane_(binaryen, expr, pad(ind), cr(0), cr(1));
      return {emittedString: lsl.emittedString, resultCat: lsl.isStatement ? A.CAT_VOID : A.CAT_V128};
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// Flat-switch emission.  The shared emitLabeledFlatSwitch wraps the switch in
// Java-style labeled blocks, which C# does not have — this variant keeps the
// shared structure extraction, chain-redirect bookkeeping, and case-group
// walking, but places goto exit labels after the switch / epilogue instead.
// ---------------------------------------------------------------------------

/**
 * C# exits a flat switch with an unlabeled {@code break;}.  The labeled
 * variants the other backends emit land in exactly the same place, so the
 * whole case-group emitter is shared with them and only this one statement
 * differs.
 *
 * @override
 * @protected
 * @param {!Array<string>} lines
 * @param {number} indent
 * @param {string} switchLabel
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} info
 * @return {void}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitFlatSwitchCaseBreak_ = function (lines, indent, switchLabel, info) {
  lines.push(Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + 'break;\n');
};

/**
 * Flat switches use the shared class-backend emitter; only the producer —
 * the goto-exit-label variant below — is C#-specific.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  return this.emitClassFlatSwitch_(state, nodeCtx);
};

/**
 * @suppress {checkTypes}
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.labeledFlatSwitchResult_ = function (state, nodeCtx) {
  return this.csEmitLabeledFlatSwitch_(/** @type {!Wasm2Lang.Backend.CsharpCodegen.EmitState_} */ (state), nodeCtx);
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
  var /** @const {boolean} */ hasEpilogue = info.epiloguePtrs.length > 0;

  // The three-way chain-name redirect bookkeeping is the shared
  // {@code applyChainRedirects_}; only the label *placement* below (goto
  // exit labels instead of labeled blocks) is C#-specific.
  var /** @const */ redirects = S.applyChainRedirects_(this, state, info);
  var /** @const {boolean} */ labeledEpilogue = redirects.labeledEpilogue;
  var /** @const {string} */ innerChainName = redirects.innerChainName;
  var /** @const {string} */ condStr = S.renderFlatSwitchCondition_(this, state, info.conditionPtr);

  var /** @const {!Array<string>} */ lines = [];
  lines.push(pad(ind) + 'switch (' + condStr + ') {\n');

  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_>} */ groups = info.caseGroups;
  for (var /** @type {number} */ gi = 0, /** @const {number} */ groupLen = groups.length; gi < groupLen; ++gi) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ group = groups[gi];
    var /** @const {!Array<number>} */ indices = group.caseIndices;
    for (var /** @type {number} */ ii = 0, /** @const {number} */ idxLen = indices.length; ii < idxLen; ++ii) {
      lines.push(pad(ind + 1) + 'case ' + indices[ii] + ':\n');
    }
    Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledGroupBody_(
      lines,
      this,
      state,
      vis,
      group,
      info,
      '',
      ind + 2
    );
  }

  var /** @type {?Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_} */ defGroup = info.defaultGroup;
  if (defGroup) {
    lines.push(pad(ind + 1) + 'default:\n');
    Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledGroupBody_(
      lines,
      this,
      state,
      vis,
      defGroup,
      info,
      '',
      ind + 2
    );
  }

  lines.push(pad(ind) + '}\n');

  // Epilogue: pop the switch sentinel (and the inner chain entry) so break
  // label-elision inside the epilogue resolves against the real outer stack,
  // mirroring the shared emitter.  The inner exit label lands between the
  // switch and the epilogue; the outer exit label lands after everything.
  if (hasEpilogue) {
    if (labeledEpilogue && '' !== innerChainName) {
      lines.push(this.csExitLabelLine_(state, innerChainName, ind));
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
  lines.push(this.csExitLabelLine_(state, info.outerName, ind));

  return {emittedString: lines.join(''), hasDefault: !!defGroup};
};
