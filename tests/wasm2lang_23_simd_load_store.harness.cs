// SIMD load/store family (C#).
//
// Prints one line per exported function.  The runner diffs this against the
// reference produced by the ORIGINAL wasm module, so a full-width load, a wrong splat width
// a missing sign extension or a fixed 32-bit lane shows up as a line
// difference.
public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();
    var mod = new WasmModule(foreign, memBuffer);
    System.Console.WriteLine("load8_splat=" + mod.load8_splat());
    System.Console.WriteLine("load16_splat=" + mod.load16_splat());
    System.Console.WriteLine("load32_splat=" + mod.load32_splat());
    System.Console.WriteLine("load64_splat=" + mod.load64_splat());
    System.Console.WriteLine("load64_splat_hi=" + mod.load64_splat_hi());
    System.Console.WriteLine("load8x8_s=" + mod.load8x8_s());
    System.Console.WriteLine("load8x8_u=" + mod.load8x8_u());
    System.Console.WriteLine("load8x8_s_hi=" + mod.load8x8_s_hi());
    System.Console.WriteLine("load8x8_s_off=" + mod.load8x8_s_off());
    System.Console.WriteLine("load8x8_u_off=" + mod.load8x8_u_off());
    System.Console.WriteLine("load16x4_s=" + mod.load16x4_s());
    System.Console.WriteLine("load16x4_u=" + mod.load16x4_u());
    System.Console.WriteLine("load16x4_s_off=" + mod.load16x4_s_off());
    System.Console.WriteLine("load32x2_s=" + mod.load32x2_s());
    System.Console.WriteLine("load32x2_s_hi=" + mod.load32x2_s_hi());
    System.Console.WriteLine("load32x2_u_hi=" + mod.load32x2_u_hi());
    System.Console.WriteLine("load32_zero=" + mod.load32_zero());
    System.Console.WriteLine("load32_zero_hi=" + mod.load32_zero_hi());
    System.Console.WriteLine("load64_zero=" + mod.load64_zero());
    System.Console.WriteLine("load64_zero_hi=" + mod.load64_zero_hi());
    System.Console.WriteLine("load8_lane=" + mod.load8_lane());
    System.Console.WriteLine("load16_lane=" + mod.load16_lane());
    System.Console.WriteLine("load32_lane=" + mod.load32_lane());
    System.Console.WriteLine("load64_lane=" + mod.load64_lane());
    System.Console.WriteLine("load8_lane_keep=" + mod.load8_lane_keep());
    System.Console.WriteLine("load16_lane_keep=" + mod.load16_lane_keep());
    System.Console.WriteLine("load32_lane_keep=" + mod.load32_lane_keep());
    System.Console.WriteLine("store8_lane=" + mod.store8_lane());
    System.Console.WriteLine("store16_lane=" + mod.store16_lane());
    System.Console.WriteLine("store32_lane=" + mod.store32_lane());
    System.Console.WriteLine("store64_lane=" + mod.store64_lane());
    System.Console.WriteLine("store32_lane_keep=" + mod.store32_lane_keep());
    W2l.DumpCRC(memBuffer);
  }
}
