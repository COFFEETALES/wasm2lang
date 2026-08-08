'use strict';

/**
 * Java's emit state is exactly the shared class-backend shape built by
 * {@code emitClassMethod_}.
 *
 * @typedef {!Wasm2Lang.Backend.AbstractCodegen.ClassEmitState_}
 */
Wasm2Lang.Backend.JavaCodegen.EmitState_;

/**
 * Java-only metadata carried by a direct v128.load child. It lets a containing
 * v128.store preserve both pointer expressions while emitting one allocation-
 * free copy helper instead of passing an IntVector across helper boundaries.
 *
 * @typedef {{
 *   w2lJavaV128LoadPtr: (string|undefined)
 * }}
 */
Wasm2Lang.Backend.JavaCodegen.V128LoadExpr_;

/**
 * Java supports eager v128 selects through its IntVector helper.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} valueType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.getEagerSelectHelperName_ = function (binaryen, valueType) {
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, valueType)) {
    this.markBinding_('$v128');
    return this.getRuntimeHelperPrefix_() + 'select_v128';
  }
  return Wasm2Lang.Backend.AbstractCodegen.prototype.getEagerSelectHelperName_.call(this, binaryen, valueType);
};

/**
 * The leave emitter is the shared class-backend body; everything Java spells
 * differently arrives through the hooks below.
 *
 * @param {!Wasm2Lang.Backend.JavaCodegen.EmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitLeave_ = function (state, nodeCtx, childResults) {
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
Wasm2Lang.Backend.JavaCodegen.prototype.renderClassCastImport_ = function (binaryen, castBaseName, callType, valStr, valCat) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, callType)) {
    // float → i32/u32: (int)(long) wraps like JS ~~x|0. Plain (int) saturates at INT_MAX/MIN.
    return {
      emittedString: '(int)(long)' + A.Precedence_.wrap_(valStr, A.Precedence_.PREC_UNARY_, true),
      resultCat: C.SIGNED
    };
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, callType)) {
    // float → i64/u64: plain (long) cast.
    return {
      emittedString: '(long)' + A.Precedence_.wrap_(valStr, A.Precedence_.PREC_UNARY_, true),
      resultCat: A.CAT_I64
    };
  }
  if (-1 !== castBaseName.indexOf('u32_to_f')) {
    // u32 → float/double: unsigned interpretation via Integer.toUnsignedLong.
    return {
      emittedString:
        (Wasm2Lang.Backend.ValueType.isF32(binaryen, callType) ? '(float)' : '(double)') +
        'Integer.toUnsignedLong(' +
        valStr +
        ')',
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
 * Attaches the v128 load-pointer metadata a containing store's copy
 * optimization reads (see {@code V128LoadExpr_}).
 *
 * @override
 * @protected
 * @param {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} leaveResult
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {function(number): string} cr
 * @return {void}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.augmentClassLeaveResult_ = function (leaveResult, state, nodeCtx, cr) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  if (
    state.binaryen.LoadId === expr.id &&
    Wasm2Lang.Backend.ValueType.isV128(state.binaryen, expr.type) &&
    leaveResult &&
    leaveResult.decisionValue &&
    'string' !== typeof leaveResult.decisionValue
  ) {
    /** @type {!Wasm2Lang.Backend.JavaCodegen.V128LoadExpr_} */ (leaveResult.decisionValue).w2lJavaV128LoadPtr =
      Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(cr(0), /** @type {number} */ (expr.offset));
  }
};

/**
 * Java-specific leave cases: the v128 store-copy optimization and the SIMD
 * lane operations in the Vector API vocabulary.
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
Wasm2Lang.Backend.JavaCodegen.prototype.emitClassLeaveBackendCase_ = function (state, nodeCtx, childResults, cr, cc, ind) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;

  switch (id) {
    case binaryen.StoreId: {
      // A v128.store whose value is a direct v128.load emits one allocation-
      // free copy helper instead of passing an IntVector across helper
      // boundaries; every other store falls through to the shared case.
      var /** @const {number} */ storeType = /** @type {number} */ (expr.valueType) || binaryen.i32;
      var /** @type {string} */ copySourcePtr = '';
      var /** @const {*} */ rawStoreValue = childResults.length > 1 ? childResults[1] : null;
      if (rawStoreValue && 'string' !== typeof rawStoreValue) {
        var /** @const {*} */ directLoadPtr = /** @type {!Wasm2Lang.Backend.JavaCodegen.V128LoadExpr_} */ (rawStoreValue)
            .w2lJavaV128LoadPtr;
        if ('string' === typeof directLoadPtr) {
          copySourcePtr = /** @type {string} */ (directLoadPtr);
        }
      }
      if (
        '' !== copySourcePtr &&
        16 === /** @type {number} */ (expr.bytes) &&
        Wasm2Lang.Backend.ValueType.isV128(binaryen, storeType)
      ) {
        var /** @const {string} */ storePtr = Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(
            cr(0),
            /** @type {number} */ (expr.offset)
          );
        this.markHelper_('$w2l_v128_copy');
        return {
          emittedString:
            pad(ind) +
            this.n_('$w2l_v128_copy') +
            '(this.' +
            this.n_('buffer') +
            ', ' +
            storePtr +
            ', ' +
            copySourcePtr +
            ');\n',
          resultCat: A.CAT_VOID
        };
      }
      return null;
    }
    case binaryen.SIMDExtractId: {
      this.markBinding_('$v128');
      var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ seOp = this.classifyLaneOpOrRefuse_(
          Wasm2Lang.Backend.SIMDOps.classifyExtractOp,
          binaryen,
          /** @type {number} */ (expr.op),
          'extract_lane'
        );
      // The lane view fixes the width; Java's lane() then sign-extends a byte
      // or short lane to int on its own, which is extract_lane_s.  The _u form
      // has to mask the sign extension back off — reading it through the wrong
      // view is what made every high-bit-set lane come back negative.
      var /** @const {string} */ seLane =
          Wasm2Lang.Backend.JavaCodegen.laneView_(cr(0), seOp.laneType) +
          '.lane(' +
          String(/** @type {number} */ (expr.index)) +
          ')';
      var /** @type {string} */ seResult;
      if ('extract_u' === seOp.kind) {
        var /** @const {number} */ seBits = Wasm2Lang.Backend.SIMDOps.laneInfo(seOp.laneType).laneBits;
        seResult = '(' + seLane + ' & 0x' + (Math.pow(2, seBits) - 1).toString(16).toUpperCase() + ')';
      } else {
        seResult = seLane;
      }
      return {emittedString: seResult, resultCat: A.catForCoercedType_(binaryen, expr.type)};
    }
    case binaryen.SIMDReplaceId: {
      this.markBinding_('$v128');
      var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ srOp = this.classifyLaneOpOrRefuse_(
          Wasm2Lang.Backend.SIMDOps.classifyReplaceOp,
          binaryen,
          /** @type {number} */ (expr.op),
          'replace_lane'
        );
      var /** @const {string} */ srElem = Wasm2Lang.Backend.JavaCodegen.simdView_(srOp.laneType)[2];
      // wasm narrows the scalar to the lane width; without the cast a value
      // wider than the lane silently keeps its high bits.
      var /** @const {string} */ srValue = Wasm2Lang.Backend.SIMDOps.laneNeedsNarrowingCast(srOp.laneType)
          ? '(' + srElem + ')' + A.Precedence_.wrap_(cr(1), A.Precedence_.PREC_UNARY_, true)
          : cr(1);
      return {
        emittedString: Wasm2Lang.Backend.JavaCodegen.toCarrier_(
          Wasm2Lang.Backend.JavaCodegen.laneView_(cr(0), srOp.laneType) +
            '.withLane(' +
            String(/** @type {number} */ (expr.index)) +
            ', ' +
            srValue +
            ')',
          srOp.laneType
        ),
        resultCat: A.CAT_V128
      };
    }
    case binaryen.SIMDShuffleId: {
      this.markBinding_('$v128');
      // i8x16.shuffle selects 16 BYTES, each independently, from a 32-byte
      // concatenation of the two operands.  This used to read only every fourth
      // mask byte and rearrange four 32-bit lanes — correct exactly when the
      // mask happens to be four 4-byte-aligned groups, which is what the one
      // fixture that existed happened to use.  Any real byte shuffle came out
      // wrong, measured against the wasm oracle on 2026-08-02.
      var /** @const {!Array<number>} */ shuffleMask = /** @type {!Array<number>} */ (expr.mask);
      var /** @const {!Array<string>} */ shuffleIdx = [];
      for (var /** @type {number} */ si = 0; si !== 16; ++si) {
        shuffleIdx.push(String(shuffleMask[si]));
      }
      // Measured on JDK 21: VectorShuffle.fromValues over SPECIES_128 wraps an
      // index of 16..31 into -16..-1, and the two-vector rearrange resolves a
      // wrapped index against its second argument — which is exactly wasm's
      // "0..15 from the first operand, 16..31 from the second".  So no helper is
      // needed and neither operand is named twice.
      return {
        emittedString: Wasm2Lang.Backend.JavaCodegen.toCarrier_(
          Wasm2Lang.Backend.JavaCodegen.laneView_(cr(0), 'i8x16') +
            '.rearrange(VectorShuffle.fromValues(ByteVector.SPECIES_128, ' +
            shuffleIdx.join(', ') +
            '), ' +
            Wasm2Lang.Backend.JavaCodegen.laneView_(cr(1), 'i8x16') +
            ')',
          'i8x16'
        ),
        resultCat: A.CAT_V128
      };
    }
    case binaryen.SIMDTernaryId: {
      this.markBinding_('$v128');
      // Bitselect is (a & c) | (b & ~c), in which the mask appears TWICE.  The
      // formula was inline, so an operand with effects — a call, a
      // load-with-side-effect — was evaluated twice where wasm evaluates it
      // once.  It goes through a helper for exactly the reason every other
      // multi-use SIMD formula does: a parameter evaluates its argument once.
      this.markHelper_('$w2l_v128_bitselect_v128');
      return {
        emittedString: this.n_('$w2l_v128_bitselect_v128') + '(' + cr(0) + ', ' + cr(1) + ', ' + cr(2) + ')',
        resultCat: A.CAT_V128
      };
    }
    case binaryen.SIMDShiftId: {
      this.markBinding_('$v128');
      var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo} */ shOp = this.classifyLaneOpOrRefuse_(
          Wasm2Lang.Backend.SIMDOps.classifyShiftOp,
          binaryen,
          /** @type {number} */ (expr.op),
          'shift'
        );
      var /** @const {string} */ shCount = A.renderLaneShiftCount_(shOp.laneType, cr(1));
      var /** @const {string} */ shVecOp = 'shl' === shOp.kind ? 'LSHL' : 'shr_s' === shOp.kind ? 'ASHR' : 'LSHR';
      return {
        emittedString: Wasm2Lang.Backend.JavaCodegen.toCarrier_(
          Wasm2Lang.Backend.JavaCodegen.laneView_(cr(0), shOp.laneType) +
            '.lanewise(VectorOperators.' +
            shVecOp +
            ', ' +
            shCount +
            ')',
          shOp.laneType
        ),
        resultCat: A.CAT_V128
      };
    }
    // SIMDLoad and SIMDLoadStoreLane are NOT plain v128 memory access: each
    // reads FEWER than 16 bytes and then splats, extends or zero-fills, or
    // touches a single lane at that lane's own width.  Both cases used to
    // render as though they were plain access — SIMDLoad ignored expr.op and
    // emitted a full-width $w2l_v128_load for every variant, SIMDLoadStoreLane
    // hardcoded getInt/putInt/.lane(n) — which was measured wrong for 21 of 25
    // probe functions with no diagnostic at all.  Both emitters are shared with
    // csharp (see AbstractCodegen.emitSIMDLoad_): the whole of the difference
    // between the two backends is the buffer argument, which java supplies
    // through simdMemoryHelperReceiver_.
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

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} dropValuePtr
 * @return {boolean}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.shouldEmitDropChild_ = function (binaryen, dropValuePtr) {
  return this.classShouldEmitDropChild_(binaryen, dropValuePtr);
};

/**
 * A Java trap is a thrown {@code ArithmeticException} — the throw is the
 * abort, no host hook can skip it, and under {@code --trap-sites} it carries
 * the kind and site id so a stack trace names the failure instead of showing
 * a bare {@code ArithmeticException} that could equally be a division by
 * zero.  Rendering is the shared throw pair; the spelling constants are set
 * in codegen.js.
 *
 * @override
 * @protected
 * @param {number} indent
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderUnreachableStatement_ = function (indent, siteId) {
  return this.renderThrowTrapStatement_(indent, Wasm2Lang.Backend.TrapKind.UNREACHABLE, siteId);
};

/**
 * Flat switches use the shared class-backend emitter, which records the
 * default-case terminality on top of the base push/produce/pop.
 *
 * @override
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  return this.emitClassFlatSwitch_(state, nodeCtx);
};
