// Java test harness for wasm2lang_02_mvp_ops.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    // MVP ops — shared i32/f32/f64 triples.
    for (java.util.List<Double> t : w2lNested(_data, "i32_f32_f64_triples")) {
        mod.exerciseMVPOps(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    mod.exerciseOverflowOps();
    mod.exerciseEdgeCases();

    w2lDumpCRC(memBuffer);
}

/exit
