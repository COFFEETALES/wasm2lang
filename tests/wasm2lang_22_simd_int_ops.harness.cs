// Widening integer SIMD ops (C#).
//
// Prints one line per exported function.  The runner diffs this against the
// reference produced by the ORIGINAL wasm module, so an extmul half taken
// from the wrong end, a saturating clamp at the wrong bound, or a narrow that
// truncates where wasm saturates shows up as a line difference.
public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();
    var mod = new WasmModule(foreign, memBuffer);
    System.Console.WriteLine("extmul_low_s_16=" + mod.extmul_low_s_16());
    System.Console.WriteLine("extmul_low_s_16b=" + mod.extmul_low_s_16b());
    System.Console.WriteLine("extmul_high_s_16=" + mod.extmul_high_s_16());
    System.Console.WriteLine("extmul_low_u_16=" + mod.extmul_low_u_16());
    System.Console.WriteLine("extmul_high_u_16=" + mod.extmul_high_u_16());
    System.Console.WriteLine("extmul_low_s_32=" + mod.extmul_low_s_32());
    System.Console.WriteLine("extmul_high_s_32=" + mod.extmul_high_s_32());
    System.Console.WriteLine("extmul_low_u_32=" + mod.extmul_low_u_32());
    System.Console.WriteLine("extmul_high_u_32=" + mod.extmul_high_u_32());
    System.Console.WriteLine("extmul_low_s_64=" + mod.extmul_low_s_64());
    System.Console.WriteLine("extmul_low_s_64h=" + mod.extmul_low_s_64h());
    System.Console.WriteLine("extmul_high_s_64=" + mod.extmul_high_s_64());
    System.Console.WriteLine("extmul_low_u_64=" + mod.extmul_low_u_64());
    System.Console.WriteLine("extmul_high_u_64=" + mod.extmul_high_u_64());
    System.Console.WriteLine("narrow_u_8=" + mod.narrow_u_8());
    System.Console.WriteLine("narrow_u_8b=" + mod.narrow_u_8b());
    System.Console.WriteLine("narrow_u_16=" + mod.narrow_u_16());
    System.Console.WriteLine("narrow_u_16b=" + mod.narrow_u_16b());
    System.Console.WriteLine("narrow_s_8=" + mod.narrow_s_8());
    System.Console.WriteLine("narrow_s_16=" + mod.narrow_s_16());
    System.Console.WriteLine("extend_low_s_16=" + mod.extend_low_s_16());
    System.Console.WriteLine("extend_high_s_16=" + mod.extend_high_s_16());
    System.Console.WriteLine("extend_low_u_16=" + mod.extend_low_u_16());
    System.Console.WriteLine("extend_high_u_16=" + mod.extend_high_u_16());
    System.Console.WriteLine("extend_low_s_32=" + mod.extend_low_s_32());
    System.Console.WriteLine("extend_high_u_32=" + mod.extend_high_u_32());
    System.Console.WriteLine("add_sat_s_8=" + mod.add_sat_s_8());
    System.Console.WriteLine("add_sat_u_8=" + mod.add_sat_u_8());
    System.Console.WriteLine("sub_sat_s_8=" + mod.sub_sat_s_8());
    System.Console.WriteLine("sub_sat_u_8=" + mod.sub_sat_u_8());
    System.Console.WriteLine("add_sat_s_16=" + mod.add_sat_s_16());
    System.Console.WriteLine("add_sat_u_16=" + mod.add_sat_u_16());
    System.Console.WriteLine("sub_sat_s_16=" + mod.sub_sat_s_16());
    System.Console.WriteLine("sub_sat_u_16=" + mod.sub_sat_u_16());
    W2l.DumpCRC(memBuffer);
  }
}
