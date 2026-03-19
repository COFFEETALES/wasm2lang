// Java test harness for wasm2lang_04_arithmetic.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "i32_values")) {
        mod.exerciseNestedArithmetic(v.intValue());
    }

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseMemoryArithmetic(p.get(0).intValue(), p.get(1).intValue());
    }

    java.util.List<java.util.List<Double>> _mtc = w2lNested(_data, "mixed_type_cases");
    for (int _i = 0; _i < 4 && _i < _mtc.size(); ++_i) {
        java.util.List<Double> t = _mtc.get(_i);
        mod.exerciseMixedTypeChains(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    mod.exerciseEdgeArithmetic();

    w2lDumpCRC(memBuffer);
}

/exit
