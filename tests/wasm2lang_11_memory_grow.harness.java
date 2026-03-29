// Java test harness for wasm2lang_11_memory_grow.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();
    mod.exerciseMemoryGrow();

    w2lDumpCRC(memBuffer);
}

/exit
