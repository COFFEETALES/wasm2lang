// Java test harness for wasm2lang_01_basis.
//
// Loaded by jshell after the generated .java file (which defines memBuffer
// and class WasmModule).  Instantiates the module, calls exported functions,
// and prints segment data — mirroring the .harness.mjs / .harness.php files.

{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    foreign.put("hostOnBufferReady", (Runnable) () -> {
        StringBuilder sb = new StringBuilder();
        for (int i = 128; i < memBuffer.capacity(); i++) {
            byte b = memBuffer.get(i);
            if (b == 0) break;
            sb.append((char)(b & 0xFF));
        }
        System.out.print(sb.toString());
    });

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.emitSegmentsToHost();
    mod.alignHeapTop();
    mod.exerciseMVPOps(42, 3.5f, 2.75);
    mod.exerciseOverflowOps();
    mod.exerciseEdgeCases();
}
