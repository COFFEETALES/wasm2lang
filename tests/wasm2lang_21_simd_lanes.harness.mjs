'use strict';

// SIMD lane-semantics harness (wasm reference).
//
// Prints one line per exported function.  The runner diffs this against the
// emitted Java and C# output, so any lane-width, signedness or rounding
// divergence shows up as a line difference rather than having to be asserted
// case by case.
const moduleImports = {};

const runTest = function (buff, out, exports) {
  void buff;
  out('i8x16_add_carry=' + exports.i8x16_add_carry() + '\n');
  out('i8x16_sub_borrow=' + exports.i8x16_sub_borrow() + '\n');
  out('i16x8_add_carry=' + exports.i16x8_add_carry() + '\n');
  out('i16x8_mul=' + exports.i16x8_mul() + '\n');
  out('i32x4_add=' + exports.i32x4_add() + '\n');
  out('i64x2_add=' + exports.i64x2_add() + '\n');
  out('f32x4_add=' + exports.f32x4_add() + '\n');
  out('f32x4_mul=' + exports.f32x4_mul() + '\n');
  out('f32x4_div=' + exports.f32x4_div() + '\n');
  out('f32x4_sqrt=' + exports.f32x4_sqrt() + '\n');
  out('f32x4_neg=' + exports.f32x4_neg() + '\n');
  out('f32x4_abs=' + exports.f32x4_abs() + '\n');
  out('f64x2_mul=' + exports.f64x2_mul() + '\n');
  out('f64x2_sqrt=' + exports.f64x2_sqrt() + '\n');
  out('i8x16_splat=' + exports.i8x16_splat() + '\n');
  out('i16x8_splat=' + exports.i16x8_splat() + '\n');
  out('f32x4_splat=' + exports.f32x4_splat() + '\n');
  out('i8x16_eq=' + exports.i8x16_eq() + '\n');
  out('i16x8_lt_u=' + exports.i16x8_lt_u() + '\n');
  out('i16x8_lt_s=' + exports.i16x8_lt_s() + '\n');
  out('f32x4_eq=' + exports.f32x4_eq() + '\n');
  out('i8x16_min_u=' + exports.i8x16_min_u() + '\n');
  out('i8x16_min_s=' + exports.i8x16_min_s() + '\n');
  out('i8x16_max_u=' + exports.i8x16_max_u() + '\n');
  out('i8x16_avgr_u=' + exports.i8x16_avgr_u() + '\n');
  out('extract_s8=' + exports.extract_s8() + '\n');
  out('extract_u8=' + exports.extract_u8() + '\n');
  out('extract_s16=' + exports.extract_s16() + '\n');
  out('extract_u16=' + exports.extract_u16() + '\n');
  out('extract_hi_lane=' + exports.extract_hi_lane() + '\n');
  out('replace8_narrows=' + exports.replace8_narrows() + '\n');
  out('i8x16_shl=' + exports.i8x16_shl() + '\n');
  out('i8x16_shl_mod=' + exports.i8x16_shl_mod() + '\n');
  out('i8x16_shr_s=' + exports.i8x16_shr_s() + '\n');
  out('i8x16_shr_u=' + exports.i8x16_shr_u() + '\n');
  out('i16x8_shr_s=' + exports.i16x8_shr_s() + '\n');
  out('i32x4_shr_u=' + exports.i32x4_shr_u() + '\n');
  out('i64x2_shl_mod=' + exports.i64x2_shl_mod() + '\n');
  out('any_true_zero=' + exports.any_true_zero() + '\n');
  out('any_true_one_bit=' + exports.any_true_one_bit() + '\n');
  out('all_true_i8_gap=' + exports.all_true_i8_gap() + '\n');
  out('all_true_i32_gap=' + exports.all_true_i32_gap() + '\n');
  out('all_true_i8_full=' + exports.all_true_i8_full() + '\n');
  out('bitmask_i8=' + exports.bitmask_i8() + '\n');
  out('bitmask_i16=' + exports.bitmask_i16() + '\n');
  out('bitmask_i32=' + exports.bitmask_i32() + '\n');
  out('v128_and=' + exports.v128_and() + '\n');
  out('v128_or=' + exports.v128_or() + '\n');
  out('v128_xor=' + exports.v128_xor() + '\n');
  out('v128_andnot=' + exports.v128_andnot() + '\n');
  out('v128_not=' + exports.v128_not() + '\n');
  out('v128_bitselect=' + exports.v128_bitselect() + '\n');
  out('v128_bitselect_call_count=' + exports.v128_bitselect_call_count() + '\n');
  out('unaligned_roundtrip=' + exports.unaligned_roundtrip() + '\n');
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
