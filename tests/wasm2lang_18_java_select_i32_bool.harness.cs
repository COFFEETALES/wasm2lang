// C# regression harness for i32 select arms emitted from comparisons.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Mirrors .harness.java.  This leg existing at all is the pin: the
// select-with-boolean-arms shapes used to emit bool/int-mixed ternaries that
// did not compile (CS0029/CS0173), and no C# variant ever built this module,
// so the defect was invisible to the suite (fixed 2026-08-07 by coercing
// both ternary arms in the shared class-backend leave emitter).

public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();

    var mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();
    mod.exerciseSelectI32BooleanArms();
    W2l.DumpCRC(memBuffer);
  }
}
