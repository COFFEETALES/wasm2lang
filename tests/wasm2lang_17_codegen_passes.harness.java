// Java test harness for wasm2lang_17_codegen_passes.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "fused_while_limits")) {
        mod.exerciseFusedWhile(v.intValue());
    }

    for (Double v : w2lFlat(_data, "fused_break_inputs")) {
        mod.exerciseFusedBreakFromIf(v.intValue());
    }

    for (java.util.List<Double> triple : w2lNested(_data, "nested_while_triples")) {
        mod.exerciseNestedWhile(triple.get(0).intValue(), triple.get(1).intValue(), triple.get(2).intValue());
    }

    for (Double v : w2lFlat(_data, "while_continue_limits")) {
        mod.exerciseWhileWithContinue(v.intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "distant_exit_pairs")) {
        mod.exerciseDistantExit(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "do_while_break_starts")) {
        mod.exerciseDoWhileBreak(v.intValue());
    }

    for (Double v : w2lFlat(_data, "fused_do_while_inputs")) {
        mod.exerciseFusedDoWhile(v.intValue());
    }

    for (java.util.List<Double> triple : w2lNested(_data, "multi_break_triples")) {
        mod.exerciseMultiBreak(triple.get(0).intValue(), triple.get(1).intValue(), triple.get(2).intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "if_else_pairs")) {
        mod.exerciseIfElseSimple(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "if_else_kept_pairs")) {
        mod.exerciseIfElseKeptLabel(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "switch_requires_label_indices")) {
        mod.exerciseSwitchRequiresLabel(v.intValue());
    }

    for (java.util.List<Double> triple : w2lNested(_data, "non_wrapping_dispatch_triples")) {
        mod.exerciseNonWrappingDispatch(triple.get(0).intValue(), triple.get(1).intValue(), triple.get(2).intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "wrapping_dispatch_epilogue_pairs")) {
        mod.exerciseWrappingDispatchEpilogue(pair.get(0).intValue(), pair.get(1).intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
