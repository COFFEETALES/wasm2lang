// C# test harness for wasm2lang_16_lookup_tables.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Instantiates the module, calls exported functions, and dumps the memory
// CRC — mirroring the .harness.java / .harness.mjs / .harness.php files.

public static class W2lHarness {
  // String-valued shared-data lists (crc32_strings) are not covered by
  // W2l.Flat / W2l.Nested (double-only), so read them straight from the
  // shared-data JSON, deriving the basename exactly like W2l.Init.
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

    foreach (var n in W2l.Flat("square_inputs")) {
      mod.exerciseSquares((int)n);
    }

    foreach (var needle in W2l.Flat("binary_search_needles")) {
      mod.exerciseBinarySearch((int)needle);
    }

    foreach (var n in W2l.Flat("fib_memo_inputs")) {
      mod.exerciseFibMemo((int)n);
    }

    foreach (var n in W2l.Flat("bit_pattern_inputs")) {
      mod.exerciseBitPatterns((int)n);
    }

    int scratch = 1536;
    foreach (var str in Strings("crc32_strings")) {
      for (int i = 0; i < str.Length; i++) {
        memBuffer[scratch + i] = (byte)str[i];
      }
      mod.exerciseCrc32PreCalc(scratch, str.Length);
    }

    W2l.DumpCRC(memBuffer);
  }
}
