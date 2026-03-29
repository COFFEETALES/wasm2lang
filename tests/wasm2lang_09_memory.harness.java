// Java test harness for wasm2lang_09_memory.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();
    mod.exerciseBulkMemory(mod.getHeapTop());
    mod.exerciseMemoryGrow();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> p : w2lNested(_data, "bulk_params")) {
        mod.exerciseBulkFillVerify(mod.getHeapTop(), p.get(0).intValue(), p.get(1).intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
