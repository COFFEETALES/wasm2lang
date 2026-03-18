// Java test harness for wasm2lang_01_basis.
//
// Loaded by jshell after the generated .java file (which defines memBuffer
// and class WasmModule).  Instantiates the module, calls exported functions,
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

    // Primary parameter set.
    mod.exerciseMVPOps(42, 3.5f, 2.75);

    // Edge-case parameter sets.
    mod.exerciseMVPOps(0, 0.0f, 0.0);
    mod.exerciseMVPOps(-1, 0.5f, 0.5);
    mod.exerciseMVPOps(2147483647, 100.0f, 100.0);

    // Additional parameter sets.
    mod.exerciseMVPOps(1, 1.0f, 1.0);
    mod.exerciseMVPOps(-2147483648, 3.0f, 3.0);
    mod.exerciseMVPOps(255, 0.125f, 0.125);
    mod.exerciseMVPOps(16, 4.0f, 4.0);

    mod.exerciseOverflowOps();
    mod.exerciseEdgeCases();

    // br_table dispatch: direct cases, default, and adversarial indices.
    for (int index : new int[] {0, 1, 2, 3, 4, -1, 99, Integer.MIN_VALUE}) {
        mod.exerciseBrTable(index);
    }

    // br_table with loop target: positive countdowns and already-terminal starts.
    for (int startCount : new int[] {5, 2, 1, 0, -3, 9}) {
        mod.exerciseBrTableLoop(startCount);
    }

    // Counted loop: forward ranges, empty ranges, reverse ranges, and negatives.
    for (int[] scenario : new int[][] {{0, 5}, {2, 2}, {-2, 3}, {5, 1}, {7, 8}}) {
        mod.exerciseCountedLoop(scenario[0], scenario[1]);
    }

    // Do-while countdown: normal factorial path and non-positive entry values.
    for (int countdownStart : new int[] {5, 1, 0, -3}) {
        mod.exerciseDoWhileLoop(countdownStart);
    }

    // Do-while variant: long, short, and zero-budget entries.
    for (int[] scenario : new int[][] {{1, 10}, {3, 1}, {7, 0}, {2, 4}}) {
        mod.exerciseDoWhileVariantA(scenario[0], scenario[1]);
    }

    // Nested loop + switch dispatch: empty outer loop, direct default, and alternating resets.
    for (int[] scenario : new int[][] {{0, 0}, {1, 0}, {3, 0}, {3, 2}, {4, -1}}) {
        mod.exerciseNestedLoops(scenario[0], scenario[1]);
    }

    // Loop state machine: multi-step transitions, direct case 2, terminal, and default exits.
    for (int[] scenario : new int[][] {{0, 0, 3}, {0, 20, 5}, {2, 9, 4}, {3, 7, 2}, {4, 99, 9}, {-1, 5, 1}}) {
        mod.exerciseSwitchInLoop(scenario[0], scenario[1], scenario[2]);
    }

    // br_table with duplicate targets: shared targets and default routing.
    for (int index : new int[] {0, 1, 2, 3, 4, 5, -1, 99}) {
        mod.exerciseBrTableMultiTarget(index);
    }

    // Nested switches: inner defaults, outer defaults, and outer non-zero cases.
    for (int[] scenario : new int[][] {{0, 0}, {0, 1}, {0, -1}, {0, 5}, {1, 0}, {2, 0}, {-1, 0}, {9, 0}}) {
        mod.exerciseNestedSwitch(scenario[0], scenario[1]);
    }

    // br_table with an internal default target.
    for (int index : new int[] {0, 1, 2, 3, -1, 99}) {
        mod.exerciseSwitchDefaultInternal(index);
    }

    // Multi-exit loop + switch: completed, alternate, and default-driven exits.
    for (int[] scenario : new int[][] {{0, 0}, {0, 50}, {1, 1}, {2, -5}, {2, 5}, {3, 7}, {-1, 42}, {9, 42}}) {
        mod.exerciseMultiExitSwitchLoop(scenario[0], scenario[1]);
    }

    // Conditional escape loop + switch: looping, immediate default exits, and direct escape checks.
    for (int[] scenario : new int[][] {{10, 0}, {30, 0}, {1, 0}, {0, 5}, {-10, 2}, {60, 2}, {5, -1}}) {
        mod.exerciseSwitchConditionalEscape(scenario[0], scenario[1]);
    }

    // Nested arithmetic trees: deeply nested i32 expressions.
    for (int a : new int[] {42, 0, -1, 2147483647, 1, 255, -100}) {
        mod.exerciseNestedArithmetic(a);
    }

    // Memory-driven arithmetic: store/load/compute chains.
    for (int[] scenario : new int[][] {{42, 7}, {0, 0}, {-1, 1}, {0x12345678, -100}, {255, 256}}) {
        mod.exerciseMemoryArithmetic(scenario[0], scenario[1]);
    }

    // Mixed-type chains: cross-type conversions and arithmetic.
    mod.exerciseMixedTypeChains(42, 3.5f, 2.75);
    mod.exerciseMixedTypeChains(0, 0.0f, 0.0);
    mod.exerciseMixedTypeChains(-1, -1.5f, -1.5);
    mod.exerciseMixedTypeChains(100, 0.125f, 100.0);

    // Edge arithmetic: overflow, boundary, and identity tests.
    mod.exerciseEdgeArithmetic();

    // Mixed-width loads: signed/unsigned byte and halfword arithmetic.
    for (int[] scenario : new int[][] {{42, 7}, {0, 0}, {-1, 1}, {0x12345678, -100}, {255, 128}, {-128, -1}}) {
        mod.exerciseMixedWidthLoads(scenario[0], scenario[1]);
    }

    // Load-to-float: memory loads converted to f32/f64 and combined.
    for (int[] scenario : new int[][] {{42, 7}, {0, 0}, {-1, 1}, {0x12345678, -100}, {255, 256}, {-128, 127}}) {
        mod.exerciseLoadToFloat(scenario[0], scenario[1]);
    }

    // Cross-type pipeline: deep multi-stage mixed-type pipelines.
    mod.exerciseCrossTypePipeline(42, 3.5f, 2.75);
    mod.exerciseCrossTypePipeline(0, 0.0f, 0.0);
    mod.exerciseCrossTypePipeline(-1, -1.5f, -1.5);
    mod.exerciseCrossTypePipeline(100, 0.125f, 100.0);
    mod.exerciseCrossTypePipeline(255, 10.0f, -50.0);

    // Sub-word store/reload: store8/store16 computed values, byte-assembly, multi-stage chains.
    for (int[] scenario : new int[][] {{42, 7}, {0, 0}, {-1, 1}, {0x12345678, -100}, {255, 128}, {-128, -1}}) {
        mod.exerciseSubWordStoreReload(scenario[0], scenario[1]);
    }

    // Precision and reinterpret: f32 precision boundaries, fractional truncation, reinterpret chains.
    mod.exercisePrecisionAndReinterpret(42, 3.5f, 2.75);
    mod.exercisePrecisionAndReinterpret(0, 0.0f, 0.0);
    mod.exercisePrecisionAndReinterpret(-1, -1.5f, -1.5);
    mod.exercisePrecisionAndReinterpret(100, 0.125f, 100.0);
    mod.exercisePrecisionAndReinterpret(255, 10.0f, -50.0);
}
