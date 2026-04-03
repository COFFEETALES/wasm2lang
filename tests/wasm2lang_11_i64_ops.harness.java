// Java test harness for wasm2lang_11_i64_ops.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseI64Arithmetic(p.get(0).intValue(), p.get(1).intValue());
    }

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseI64Bitwise(p.get(0).intValue(), p.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "i32_values")) {
        mod.exerciseI64Unary(v.intValue());
    }

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseI64Comparison(p.get(0).intValue(), p.get(1).intValue());
    }

    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseI64Memory(p.get(0).intValue(), p.get(1).intValue());
    }

    for (java.util.List<Double> t : w2lNested(_data, "conversion_cases")) {
        mod.exerciseI64Conversions(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    for (java.util.List<Double> p : w2lNested(_data, "trunc_convert_pairs")) {
        mod.exerciseI64TruncConvert(p.get(0).floatValue(), p.get(1));
    }

    mod.exerciseI64EdgeCases();

    w2lDumpCRC(memBuffer);
}

/exit
