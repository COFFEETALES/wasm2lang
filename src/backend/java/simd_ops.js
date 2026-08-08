'use strict';

// ---------------------------------------------------------------------------
// Java SIMD128 rendering — jdk.incubator.vector.
//
// The carrier stays IntVector (see javaTypeName_), but no operation may be
// performed in the carrier's shape: wasm v128 is 128 untyped bits and each
// instruction reinterprets them as its own lane geometry.  Every op therefore
// reinterprets the carrier into its lane view, computes there, and
// reinterprets back.
//
// This file previously did NOT do that — it emitted every op against
// IntVector.SPECIES_128 regardless of laneType.  Measured 2026-08-02 against
// the wasm oracle, that produced wrong values for 14 of 28 probe functions:
// i8x16/i16x8 adds carried across lane boundaries, f32x4/f64x2 arithmetic
// operated on bit patterns as integers, splat broadcast the wrong width,
// extract_lane_s did not sign-extend, replace_lane did not narrow, shift
// counts were not reduced modulo the lane width, and all_true / bitmask
// counted 4 lanes whatever the lane type.  Every helper here takes laneType
// from the shared classifier for that reason.
// ---------------------------------------------------------------------------

/**
 * Lane views: laneType -> [vectorClass, reinterpretMethod, elementType].
 * The species is always {@code <vectorClass>.SPECIES_128} — 128 bits total,
 * so the lane count follows from the element width.
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_LANE_VIEW_ = {
  'i8x16': ['ByteVector', 'reinterpretAsBytes', 'byte'],
  'i16x8': ['ShortVector', 'reinterpretAsShorts', 'short'],
  'i32x4': ['IntVector', 'reinterpretAsInts', 'int'],
  'i64x2': ['LongVector', 'reinterpretAsLongs', 'long'],
  'f32x4': ['FloatVector', 'reinterpretAsFloats', 'float'],
  'f64x2': ['DoubleVector', 'reinterpretAsDoubles', 'double'],
  // v128 ops are whole-vector bitwise; the carrier shape is already correct.
  'v128': ['IntVector', 'reinterpretAsInts', 'int']
};

/**
 * @param {string} laneType
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.simdView_ = function (laneType) {
  return Wasm2Lang.Backend.SIMDOps.laneViewRow(Wasm2Lang.Backend.JavaCodegen.SIMD_LANE_VIEW_, laneType, 'Java');
};

/**
 * Renders {@code expr} reinterpreted into the lane view for {@code laneType}.
 *
 * @param {string} expr
 * @param {string} laneType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.laneView_ = function (expr, laneType) {
  var /** @const {!Array<string>} */ view = Wasm2Lang.Backend.JavaCodegen.simdView_(laneType);
  // i32x4 and v128 already ARE the carrier shape, so the reinterpret is the
  // identity.  Eliding it keeps the emitted text for i32x4 code — by far the
  // common case, and the one shape the pre-lane-aware emitter got right —
  // unchanged rather than wrapping every operand in a no-op call.
  if ('IntVector' === view[0]) return expr;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return P.wrap_(expr, P.PREC_UNARY_, true) + '.' + view[1] + '()';
};

/**
 * The species expression for a lane type, e.g. {@code ByteVector.SPECIES_128}.
 *
 * @param {string} laneType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.laneSpecies_ = function (laneType) {
  return Wasm2Lang.Backend.JavaCodegen.simdView_(laneType)[0] + '.SPECIES_128';
};

/**
 * Reinterprets a lane-view expression back to the IntVector carrier, eliding
 * the call when the lane view already is the carrier shape.
 *
 * @param {string} expr
 * @param {string} laneType  The lane view {@code expr} is currently in.
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.toCarrier_ = function (expr, laneType) {
  if ('IntVector' === Wasm2Lang.Backend.JavaCodegen.simdView_(laneType)[0]) return expr;
  return expr + '.reinterpretAsInts()';
};

/**
 * Binary ops expressed as a method call on the lane view.
 *
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_BINARY_METHOD_ = {
  'add': '.add(',
  'sub': '.sub(',
  'mul': '.mul(',
  'div': '.div(',
  'min_s': '.min(',
  'max_s': '.max(',
  'min': '.min(',
  'max': '.max('
};

/**
 * Binary ops expressed as {@code lanewise(VectorOperators.X, other)}.
 *
 * ONLY operators that exist in JDK 21 may appear here.  Enumerated by
 * reflection on 2026-08-02: {@code SADD}, {@code SSUB}, {@code SUADD},
 * {@code SUSUB}, {@code UMIN}, {@code UMAX} and {@code UAVERGE} do NOT exist —
 * the Vector API has no saturating arithmetic and no unsigned min/max/average.
 * This table previously named five of them, so every saturating SIMD op
 * emitted Java that did not compile.  An op with no real operator must reach
 * {@code refuseSIMDOp_} instead of naming an invented one.
 *
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_BINARY_LANEWISE_ = {
  'and': 'AND',
  'or': 'OR',
  'xor': 'XOR',
  'andnot': 'AND_NOT'
};

/**
 * Comparison ops: opName -> VectorOperators comparison name.
 *
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_CMP_OPS_ = {
  'eq': 'EQ',
  'ne': 'NE',
  'lt_s': 'LT',
  'lt': 'LT',
  'gt_s': 'GT',
  'gt': 'GT',
  'le_s': 'LE',
  'le': 'LE',
  'ge_s': 'GE',
  'ge': 'GE',
  'lt_u': 'UNSIGNED_LT',
  'gt_u': 'UNSIGNED_GT',
  'le_u': 'UNSIGNED_LE',
  'ge_u': 'UNSIGNED_GE'
};

/**
 * Renders a SIMD comparison as an all-ones / all-zeros vector in the op's lane
 * view.  wasm defines a comparison result as all-ones per true lane, not as 1,
 * so the mask is blended into a broadcast of -1 rather than materialized as a
 * boolean.  The broadcast happens in the lane view so the -1 fills exactly one
 * lane's worth of bits.
 *
 * @param {string} L
 * @param {string} cmpOp
 * @param {string} R
 * @param {string} laneType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.simdCompare_ = function (L, cmpOp, R, laneType) {
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  // A float lane's "all ones" is the BIT PATTERN 0xFFFF_FFFF, not the float
  // value -1.0.  Broadcasting (float)-1 produces 0xBF800000 and is wrong by
  // every bit — so the comparison happens in the float view but the result is
  // materialized in the same-width INTEGER view, with the mask cast across.
  var /** @const {string} */ resultLane = 'f32x4' === laneType ? 'i32x4' : 'f64x2' === laneType ? 'i64x2' : laneType;
  var /** @const {!Array<string>} */ rview = J.simdView_(resultLane);
  var /** @const {string} */ rspecies = J.laneSpecies_(resultLane);
  var /** @const {string} */ rcls = rview[0];
  var /** @const {string} */ mask =
      J.laneView_(L, laneType) + '.compare(VectorOperators.' + cmpOp + ', ' + J.laneView_(R, laneType) + ')';
  var /** @const {string} */ castMask = resultLane === laneType ? mask : mask + '.cast(' + rspecies + ')';
  // Converted back to the carrier here rather than by the caller, because the
  // result lives in resultLane, not in the op's own laneType.
  return J.toCarrier_(
    rcls + '.zero(' + rspecies + ').blend(' + rcls + '.broadcast(' + rspecies + ', (' + rview[2] + ')-1), ' + castMask + ')',
    resultLane
  );
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitSIMDBinaryOp_ = function (binaryen, info, L, R) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  var /** @const {string} */ opName = info.opName;
  var /** @const {string} */ lane = info.laneType;

  var /** @const {string|undefined} */ method = J.SIMD_BINARY_METHOD_[opName];
  if (method) {
    return {
      emittedString: J.toCarrier_(J.laneView_(L, lane) + method + J.laneView_(R, lane) + ')', lane),
      resultCat: A.CAT_V128
    };
  }

  var /** @const {string|undefined} */ lanewise = J.SIMD_BINARY_LANEWISE_[opName];
  if (lanewise) {
    return {
      emittedString: J.toCarrier_(
        J.laneView_(L, lane) + '.lanewise(VectorOperators.' + lanewise + ', ' + J.laneView_(R, lane) + ')',
        lane
      ),
      resultCat: A.CAT_V128
    };
  }

  var /** @const {string|undefined} */ cmpOp = J.SIMD_CMP_OPS_[opName];
  if (cmpOp) {
    return {emittedString: J.simdCompare_(L, cmpOp, R, lane), resultCat: A.CAT_V128};
  }

  // Everything below needs an operand more than once, has no Vector API
  // operator at all, or both.  All of it therefore goes through a helper: a
  // helper parameter evaluates its argument exactly once, and a helper body is
  // a statement list, which an emitted expression is not.  The formulas live in
  // emitSIMDHelpers_.
  if (Wasm2Lang.Backend.JavaCodegen.SIMD_BINARY_HELPER_[opName]) {
    var /** @const {string} */ binHelper = '$w2l_v128_' + opName + '_' + lane;
    this.markHelper_(binHelper);
    return {emittedString: this.n_(binHelper) + '(' + L + ', ' + R + ')', resultCat: A.CAT_V128};
  }

  this.refuseSIMDOp_('binary', opName, lane);
  return {emittedString: '', resultCat: A.CAT_V128};
};

/**
 * Binary SIMD ops rendered as a call to {@code $w2l_v128_<op>_<laneType>}.
 * Membership here is decided by the helper roster in {@code emitSIMDHelpers_};
 * an op listed without a matching helper would emit a call to a method that is
 * never declared, so the two must be kept in step.
 *
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_BINARY_HELPER_ = {
  'add_sat_s': true,
  'add_sat_u': true,
  'sub_sat_s': true,
  'sub_sat_u': true,
  'avgr_u': true,
  'min_u': true,
  'max_u': true,
  'pmin': true,
  'pmax': true,
  'extmul_low_s': true,
  'extmul_high_s': true,
  'extmul_low_u': true,
  'extmul_high_u': true,
  'narrow_s': true,
  'narrow_u': true,
  'dot_s': true,
  'q15mulr_sat_s': true,
  'swizzle': true
};

/**
 * Unary ops expressed as a method call on the lane view.
 *
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_UNARY_METHOD_ = {
  'neg': '.neg()',
  'abs': '.abs()',
  'sqrt': '.lanewise(VectorOperators.SQRT)',
  'not': '.lanewise(VectorOperators.NOT)'
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.UnaryOpInfo} info
 * @param {string} operandExpr
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitSIMDUnaryOp_ = function (binaryen, info, operandExpr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  var /** @const {string} */ opName = info.opName;
  var /** @const {string} */ lane = info.laneType;

  var /** @const {string|undefined} */ method = J.SIMD_UNARY_METHOD_[opName];
  if (method) {
    return {emittedString: J.toCarrier_(J.laneView_(operandExpr, lane) + method, lane), resultCat: A.CAT_V128};
  }

  // splat: broadcast into the op's lane view, narrowing the scalar to the lane
  // element width exactly as wasm does.
  if ('splat' === opName) {
    var /** @const {!Array<string>} */ view = J.simdView_(lane);
    var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @const {string} */ elem = view[2];
    var /** @const {string} */ arg = Wasm2Lang.Backend.SIMDOps.laneNeedsNarrowingCast(lane)
        ? '(' + elem + ')' + P.wrap_(operandExpr, P.PREC_UNARY_, true)
        : operandExpr;
    return {
      emittedString: J.toCarrier_(view[0] + '.broadcast(' + J.laneSpecies_(lane) + ', ' + arg + ')', lane),
      resultCat: A.CAT_V128
    };
  }

  // any_true is whole-vector: any non-zero bit anywhere, independent of lane
  // type, so it is evaluated in the carrier view.
  if ('any_true' === opName) {
    return {
      emittedString:
        J.laneView_(operandExpr, 'v128') +
        '.compare(VectorOperators.NE, IntVector.zero(IntVector.SPECIES_128)).anyTrue() ? 1 : 0',
      resultCat: C.SIGNED
    };
  }

  // all_true is per-lane in the op's own lane view — the lane COUNT is exactly
  // what makes this lane-type dependent, and what the old 4-lane form got wrong.
  if ('all_true' === opName) {
    return {
      emittedString:
        J.laneView_(operandExpr, lane) +
        '.compare(VectorOperators.NE, ' +
        J.simdView_(lane)[0] +
        '.zero(' +
        J.laneSpecies_(lane) +
        ')).allTrue() ? 1 : 0',
      resultCat: C.SIGNED
    };
  }

  // bitmask gathers the sign bit of each lane into the low bits of an i32; the
  // bit count equals the lane count, so the mask width follows laneType.
  if ('bitmask' === opName) {
    var /** @const {number} */ laneCount = Wasm2Lang.Backend.SIMDOps.laneInfo(lane).laneCount;
    return {
      emittedString:
        '(int)(' +
        J.laneView_(operandExpr, lane) +
        '.compare(VectorOperators.LT, ' +
        J.simdView_(lane)[0] +
        '.zero(' +
        J.laneSpecies_(lane) +
        ')).toLong() & 0x' +
        (Math.pow(2, laneCount) - 1).toString(16).toUpperCase() +
        'L)',
      resultCat: C.SIGNED
    };
  }

  // popcnt and the four rounding ops: BIT_COUNT is a real operator but the
  // rounding ones have none in JDK 21 (no CEIL/FLOOR/RINT/TRUNC), so their
  // helper bodies round lane by lane through java.lang.Math.
  if (Wasm2Lang.Backend.JavaCodegen.SIMD_UNARY_HELPER_[opName]) {
    var /** @const {string} */ unHelper = '$w2l_v128_' + opName + '_' + lane;
    this.markHelper_(unHelper);
    return {emittedString: this.n_(unHelper) + '(' + operandExpr + ')', resultCat: A.CAT_V128};
  }

  this.refuseSIMDOp_('unary', opName, lane);
  return {emittedString: '', resultCat: A.CAT_V128};
};

/**
 * Unary SIMD ops rendered as a call to {@code $w2l_v128_<op>_<laneType>}.
 * Kept in step with {@code emitSIMDHelpers_} for the same reason as
 * {@code SIMD_BINARY_HELPER_}.
 *
 * @const {!Object<string, boolean>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_UNARY_HELPER_ = {
  'popcnt': true,
  'ceil': true,
  'floor': true,
  'trunc': true,
  'nearest': true,
  'extend_low_s': true,
  'extend_high_s': true,
  'extend_low_u': true,
  'extend_high_u': true,
  'extadd_pairwise_s': true,
  'extadd_pairwise_u': true,
  'trunc_sat_s_f32x4': true,
  'trunc_sat_u_f32x4': true,
  // The four f64x2 <-> i32x4 conversions were missing until 2026-08-02, so
  // every one of them reached refuseSIMDOp_ and stopped the build.  They were
  // not caught earlier because the probe matrix was written by hand; the list
  // is now derived from binaryen's own builder enumeration (see
  // tests/wasm2lang_24_simd_dense.build.js, which fails the build if binaryen
  // exposes an op no fixture reaches).
  'trunc_sat_zero_s_f64x2': true,
  'trunc_sat_zero_u_f64x2': true,
  'convert_s_i32x4': true,
  'convert_u_i32x4': true,
  'convert_low_s_i32x4': true,
  'convert_low_u_i32x4': true,
  'promote_low_f32x4': true,
  'demote_zero_f64x2': true
};

/**
 * java expresses v128 through {@code jdk.incubator.vector}.
 *
 * @override
 * @protected
 * @return {boolean}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.supportsSIMD_ = function () {
  return true;
};

/**
 * Java's SIMD memory helpers are static methods, so the ByteBuffer field is
 * passed explicitly ahead of the pointer.  This is the whole of the difference
 * between java's and csharp's SIMDLoad / SIMDLoadStoreLane emitters, which are
 * otherwise shared.
 *
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.simdMemoryHelperReceiver_ = function () {
  return 'this.' + this.n_('buffer') + ', ';
};
