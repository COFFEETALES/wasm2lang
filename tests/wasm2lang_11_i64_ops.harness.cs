// C# test harness for wasm2lang_11_i64_ops.
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

    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseI64Arithmetic((int)p[0], (int)p[1]);
    }

    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseI64Bitwise((int)p[0], (int)p[1]);
    }

    foreach (var v in W2l.Flat("i32_values")) {
      mod.exerciseI64Unary((int)v);
    }

    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseI64Comparison((int)p[0], (int)p[1]);
    }

    foreach (var p in W2l.Nested("i32_pairs")) {
      mod.exerciseI64Memory((int)p[0], (int)p[1]);
    }

    foreach (var t in W2l.Nested("conversion_cases")) {
      mod.exerciseI64Conversions((int)t[0], (float)t[1], t[2]);
    }

    foreach (var p in W2l.Nested("trunc_convert_pairs")) {
      mod.exerciseI64TruncConvert((float)p[0], p[1]);
    }

    mod.exerciseI64EdgeCases();

    W2l.DumpCRC(memBuffer);
  }
}
