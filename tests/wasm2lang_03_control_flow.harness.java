{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "branch_indices")) {
        mod.exerciseBrTable(v.intValue());
    }
    for (Double v : w2lFlat(_data, "loop_countdown_values")) {
        mod.exerciseBrTableLoop(v.intValue());
    }
    for (java.util.List<Double> p : w2lNested(_data, "loop_pairs")) {
        mod.exerciseCountedLoop(p.get(0).intValue(), p.get(1).intValue());
    }
    for (Double v : w2lFlat(_data, "do_while_values")) {
        mod.exerciseDoWhileLoop(v.intValue());
    }
    for (int[] scenario : new int[][] {{1, 10}, {3, 1}, {7, 0}, {2, 4}}) {
        mod.exerciseDoWhileVariantA(scenario[0], scenario[1]);
    }
    for (int[] scenario : new int[][] {{0, 0}, {1, 0}, {3, 0}, {3, 2}, {4, -1}}) {
        mod.exerciseNestedLoops(scenario[0], scenario[1]);
    }
    for (java.util.List<Double> t : w2lNested(_data, "i32_triples")) {
        mod.exerciseSwitchInLoop(t.get(0).intValue(), t.get(1).intValue(), t.get(2).intValue());
    }
    for (int index : new int[] {0, 1, 2, 3, 4, 5, -1, 99}) {
        mod.exerciseBrTableMultiTarget(index);
    }
    for (int[] scenario : new int[][] {{0, 0}, {0, 1}, {0, -1}, {0, 5}, {1, 0}, {2, 0}, {-1, 0}, {9, 0}}) {
        mod.exerciseNestedSwitch(scenario[0], scenario[1]);
    }
    for (int index : new int[] {0, 1, 2, 3, -1, 99}) {
        mod.exerciseSwitchDefaultInternal(index);
    }
    for (int[] scenario : new int[][] {{0, 0}, {0, 50}, {1, 1}, {2, -5}, {2, 5}, {3, 7}, {-1, 42}, {9, 42}}) {
        mod.exerciseMultiExitSwitchLoop(scenario[0], scenario[1]);
    }
    for (int[] scenario : new int[][] {{10, 0}, {30, 0}, {1, 0}, {0, 5}, {-10, 2}, {60, 2}, {5, -1}}) {
        mod.exerciseSwitchConditionalEscape(scenario[0], scenario[1]);
    }

    w2lDumpCRC(memBuffer);
}

/exit
