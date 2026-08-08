// SIMD load/store family (Java).
//
// Prints one line per exported function.  The runner diffs this against the
// reference produced by the ORIGINAL wasm module, so a full-width load, a wrong splat width
// a missing sign extension or a fixed 32-bit lane shows up as a line
// difference.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    WasmModule mod = new WasmModule(foreign, memBuffer);
    System.out.println("load8_splat=" + mod.load8_splat());
    System.out.println("load16_splat=" + mod.load16_splat());
    System.out.println("load32_splat=" + mod.load32_splat());
    System.out.println("load64_splat=" + mod.load64_splat());
    System.out.println("load64_splat_hi=" + mod.load64_splat_hi());
    System.out.println("load8x8_s=" + mod.load8x8_s());
    System.out.println("load8x8_u=" + mod.load8x8_u());
    System.out.println("load8x8_s_hi=" + mod.load8x8_s_hi());
    System.out.println("load8x8_s_off=" + mod.load8x8_s_off());
    System.out.println("load8x8_u_off=" + mod.load8x8_u_off());
    System.out.println("load16x4_s=" + mod.load16x4_s());
    System.out.println("load16x4_u=" + mod.load16x4_u());
    System.out.println("load16x4_s_off=" + mod.load16x4_s_off());
    System.out.println("load32x2_s=" + mod.load32x2_s());
    System.out.println("load32x2_s_hi=" + mod.load32x2_s_hi());
    System.out.println("load32x2_u_hi=" + mod.load32x2_u_hi());
    System.out.println("load32_zero=" + mod.load32_zero());
    System.out.println("load32_zero_hi=" + mod.load32_zero_hi());
    System.out.println("load64_zero=" + mod.load64_zero());
    System.out.println("load64_zero_hi=" + mod.load64_zero_hi());
    System.out.println("load8_lane=" + mod.load8_lane());
    System.out.println("load16_lane=" + mod.load16_lane());
    System.out.println("load32_lane=" + mod.load32_lane());
    System.out.println("load64_lane=" + mod.load64_lane());
    System.out.println("load8_lane_keep=" + mod.load8_lane_keep());
    System.out.println("load16_lane_keep=" + mod.load16_lane_keep());
    System.out.println("load32_lane_keep=" + mod.load32_lane_keep());
    System.out.println("store8_lane=" + mod.store8_lane());
    System.out.println("store16_lane=" + mod.store16_lane());
    System.out.println("store32_lane=" + mod.store32_lane());
    System.out.println("store64_lane=" + mod.store64_lane());
    System.out.println("store32_lane_keep=" + mod.store32_lane_keep());
    w2lDumpCRC(memBuffer);
}

/exit
