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

    // Trunc/convert chains with wide-range random float input.
    for (java.util.List<Double> p : w2lNested(_data, "trunc_convert_pairs")) {
        mod.exerciseTruncConvert(p.get(0).floatValue(), p.get(1));
    }

    mod.exerciseOverflowOps();
    mod.exerciseEdgeCases();

    // Exported mutable global: exercise via getter/setter and function.
    mod.counter$set(42);
    mod.exerciseGlobalExports(mod.counter());
    mod.counter$set(100);
    mod.exerciseGlobalExports(mod.counter());

    w2lDumpCRC(memBuffer);
}

/exit
