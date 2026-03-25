// Java test harness for wasm2lang_06_ftable.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseDispatchPair(p.get(0).intValue(), p.get(1).intValue());
    }

    for (java.util.List<Double> p : w2lNested(_data, "float_pairs")) {
        mod.exerciseFloatPair(p.get(0).intValue(), p.get(1).intValue());
    }

    for (java.util.List<Double> t : w2lNested(_data, "i32_triples")) {
        mod.exerciseTriple(t.get(0).intValue(), t.get(1).intValue(), t.get(2).intValue());
    }

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseChained(p.get(0).intValue(), p.get(1).intValue());
    }

    mod.exerciseEdgeCases();

    for (java.util.List<Double> d : w2lNested(_data, "dynamic_dispatch")) {
        mod.exerciseDynamicIndex(d.get(0).intValue(), d.get(1).intValue(), d.get(2).intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
