// Java test harness for wasm2lang_17_codegen_passes.

// ---------------------------------------------------------------------------
// Code structure validation helpers (Java backend)
// ---------------------------------------------------------------------------

/** Extracts the body of a method by name via brace counting. */
String w2lBodyOf(String code, String methodName) {
    int idx = code.indexOf(" " + methodName + "(");
    if (idx < 0) return null;
    int depth = 0, start = -1;
    for (int i = idx; i < code.length(); i++) {
        char c = code.charAt(i);
        if (c == '{') { if (start < 0) start = i; depth++; }
        else if (c == '}') { if (--depth == 0) return code.substring(start + 1, i); }
    }
    return null;
}

boolean w2lHasMatch(String body, String pattern) {
    return java.util.regex.Pattern.compile(pattern).matcher(body).find();
}

int w2lCountMatches(String body, String pattern) {
    java.util.regex.Matcher m = java.util.regex.Pattern.compile(pattern).matcher(body);
    int n = 0;
    while (m.find()) n++;
    return n;
}

/** Counts while( that are NOT } while( (simplified while, not do-while tail). */
int w2lCountSimplifiedWhile(String body) {
    return w2lCountMatches(body, "while\\s*\\(") - w2lCountMatches(body, "\\}\\s*while\\s*\\(");
}

{
    // ---- Code structure validation (codegen variant only) ----
    String _testName = System.getProperty("w2l.testname", "");
    if (_testName.endsWith("_codegen") || _testName.endsWith("_prenorm")) {
        String _code = w2lReadSource(_testName);
        if (_code != null && !_code.isEmpty()) {
            java.util.List<String> _f = new java.util.ArrayList<>();

            // Simplification checks only apply to the prenorm variant
            // (--pre-normalized enables backend simplifications; the codegen
            // variant verifies correctness without them).
            boolean _hasSimplifications = _testName.endsWith("_prenorm") || _testName.endsWith("_codegen");

            String b;

            if (_hasSimplifications) {
                // -- while simplification --
                b = w2lBodyOf(_code, "fusedWhileSum");
                if (b == null || w2lCountSimplifiedWhile(b) < 1)
                    _f.add("fusedWhileSum: expected while loop with condition");

                b = w2lBodyOf(_code, "fusedBreakFromNestedIf");
                if (b == null || w2lCountSimplifiedWhile(b) < 1)
                    _f.add("fusedBreakFromNestedIf: expected while loop with condition");

                b = w2lBodyOf(_code, "nestedWhileLoops");
                if (b == null || w2lCountSimplifiedWhile(b) < 2)
                    _f.add("nestedWhileLoops: expected >= 2 while loops with conditions");

                b = w2lBodyOf(_code, "whileWithInnerContinue");
                if (b == null || w2lCountSimplifiedWhile(b) < 1)
                    _f.add("whileWithInnerContinue: expected while loop with condition");

                // -- do-while --
                b = w2lBodyOf(_code, "doWhileBreakOuter");
                if (b == null || !w2lHasMatch(b, "\\bdo\\s*\\{"))
                    _f.add("doWhileBreakOuter: expected do-while loop");

                b = w2lBodyOf(_code, "fusedDoWhile");
                if (b == null || !w2lHasMatch(b, "\\bdo\\s*\\{"))
                    _f.add("fusedDoWhile: expected do-while loop");

                // -- flat switch dispatch (labeled block count < case count = flattened) --
                b = w2lBodyOf(_code, "switchRequiresLabel");
                if (b == null || w2lCountMatches(b, "\\w+\\s*:\\s*\\{") >= w2lCountMatches(b, "\\bcase\\s+\\d+\\s*:"))
                    _f.add("switchRequiresLabel: expected flat switch (fewer labeled blocks than cases)");

                b = w2lBodyOf(_code, "nonWrappingDispatch");
                if (b == null || w2lCountMatches(b, "\\w+\\s*:\\s*\\{") >= w2lCountMatches(b, "\\bcase\\s+\\d+\\s*:"))
                    _f.add("nonWrappingDispatch: expected flat switch (fewer labeled blocks than cases)");

                b = w2lBodyOf(_code, "wrappingDispatchEpilogue");
                if (b == null || w2lCountMatches(b, "\\w+\\s*:\\s*\\{") >= w2lCountMatches(b, "\\bcase\\s+\\d+\\s*:"))
                    _f.add("wrappingDispatchEpilogue: expected flat switch (fewer labeled blocks than cases)");

                b = w2lBodyOf(_code, "terminatorDispatch");
                if (b == null || w2lCountMatches(b, "\\w+\\s*:\\s*\\{") >= w2lCountMatches(b, "\\bcase\\s+\\d+\\s*:"))
                    _f.add("terminatorDispatch: expected flat switch (fewer labeled blocks than cases)");

                // -- redundant block removal --
                b = w2lBodyOf(_code, "redundantLoopBlock");
                if (b == null || w2lCountSimplifiedWhile(b) < 1)
                    _f.add("redundantLoopBlock: expected while loop with condition");

                // -- multi-guard while (compound condition) --
                b = w2lBodyOf(_code, "multiGuardWhile");
                if (b == null || w2lCountSimplifiedWhile(b) < 1)
                    _f.add("multiGuardWhile: expected while loop with compound condition");

                // -- switch label elision (no labeled block wrapping the switch) --
                b = w2lBodyOf(_code, "switchNoLabel");
                if (b != null) {
                    if (w2lCountMatches(b, "\\bcase\\s+\\d+\\s*:") < 2)
                        _f.add("switchNoLabel: expected flat switch with cases");
                    if (w2lCountMatches(b, "\\w+\\s*:\\s*switch\\s*\\(") > 0)
                        _f.add("switchNoLabel: expected switch without label prefix");
                } else {
                    _f.add("switchNoLabel: function body not found");
                }

                // -- fused for loop label elision --
                b = w2lBodyOf(_code, "fusedForNoLabel");
                if (b != null) {
                    if (!w2lHasMatch(b, "\\bfor\\s*\\("))
                        _f.add("fusedForNoLabel: expected for loop");
                    if (w2lCountMatches(b, "\\w+\\s*:\\s*for\\s*\\(") > 0)
                        _f.add("fusedForNoLabel: expected for loop without label prefix");
                } else {
                    _f.add("fusedForNoLabel: function body not found");
                }
            }

            // -- if-else recovery (IR restructuring, always active) --
            b = w2lBodyOf(_code, "ifElseSimple");
            if (b == null || !w2lHasMatch(b, "\\}\\s*else\\s*\\{"))
                _f.add("ifElseSimple: expected if/else structure");

            // -- guard elision (IR restructuring, always active) --
            b = w2lBodyOf(_code, "guardElisionProduct");
            if (b == null || w2lHasMatch(b, "\\w+\\s*:\\s*\\{"))
                _f.add("guardElisionProduct: expected guard elision (no labeled block)");

            // -- local init folding (always active) --
            b = w2lBodyOf(_code, "localInitFolding");
            if (b != null) {
                if (!w2lHasMatch(b, "int\\s+[\\w$]+\\s*=\\s*10\\s*;"))
                    _f.add("localInitFolding: expected int declaration with value 10");
                if (!w2lHasMatch(b, "int\\s+[\\w$]+\\s*=\\s*20\\s*;"))
                    _f.add("localInitFolding: expected int declaration with value 20");
            } else {
                _f.add("localInitFolding: function body not found");
            }

            // -- local init folding mixed (non-foldable before foldable) --
            b = w2lBodyOf(_code, "localInitFoldingMixed");
            if (b != null) {
                if (!w2lHasMatch(b, "int\\s+[\\w$]+\\s*=\\s*42\\s*;"))
                    _f.add("localInitFoldingMixed: expected int declaration with value 42");
                if (!w2lHasMatch(b, "100"))
                    _f.add("localInitFoldingMixed: expected non-foldable base computation (+ 100) present");
            } else {
                _f.add("localInitFoldingMixed: function body not found");
            }

            if (!_f.isEmpty()) {
                throw new RuntimeException("Code structure validation FAILED:\n  " + String.join("\n  ", _f));
            }
        }
    }

    // ---- Test execution ----
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

    for (java.util.List<Double> triple : w2lNested(_data, "terminator_dispatch_triples")) {
        mod.exerciseTerminatorDispatch(triple.get(0).intValue(), triple.get(1).intValue(), triple.get(2).intValue());
    }

    for (Double v : w2lFlat(_data, "guard_elision_product_values")) {
        mod.exerciseGuardElisionProduct(v.intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "guard_elision_retained_pairs")) {
        mod.exerciseGuardElisionRetained(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "redundant_loop_block_limits")) {
        mod.exerciseRedundantLoopBlock(v.intValue());
    }

    for (Double v : w2lFlat(_data, "local_init_folding_limits")) {
        mod.exerciseLocalInitFolding(v.intValue());
    }

    for (Double v : w2lFlat(_data, "local_init_folding_mixed_limits")) {
        mod.exerciseLocalInitFoldingMixed(v.intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "multi_guard_while_pairs")) {
        mod.exerciseMultiGuardWhile(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "switch_no_label_pairs")) {
        mod.exerciseSwitchNoLabel(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "fused_for_no_label_limits")) {
        mod.exerciseFusedForNoLabel(v.intValue());
    }

    for (Double v : w2lFlat(_data, "no_while_block_tail_limits")) {
        mod.exerciseNoWhileBlockTail(v.intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
