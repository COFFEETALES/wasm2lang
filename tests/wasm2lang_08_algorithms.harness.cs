// C# test harness for wasm2lang_08_algorithms.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Instantiates the module, calls exported functions, and dumps the memory
// CRC — mirroring the .harness.java / .harness.mjs / .harness.php files.

public static class W2lHarness {
  // String-valued shared-data lists (string_inputs / crc32_inputs) are not
  // covered by W2l.Flat / W2l.Nested (double-only), so read them straight
  // from the shared-data JSON, deriving the basename exactly like W2l.Init.
  static System.Collections.Generic.List<string> Strings(string key) {
    var list = new System.Collections.Generic.List<string>();
    string baseName = W2l.TestName.Contains("/")
        ? W2l.TestName.Substring(W2l.TestName.LastIndexOf('/') + 1)
        : W2l.TestName;
    baseName = System.Text.RegularExpressions.Regex.Replace(
        baseName, "_(baseline|codegen|none|prenorm|nopre|nomangle|codegen_max|prenorm_max)$", "");
    using (var doc = System.Text.Json.JsonDocument.Parse(
        System.IO.File.ReadAllText(baseName + ".shared.data.json"))) {
      System.Text.Json.JsonElement arr;
      if (!doc.RootElement.TryGetProperty(key, out arr)) return list;
      foreach (var v in arr.EnumerateArray()) list.Add(v.GetString());
    }
    return list;
  }

  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();

    var mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();
    mod.initCrc32Tables();

    foreach (var v in W2l.Flat("factorial_inputs")) {
      mod.exerciseFactorial((int)v);
    }

    foreach (var v in W2l.Flat("fibonacci_inputs")) {
      mod.exerciseFibonacci((int)v);
    }

    foreach (var v in W2l.Flat("collatz_inputs")) {
      mod.exerciseCollatz((int)v);
    }

    foreach (var pair in W2l.Nested("gcd_inputs")) {
      mod.exerciseGcd((int)pair[0], (int)pair[1]);
    }

    foreach (var pair in W2l.Nested("select_inputs")) {
      mod.exerciseSelect((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("bitwise_inputs")) {
      mod.exerciseBitwise((int)v);
    }

    int scratch = 1088;
    foreach (var str in Strings("string_inputs")) {
      for (int i = 0; i < str.Length; i++) {
        memBuffer[scratch + i] = (byte)str[i];
      }
      memBuffer[scratch + str.Length] = 0;
      mod.exerciseString(scratch);
    }

    foreach (var str in Strings("crc32_inputs")) {
      for (int i = 0; i < str.Length; i++) {
        memBuffer[scratch + i] = (byte)str[i];
      }
      mod.exerciseCrc32(scratch, str.Length);
    }

    mod.exerciseMemory(scratch);

    W2l.DumpCRC(memBuffer);
  }
}
