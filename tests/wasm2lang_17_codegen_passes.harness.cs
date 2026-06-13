// C# test harness for wasm2lang_17_codegen_passes.
//
// Compiled by wasm2lang_csharp_runner.ps1 together with the W2l helpers and
// the generated .cs file (which defines WasmMemBuffer and WasmModule).
// Instantiates the module, calls exported functions, and dumps the memory
// CRC — mirroring the .harness.java / .harness.mjs / .harness.php files.
//
// The structural assertions are adapted from the Java harness to the C#
// emission shapes: the C# backend has no labeled breaks or labeled blocks —
// labeled jumps are `goto <label>;`, exit labels are `<label>: ;` after the
// construct, kept labeled blocks are a bare `{ ... }` followed by an exit
// label, and labeled loops are `<label>: for (`.  Each check proves the same
// simplification as its Java counterpart and reports the identical failure
// text.

public static class W2lHarness {
  // -------------------------------------------------------------------------
  // Code structure validation helpers (C# backend)
  // -------------------------------------------------------------------------

  /** Extracts the body of a method by name via brace counting. */
  static string BodyOf(string code, string methodName) {
    int idx = code.IndexOf(" " + methodName + "(");
    if (idx < 0) return null;
    int depth = 0, start = -1;
    for (int i = idx; i < code.Length; i++) {
      char c = code[i];
      if (c == '{') { if (start < 0) start = i; depth++; }
      else if (c == '}') { if (--depth == 0) return code.Substring(start + 1, i - start - 1); }
    }
    return null;
  }

  static bool HasMatch(string body, string pattern) {
    return System.Text.RegularExpressions.Regex.IsMatch(body, pattern);
  }

  static int CountMatches(string body, string pattern) {
    return System.Text.RegularExpressions.Regex.Matches(body, pattern).Count;
  }

  /** Counts while( that are NOT } while( (simplified while, not do-while tail). */
  static int CountSimplifiedWhile(string body) {
    return CountMatches(body, "while\\s*\\(") - CountMatches(body, "\\}\\s*while\\s*\\(");
  }

  public static void Run() {
    // ---- Code structure validation ----
    string _testName = W2l.TestName;
    string _code = W2l.ReadSource();
    if (_code != null && _code.Length != 0) {
      var _f = new System.Collections.Generic.List<string>();

      // Simplification checks only apply to variants where wasm2lang:codegen
      // has been applied with metadata still available at emit time
      // (single-process codegen, or pre-normalized binary read with
      // --pre-normalized).
      bool _hasSimplifications = _testName.EndsWith("_prenorm")
          || _testName.EndsWith("_codegen")
          || _testName.EndsWith("_nomangle");
      // IR restructuring (if-else recovery, guard elision) leaves the
      // simplified shape in the IR itself, so it survives binary round-trip
      // even without metadata.  Only the bare _baseline variant skips it.
      bool _hasIrRestructuring = !_testName.EndsWith("_baseline");

      string b;

      if (_hasSimplifications) {
        // -- while simplification --
        b = BodyOf(_code, "fusedWhileSum");
        if (b == null || CountSimplifiedWhile(b) < 1)
          _f.Add("fusedWhileSum: expected while loop with condition");

        b = BodyOf(_code, "fusedBreakFromNestedIf");
        if (b == null || CountSimplifiedWhile(b) < 1)
          _f.Add("fusedBreakFromNestedIf: expected while loop with condition");

        b = BodyOf(_code, "nestedWhileLoops");
        if (b == null || CountSimplifiedWhile(b) < 2)
          _f.Add("nestedWhileLoops: expected >= 2 while loops with conditions");

        b = BodyOf(_code, "whileWithInnerContinue");
        if (b == null || CountSimplifiedWhile(b) < 1)
          _f.Add("whileWithInnerContinue: expected while loop with condition");

        // -- do-while --
        b = BodyOf(_code, "doWhileBreakOuter");
        if (b == null || !HasMatch(b, "\\bdo\\s*\\{"))
          _f.Add("doWhileBreakOuter: expected do-while loop");

        b = BodyOf(_code, "fusedDoWhile");
        if (b == null || !HasMatch(b, "\\bdo\\s*\\{"))
          _f.Add("fusedDoWhile: expected do-while loop");

        // -- flat switch dispatch (exit-label count < case count = flattened;
        // C# analog of Java's labeled-block count) --
        b = BodyOf(_code, "switchRequiresLabel");
        if (b == null || CountMatches(b, "[\\w$]+\\s*:\\s*;") >= CountMatches(b, "\\bcase\\s+\\d+\\s*:"))
          _f.Add("switchRequiresLabel: expected flat switch (fewer labeled blocks than cases)");

        b = BodyOf(_code, "nonWrappingDispatch");
        if (b == null || CountMatches(b, "[\\w$]+\\s*:\\s*;") >= CountMatches(b, "\\bcase\\s+\\d+\\s*:"))
          _f.Add("nonWrappingDispatch: expected flat switch (fewer labeled blocks than cases)");

        b = BodyOf(_code, "wrappingDispatchEpilogue");
        if (b == null || CountMatches(b, "[\\w$]+\\s*:\\s*;") >= CountMatches(b, "\\bcase\\s+\\d+\\s*:"))
          _f.Add("wrappingDispatchEpilogue: expected flat switch (fewer labeled blocks than cases)");

        b = BodyOf(_code, "terminatorDispatch");
        if (b == null || CountMatches(b, "[\\w$]+\\s*:\\s*;") >= CountMatches(b, "\\bcase\\s+\\d+\\s*:"))
          _f.Add("terminatorDispatch: expected flat switch (fewer labeled blocks than cases)");

        // -- redundant block removal --
        b = BodyOf(_code, "redundantLoopBlock");
        if (b == null || CountSimplifiedWhile(b) < 1)
          _f.Add("redundantLoopBlock: expected while loop with condition");

        // -- multi-guard while (compound condition) --
        b = BodyOf(_code, "multiGuardWhile");
        if (b == null || CountSimplifiedWhile(b) < 1)
          _f.Add("multiGuardWhile: expected while loop with compound condition");

        // -- switch label elision (no goto needed to escape the switch) --
        b = BodyOf(_code, "switchNoLabel");
        if (b != null) {
          if (CountMatches(b, "\\bcase\\s+\\d+\\s*:") < 2)
            _f.Add("switchNoLabel: expected flat switch with cases");
          if (CountMatches(b, "\\bgoto\\b") > 0)
            _f.Add("switchNoLabel: expected switch without label prefix");
        } else {
          _f.Add("switchNoLabel: function body not found");
        }

        // -- fused for loop label elision --
        b = BodyOf(_code, "fusedForNoLabel");
        if (b != null) {
          if (!HasMatch(b, "\\bfor\\s*\\("))
            _f.Add("fusedForNoLabel: expected for loop");
          if (CountMatches(b, "[\\w$]+\\s*:\\s*for\\s*\\(") > 0)
            _f.Add("fusedForNoLabel: expected for loop without label prefix");
        } else {
          _f.Add("fusedForNoLabel: function body not found");
        }

        // -- if-guarded while (LWI): loop body is If promoted to while --
        b = BodyOf(_code, "ifGuardedWhileInner");
        if (b == null || CountSimplifiedWhile(b) < 1)
          _f.Add("ifGuardedWhileInner: expected while loop (LWI)");

        // -- terminal-exit loop (LCT/LFT): for-loop with unconditional exit --
        b = BodyOf(_code, "terminalExitLoop");
        if (b != null) {
          if (!HasMatch(b, "\\bfor\\s*\\("))
            _f.Add("terminalExitLoop: expected for-loop");
          if (CountSimplifiedWhile(b) != 0)
            _f.Add("terminalExitLoop: expected no while-loop (is for-loop)");
        } else {
          _f.Add("terminalExitLoop: function body not found");
        }

        // -- do-while + trailing exit (LDA/LEA) --
        b = BodyOf(_code, "doWhileWithExitTail");
        if (b == null || !HasMatch(b, "\\bdo\\s*\\{"))
          _f.Add("doWhileWithExitTail: expected do-while loop");

        // -- bare do-while (LEB) --
        b = BodyOf(_code, "bareDoWhileLoop");
        if (b == null || !HasMatch(b, "\\bdo\\s*\\{"))
          _f.Add("bareDoWhileLoop: expected do-while loop (LEB)");

        // -- interior back-branch rejection (see .mjs harness for
        // details): loop body holds a conditional `br $L` inside an
        // inner `if` plus a trailing `br_if $L cond`.  Naive LDB
        // classification would compile to `do { ... continue; ... }
        // while (cond);`, but continue-in-do-while jumps to the
        // while-check, diverging from WASM's unconditional re-iterate.
        // The pass vetoes LD*/LE* here; the for-loop form keeps
        // continue meaning "jump to loop top".
        b = BodyOf(_code, "dowhileInteriorContinue");
        if (b != null) {
          if (HasMatch(b, "\\bdo\\s*\\{"))
            _f.Add("dowhileInteriorContinue: expected no do-while (interior back-branch forbids LDB)");
          if (!HasMatch(b, "\\bfor\\s*\\("))
            _f.Add("dowhileInteriorContinue: expected for-loop (interior back-branch case)");
        } else {
          _f.Add("dowhileInteriorContinue: function body not found");
        }

        // -- switch-continue loop (LCS/LFS) --
        b = BodyOf(_code, "switchContinueLoop");
        if (b != null) {
          if (!HasMatch(b, "\\bfor\\s*\\("))
            _f.Add("switchContinueLoop: expected for-loop");
          if (!HasMatch(b, "\\bswitch\\s*\\("))
            _f.Add("switchContinueLoop: expected switch dispatch");
        } else {
          _f.Add("switchContinueLoop: function body not found");
        }

        // -- root switch state machine (rs$) --
        b = BodyOf(_code, "rootSwitchStateMachine");
        if (b != null) {
          if (!HasMatch(b, "\\bswitch\\s*\\("))
            _f.Add("rootSwitchStateMachine: expected switch dispatch");
          if (CountMatches(b, "\\bcase\\s+\\d+\\s*:") < 3)
            _f.Add("rootSwitchStateMachine: expected >=3 cases");
        } else {
          _f.Add("rootSwitchStateMachine: function body not found");
        }

        // -- Pattern B fusion (loop with named body block) --
        b = BodyOf(_code, "loopWithNamedBodyBlock");
        if (b != null) {
          bool anyLoop = HasMatch(b, "\\bwhile\\s*\\(") ||
              HasMatch(b, "\\bfor\\s*\\(") || HasMatch(b, "\\bdo\\s*\\{");
          if (!anyLoop)
            _f.Add("loopWithNamedBodyBlock: expected fused loop construct");
        } else {
          _f.Add("loopWithNamedBodyBlock: function body not found");
        }

        // -- 3-arm if-else chain --
        b = BodyOf(_code, "ifElseChainThree");
        if (b != null) {
          if (CountMatches(b, "\\}\\s*else\\b") < 2)
            _f.Add("ifElseChainThree: expected >=2 else branches");
        } else {
          _f.Add("ifElseChainThree: function body not found");
        }
      }

      // -- if-else recovery (IR restructuring; baseline skips it) --
      if (_hasIrRestructuring) {
        b = BodyOf(_code, "ifElseSimple");
        if (b == null || !HasMatch(b, "\\}\\s*else\\s*\\{"))
          _f.Add("ifElseSimple: expected if/else structure");

        // -- guard elision (IR restructuring; baseline skips it).  Elided
        // guard means no escape label survives: neither a goto nor an exit
        // label (the C# analog of Java's labeled block). --
        b = BodyOf(_code, "guardElisionProduct");
        if (b == null || HasMatch(b, "\\bgoto\\b") || HasMatch(b, "[\\w$]+\\s*:\\s*;"))
          _f.Add("guardElisionProduct: expected guard elision (no labeled block)");
      }

      // -- local init folding (requires pass metadata; only active under
      // simplification variants) --
      if (_hasSimplifications) {
        b = BodyOf(_code, "localInitFolding");
        if (b != null) {
          if (!HasMatch(b, "int\\s+[\\w$]+\\s*=\\s*10\\s*;"))
            _f.Add("localInitFolding: expected int declaration with value 10");
          if (!HasMatch(b, "int\\s+[\\w$]+\\s*=\\s*20\\s*;"))
            _f.Add("localInitFolding: expected int declaration with value 20");
        } else {
          _f.Add("localInitFolding: function body not found");
        }

        // -- local init folding mixed (non-foldable before foldable) --
        b = BodyOf(_code, "localInitFoldingMixed");
        if (b != null) {
          if (!HasMatch(b, "int\\s+[\\w$]+\\s*=\\s*42\\s*;"))
            _f.Add("localInitFoldingMixed: expected int declaration with value 42");
          if (!HasMatch(b, "100"))
            _f.Add("localInitFoldingMixed: expected non-foldable base computation (+ 100) present");
        } else {
          _f.Add("localInitFoldingMixed: function body not found");
        }

        // -- local init repeated set (first set folded, second runtime-assigned) --
        b = BodyOf(_code, "localInitRepeatedSet");
        if (b != null) {
          if (!HasMatch(b, "int\\s+[\\w$]+\\s*=\\s*10\\s*;"))
            _f.Add("localInitRepeatedSet: expected int declaration with value 10 (first set folded)");
          if (!HasMatch(b, "\\b20\\b"))
            _f.Add("localInitRepeatedSet: expected runtime assignment of value 20 (second set NOT folded)");
          if (!HasMatch(b, "int\\s+[\\w$]+\\s*=\\s*30\\s*;"))
            _f.Add("localInitRepeatedSet: expected int declaration with value 30 (other local folded)");
        } else {
          _f.Add("localInitRepeatedSet: function body not found");
        }

        // -- local init all-zero (zero folds become nops; runtime stores remain) --
        b = BodyOf(_code, "localInitAllZero");
        if (b != null) {
          if (!HasMatch(b, "\\b5\\b"))
            _f.Add("localInitAllZero: expected (x+5) term present");
          if (!HasMatch(b, "\\b3\\b"))
            _f.Add("localInitAllZero: expected (x*3) term present");
          if (!HasMatch(b, "\\b7\\b"))
            _f.Add("localInitAllZero: expected (x-7) term present");
        } else {
          _f.Add("localInitAllZero: function body not found");
        }
      }

      // -- eqz(or(eq, eq)) compound negation (quic.js regression).
      // Backend must negate the full OR (with `!` or De Morgan's) —
      // a partial operator flip like `v != 1 | v == N` is the broken
      // form that caused every QUIC version check to fail.
      b = BodyOf(_code, "eqzOrVersionGate");
      if (b != null) {
        if (!HasMatch(b, "\\breturn\\b"))
          _f.Add("eqzOrVersionGate: expected a return statement");
        // Broken form: one inequality joined by `|`/`&` with a matching
        // equality (e.g. `v != 1 | v == N`) — exactly the partial-flip
        // negateComparison_ used to emit.  Any safe form (`!(…)`,
        // De Morgan, `(…) == 0`, `0 == (…)`) is acceptable.
        bool hasMixed = HasMatch(b, "!=\\s*-?\\d+\\s*[|&]\\s*[^|&]*?==\\s*-?\\d+") ||
            HasMatch(b, "==\\s*-?\\d+\\s*[|&]\\s*[^|&]*?!=\\s*-?\\d+");
        if (hasMixed)
          _f.Add("eqzOrVersionGate: partial-flip compound condition would miscompile the quic version gate");
      } else {
        _f.Add("eqzOrVersionGate: function body not found");
      }

      // -- root value block: function body is an unnamed value-typed
      // block.  The last child must be emitted as `return <tail>`,
      // not as a dangling expression followed by a `return 0`
      // stabilizer.  Regression guard for tryEmitRootValueBlock_.
      //
      // Tail expression is `i32.add(p(0), p(1))` — the return must
      // contain the `+` operator.  Bug signature: the tail is emitted
      // as a dangling stmt and replaced by `return 0`.
      b = BodyOf(_code, "rootValueBlock");
      if (b != null) {
        if (!HasMatch(b, "\\breturn\\b"))
          _f.Add("rootValueBlock: expected a return statement");
        if (HasMatch(b, "(?m)^\\s*return\\s+0\\s*;"))
          _f.Add("rootValueBlock: expected real tail value, not bare `return 0` stabilizer");
        if (!HasMatch(b, "return\\s+[^;]*\\+"))
          _f.Add("rootValueBlock: expected return to contain the `+` tail operator");
      } else {
        _f.Add("rootValueBlock: function body not found");
      }

      // -- direct labeled if: the if must carry its own exit label
      // (`goto`-reachable `label: ;` after the if), with no bare block
      // wrapper (lone `{` line) around it.
      b = BodyOf(_code, "directLabeledIf");
      if (b != null) {
        if (!HasMatch(b, "\\bif\\s*\\(") || !HasMatch(b, "[\\w$]+\\s*:\\s*;"))
          _f.Add("directLabeledIf: expected direct labeled if statement");
        if (HasMatch(b, "(?m)^\\s*\\{\\s*$"))
          _f.Add("directLabeledIf: expected labeled if without block wrapper");
      } else {
        _f.Add("directLabeledIf: function body not found");
      }

      // -- direct labeled loop: block+loop pair must collapse to a bare or
      // directly-labeled loop, never a bare-block wrapper around the loop.
      b = BodyOf(_code, "directLabeledLoop");
      if (b != null) {
        if (!HasMatch(b, "(for\\s*\\(|while\\s*\\(|do\\s*\\{)"))
          _f.Add("directLabeledLoop: expected loop statement in body");
        if (HasMatch(b, "(?m)^\\s*\\{\\s*\\n\\s*(for\\s*\\(|while\\s*\\(|do\\s*\\{)"))
          _f.Add("directLabeledLoop: expected loop without block wrapper");
      } else {
        _f.Add("directLabeledLoop: function body not found");
      }

      // -- assignment RHS paren elision --
      b = BodyOf(_code, "assignmentParenElision");
      if (b != null) {
        if (!HasMatch(b, "\\?"))
          _f.Add("assignmentParenElision: expected lowered select/conditional expression");
        if (HasMatch(b, "=\\s*\\([^;\\n]*\\?"))
          _f.Add("assignmentParenElision: expected assignment RHS without redundant outer parentheses");
      } else {
        _f.Add("assignmentParenElision: function body not found");
      }

      if (_f.Count != 0) {
        throw new System.Exception("Code structure validation FAILED:\n  " + string.Join("\n  ", _f));
      }
    }

    // ---- Test execution ----
    var foreign = new System.Collections.Generic.Dictionary<string, object>();
    var memBuffer = WasmMemBuffer.memBuffer();

    var mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    foreach (var v in W2l.Flat("fused_while_limits")) {
      mod.exerciseFusedWhile((int)v);
    }

    foreach (var v in W2l.Flat("fused_break_inputs")) {
      mod.exerciseFusedBreakFromIf((int)v);
    }

    foreach (var triple in W2l.Nested("nested_while_triples")) {
      mod.exerciseNestedWhile((int)triple[0], (int)triple[1], (int)triple[2]);
    }

    foreach (var v in W2l.Flat("while_continue_limits")) {
      mod.exerciseWhileWithContinue((int)v);
    }

    foreach (var pair in W2l.Nested("distant_exit_pairs")) {
      mod.exerciseDistantExit((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("do_while_break_starts")) {
      mod.exerciseDoWhileBreak((int)v);
    }

    foreach (var v in W2l.Flat("fused_do_while_inputs")) {
      mod.exerciseFusedDoWhile((int)v);
    }

    foreach (var triple in W2l.Nested("multi_break_triples")) {
      mod.exerciseMultiBreak((int)triple[0], (int)triple[1], (int)triple[2]);
    }

    foreach (var pair in W2l.Nested("if_else_pairs")) {
      mod.exerciseIfElseSimple((int)pair[0], (int)pair[1]);
    }

    foreach (var pair in W2l.Nested("if_else_kept_pairs")) {
      mod.exerciseIfElseKeptLabel((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("switch_requires_label_indices")) {
      mod.exerciseSwitchRequiresLabel((int)v);
    }

    foreach (var triple in W2l.Nested("non_wrapping_dispatch_triples")) {
      mod.exerciseNonWrappingDispatch((int)triple[0], (int)triple[1], (int)triple[2]);
    }

    foreach (var pair in W2l.Nested("wrapping_dispatch_epilogue_pairs")) {
      mod.exerciseWrappingDispatchEpilogue((int)pair[0], (int)pair[1]);
    }

    foreach (var triple in W2l.Nested("terminator_dispatch_triples")) {
      mod.exerciseTerminatorDispatch((int)triple[0], (int)triple[1], (int)triple[2]);
    }

    foreach (var v in W2l.Flat("guard_elision_product_values")) {
      mod.exerciseGuardElisionProduct((int)v);
    }

    foreach (var pair in W2l.Nested("guard_elision_retained_pairs")) {
      mod.exerciseGuardElisionRetained((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("redundant_loop_block_limits")) {
      mod.exerciseRedundantLoopBlock((int)v);
    }

    foreach (var v in W2l.Flat("local_init_folding_limits")) {
      mod.exerciseLocalInitFolding((int)v);
    }

    foreach (var v in W2l.Flat("local_init_folding_mixed_limits")) {
      mod.exerciseLocalInitFoldingMixed((int)v);
    }

    foreach (var pair in W2l.Nested("multi_guard_while_pairs")) {
      mod.exerciseMultiGuardWhile((int)pair[0], (int)pair[1]);
    }

    foreach (var pair in W2l.Nested("switch_no_label_pairs")) {
      mod.exerciseSwitchNoLabel((int)pair[0], (int)pair[1]);
    }

    foreach (var pair in W2l.Nested("external_case_target_pairs")) {
      mod.exerciseExternalCaseTarget((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("fused_for_no_label_limits")) {
      mod.exerciseFusedForNoLabel((int)v);
    }

    foreach (var v in W2l.Flat("no_while_block_tail_limits")) {
      mod.exerciseNoWhileBlockTail((int)v);
    }

    foreach (var v in W2l.Flat("if_guarded_while_inner_limits")) {
      mod.exerciseIfGuardedWhileInner((int)v);
    }

    foreach (var v in W2l.Flat("terminal_exit_loop_caps")) {
      mod.exerciseTerminalExitLoop((int)v);
    }

    foreach (var pair in W2l.Nested("do_while_with_exit_tail_pairs")) {
      mod.exerciseDoWhileWithExitTail((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("bare_do_while_loop_limits")) {
      mod.exerciseBareDoWhileLoop((int)v);
    }

    foreach (var pair in W2l.Nested("dowhile_interior_continue_pairs")) {
      mod.exerciseDowhileInteriorContinue((int)pair[0], (int)pair[1]);
    }

    foreach (var v in W2l.Flat("switch_continue_loop_initial")) {
      mod.exerciseSwitchContinueLoop((int)v);
    }

    foreach (var v in W2l.Flat("root_switch_state_machine_initial")) {
      mod.exerciseRootSwitchStateMachine((int)v);
    }

    foreach (var v in W2l.Flat("loop_with_named_body_block_limits")) {
      mod.exerciseLoopWithNamedBodyBlock((int)v);
    }

    foreach (var v in W2l.Flat("if_else_chain_three_values")) {
      mod.exerciseIfElseChainThree((int)v);
    }

    foreach (var v in W2l.Flat("local_init_repeated_set_values")) {
      mod.exerciseLocalInitRepeatedSet((int)v);
    }

    foreach (var v in W2l.Flat("local_init_all_zero_values")) {
      mod.exerciseLocalInitAllZero((int)v);
    }

    foreach (var v in W2l.Flat("root_value_block_values")) {
      mod.exerciseRootValueBlock((int)v);
    }

    foreach (var v in W2l.Flat("direct_labeled_if_values")) {
      mod.exerciseDirectLabeledIf((int)v);
    }

    foreach (var v in W2l.Flat("direct_labeled_loop_values")) {
      mod.exerciseDirectLabeledLoop((int)v);
    }

    foreach (var v in W2l.Flat("assignment_paren_elision_values")) {
      mod.exerciseAssignmentParenElision((int)v);
    }

    foreach (var v in W2l.Flat("eqz_or_version_gate_values")) {
      mod.exerciseEqzOrVersionGate((int)v);
    }

    foreach (var v in W2l.Flat("eqz_negate_numeric_comparison_values")) {
      mod.exerciseEqzNegateNumericComparison((int)v);
    }

    W2l.DumpCRC(memBuffer);
  }
}
