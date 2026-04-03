// Java test harness for wasm2lang_13_i64_casts.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    foreign.put("i64_to_f32", (java.util.function.LongToDoubleFunction)(long x) -> (float) x);
    foreign.put("i64_to_f64", (java.util.function.LongToDoubleFunction)(long x) -> (double) x);
    foreign.put("f32_to_i64", (java.util.function.DoubleToLongFunction)(double x) -> (long) x);
    foreign.put("f64_to_i64", (java.util.function.DoubleToLongFunction)(double x) -> (long) x);

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> t : w2lNested(_data, "cast_triples")) {
        mod.exerciseI64Casts(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    mod.exerciseI64CastEdgeCases();

    w2lDumpCRC(memBuffer);
}

/exit
