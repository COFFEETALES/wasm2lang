// SIMD lane-semantics harness (Java).
//
// Prints one line per exported function, then the memory CRC.  The runner
// diffs this against the .v8.wasm.out reference produced by running the
// ORIGINAL wasm module, so any lane-width, signedness or rounding divergence
// in the emitted code shows up as a line difference.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    WasmModule mod = new WasmModule(foreign, memBuffer);
    System.out.println("i8x16_add_carry=" + mod.i8x16_add_carry());
    System.out.println("i8x16_sub_borrow=" + mod.i8x16_sub_borrow());
    System.out.println("i16x8_add_carry=" + mod.i16x8_add_carry());
    System.out.println("i16x8_mul=" + mod.i16x8_mul());
    System.out.println("i32x4_add=" + mod.i32x4_add());
    System.out.println("i64x2_add=" + mod.i64x2_add());
    System.out.println("f32x4_add=" + mod.f32x4_add());
    System.out.println("f32x4_mul=" + mod.f32x4_mul());
    System.out.println("f32x4_div=" + mod.f32x4_div());
    System.out.println("f32x4_sqrt=" + mod.f32x4_sqrt());
    System.out.println("f32x4_neg=" + mod.f32x4_neg());
    System.out.println("f32x4_abs=" + mod.f32x4_abs());
    System.out.println("f64x2_mul=" + mod.f64x2_mul());
    System.out.println("f64x2_sqrt=" + mod.f64x2_sqrt());
    System.out.println("i8x16_splat=" + mod.i8x16_splat());
    System.out.println("i16x8_splat=" + mod.i16x8_splat());
    System.out.println("f32x4_splat=" + mod.f32x4_splat());
    System.out.println("i8x16_eq=" + mod.i8x16_eq());
    System.out.println("i16x8_lt_u=" + mod.i16x8_lt_u());
    System.out.println("i16x8_lt_s=" + mod.i16x8_lt_s());
    System.out.println("f32x4_eq=" + mod.f32x4_eq());
    System.out.println("i8x16_min_u=" + mod.i8x16_min_u());
    System.out.println("i8x16_min_s=" + mod.i8x16_min_s());
    System.out.println("i8x16_max_u=" + mod.i8x16_max_u());
    System.out.println("i8x16_avgr_u=" + mod.i8x16_avgr_u());
    System.out.println("extract_s8=" + mod.extract_s8());
    System.out.println("extract_u8=" + mod.extract_u8());
    System.out.println("extract_s16=" + mod.extract_s16());
    System.out.println("extract_u16=" + mod.extract_u16());
    System.out.println("extract_hi_lane=" + mod.extract_hi_lane());
    System.out.println("replace8_narrows=" + mod.replace8_narrows());
    System.out.println("i8x16_shl=" + mod.i8x16_shl());
    System.out.println("i8x16_shl_mod=" + mod.i8x16_shl_mod());
    System.out.println("i8x16_shr_s=" + mod.i8x16_shr_s());
    System.out.println("i8x16_shr_u=" + mod.i8x16_shr_u());
    System.out.println("i16x8_shr_s=" + mod.i16x8_shr_s());
    System.out.println("i32x4_shr_u=" + mod.i32x4_shr_u());
    System.out.println("i64x2_shl_mod=" + mod.i64x2_shl_mod());
    System.out.println("any_true_zero=" + mod.any_true_zero());
    System.out.println("any_true_one_bit=" + mod.any_true_one_bit());
    System.out.println("all_true_i8_gap=" + mod.all_true_i8_gap());
    System.out.println("all_true_i32_gap=" + mod.all_true_i32_gap());
    System.out.println("all_true_i8_full=" + mod.all_true_i8_full());
    System.out.println("bitmask_i8=" + mod.bitmask_i8());
    System.out.println("bitmask_i16=" + mod.bitmask_i16());
    System.out.println("bitmask_i32=" + mod.bitmask_i32());
    System.out.println("v128_and=" + mod.v128_and());
    System.out.println("v128_or=" + mod.v128_or());
    System.out.println("v128_xor=" + mod.v128_xor());
    System.out.println("v128_andnot=" + mod.v128_andnot());
    System.out.println("v128_not=" + mod.v128_not());
    System.out.println("v128_bitselect=" + mod.v128_bitselect());
    System.out.println("v128_bitselect_call_count=" + mod.v128_bitselect_call_count());
    System.out.println("unaligned_roundtrip=" + mod.unaligned_roundtrip());
    w2lDumpCRC(memBuffer);
}

/exit
