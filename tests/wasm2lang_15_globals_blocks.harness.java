// Java test harness for wasm2lang_15_globals_blocks.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (java.util.List<Double> pair : w2lNested(_data, "global_pairs")) {
        mod.exerciseGlobals(pair.get(0).intValue(), pair.get(1).intValue());
    }

    mod.exerciseFind2D();

    for (java.util.List<Double> triple : w2lNested(_data, "validation_triples")) {
        mod.exerciseValidation(triple.get(0).intValue(), triple.get(1).intValue(), triple.get(2).intValue());
    }

    for (java.util.List<Double> triple : w2lNested(_data, "if_expr_triples")) {
        mod.exerciseIfExpressions(triple.get(0).intValue(), triple.get(1).intValue(), triple.get(2).intValue());
    }

    for (Double n : w2lFlat(_data, "mutual_recursion_inputs")) {
        mod.exerciseMutualRecursion(n.intValue());
    }

    for (Double n : w2lFlat(_data, "drop_inputs")) {
        mod.exerciseDrop(n.intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
