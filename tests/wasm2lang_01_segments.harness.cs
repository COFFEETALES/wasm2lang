// C# test harness for wasm2lang_01_segments.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Instantiates the module, calls exported functions, and prints segment
// data — mirroring the .harness.java / .harness.mjs / .harness.php files.

public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();

    foreign["hostOnBufferReady"] = (System.Action)(() => {
      var sb = new System.Text.StringBuilder();
      for (int i = 128; i < memBuffer.Length; i++) {
        byte b = memBuffer[i];
        if (b == 0) break;
        sb.Append((char)(b & 0xFF));
      }
      W2l.Print(sb.ToString());
    });

    var mod = new WasmModule(foreign, memBuffer);
    mod.emitSegmentsToHost();

    W2l.DumpCRC(memBuffer);
  }
}
