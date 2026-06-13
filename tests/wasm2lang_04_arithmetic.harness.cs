// C# test harness for wasm2lang_04_arithmetic.
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

    foreach (var v in W2l.Flat("i32_values")) {
      mod.exerciseNestedArithmetic((int)v);
    }

    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseMemoryArithmetic((int)p[0], (int)p[1]);
    }

    var _mtc = W2l.Nested("mixed_type_cases");
    for (int _i = 0; _i < 4 && _i < _mtc.Count; ++_i) {
      var t = _mtc[_i];
      mod.exerciseMixedTypeChains((int)t[0], (float)t[1], t[2]);
    }

    mod.exerciseEdgeArithmetic();

    W2l.DumpCRC(memBuffer);
  }
}
