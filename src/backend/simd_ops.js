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
  if (!Wasm2Lang.Backend.SIMDOps.binaryOpMap_) {
    var /** @const */ b = Wasm2Lang.Backend.SIMDOps.binInfo_;
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

    Wasm2Lang.Backend.SIMDOps.binaryOpMap_ = m;
  }
  return Wasm2Lang.Backend.SIMDOps.binaryOpMap_[op] || null;
};

/**
 * Classifies a binaryen SIMD unary op constant.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.SIMDOps.UnaryOpInfo}
 */
Wasm2Lang.Backend.SIMDOps.classifyUnaryOp = function (binaryen, op) {
  if (!Wasm2Lang.Backend.SIMDOps.unaryOpMap_) {
    var /** @const */ u = Wasm2Lang.Backend.SIMDOps.unInfo_;
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

    Wasm2Lang.Backend.SIMDOps.unaryOpMap_ = m;
  }
  return Wasm2Lang.Backend.SIMDOps.unaryOpMap_[op] || null;
};
