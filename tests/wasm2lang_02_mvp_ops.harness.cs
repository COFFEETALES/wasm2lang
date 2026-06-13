// C# test harness for wasm2lang_02_mvp_ops.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Instantiates the module, calls exported functions, and dumps the memory
// CRC — mirroring the .harness.java / .harness.mjs / .harness.php files.
// Note: '$' in export-derived accessor names maps to '_' in C#
// (counter$set → counter_set).

public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();

    var mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    // MVP ops — shared i32/f32/f64 triples.
    foreach (var t in W2l.Nested("i32_f32_f64_triples")) {
      mod.exerciseMVPOps((int)t[0], (float)t[1], t[2]);
    }

    // Trunc/convert chains with wide-range random float input.
    foreach (var p in W2l.Nested("trunc_convert_pairs")) {
      mod.exerciseTruncConvert((float)p[0], p[1]);
    }

    mod.exerciseOverflowOps();
    mod.exerciseEdgeCases();

    // Exported mutable global: exercise via getter/setter and function.
    mod.counter_set(42);
    mod.exerciseGlobalExports(mod.counter());
    mod.counter_set(100);
    mod.exerciseGlobalExports(mod.counter());

    W2l.DumpCRC(memBuffer);
  }
}
