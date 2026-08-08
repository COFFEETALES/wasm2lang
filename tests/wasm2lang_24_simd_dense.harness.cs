// Dense SIMD128 module (C#).
//
// Enumerates the module's own exports rather than listing them; see the .mjs
// harness for why.  StringComparer.Ordinal, not the culture-aware default: the
// other two harnesses sort by code unit, and a culture-aware sort would order
// the same ASCII names differently and turn every line into a diff.
public static class W2lHarness {
  public static void Run() {
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();
    var mod = new WasmModule(foreign, memBuffer);
    var exports = new System.Collections.Generic.List<System.Reflection.MethodInfo>();
    foreach (var m in typeof(WasmModule).GetMethods(
                 System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic |
                 System.Reflection.BindingFlags.Instance)) {
      if (m.GetParameters().Length == 0 && m.ReturnType == typeof(int) && m.Name.StartsWith("t_")) exports.Add(m);
    }
    exports.Sort((a, b) => System.StringComparer.Ordinal.Compare(a.Name, b.Name));
    System.Console.WriteLine("exports=" + exports.Count);
    foreach (var m in exports) System.Console.WriteLine(m.Name + "=" + m.Invoke(mod, null));
    W2l.DumpCRC(memBuffer);
  }
}
