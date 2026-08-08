'use strict';

// ---------------------------------------------------------------------------
// SIMD128 op classification — classifies binaryen op constants that flow
// through UnaryId and BinaryId into categories for backend dispatch.
// ---------------------------------------------------------------------------

/**
 * SIMD binary-op descriptor.
 *
 * @typedef {{
 *   opName: string,
 *   laneType: string,
 *   unsigned: boolean
 * }}
 */
Wasm2Lang.Backend.SIMDOps.BinaryOpInfo;

/**
 * SIMD unary-op descriptor.
 *
 * @typedef {{
 *   opName: string,
 *   laneType: string,
 *   scalarResult: boolean
 * }}
 */
Wasm2Lang.Backend.SIMDOps.UnaryOpInfo;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.BinaryOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.binaryOpMap_ = null;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.UnaryOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.unaryOpMap_ = null;

/**
 * @private
 * @param {string} opName
 * @param {string} laneType
 * @param {boolean} unsigned
 * @return {!Wasm2Lang.Backend.SIMDOps.BinaryOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.binInfo_ = function (opName, laneType, unsigned) {
  return {opName: opName, laneType: laneType, unsigned: unsigned};
};

/**
 * @private
 * @param {string} opName
 * @param {string} laneType
 * @param {boolean} scalarResult
 * @return {!Wasm2Lang.Backend.SIMDOps.UnaryOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.unInfo_ = function (opName, laneType, scalarResult) {
  return {opName: opName, laneType: laneType, scalarResult: scalarResult};
};

/**
 * Classifies a binaryen SIMD binary op constant.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.BinaryOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyBinaryOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.binaryOpMap_) {
    var /** @const */ b = S.binInfo_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.BinaryOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.BinaryOpInfo>} */ (Object.create(null));

    // v128 bitwise
    m[binaryen.AndVec128] = b('and', 'v128', false);
    m[binaryen.OrVec128] = b('or', 'v128', false);
    m[binaryen.XorVec128] = b('xor', 'v128', false);
    m[binaryen.AndNotVec128] = b('andnot', 'v128', false);

    // i8x16
    m[binaryen.AddVecI8x16] = b('add', 'i8x16', false);
    m[binaryen.SubVecI8x16] = b('sub', 'i8x16', false);
    m[binaryen.AddSatSVecI8x16] = b('add_sat_s', 'i8x16', false);
    m[binaryen.AddSatUVecI8x16] = b('add_sat_u', 'i8x16', true);
    m[binaryen.SubSatSVecI8x16] = b('sub_sat_s', 'i8x16', false);
    m[binaryen.SubSatUVecI8x16] = b('sub_sat_u', 'i8x16', true);
    m[binaryen.MinSVecI8x16] = b('min_s', 'i8x16', false);
    m[binaryen.MinUVecI8x16] = b('min_u', 'i8x16', true);
    m[binaryen.MaxSVecI8x16] = b('max_s', 'i8x16', false);
    m[binaryen.MaxUVecI8x16] = b('max_u', 'i8x16', true);
    m[binaryen.AvgrUVecI8x16] = b('avgr_u', 'i8x16', true);
    m[binaryen.EqVecI8x16] = b('eq', 'i8x16', false);
    m[binaryen.NeVecI8x16] = b('ne', 'i8x16', false);
    m[binaryen.LtSVecI8x16] = b('lt_s', 'i8x16', false);
    m[binaryen.LtUVecI8x16] = b('lt_u', 'i8x16', true);
    m[binaryen.GtSVecI8x16] = b('gt_s', 'i8x16', false);
    m[binaryen.GtUVecI8x16] = b('gt_u', 'i8x16', true);
    m[binaryen.LeSVecI8x16] = b('le_s', 'i8x16', false);
    m[binaryen.LeUVecI8x16] = b('le_u', 'i8x16', true);
    m[binaryen.GeSVecI8x16] = b('ge_s', 'i8x16', false);
    m[binaryen.GeUVecI8x16] = b('ge_u', 'i8x16', true);
    m[binaryen.NarrowSVecI16x8ToVecI8x16] = b('narrow_s', 'i8x16', false);
    m[binaryen.NarrowUVecI16x8ToVecI8x16] = b('narrow_u', 'i8x16', true);
    m[binaryen.SwizzleVecI8x16] = b('swizzle', 'i8x16', false);

    // i16x8
    m[binaryen.AddVecI16x8] = b('add', 'i16x8', false);
    m[binaryen.SubVecI16x8] = b('sub', 'i16x8', false);
    m[binaryen.MulVecI16x8] = b('mul', 'i16x8', false);
    m[binaryen.AddSatSVecI16x8] = b('add_sat_s', 'i16x8', false);
    m[binaryen.AddSatUVecI16x8] = b('add_sat_u', 'i16x8', true);
    m[binaryen.SubSatSVecI16x8] = b('sub_sat_s', 'i16x8', false);
    m[binaryen.SubSatUVecI16x8] = b('sub_sat_u', 'i16x8', true);
    m[binaryen.MinSVecI16x8] = b('min_s', 'i16x8', false);
    m[binaryen.MinUVecI16x8] = b('min_u', 'i16x8', true);
    m[binaryen.MaxSVecI16x8] = b('max_s', 'i16x8', false);
    m[binaryen.MaxUVecI16x8] = b('max_u', 'i16x8', true);
    m[binaryen.AvgrUVecI16x8] = b('avgr_u', 'i16x8', true);
    m[binaryen.Q15MulrSatSVecI16x8] = b('q15mulr_sat_s', 'i16x8', false);
    m[binaryen.EqVecI16x8] = b('eq', 'i16x8', false);
    m[binaryen.NeVecI16x8] = b('ne', 'i16x8', false);
    m[binaryen.LtSVecI16x8] = b('lt_s', 'i16x8', false);
    m[binaryen.LtUVecI16x8] = b('lt_u', 'i16x8', true);
    m[binaryen.GtSVecI16x8] = b('gt_s', 'i16x8', false);
    m[binaryen.GtUVecI16x8] = b('gt_u', 'i16x8', true);
    m[binaryen.LeSVecI16x8] = b('le_s', 'i16x8', false);
    m[binaryen.LeUVecI16x8] = b('le_u', 'i16x8', true);
    m[binaryen.GeSVecI16x8] = b('ge_s', 'i16x8', false);
    m[binaryen.GeUVecI16x8] = b('ge_u', 'i16x8', true);
    m[binaryen.NarrowSVecI32x4ToVecI16x8] = b('narrow_s', 'i16x8', false);
    m[binaryen.NarrowUVecI32x4ToVecI16x8] = b('narrow_u', 'i16x8', true);
    m[binaryen.DotSVecI16x8ToVecI32x4] = b('dot_s', 'i16x8', false);
    m[binaryen.ExtMulLowSVecI16x8] = b('extmul_low_s', 'i16x8', false);
    m[binaryen.ExtMulHighSVecI16x8] = b('extmul_high_s', 'i16x8', false);
    m[binaryen.ExtMulLowUVecI16x8] = b('extmul_low_u', 'i16x8', true);
    m[binaryen.ExtMulHighUVecI16x8] = b('extmul_high_u', 'i16x8', true);

    // i32x4
    m[binaryen.AddVecI32x4] = b('add', 'i32x4', false);
    m[binaryen.SubVecI32x4] = b('sub', 'i32x4', false);
    m[binaryen.MulVecI32x4] = b('mul', 'i32x4', false);
    m[binaryen.MinSVecI32x4] = b('min_s', 'i32x4', false);
    m[binaryen.MinUVecI32x4] = b('min_u', 'i32x4', true);
    m[binaryen.MaxSVecI32x4] = b('max_s', 'i32x4', false);
    m[binaryen.MaxUVecI32x4] = b('max_u', 'i32x4', true);
    m[binaryen.EqVecI32x4] = b('eq', 'i32x4', false);
    m[binaryen.NeVecI32x4] = b('ne', 'i32x4', false);
    m[binaryen.LtSVecI32x4] = b('lt_s', 'i32x4', false);
    m[binaryen.LtUVecI32x4] = b('lt_u', 'i32x4', true);
    m[binaryen.GtSVecI32x4] = b('gt_s', 'i32x4', false);
    m[binaryen.GtUVecI32x4] = b('gt_u', 'i32x4', true);
    m[binaryen.LeSVecI32x4] = b('le_s', 'i32x4', false);
    m[binaryen.LeUVecI32x4] = b('le_u', 'i32x4', true);
    m[binaryen.GeSVecI32x4] = b('ge_s', 'i32x4', false);
    m[binaryen.GeUVecI32x4] = b('ge_u', 'i32x4', true);
    m[binaryen.ExtMulLowSVecI32x4] = b('extmul_low_s', 'i32x4', false);
    m[binaryen.ExtMulHighSVecI32x4] = b('extmul_high_s', 'i32x4', false);
    m[binaryen.ExtMulLowUVecI32x4] = b('extmul_low_u', 'i32x4', true);
    m[binaryen.ExtMulHighUVecI32x4] = b('extmul_high_u', 'i32x4', true);

    // i64x2
    m[binaryen.AddVecI64x2] = b('add', 'i64x2', false);
    m[binaryen.SubVecI64x2] = b('sub', 'i64x2', false);
    m[binaryen.MulVecI64x2] = b('mul', 'i64x2', false);
    m[binaryen.EqVecI64x2] = b('eq', 'i64x2', false);
    m[binaryen.NeVecI64x2] = b('ne', 'i64x2', false);
    m[binaryen.LtSVecI64x2] = b('lt_s', 'i64x2', false);
    m[binaryen.GtSVecI64x2] = b('gt_s', 'i64x2', false);
    m[binaryen.LeSVecI64x2] = b('le_s', 'i64x2', false);
    m[binaryen.GeSVecI64x2] = b('ge_s', 'i64x2', false);
    m[binaryen.ExtMulLowSVecI64x2] = b('extmul_low_s', 'i64x2', false);
    m[binaryen.ExtMulHighSVecI64x2] = b('extmul_high_s', 'i64x2', false);
    m[binaryen.ExtMulLowUVecI64x2] = b('extmul_low_u', 'i64x2', true);
    m[binaryen.ExtMulHighUVecI64x2] = b('extmul_high_u', 'i64x2', true);

    // f32x4
    m[binaryen.AddVecF32x4] = b('add', 'f32x4', false);
    m[binaryen.SubVecF32x4] = b('sub', 'f32x4', false);
    m[binaryen.MulVecF32x4] = b('mul', 'f32x4', false);
    m[binaryen.DivVecF32x4] = b('div', 'f32x4', false);
    m[binaryen.MinVecF32x4] = b('min', 'f32x4', false);
    m[binaryen.MaxVecF32x4] = b('max', 'f32x4', false);
    m[binaryen.PMinVecF32x4] = b('pmin', 'f32x4', false);
    m[binaryen.PMaxVecF32x4] = b('pmax', 'f32x4', false);
    m[binaryen.EqVecF32x4] = b('eq', 'f32x4', false);
    m[binaryen.NeVecF32x4] = b('ne', 'f32x4', false);
    m[binaryen.LtVecF32x4] = b('lt', 'f32x4', false);
    m[binaryen.GtVecF32x4] = b('gt', 'f32x4', false);
    m[binaryen.LeVecF32x4] = b('le', 'f32x4', false);
    m[binaryen.GeVecF32x4] = b('ge', 'f32x4', false);

    // f64x2
    m[binaryen.AddVecF64x2] = b('add', 'f64x2', false);
    m[binaryen.SubVecF64x2] = b('sub', 'f64x2', false);
    m[binaryen.MulVecF64x2] = b('mul', 'f64x2', false);
    m[binaryen.DivVecF64x2] = b('div', 'f64x2', false);
    m[binaryen.MinVecF64x2] = b('min', 'f64x2', false);
    m[binaryen.MaxVecF64x2] = b('max', 'f64x2', false);
    m[binaryen.PMinVecF64x2] = b('pmin', 'f64x2', false);
    m[binaryen.PMaxVecF64x2] = b('pmax', 'f64x2', false);
    m[binaryen.EqVecF64x2] = b('eq', 'f64x2', false);
    m[binaryen.NeVecF64x2] = b('ne', 'f64x2', false);
    m[binaryen.LtVecF64x2] = b('lt', 'f64x2', false);
    m[binaryen.GtVecF64x2] = b('gt', 'f64x2', false);
    m[binaryen.LeVecF64x2] = b('le', 'f64x2', false);
    m[binaryen.GeVecF64x2] = b('ge', 'f64x2', false);

    S.binaryOpMap_ = m;
  }
  return S.binaryOpMap_[op] || null;
};

/**
 * Classifies a binaryen SIMD unary op constant.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.UnaryOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyUnaryOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.unaryOpMap_) {
    var /** @const */ u = S.unInfo_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.UnaryOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.UnaryOpInfo>} */ (Object.create(null));

    // v128 bitwise
    m[binaryen.NotVec128] = u('not', 'v128', false);
    m[binaryen.AnyTrueVec128] = u('any_true', 'v128', true);

    // i8x16
    m[binaryen.SplatVecI8x16] = u('splat', 'i8x16', false);
    m[binaryen.NegVecI8x16] = u('neg', 'i8x16', false);
    m[binaryen.AbsVecI8x16] = u('abs', 'i8x16', false);
    m[binaryen.AllTrueVecI8x16] = u('all_true', 'i8x16', true);
    m[binaryen.BitmaskVecI8x16] = u('bitmask', 'i8x16', true);
    m[binaryen.PopcntVecI8x16] = u('popcnt', 'i8x16', false);
    m[binaryen.ExtendLowSVecI8x16ToVecI16x8] = u('extend_low_s', 'i8x16', false);
    m[binaryen.ExtendHighSVecI8x16ToVecI16x8] = u('extend_high_s', 'i8x16', false);
    m[binaryen.ExtendLowUVecI8x16ToVecI16x8] = u('extend_low_u', 'i8x16', false);
    m[binaryen.ExtendHighUVecI8x16ToVecI16x8] = u('extend_high_u', 'i8x16', false);
    m[binaryen.ExtAddPairwiseSVecI8x16ToI16x8] = u('extadd_pairwise_s', 'i8x16', false);
    m[binaryen.ExtAddPairwiseUVecI8x16ToI16x8] = u('extadd_pairwise_u', 'i8x16', false);

    // i16x8
    m[binaryen.SplatVecI16x8] = u('splat', 'i16x8', false);
    m[binaryen.NegVecI16x8] = u('neg', 'i16x8', false);
    m[binaryen.AbsVecI16x8] = u('abs', 'i16x8', false);
    m[binaryen.AllTrueVecI16x8] = u('all_true', 'i16x8', true);
    m[binaryen.BitmaskVecI16x8] = u('bitmask', 'i16x8', true);
    m[binaryen.ExtendLowSVecI16x8ToVecI32x4] = u('extend_low_s', 'i16x8', false);
    m[binaryen.ExtendHighSVecI16x8ToVecI32x4] = u('extend_high_s', 'i16x8', false);
    m[binaryen.ExtendLowUVecI16x8ToVecI32x4] = u('extend_low_u', 'i16x8', false);
    m[binaryen.ExtendHighUVecI16x8ToVecI32x4] = u('extend_high_u', 'i16x8', false);
    m[binaryen.ExtAddPairwiseSVecI16x8ToI32x4] = u('extadd_pairwise_s', 'i16x8', false);
    m[binaryen.ExtAddPairwiseUVecI16x8ToI32x4] = u('extadd_pairwise_u', 'i16x8', false);

    // i32x4
    m[binaryen.SplatVecI32x4] = u('splat', 'i32x4', false);
    m[binaryen.NegVecI32x4] = u('neg', 'i32x4', false);
    m[binaryen.AbsVecI32x4] = u('abs', 'i32x4', false);
    m[binaryen.AllTrueVecI32x4] = u('all_true', 'i32x4', true);
    m[binaryen.BitmaskVecI32x4] = u('bitmask', 'i32x4', true);
    m[binaryen.ExtendLowSVecI32x4ToVecI64x2] = u('extend_low_s', 'i32x4', false);
    m[binaryen.ExtendHighSVecI32x4ToVecI64x2] = u('extend_high_s', 'i32x4', false);
    m[binaryen.ExtendLowUVecI32x4ToVecI64x2] = u('extend_low_u', 'i32x4', false);
    m[binaryen.ExtendHighUVecI32x4ToVecI64x2] = u('extend_high_u', 'i32x4', false);
    m[binaryen.TruncSatSVecF32x4ToVecI32x4] = u('trunc_sat_s_f32x4', 'i32x4', false);
    m[binaryen.TruncSatUVecF32x4ToVecI32x4] = u('trunc_sat_u_f32x4', 'i32x4', false);
    m[binaryen.TruncSatZeroSVecF64x2ToVecI32x4] = u('trunc_sat_zero_s_f64x2', 'i32x4', false);
    m[binaryen.TruncSatZeroUVecF64x2ToVecI32x4] = u('trunc_sat_zero_u_f64x2', 'i32x4', false);

    // i64x2
    m[binaryen.SplatVecI64x2] = u('splat', 'i64x2', false);
    m[binaryen.NegVecI64x2] = u('neg', 'i64x2', false);
    m[binaryen.AbsVecI64x2] = u('abs', 'i64x2', false);
    m[binaryen.AllTrueVecI64x2] = u('all_true', 'i64x2', true);
    m[binaryen.BitmaskVecI64x2] = u('bitmask', 'i64x2', true);

    // f32x4
    m[binaryen.SplatVecF32x4] = u('splat', 'f32x4', false);
    m[binaryen.NegVecF32x4] = u('neg', 'f32x4', false);
    m[binaryen.AbsVecF32x4] = u('abs', 'f32x4', false);
    m[binaryen.SqrtVecF32x4] = u('sqrt', 'f32x4', false);
    m[binaryen.CeilVecF32x4] = u('ceil', 'f32x4', false);
    m[binaryen.FloorVecF32x4] = u('floor', 'f32x4', false);
    m[binaryen.TruncVecF32x4] = u('trunc', 'f32x4', false);
    m[binaryen.NearestVecF32x4] = u('nearest', 'f32x4', false);
    m[binaryen.ConvertSVecI32x4ToVecF32x4] = u('convert_s_i32x4', 'f32x4', false);
    m[binaryen.ConvertUVecI32x4ToVecF32x4] = u('convert_u_i32x4', 'f32x4', false);
    m[binaryen.DemoteZeroVecF64x2ToVecF32x4] = u('demote_zero_f64x2', 'f32x4', false);

    // f64x2
    m[binaryen.SplatVecF64x2] = u('splat', 'f64x2', false);
    m[binaryen.NegVecF64x2] = u('neg', 'f64x2', false);
    m[binaryen.AbsVecF64x2] = u('abs', 'f64x2', false);
    m[binaryen.SqrtVecF64x2] = u('sqrt', 'f64x2', false);
    m[binaryen.CeilVecF64x2] = u('ceil', 'f64x2', false);
    m[binaryen.FloorVecF64x2] = u('floor', 'f64x2', false);
    m[binaryen.TruncVecF64x2] = u('trunc', 'f64x2', false);
    m[binaryen.NearestVecF64x2] = u('nearest', 'f64x2', false);
    m[binaryen.ConvertLowSVecI32x4ToVecF64x2] = u('convert_low_s_i32x4', 'f64x2', false);
    m[binaryen.ConvertLowUVecI32x4ToVecF64x2] = u('convert_low_u_i32x4', 'f64x2', false);
    m[binaryen.PromoteLowVecF32x4ToVecF64x2] = u('promote_low_f32x4', 'f64x2', false);

    S.unaryOpMap_ = m;
  }
  return S.unaryOpMap_[op] || null;
};

// ---------------------------------------------------------------------------
// Lane-type metadata.
//
// Every backend that renders v128 needs the same four facts about a lane type,
// and getting any of them wrong is the failure mode that made the Java backend
// silently incorrect for years: it rendered every op against a 4-lane 32-bit
// species regardless of laneType, so an i8x16 add carried across byte
// boundaries and an f32x4 add added bit patterns as integers.  The table lives
// here, next to the classifier that produces the laneType strings, so a new
// lane type cannot be added to one without the other noticing.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   laneCount: number,
 *   laneBits: number,
 *   isFloat: boolean
 * }}
 */
Wasm2Lang.Backend.SIMDOps.LaneInfo;

/**
 * @private
 * @const {!Object<string, !Wasm2Lang.Backend.SIMDOps.LaneInfo>}
 */
Wasm2Lang.Backend.SIMDOps.LANE_INFO_ = {
  'i8x16': {laneCount: 16, laneBits: 8, isFloat: false},
  'i16x8': {laneCount: 8, laneBits: 16, isFloat: false},
  'i32x4': {laneCount: 4, laneBits: 32, isFloat: false},
  'i64x2': {laneCount: 2, laneBits: 64, isFloat: false},
  'f32x4': {laneCount: 4, laneBits: 32, isFloat: true},
  'f64x2': {laneCount: 2, laneBits: 64, isFloat: true},
  // 'v128' is the whole-vector bitwise view: 128 bits, no lane structure.
  'v128': {laneCount: 1, laneBits: 128, isFloat: false}
};

/**
 * Returns the lane geometry for a {@code laneType} string as produced by
 * {@code classifyBinaryOp} / {@code classifyUnaryOp}.  Throws on an unknown
 * lane type rather than guessing: a silently wrong lane count is exactly the
 * defect this table exists to prevent.
 *
 * @param {string} laneType
 * @return {!Wasm2Lang.Backend.SIMDOps.LaneInfo}
 */
Wasm2Lang.Backend.SIMDOps.laneInfo = function (laneType) {
  var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneInfo|undefined} */ info = Wasm2Lang.Backend.SIMDOps.LANE_INFO_[laneType];
  if (!info) {
    throw new Error('Wasm2Lang codegen: unknown SIMD lane type "' + laneType + '".');
  }
  return info;
};

/**
 * The lane type of a given element width and floatness, or {@code ''} when the
 * table has none.
 *
 * {@code 'v128'} is skipped deliberately: it is the whole-vector bitwise view,
 * not a lane geometry, and it is the only 128-bit row.  Without the skip,
 * "twice as wide as i64x2" would answer {@code 'v128'} — a string every caller
 * would then feed to {@code laneView_} as though it named 2x128-bit lanes.
 *
 * @private
 * @param {number} laneBits
 * @param {boolean} isFloat
 * @return {string}
 */
Wasm2Lang.Backend.SIMDOps.laneOfWidth_ = function (laneBits, isFloat) {
  var /** @const */ table = Wasm2Lang.Backend.SIMDOps.LANE_INFO_;
  for (var /** @type {string} */ k in table) {
    if ('v128' === k) continue;
    var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneInfo} */ info = table[k];
    if (info.laneBits === laneBits && info.isFloat === isFloat) return k;
  }
  return '';
};

/**
 * The lane type twice as wide as {@code laneType}, or {@code ''} when none
 * exists.  This is the relation the widening ops move along: extend, extmul and
 * extadd_pairwise all read a source lane and produce the next one up, and narrow
 * reads this relation backwards.
 *
 * Both backends restated it by hand — csharp as two tables plus two ternaries,
 * java as a third ternary — and the geometry it encodes is already in
 * {@code LANE_INFO_}, one file away from the classifier that names the lanes.
 * Deriving it means a new lane type cannot arrive with the relation missing.
 *
 * The derived relation is one row wider than either hand table was: it also
 * answers f32x4 -> f64x2 (and, backwards, f64x2 -> f32x4), which is correct and
 * unreached — the ops that ask are all integer-lane ops.
 *
 * @param {string} laneType
 * @return {string}
 */
Wasm2Lang.Backend.SIMDOps.widerLane = function (laneType) {
  var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneInfo} */ info = Wasm2Lang.Backend.SIMDOps.laneInfo(laneType);
  return Wasm2Lang.Backend.SIMDOps.laneOfWidth_(2 * info.laneBits, info.isFloat);
};

/**
 * The lane type half as wide as {@code laneType}, or {@code ''} when none
 * exists.  The inverse of {@code widerLane}; both directions are needed because
 * the shared classifier reports the SOURCE lane for some widening ops
 * (extadd_pairwise, extend) and the RESULT lane for others (extmul).
 *
 * @param {string} laneType
 * @return {string}
 */
Wasm2Lang.Backend.SIMDOps.narrowerLane = function (laneType) {
  var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneInfo} */ info = Wasm2Lang.Backend.SIMDOps.laneInfo(laneType);
  return Wasm2Lang.Backend.SIMDOps.laneOfWidth_(info.laneBits / 2, info.isFloat);
};

/**
 * Whether the scalar operand of {@code splat} / {@code replace_lane} has to be
 * narrowed to the lane element type before it is written.
 *
 * wasm hands both ops an i32 for every integer lane type, so the value has to be
 * truncated exactly for the lanes narrower than that scalar — i8x16 and i16x8.
 * The wider lanes (i32x4, i64x2) and the float lanes receive a scalar of their
 * own width and must NOT be cast, which is what makes this a predicate rather
 * than an unconditional cast.
 *
 * Both backends asked the question by spelling out their own element-type names
 * ({@code 'int' === elem || 'long' === elem || …}), four times between them.
 * That reads as a fact about C# and Java type names; it is a fact about lane
 * geometry, and {@code laneInfo} already holds it.
 *
 * @param {string} laneType
 * @return {boolean}
 */
Wasm2Lang.Backend.SIMDOps.laneNeedsNarrowingCast = function (laneType) {
  var /** @const {!Wasm2Lang.Backend.SIMDOps.LaneInfo} */ info = Wasm2Lang.Backend.SIMDOps.laneInfo(laneType);
  return !info.isFloat && info.laneBits < 32;
};

/**
 * Looks up a backend's lane-view row, throwing rather than handing back
 * {@code undefined}.
 *
 * Each backend keeps its own table — java names vector classes and reinterpret
 * methods, csharp names {@code As*} views — but the lookup and its failure are
 * the same in both, and were written three times (java once, csharp twice,
 * inline in {@code laneView_} and {@code laneElemType_}).  The failure matters
 * more than the lookup: returning {@code undefined} would index into it and
 * splice {@code "undefined"} into emitted source, which is the same class of
 * defect as a placeholder emitter.
 *
 * {@code language} is the only thing that differs, and it is a message word, not
 * a switch.
 *
 * @param {!Object<string, !Array<string>>} table
 * @param {string} laneType
 * @param {string} language  Backend name as it should read in the message.
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.SIMDOps.laneViewRow = function (table, laneType, language) {
  var /** @const {!Array<string>|undefined} */ row = table[laneType];
  if (!row) {
    throw new Error('Wasm2Lang codegen: no ' + language + ' SIMD lane view for lane type "' + laneType + '".');
  }
  return row;
};

// ---------------------------------------------------------------------------
// Node-kind op classification.
//
// SIMDShift / SIMDExtract / SIMDReplace carry a binaryen op constant that
// encodes both the lane type and the variant.  Every backend needs the same
// decomposition, and getting the lane type wrong here is the same silent-
// corruption failure the LANE_INFO_ table above exists to prevent, so the
// mapping lives once, next to the other classifiers.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   laneType: string,
 *   kind: string
 * }}
 */
Wasm2Lang.Backend.SIMDOps.LaneOpInfo;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.shiftOpMap_ = null;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.extractOpMap_ = null;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.replaceOpMap_ = null;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.loadOpMap_ = null;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>}
 */
Wasm2Lang.Backend.SIMDOps.loadStoreLaneOpMap_ = null;

/**
 * @private
 * @param {string} laneType
 * @param {string} kind
 * @return {!Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.laneOp_ = function (laneType, kind) {
  return {laneType: laneType, kind: kind};
};

/**
 * Classifies a SIMDShift op.  {@code kind} is 'shl', 'shr_s' or 'shr_u'.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyShiftOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.shiftOpMap_) {
    var /** @const */ o = S.laneOp_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */ (Object.create(null));
    m[binaryen.ShlVecI8x16] = o('i8x16', 'shl');
    m[binaryen.ShrSVecI8x16] = o('i8x16', 'shr_s');
    m[binaryen.ShrUVecI8x16] = o('i8x16', 'shr_u');
    m[binaryen.ShlVecI16x8] = o('i16x8', 'shl');
    m[binaryen.ShrSVecI16x8] = o('i16x8', 'shr_s');
    m[binaryen.ShrUVecI16x8] = o('i16x8', 'shr_u');
    m[binaryen.ShlVecI32x4] = o('i32x4', 'shl');
    m[binaryen.ShrSVecI32x4] = o('i32x4', 'shr_s');
    m[binaryen.ShrUVecI32x4] = o('i32x4', 'shr_u');
    m[binaryen.ShlVecI64x2] = o('i64x2', 'shl');
    m[binaryen.ShrSVecI64x2] = o('i64x2', 'shr_s');
    m[binaryen.ShrUVecI64x2] = o('i64x2', 'shr_u');
    S.shiftOpMap_ = m;
  }
  return S.shiftOpMap_[op] || null;
};

/**
 * Classifies a SIMDExtract op.  {@code kind} is 'extract_s', 'extract_u' or
 * 'extract' — the signed/unsigned split exists only for the narrow lane types,
 * where wasm defines both a sign-extending and a zero-extending extract.
 *
 * Extract, Replace and Shift each have their OWN binaryen enumeration starting
 * at 0, so their constants collide numerically: measured on binaryen 131,
 * {@code ExtractLaneUVecI16x8} and {@code ReplaceLaneVecI64x2} are both 3.
 * Keying one map by op number therefore silently returns the wrong lane type
 * for whichever family was registered first — which is exactly the bug this
 * split fixes.  Never merge these maps.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyExtractOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.extractOpMap_) {
    var /** @const */ o = S.laneOp_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */ (Object.create(null));
    m[binaryen.ExtractLaneSVecI8x16] = o('i8x16', 'extract_s');
    m[binaryen.ExtractLaneUVecI8x16] = o('i8x16', 'extract_u');
    m[binaryen.ExtractLaneSVecI16x8] = o('i16x8', 'extract_s');
    m[binaryen.ExtractLaneUVecI16x8] = o('i16x8', 'extract_u');
    m[binaryen.ExtractLaneVecI32x4] = o('i32x4', 'extract');
    m[binaryen.ExtractLaneVecI64x2] = o('i64x2', 'extract');
    m[binaryen.ExtractLaneVecF32x4] = o('f32x4', 'extract');
    m[binaryen.ExtractLaneVecF64x2] = o('f64x2', 'extract');
    S.extractOpMap_ = m;
  }
  return S.extractOpMap_[op] || null;
};

/**
 * Classifies a SIMDReplace op.  See {@code classifyExtractOp} for why this is
 * a separate map rather than a shared one.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyReplaceOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.replaceOpMap_) {
    var /** @const */ o = S.laneOp_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */ (Object.create(null));
    m[binaryen.ReplaceLaneVecI8x16] = o('i8x16', 'replace');
    m[binaryen.ReplaceLaneVecI16x8] = o('i16x8', 'replace');
    m[binaryen.ReplaceLaneVecI32x4] = o('i32x4', 'replace');
    m[binaryen.ReplaceLaneVecI64x2] = o('i64x2', 'replace');
    m[binaryen.ReplaceLaneVecF32x4] = o('f32x4', 'replace');
    m[binaryen.ReplaceLaneVecF64x2] = o('f64x2', 'replace');
    S.replaceOpMap_ = m;
  }
  return S.replaceOpMap_[op] || null;
};

/**
 * Classifies a SIMDLoad op — the {@code v128.load*_splat},
 * {@code v128.load*x*_s/_u} and {@code v128.load*_zero} family.  {@code kind}
 * is the wasm mnemonic without the {@code v128.} prefix; {@code laneType} is
 * the lane geometry the loaded bits are placed in.
 *
 * These are NOT plain v128 loads.  Each reads FEWER than 16 bytes and then
 * splats, sign/zero-extends, or zero-fills to fill the vector, so rendering
 * any of them as a full-width load silently returns the wrong 16 bytes — which
 * is exactly what the Java backend did for every one of them until 2026-08-02
 * (measured: 21 of 25 probe functions wrong, with no diagnostic, because the
 * emitter ignored {@code expr.op} entirely).  A backend that cannot express a
 * form must refuse it rather than fall back to a full-width load.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyLoadOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.loadOpMap_) {
    var /** @const */ o = S.laneOp_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */ (Object.create(null));
    m[binaryen.Load8SplatVec128] = o('i8x16', 'load8_splat');
    m[binaryen.Load16SplatVec128] = o('i16x8', 'load16_splat');
    m[binaryen.Load32SplatVec128] = o('i32x4', 'load32_splat');
    m[binaryen.Load64SplatVec128] = o('i64x2', 'load64_splat');
    m[binaryen.Load8x8SVec128] = o('i16x8', 'load8x8_s');
    m[binaryen.Load8x8UVec128] = o('i16x8', 'load8x8_u');
    m[binaryen.Load16x4SVec128] = o('i32x4', 'load16x4_s');
    m[binaryen.Load16x4UVec128] = o('i32x4', 'load16x4_u');
    m[binaryen.Load32x2SVec128] = o('i64x2', 'load32x2_s');
    m[binaryen.Load32x2UVec128] = o('i64x2', 'load32x2_u');
    m[binaryen.Load32ZeroVec128] = o('i32x4', 'load32_zero');
    m[binaryen.Load64ZeroVec128] = o('i64x2', 'load64_zero');
    S.loadOpMap_ = m;
  }
  return S.loadOpMap_[op] || null;
};

/**
 * Classifies a SIMDLoadStoreLane op.  {@code kind} is the wasm mnemonic and
 * {@code laneType} the lane geometry the index counts in — an 8-bit lane op
 * indexes 16 lanes, a 64-bit one indexes 2.
 *
 * Rendering these against a fixed 32-bit lane width is wrong for three of the
 * four widths, in both the index it applies and the number of bytes it moves;
 * the Java backend did exactly that (hardcoded {@code getInt}/{@code putInt}
 * and {@code .lane(n)}) for every width until 2026-08-02.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.LaneOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyLoadStoreLaneOp = function (binaryen, op) {
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  if (!S.loadStoreLaneOpMap_) {
    var /** @const */ o = S.laneOp_;
    var /** @const {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.SIMDOps.LaneOpInfo>} */ (Object.create(null));
    m[binaryen.Load8LaneVec128] = o('i8x16', 'load8_lane');
    m[binaryen.Load16LaneVec128] = o('i16x8', 'load16_lane');
    m[binaryen.Load32LaneVec128] = o('i32x4', 'load32_lane');
    m[binaryen.Load64LaneVec128] = o('i64x2', 'load64_lane');
    m[binaryen.Store8LaneVec128] = o('i8x16', 'store8_lane');
    m[binaryen.Store16LaneVec128] = o('i16x8', 'store16_lane');
    m[binaryen.Store32LaneVec128] = o('i32x4', 'store32_lane');
    m[binaryen.Store64LaneVec128] = o('i64x2', 'store64_lane');
    S.loadStoreLaneOpMap_ = m;
  }
  return S.loadStoreLaneOpMap_[op] || null;
};
