// C# test harness for wasm2lang_06_ftable.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Instantiates the module, calls exported functions, and dumps the memory
// CRC — mirroring the .harness.java / .harness.mjs / .harness.php files.

public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();

    var mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    // Basic dispatch — all ii_i and i_i entries with shared i32 pairs.
    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseDispatchPair((int)p[0], (int)p[1]);
    }

    // Float dispatch — dd_i entries via integer-to-f64 conversion.
    foreach (var p in W2l.Nested("float_pairs")) {
      mod.exerciseFloatPair((int)p[0], (int)p[1]);
    }

    // Triple-arg dispatch — iii_i entries (select + combineBits).
    foreach (var t in W2l.Nested("i32_triples")) {
      mod.exerciseTriple((int)t[0], (int)t[1], (int)t[2]);
    }

    // Chained calls — multi-stage pipeline crossing signature boundaries.
    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseChained((int)p[0], (int)p[1]);
    }

    // Edge cases — hardcoded boundary values, all four signatures.
    mod.exerciseEdgeCases();

    // Dynamic index — table index from parameter, not constant.
    foreach (var d in W2l.Nested("dynamic_dispatch")) {
      mod.exerciseDynamicIndex((int)d[0], (int)d[1], (int)d[2]);
    }

    W2l.DumpCRC(memBuffer);
  }
}
