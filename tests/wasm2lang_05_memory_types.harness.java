// Java test harness for wasm2lang_05_memory_types.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> p : w2lNested(_data, "subword_cases")) {
        mod.exerciseMixedWidthLoads(p.get(0).intValue(), p.get(1).intValue());
    }
    for (int[] scenario : new int[][] {{42, 7}, {0, 0}, {-1, 1}, {0x12345678, -100}, {255, 256}, {-128, 127}}) {
        mod.exerciseLoadToFloat(scenario[0], scenario[1]);
    }
    java.util.List<java.util.List<Double>> _mtc = w2lNested(_data, "mixed_type_cases");
    for (java.util.List<Double> t : _mtc) {
        mod.exerciseCrossTypePipeline(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }
    for (java.util.List<Double> p : w2lNested(_data, "subword_cases")) {
        mod.exerciseSubWordStoreReload(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> t : _mtc) {
        mod.exercisePrecisionAndReinterpret(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    w2lDumpCRC(memBuffer);
}

/exit
