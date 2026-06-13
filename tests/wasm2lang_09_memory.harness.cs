// C# test harness for wasm2lang_09_memory.
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
    mod.exerciseBulkMemory(mod.getHeapTop());
    mod.exerciseMemoryGrow();

    foreach (var p in W2l.Nested("bulk_params")) {
      mod.exerciseBulkFillVerify(mod.getHeapTop(), (int)p[0], (int)p[1]);
    }

    W2l.DumpCRC(memBuffer);
  }
}
