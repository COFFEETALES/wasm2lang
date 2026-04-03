// Java test harness for wasm2lang_14_simd.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> q : w2lNested(_data, "quads")) {
        mod.exerciseSIMDLanes(q.get(0).intValue(), q.get(1).intValue(), q.get(2).intValue(), q.get(3).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "pairs")) {
        mod.exerciseSIMDArithmetic(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "pairs")) {
        mod.exerciseSIMDBitwise(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "shift_pairs")) {
        mod.exerciseSIMDShift(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "pairs")) {
        mod.exerciseSIMDCompare(p.get(0).intValue(), p.get(1).intValue());
    }
    for (java.util.List<Double> q : w2lNested(_data, "quads")) {
        mod.exerciseSIMDShuffle(q.get(0).intValue(), q.get(1).intValue(), q.get(2).intValue(), q.get(3).intValue());
    }
    for (java.util.List<Double> q : w2lNested(_data, "quads")) {
        mod.exerciseSIMDMemory(q.get(0).intValue(), q.get(1).intValue(), q.get(2).intValue(), q.get(3).intValue());
    }

    mod.exerciseSIMDEdgeCases();

    w2lDumpCRC(memBuffer);
}

/exit
