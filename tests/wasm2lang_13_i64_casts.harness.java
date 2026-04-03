// Java test harness for wasm2lang_13_i64_casts.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> t : w2lNested(_data, "cast_triples")) {
        mod.exerciseI64Casts(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
        mod.exerciseU64Casts(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    mod.exerciseI64CastEdgeCases();

    w2lDumpCRC(memBuffer);
}

/exit
