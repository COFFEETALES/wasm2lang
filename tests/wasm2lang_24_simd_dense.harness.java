// Dense SIMD128 module (Java).
//
// Enumerates the module's own exports rather than listing them; see the .mjs
// harness for why.  getDeclaredMethods, not getMethods: an exported wasm
// function is emitted package-private on this backend, so the public-only view
// would find nothing and the test would pass while calling zero functions.
// The printed count is the guard against exactly that.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    WasmModule mod = new WasmModule(foreign, memBuffer);
    java.util.List<java.lang.reflect.Method> exports = new java.util.ArrayList<>();
    for (java.lang.reflect.Method m : WasmModule.class.getDeclaredMethods()) {
        if (m.getParameterCount() == 0 && m.getReturnType() == int.class && m.getName().startsWith("t_")) {
            exports.add(m);
        }
    }
    exports.sort(java.util.Comparator.comparing(java.lang.reflect.Method::getName));
    System.out.println("exports=" + exports.size());
    for (java.lang.reflect.Method m : exports) {
        m.setAccessible(true);
        System.out.println(m.getName() + "=" + m.invoke(mod));
    }
    w2lDumpCRC(memBuffer);
}

/exit
