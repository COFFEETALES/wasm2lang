// SIMD lane-semantics harness (C#).
//
// Prints one line per exported function, then the memory CRC.  The runner
// diffs this against the .v8.wasm.out reference produced by running the
// ORIGINAL wasm module, so any lane-width, signedness or rounding divergence
// in the emitted code shows up as a line difference.
public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();
    var mod = new WasmModule(foreign, memBuffer);
    System.Console.WriteLine("i8x16_add_carry=" + mod.i8x16_add_carry());
    System.Console.WriteLine("i8x16_sub_borrow=" + mod.i8x16_sub_borrow());
    System.Console.WriteLine("i16x8_add_carry=" + mod.i16x8_add_carry());
    System.Console.WriteLine("i16x8_mul=" + mod.i16x8_mul());
    System.Console.WriteLine("i32x4_add=" + mod.i32x4_add());
    System.Console.WriteLine("i64x2_add=" + mod.i64x2_add());
    System.Console.WriteLine("f32x4_add=" + mod.f32x4_add());
    System.Console.WriteLine("f32x4_mul=" + mod.f32x4_mul());
    System.Console.WriteLine("f32x4_div=" + mod.f32x4_div());
    System.Console.WriteLine("f32x4_sqrt=" + mod.f32x4_sqrt());
    System.Console.WriteLine("f32x4_neg=" + mod.f32x4_neg());
    System.Console.WriteLine("f32x4_abs=" + mod.f32x4_abs());
    System.Console.WriteLine("f64x2_mul=" + mod.f64x2_mul());
    System.Console.WriteLine("f64x2_sqrt=" + mod.f64x2_sqrt());
    System.Console.WriteLine("i8x16_splat=" + mod.i8x16_splat());
    System.Console.WriteLine("i16x8_splat=" + mod.i16x8_splat());
    System.Console.WriteLine("f32x4_splat=" + mod.f32x4_splat());
    System.Console.WriteLine("i8x16_eq=" + mod.i8x16_eq());
    System.Console.WriteLine("i16x8_lt_u=" + mod.i16x8_lt_u());
    System.Console.WriteLine("i16x8_lt_s=" + mod.i16x8_lt_s());
    System.Console.WriteLine("f32x4_eq=" + mod.f32x4_eq());
    System.Console.WriteLine("i8x16_min_u=" + mod.i8x16_min_u());
    System.Console.WriteLine("i8x16_min_s=" + mod.i8x16_min_s());
    System.Console.WriteLine("i8x16_max_u=" + mod.i8x16_max_u());
    System.Console.WriteLine("i8x16_avgr_u=" + mod.i8x16_avgr_u());
    System.Console.WriteLine("extract_s8=" + mod.extract_s8());
    System.Console.WriteLine("extract_u8=" + mod.extract_u8());
    System.Console.WriteLine("extract_s16=" + mod.extract_s16());
    System.Console.WriteLine("extract_u16=" + mod.extract_u16());
    System.Console.WriteLine("extract_hi_lane=" + mod.extract_hi_lane());
    System.Console.WriteLine("replace8_narrows=" + mod.replace8_narrows());
    System.Console.WriteLine("i8x16_shl=" + mod.i8x16_shl());
    System.Console.WriteLine("i8x16_shl_mod=" + mod.i8x16_shl_mod());
    System.Console.WriteLine("i8x16_shr_s=" + mod.i8x16_shr_s());
    System.Console.WriteLine("i8x16_shr_u=" + mod.i8x16_shr_u());
    System.Console.WriteLine("i16x8_shr_s=" + mod.i16x8_shr_s());
    System.Console.WriteLine("i32x4_shr_u=" + mod.i32x4_shr_u());
    System.Console.WriteLine("i64x2_shl_mod=" + mod.i64x2_shl_mod());
    System.Console.WriteLine("any_true_zero=" + mod.any_true_zero());
    System.Console.WriteLine("any_true_one_bit=" + mod.any_true_one_bit());
    System.Console.WriteLine("all_true_i8_gap=" + mod.all_true_i8_gap());
    System.Console.WriteLine("all_true_i32_gap=" + mod.all_true_i32_gap());
    System.Console.WriteLine("all_true_i8_full=" + mod.all_true_i8_full());
    System.Console.WriteLine("bitmask_i8=" + mod.bitmask_i8());
    System.Console.WriteLine("bitmask_i16=" + mod.bitmask_i16());
    System.Console.WriteLine("bitmask_i32=" + mod.bitmask_i32());
    System.Console.WriteLine("v128_and=" + mod.v128_and());
    System.Console.WriteLine("v128_or=" + mod.v128_or());
    System.Console.WriteLine("v128_xor=" + mod.v128_xor());
    System.Console.WriteLine("v128_andnot=" + mod.v128_andnot());
    System.Console.WriteLine("v128_not=" + mod.v128_not());
    System.Console.WriteLine("v128_bitselect=" + mod.v128_bitselect());
    System.Console.WriteLine("v128_bitselect_call_count=" + mod.v128_bitselect_call_count());
    System.Console.WriteLine("unaligned_roundtrip=" + mod.unaligned_roundtrip());
    W2l.DumpCRC(memBuffer);
  }
}
