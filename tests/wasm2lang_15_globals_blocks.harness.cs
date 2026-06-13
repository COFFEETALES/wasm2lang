// C# test harness for wasm2lang_15_globals_blocks.
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

    foreach (var pair in W2l.Nested("global_pairs")) {
      mod.exerciseGlobals((int)pair[0], (int)pair[1]);
    }

    mod.exerciseFind2D();

    foreach (var triple in W2l.Nested("validation_triples")) {
      mod.exerciseValidation((int)triple[0], (int)triple[1], (int)triple[2]);
    }

    foreach (var triple in W2l.Nested("if_expr_triples")) {
      mod.exerciseIfExpressions((int)triple[0], (int)triple[1], (int)triple[2]);
    }

    foreach (var n in W2l.Flat("mutual_recursion_inputs")) {
      mod.exerciseMutualRecursion((int)n);
    }

    foreach (var n in W2l.Flat("drop_inputs")) {
      mod.exerciseDrop((int)n);
    }

    W2l.DumpCRC(memBuffer);
  }
}
