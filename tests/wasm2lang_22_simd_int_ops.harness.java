// Widening integer SIMD ops (Java).
//
// Prints one line per exported function.  The runner diffs this against the
// reference produced by the ORIGINAL wasm module, so an extmul half taken
// from the wrong end, a saturating clamp at the wrong bound, or a narrow that
// truncates where wasm saturates shows up as a line difference.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    WasmModule mod = new WasmModule(foreign, memBuffer);
    System.out.println("extmul_low_s_16=" + mod.extmul_low_s_16());
    System.out.println("extmul_low_s_16b=" + mod.extmul_low_s_16b());
    System.out.println("extmul_high_s_16=" + mod.extmul_high_s_16());
    System.out.println("extmul_low_u_16=" + mod.extmul_low_u_16());
    System.out.println("extmul_high_u_16=" + mod.extmul_high_u_16());
    System.out.println("extmul_low_s_32=" + mod.extmul_low_s_32());
    System.out.println("extmul_high_s_32=" + mod.extmul_high_s_32());
    System.out.println("extmul_low_u_32=" + mod.extmul_low_u_32());
    System.out.println("extmul_high_u_32=" + mod.extmul_high_u_32());
    System.out.println("extmul_low_s_64=" + mod.extmul_low_s_64());
    System.out.println("extmul_low_s_64h=" + mod.extmul_low_s_64h());
    System.out.println("extmul_high_s_64=" + mod.extmul_high_s_64());
    System.out.println("extmul_low_u_64=" + mod.extmul_low_u_64());
    System.out.println("extmul_high_u_64=" + mod.extmul_high_u_64());
    System.out.println("narrow_u_8=" + mod.narrow_u_8());
    System.out.println("narrow_u_8b=" + mod.narrow_u_8b());
    System.out.println("narrow_u_16=" + mod.narrow_u_16());
    System.out.println("narrow_u_16b=" + mod.narrow_u_16b());
    System.out.println("narrow_s_8=" + mod.narrow_s_8());
    System.out.println("narrow_s_16=" + mod.narrow_s_16());
    System.out.println("extend_low_s_16=" + mod.extend_low_s_16());
    System.out.println("extend_high_s_16=" + mod.extend_high_s_16());
    System.out.println("extend_low_u_16=" + mod.extend_low_u_16());
    System.out.println("extend_high_u_16=" + mod.extend_high_u_16());
    System.out.println("extend_low_s_32=" + mod.extend_low_s_32());
    System.out.println("extend_high_u_32=" + mod.extend_high_u_32());
    System.out.println("add_sat_s_8=" + mod.add_sat_s_8());
    System.out.println("add_sat_u_8=" + mod.add_sat_u_8());
    System.out.println("sub_sat_s_8=" + mod.sub_sat_s_8());
    System.out.println("sub_sat_u_8=" + mod.sub_sat_u_8());
    System.out.println("add_sat_s_16=" + mod.add_sat_s_16());
    System.out.println("add_sat_u_16=" + mod.add_sat_u_16());
    System.out.println("sub_sat_s_16=" + mod.sub_sat_s_16());
    System.out.println("sub_sat_u_16=" + mod.sub_sat_u_16());
    w2lDumpCRC(memBuffer);
}

/exit
