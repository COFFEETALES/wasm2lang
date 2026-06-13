// C# test harness for wasm2lang_03_control_flow.
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

    // br_table dispatch — shared branch indices.
    foreach (var v in W2l.Flat("branch_indices")) {
      mod.exerciseBrTable((int)v);
    }

    // br_table with loop target — shared countdown values.
    foreach (var v in W2l.Flat("loop_countdown_values")) {
      mod.exerciseBrTableLoop((int)v);
    }

    // Counted loop — shared loop pairs.
    foreach (var p in W2l.Nested("loop_pairs")) {
      mod.exerciseCountedLoop((int)p[0], (int)p[1]);
    }

    // Do-while countdown — shared do-while values.
    foreach (var v in W2l.Flat("do_while_values")) {
      mod.exerciseDoWhileLoop((int)v);
    }

    // Do-while variant — function-specific scenarios.
    foreach (var scenario in new int[][] { new int[] {1, 10}, new int[] {3, 1}, new int[] {7, 0}, new int[] {2, 4} }) {
      mod.exerciseDoWhileVariantA(scenario[0], scenario[1]);
    }

    // Nested loop + switch dispatch
    foreach (var scenario in new int[][] { new int[] {0, 0}, new int[] {1, 0}, new int[] {3, 0}, new int[] {3, 2}, new int[] {4, -1} }) {
      mod.exerciseNestedLoops(scenario[0], scenario[1]);
    }

    // Loop state machine — shared i32 triples.
    foreach (var t in W2l.Nested("i32_triples")) {
      mod.exerciseSwitchInLoop((int)t[0], (int)t[1], (int)t[2]);
    }

    // br_table with duplicate targets
    foreach (var index in new int[] {0, 1, 2, 3, 4, 5, -1, 99}) {
      mod.exerciseBrTableMultiTarget(index);
    }

    // Nested switches
    foreach (var scenario in new int[][] { new int[] {0, 0}, new int[] {0, 1}, new int[] {0, -1}, new int[] {0, 5}, new int[] {1, 0}, new int[] {2, 0}, new int[] {-1, 0}, new int[] {9, 0} }) {
      mod.exerciseNestedSwitch(scenario[0], scenario[1]);
    }

    // br_table with an internal default target
    foreach (var index in new int[] {0, 1, 2, 3, -1, 99}) {
      mod.exerciseSwitchDefaultInternal(index);
    }

    // Multi-exit loop + switch
    foreach (var scenario in new int[][] { new int[] {0, 0}, new int[] {0, 50}, new int[] {1, 1}, new int[] {2, -5}, new int[] {2, 5}, new int[] {3, 7}, new int[] {-1, 42}, new int[] {9, 42} }) {
      mod.exerciseMultiExitSwitchLoop(scenario[0], scenario[1]);
    }

    // Conditional escape loop + switch
    foreach (var scenario in new int[][] { new int[] {10, 0}, new int[] {30, 0}, new int[] {1, 0}, new int[] {0, 5}, new int[] {-10, 2}, new int[] {60, 2}, new int[] {5, -1} }) {
      mod.exerciseSwitchConditionalEscape(scenario[0], scenario[1]);
    }

    W2l.DumpCRC(memBuffer);
  }
}
