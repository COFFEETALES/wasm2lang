// C# test harness for wasm2lang_05_memory_types.
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

    // Mixed-width and mixed-signedness loads over shared subword cases.
    foreach (var p in W2l.Nested("subword_cases")) {
      mod.exerciseMixedWidthLoads((int)p[0], (int)p[1]);
    }

    // Loads of varying widths/signedness feeding float conversions.
    foreach (var scenario in new int[][] { new int[] {42, 7}, new int[] {0, 0}, new int[] {-1, 1}, new int[] {0x12345678, -100}, new int[] {255, 256}, new int[] {-128, 127} }) {
      mod.exerciseLoadToFloat(scenario[0], scenario[1]);
    }

    // Deep multi-stage cross-type pipelines.
    var _mtc = W2l.Nested("mixed_type_cases");
    foreach (var t in _mtc) {
      mod.exerciseCrossTypePipeline((int)t[0], (float)t[1], t[2]);
    }

    // store8/store16 of computed values then reload.
    foreach (var p in W2l.Nested("subword_cases")) {
      mod.exerciseSubWordStoreReload((int)p[0], (int)p[1]);
    }

    // f32 precision boundaries and float reinterpret round-trips.
    foreach (var t in _mtc) {
      mod.exercisePrecisionAndReinterpret((int)t[0], (float)t[1], t[2]);
    }

    // i32.store with declared sub-natural alignment.
    foreach (var p in W2l.Nested("subword_cases")) {
      mod.exerciseSubAlignedI32Stores((int)p[0], (int)p[1]);
    }

    W2l.DumpCRC(memBuffer);
  }
}
