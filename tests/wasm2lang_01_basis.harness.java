// Java test harness for wasm2lang_01_basis.
//
// Loaded by jshell after wasm2lang_java_runner.jsh (which defines w2l*
// helpers) and the generated .java file (which defines memBuffer and
// WasmModule).  Instantiates the module, calls exported functions,
// and prints segment data — mirroring the .harness.mjs / .harness.php files.

{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();
    foreign.put("hostOnBufferReady", (Runnable) () -> {
        StringBuilder sb = new StringBuilder();
        for (int i = 128; i < memBuffer.capacity(); i++) {
            byte b = memBuffer.get(i);
            if (b == 0) break;
            sb.append((char)(b & 0xFF));
        }
        System.out.print(sb.toString());
    });

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.emitSegmentsToHost();
    mod.alignHeapTop();

    // Load shared edge-case corpus.
    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    // MVP ops — shared i32/f32/f64 triples.
    for (java.util.List<Double> t : w2lNested(_data, "i32_f32_f64_triples")) {
        mod.exerciseMVPOps(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    mod.exerciseOverflowOps();
    mod.exerciseEdgeCases();

    // br_table dispatch — shared branch indices.
    for (Double v : w2lFlat(_data, "branch_indices")) {
        mod.exerciseBrTable(v.intValue());
    }

    // br_table with loop target — shared countdown values.
    for (Double v : w2lFlat(_data, "loop_countdown_values")) {
        mod.exerciseBrTableLoop(v.intValue());
    }

    // Counted loop — shared loop pairs.
    for (java.util.List<Double> p : w2lNested(_data, "loop_pairs")) {
        mod.exerciseCountedLoop(p.get(0).intValue(), p.get(1).intValue());
    }

    // Do-while countdown — shared do-while values.
    for (Double v : w2lFlat(_data, "do_while_values")) {
        mod.exerciseDoWhileLoop(v.intValue());
    }

    // Do-while variant — function-specific scenarios.
    for (int[] scenario : new int[][] {{1, 10}, {3, 1}, {7, 0}, {2, 4}}) {
        mod.exerciseDoWhileVariantA(scenario[0], scenario[1]);
    }

    // Nested loop + switch dispatch — function-specific scenarios.
    for (int[] scenario : new int[][] {{0, 0}, {1, 0}, {3, 0}, {3, 2}, {4, -1}}) {
        mod.exerciseNestedLoops(scenario[0], scenario[1]);
    }

    // Loop state machine — shared i32 triples.
    for (java.util.List<Double> t : w2lNested(_data, "i32_triples")) {
        mod.exerciseSwitchInLoop(t.get(0).intValue(), t.get(1).intValue(), t.get(2).intValue());
    }

    // br_table with duplicate targets — function-specific (differs from branch_indices).
    for (int index : new int[] {0, 1, 2, 3, 4, 5, -1, 99}) {
        mod.exerciseBrTableMultiTarget(index);
    }

    // Nested switches — function-specific scenarios.
    for (int[] scenario : new int[][] {{0, 0}, {0, 1}, {0, -1}, {0, 5}, {1, 0}, {2, 0}, {-1, 0}, {9, 0}}) {
        mod.exerciseNestedSwitch(scenario[0], scenario[1]);
    }

    // br_table with an internal default target — function-specific subset.
    for (int index : new int[] {0, 1, 2, 3, -1, 99}) {
        mod.exerciseSwitchDefaultInternal(index);
    }

    // Multi-exit loop + switch — function-specific scenarios.
    for (int[] scenario : new int[][] {{0, 0}, {0, 50}, {1, 1}, {2, -5}, {2, 5}, {3, 7}, {-1, 42}, {9, 42}}) {
        mod.exerciseMultiExitSwitchLoop(scenario[0], scenario[1]);
    }

    // Conditional escape loop + switch — function-specific scenarios.
    for (int[] scenario : new int[][] {{10, 0}, {30, 0}, {1, 0}, {0, 5}, {-10, 2}, {60, 2}, {5, -1}}) {
        mod.exerciseSwitchConditionalEscape(scenario[0], scenario[1]);
    }

    // Nested arithmetic trees — shared i32 values.
    for (Double v : w2lFlat(_data, "i32_values")) {
        mod.exerciseNestedArithmetic(v.intValue());
    }

    // Memory-driven arithmetic — shared i32 pairs.
    for (java.util.List<Double> p : w2lNested(_data, "i32_pairs")) {
        mod.exerciseMemoryArithmetic(p.get(0).intValue(), p.get(1).intValue());
    }

    // Mixed-type chains — first 4 shared mixed-type cases.
    java.util.List<java.util.List<Double>> _mtc = w2lNested(_data, "mixed_type_cases");
    for (int _i = 0; _i < 4 && _i < _mtc.size(); ++_i) {
        java.util.List<Double> t = _mtc.get(_i);
        mod.exerciseMixedTypeChains(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    // Edge arithmetic — no parameters.
    mod.exerciseEdgeArithmetic();

    // Mixed-width loads — shared subword cases.
    for (java.util.List<Double> p : w2lNested(_data, "subword_cases")) {
        mod.exerciseMixedWidthLoads(p.get(0).intValue(), p.get(1).intValue());
    }

    // Load-to-float — function-specific pairs (differs from subword_cases).
    for (int[] scenario : new int[][] {{42, 7}, {0, 0}, {-1, 1}, {0x12345678, -100}, {255, 256}, {-128, 127}}) {
        mod.exerciseLoadToFloat(scenario[0], scenario[1]);
    }

    // Cross-type pipeline — shared mixed-type cases.
    for (java.util.List<Double> t : _mtc) {
        mod.exerciseCrossTypePipeline(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    // Sub-word store/reload — shared subword cases.
    for (java.util.List<Double> p : w2lNested(_data, "subword_cases")) {
        mod.exerciseSubWordStoreReload(p.get(0).intValue(), p.get(1).intValue());
    }

    // Precision and reinterpret — shared mixed-type cases.
    for (java.util.List<Double> t : _mtc) {
        mod.exercisePrecisionAndReinterpret(t.get(0).intValue(), t.get(1).floatValue(), t.get(2));
    }

    w2lDumpCRC(memBuffer);
}

/exit
