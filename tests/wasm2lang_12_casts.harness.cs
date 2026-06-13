// C# test harness for wasm2lang_12_casts.
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

    foreach (var t in W2l.Nested("cast_triples")) {
      mod.exerciseI32Casts((int)t[0], (float)t[1], t[2]);
      mod.exerciseU32Casts((int)t[0], (float)t[1], t[2]);
    }

    mod.exerciseCastEdgeCases();

    W2l.DumpCRC(memBuffer);
  }
}
