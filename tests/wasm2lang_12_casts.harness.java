// Java test harness for wasm2lang_12_casts.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    foreign.put("i32_to_f32", (java.util.function.IntToDoubleFunction)(int x) -> (float) x);
    foreign.put("i32_to_f64", (java.util.function.IntToDoubleFunction)(int x) -> (double) x);
    foreign.put("f32_to_i32", (java.util.function.DoubleToIntFunction)(double x) -> (int) x);
    foreign.put("f64_to_i32", (java.util.function.DoubleToIntFunction)(double x) -> (int) x);

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> t : w2lNested(_data, "cast_triples")) {
        mod.exerciseI32Casts(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    mod.exerciseCastEdgeCases();

    w2lDumpCRC(memBuffer);
}

/exit
