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

                // -- if-guarded while (LWI): loop body is If promoted to while --
                b = w2lBodyOf(_code, "ifGuardedWhileInner");
                if (b == null || w2lCountSimplifiedWhile(b) < 1)
                    _f.add("ifGuardedWhileInner: expected while loop (LWI)");

                // -- terminal-exit loop (LCT/LFT): for-loop with unconditional exit --
                b = w2lBodyOf(_code, "terminalExitLoop");
                if (b != null) {
                    if (!w2lHasMatch(b, "\\bfor\\s*\\("))
                        _f.add("terminalExitLoop: expected for-loop");
                    if (w2lCountSimplifiedWhile(b) != 0)
                        _f.add("terminalExitLoop: expected no while-loop (is for-loop)");
                } else {
                    _f.add("terminalExitLoop: function body not found");
                }

                // -- do-while + trailing exit (LDA/LEA) --
                b = w2lBodyOf(_code, "doWhileWithExitTail");
                if (b == null || !w2lHasMatch(b, "\\bdo\\s*\\{"))
                    _f.add("doWhileWithExitTail: expected do-while loop");

                // -- bare do-while (LEB) --
                b = w2lBodyOf(_code, "bareDoWhileLoop");
                if (b == null || !w2lHasMatch(b, "\\bdo\\s*\\{"))
                    _f.add("bareDoWhileLoop: expected do-while loop (LEB)");

                // -- interior back-branch rejection (see .mjs harness for
                // details): loop body holds a conditional `br $L` inside an
                // inner `if` plus a trailing `br_if $L cond`.  Naive LDB
                // classification would compile to `do { ... continue; ... }
                // while (cond);`, but JS continue-in-do-while jumps to the
                // while-check, diverging from WASM's unconditional re-iterate.
                // The pass vetoes LD*/LE* here; the for-loop form keeps
                // continue meaning "jump to loop top".
                b = w2lBodyOf(_code, "dowhileInteriorContinue");
                if (b != null) {
                    if (w2lHasMatch(b, "\\bdo\\s*\\{"))
                        _f.add("dowhileInteriorContinue: expected no do-while (interior back-branch forbids LDB)");
                    if (!w2lHasMatch(b, "\\bfor\\s*\\("))
                        _f.add("dowhileInteriorContinue: expected for-loop (interior back-branch case)");
                } else {
                    _f.add("dowhileInteriorContinue: function body not found");
                }

                // -- switch-continue loop (LCS/LFS) --
                b = w2lBodyOf(_code, "switchContinueLoop");
                if (b != null) {
                    if (!w2lHasMatch(b, "\\bfor\\s*\\("))
                        _f.add("switchContinueLoop: expected for-loop");
                    if (!w2lHasMatch(b, "\\bswitch\\s*\\("))
                        _f.add("switchContinueLoop: expected switch dispatch");
                } else {
                    _f.add("switchContinueLoop: function body not found");
                }

                // -- root switch state machine (rs$) --
                b = w2lBodyOf(_code, "rootSwitchStateMachine");
                if (b != null) {
                    if (!w2lHasMatch(b, "\\bswitch\\s*\\("))
                        _f.add("rootSwitchStateMachine: expected switch dispatch");
                    if (w2lCountMatches(b, "\\bcase\\s+\\d+\\s*:") < 3)
                        _f.add("rootSwitchStateMachine: expected >=3 cases");
                } else {
                    _f.add("rootSwitchStateMachine: function body not found");
                }

                // -- Pattern B fusion (loop with named body block) --
                b = w2lBodyOf(_code, "loopWithNamedBodyBlock");
                if (b != null) {
                    boolean anyLoop = w2lHasMatch(b, "\\bwhile\\s*\\(") ||
                        w2lHasMatch(b, "\\bfor\\s*\\(") || w2lHasMatch(b, "\\bdo\\s*\\{");
                    if (!anyLoop)
                        _f.add("loopWithNamedBodyBlock: expected fused loop construct");
                } else {
                    _f.add("loopWithNamedBodyBlock: function body not found");
                }

                // -- 3-arm if-else chain --
                b = w2lBodyOf(_code, "ifElseChainThree");
                if (b != null) {
                    if (w2lCountMatches(b, "\\}\\s*else\\b") < 2)
                        _f.add("ifElseChainThree: expected >=2 else branches");
                } else {
                    _f.add("ifElseChainThree: function body not found");
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

            // -- local init repeated set (first set folded, second runtime-assigned) --
            b = w2lBodyOf(_code, "localInitRepeatedSet");
            if (b != null) {
                if (!w2lHasMatch(b, "int\\s+[\\w$]+\\s*=\\s*10\\s*;"))
                    _f.add("localInitRepeatedSet: expected int declaration with value 10 (first set folded)");
                if (!w2lHasMatch(b, "\\b20\\b"))
                    _f.add("localInitRepeatedSet: expected runtime assignment of value 20 (second set NOT folded)");
                if (!w2lHasMatch(b, "int\\s+[\\w$]+\\s*=\\s*30\\s*;"))
                    _f.add("localInitRepeatedSet: expected int declaration with value 30 (other local folded)");
            } else {
                _f.add("localInitRepeatedSet: function body not found");
            }

            // -- local init all-zero (zero folds become nops; runtime stores remain) --
            b = w2lBodyOf(_code, "localInitAllZero");
            if (b != null) {
                if (!w2lHasMatch(b, "\\b5\\b"))
                    _f.add("localInitAllZero: expected (x+5) term present");
                if (!w2lHasMatch(b, "\\b3\\b"))
                    _f.add("localInitAllZero: expected (x*3) term present");
                if (!w2lHasMatch(b, "\\b7\\b"))
                    _f.add("localInitAllZero: expected (x-7) term present");
            } else {
                _f.add("localInitAllZero: function body not found");
            }

            // -- eqz(or(eq, eq)) compound negation (quic.js regression).
            // Backend must negate the full OR (with `!` or De Morgan's) —
            // a partial operator flip like `v != 1 | v == N` is the broken
            // form that caused every QUIC version check to fail.
            b = w2lBodyOf(_code, "eqzOrVersionGate");
            if (b != null) {
                if (!w2lHasMatch(b, "\\breturn\\b"))
                    _f.add("eqzOrVersionGate: expected a return statement");
                // Broken form: one inequality joined by `|`/`&` with a matching
                // equality (e.g. `v != 1 | v == N`) — exactly the partial-flip
                // negateComparison_ used to emit.  Any safe form (`!(…)`,
                // De Morgan, `(…) == 0`, `0 == (…)`) is acceptable.
                boolean hasMixed = w2lHasMatch(b, "!=\\s*-?\\d+\\s*[|&]\\s*[^|&]*?==\\s*-?\\d+") ||
                    w2lHasMatch(b, "==\\s*-?\\d+\\s*[|&]\\s*[^|&]*?!=\\s*-?\\d+");
                if (hasMixed)
                    _f.add("eqzOrVersionGate: partial-flip compound condition would miscompile the quic version gate");
            } else {
                _f.add("eqzOrVersionGate: function body not found");
            }

            // -- root value block: function body is an unnamed value-typed
            // block.  The last child must be emitted as `return <tail>`,
            // not as a dangling expression followed by a `return 0`
            // stabilizer.  Regression guard for tryEmitRootValueBlock_.
            //
            // Tail expression is `i32.add(p(0), p(1))` — the return must
            // contain the `+` operator.  Bug signature: the tail is emitted
            // as a dangling stmt and replaced by `return 0`.
            b = w2lBodyOf(_code, "rootValueBlock");
            if (b != null) {
                if (!w2lHasMatch(b, "\\breturn\\b"))
                    _f.add("rootValueBlock: expected a return statement");
                if (w2lHasMatch(b, "(?m)^\\s*return\\s+0\\s*;"))
                    _f.add("rootValueBlock: expected real tail value, not bare `return 0` stabilizer");
                if (!w2lHasMatch(b, "return\\s+[^;]*\\+"))
                    _f.add("rootValueBlock: expected return to contain the `+` tail operator");
            } else {
                _f.add("rootValueBlock: function body not found");
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

    for (Double v : w2lFlat(_data, "if_guarded_while_inner_limits")) {
        mod.exerciseIfGuardedWhileInner(v.intValue());
    }

    for (Double v : w2lFlat(_data, "terminal_exit_loop_caps")) {
        mod.exerciseTerminalExitLoop(v.intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "do_while_with_exit_tail_pairs")) {
        mod.exerciseDoWhileWithExitTail(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "bare_do_while_loop_limits")) {
        mod.exerciseBareDoWhileLoop(v.intValue());
    }

    for (java.util.List<Double> pair : w2lNested(_data, "dowhile_interior_continue_pairs")) {
        mod.exerciseDowhileInteriorContinue(pair.get(0).intValue(), pair.get(1).intValue());
    }

    for (Double v : w2lFlat(_data, "switch_continue_loop_initial")) {
        mod.exerciseSwitchContinueLoop(v.intValue());
    }

    for (Double v : w2lFlat(_data, "root_switch_state_machine_initial")) {
        mod.exerciseRootSwitchStateMachine(v.intValue());
    }

    for (Double v : w2lFlat(_data, "loop_with_named_body_block_limits")) {
        mod.exerciseLoopWithNamedBodyBlock(v.intValue());
    }

    for (Double v : w2lFlat(_data, "if_else_chain_three_values")) {
        mod.exerciseIfElseChainThree(v.intValue());
    }

    for (Double v : w2lFlat(_data, "local_init_repeated_set_values")) {
        mod.exerciseLocalInitRepeatedSet(v.intValue());
    }

    for (Double v : w2lFlat(_data, "local_init_all_zero_values")) {
        mod.exerciseLocalInitAllZero(v.intValue());
    }

    for (Double v : w2lFlat(_data, "root_value_block_values")) {
        mod.exerciseRootValueBlock(v.intValue());
    }

    for (Double v : w2lFlat(_data, "const_condition_fold_values")) {
        mod.exerciseConstConditionFold(v.intValue());
    }

    for (Double v : w2lFlat(_data, "eqz_or_version_gate_values")) {
        mod.exerciseEqzOrVersionGate(v.intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
