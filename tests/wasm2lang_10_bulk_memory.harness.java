// Java test harness for wasm2lang_10_bulk_memory.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();
    mod.exerciseBulkMemory(mod.getHeapTop());

    w2lDumpCRC(memBuffer);
}

/exit
