// Java test harness for wasm2lang_01_segments.
//
// Loaded by jshell after wasm2lang_java_runner.jsh (which defines w2l*
// helpers) and the generated .java file (which defines memBuffer and
// WasmModule).  Instantiates the module, calls exported functions,
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

    w2lDumpCRC(memBuffer);
}

/exit
