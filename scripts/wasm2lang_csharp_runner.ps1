# wasm2lang C# test runner (pwsh 7+).
#
# Compiles, in one Add-Type compilation: the W2l helper class below, the
# generated <testname>.cs (WasmMemBuffer factory + WasmModule class), and the
# <testname>.harness.cs (a W2lHarness static class), then invokes
# [W2lHarness]::Run().  One fresh pwsh process per test — Add-Type types
# cannot be redefined within a session.
#
# Mirrors scripts/wasm2lang_java_runner.jsh: shared-data JSON loading with
# variant-suffix stripping, zlib-compatible CRC32 memory dump, and source
# readback for structural assertions.  Output is forced to LF so diffs
# against the LF-canonical .v8.wasm.out pass on Windows.

param([Parameter(Mandatory = $true)][string]$TestName)

$ErrorActionPreference = 'Stop'

$helpers = @'
public static class W2l {
  public static string TestName = "";
  static System.IO.StreamWriter stdout_;
  static System.Text.Json.JsonDocument data_;

  public static void Init(string testName) {
    TestName = testName;
    stdout_ = new System.IO.StreamWriter(System.Console.OpenStandardOutput());
    stdout_.NewLine = "\n";
    stdout_.AutoFlush = true;
    System.Console.SetOut(stdout_);
    string baseName = testName.Contains("/") ? testName.Substring(testName.LastIndexOf('/') + 1) : testName;
    baseName = System.Text.RegularExpressions.Regex.Replace(
      baseName, "_(baseline|codegen|none|prenorm|nopre|nomangle|codegen_max|prenorm_max)$", "");
    try {
      data_ = System.Text.Json.JsonDocument.Parse(System.IO.File.ReadAllText(baseName + ".shared.data.json"));
    } catch (System.Exception) {
      data_ = null;
    }
  }

  public static void Print(string s) {
    System.Console.Write(s);
  }

  public static System.Collections.Generic.List<double> Flat(string key) {
    var list = new System.Collections.Generic.List<double>();
    System.Text.Json.JsonElement arr;
    if (data_ == null || !data_.RootElement.TryGetProperty(key, out arr)) return list;
    foreach (var v in arr.EnumerateArray()) list.Add(v.GetDouble());
    return list;
  }

  public static System.Collections.Generic.List<System.Collections.Generic.List<double>> Nested(string key) {
    var list = new System.Collections.Generic.List<System.Collections.Generic.List<double>>();
    System.Text.Json.JsonElement arr;
    if (data_ == null || !data_.RootElement.TryGetProperty(key, out arr)) return list;
    foreach (var row in arr.EnumerateArray()) {
      var inner = new System.Collections.Generic.List<double>();
      foreach (var v in row.EnumerateArray()) inner.Add(v.GetDouble());
      list.Add(inner);
    }
    return list;
  }

  public static void DumpCRC(byte[] buf) {
    uint crc = 0xFFFFFFFFu;
    for (int i = 0; i < buf.Length; i++) {
      crc ^= buf[i];
      for (int b = 0; b < 8; b++) {
        crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
      }
    }
    crc ^= 0xFFFFFFFFu;
    System.Console.Write("Memory CRC32: 0x" + crc.ToString("x8") + "\n");
  }

  public static string ReadSource() {
    try {
      return System.IO.File.ReadAllText(TestName + ".cs");
    } catch (System.Exception) {
      return "";
    }
  }
}
'@

$module = Get-Content -Raw "$TestName.cs"
$harness = Get-Content -Raw "$TestName.harness.cs"

# -IgnoreWarnings: generated trap statements (throw after goto/return) emit
# benign CS0162 unreachable-code warnings that Add-Type would otherwise
# surface as errors.
Add-Type -TypeDefinition ($helpers + "`n" + $module + "`n" + $harness) -Language CSharp `
  -IgnoreWarnings -WarningAction SilentlyContinue

[W2l]::Init($TestName)
[W2lHarness]::Run()
