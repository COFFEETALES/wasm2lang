'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const v of data.fused_while_limits) {
    exports.exerciseFusedWhile(v);
  }

  for (const v of data.fused_break_inputs) {
    exports.exerciseFusedBreakFromIf(v);
  }

  for (const triple of data.nested_while_triples) {
    exports.exerciseNestedWhile(triple[0], triple[1], triple[2]);
  }

  for (const v of data.while_continue_limits) {
    exports.exerciseWhileWithContinue(v);
  }

  for (const pair of data.distant_exit_pairs) {
    exports.exerciseDistantExit(pair[0], pair[1]);
  }

  for (const v of data.do_while_break_starts) {
    exports.exerciseDoWhileBreak(v);
  }

  for (const v of data.fused_do_while_inputs) {
    exports.exerciseFusedDoWhile(v);
  }

  for (const triple of data.multi_break_triples) {
    exports.exerciseMultiBreak(triple[0], triple[1], triple[2]);
  }

  for (const pair of data.if_else_pairs) {
    exports.exerciseIfElseSimple(pair[0], pair[1]);
  }

  for (const pair of data.if_else_kept_pairs) {
    exports.exerciseIfElseKeptLabel(pair[0], pair[1]);
  }

  for (const v of data.switch_requires_label_indices) {
    exports.exerciseSwitchRequiresLabel(v);
  }

  for (const triple of data.non_wrapping_dispatch_triples) {
    exports.exerciseNonWrappingDispatch(triple[0], triple[1], triple[2]);
  }

  for (const pair of data.wrapping_dispatch_epilogue_pairs) {
    exports.exerciseWrappingDispatchEpilogue(pair[0], pair[1]);
  }

  for (const triple of data.terminator_dispatch_triples) {
    exports.exerciseTerminatorDispatch(triple[0], triple[1], triple[2]);
  }

  for (const v of data.guard_elision_product_values) {
    exports.exerciseGuardElisionProduct(v);
  }

  for (const pair of data.guard_elision_retained_pairs) {
    exports.exerciseGuardElisionRetained(pair[0], pair[1]);
  }

  for (const v of data.redundant_loop_block_limits) {
    exports.exerciseRedundantLoopBlock(v);
  }

  for (const v of data.local_init_folding_limits) {
    exports.exerciseLocalInitFolding(v);
  }

  for (const v of data.local_init_folding_mixed_limits) {
    exports.exerciseLocalInitFoldingMixed(v);
  }

  for (const pair of data.multi_guard_while_pairs) {
    exports.exerciseMultiGuardWhile(pair[0], pair[1]);
  }

  for (const pair of data.switch_no_label_pairs) {
    exports.exerciseSwitchNoLabel(pair[0], pair[1]);
  }

  for (const v of data.fused_for_no_label_limits) {
    exports.exerciseFusedForNoLabel(v);
  }

  for (const v of data.no_while_block_tail_limits) {
    exports.exerciseNoWhileBlockTail(v);
  }

  for (const v of data.if_guarded_while_inner_limits) {
    exports.exerciseIfGuardedWhileInner(v);
  }

  for (const v of data.terminal_exit_loop_caps) {
    exports.exerciseTerminalExitLoop(v);
  }

  for (const pair of data.do_while_with_exit_tail_pairs) {
    exports.exerciseDoWhileWithExitTail(pair[0], pair[1]);
  }

  for (const v of data.bare_do_while_loop_limits) {
    exports.exerciseBareDoWhileLoop(v);
  }

  for (const v of data.switch_continue_loop_initial) {
    exports.exerciseSwitchContinueLoop(v);
  }

  for (const v of data.root_switch_state_machine_initial) {
    exports.exerciseRootSwitchStateMachine(v);
  }

  for (const v of data.loop_with_named_body_block_limits) {
    exports.exerciseLoopWithNamedBodyBlock(v);
  }

  for (const v of data.if_else_chain_three_values) {
    exports.exerciseIfElseChainThree(v);
  }

  for (const v of data.local_init_repeated_set_values) {
    exports.exerciseLocalInitRepeatedSet(v);
  }

  for (const v of data.local_init_all_zero_values) {
    exports.exerciseLocalInitAllZero(v);
  }

  for (const v of data.root_value_block_values) {
    exports.exerciseRootValueBlock(v);
  }

  for (const v of data.const_condition_fold_values) {
    exports.exerciseConstConditionFold(v);
  }
};

/**
 * Validates that wasm2lang:codegen structural transformations are present
 * in the generated asm.js code.  Only runs for the _codegen variant.
 */
const validateCode = function (code, testName) {
  if (!testName.endsWith('_codegen') && !testName.endsWith('_prenorm')) return;

  // ---- export name -> internal function name map ----
  const retIdx = code.lastIndexOf('return {');
  if (retIdx < 0) throw new Error('validateCode: module return statement not found');
  let braceDepth = 0,
    retStart = -1,
    retEnd = -1;
  for (let i = retIdx; i < code.length; i++) {
    if (code[i] === '{') {
      if (retStart < 0) retStart = i;
      braceDepth++;
    } else if (code[i] === '}') {
      if (--braceDepth === 0) {
        retEnd = i;
        break;
      }
    }
  }
  const retBody = code.substring(retStart + 1, retEnd);
  const exportMap = Object.create(null);
  retBody.replace(/([\w$]+)\s*:\s*([\w$]+)/g, function (_, e, f) {
    exportMap[e] = f;
  });

  // ---- function body extraction (brace counting) ----
  const bodyOf = function (exportName) {
    const fn = exportMap[exportName];
    if (!fn) return null;
    const marker = 'function ' + fn + '(';
    const idx = code.indexOf(marker);
    if (idx < 0) return null;
    let depth = 0,
      start = -1;
    for (let i = idx; i < code.length; i++) {
      if (code[i] === '{') {
        if (start < 0) start = i;
        depth++;
      } else if (code[i] === '}') {
        if (--depth === 0) return code.substring(start + 1, i);
      }
    }
    return null;
  };

  // ---- helpers ----
  const failures = [];
  const check = function (name, cond, msg) {
    if (!cond) failures.push(name + ': ' + msg);
  };

  check('global', !/switch\s*\(\|0\)/.test(code), 'generated code contains an empty switch condition (`switch (|0)`)');
  // Count while( that are NOT } while( (i.e. simplified while, not do-while tail).
  const countSimplifiedWhile = function (body) {
    const total = (body.match(/while\s*\(/g) || []).length;
    const doWhileTail = (body.match(/\}\s*while\s*\(/g) || []).length;
    return total - doWhileTail;
  };

  let b;

  // Simplification checks only apply to the prenorm variant (--pre-normalized
  // enables backend simplifications; the codegen variant verifies correctness
  // without them).
  const hasSimplifications = testName.endsWith('_prenorm') || testName.endsWith('_codegen');

  if (hasSimplifications) {
    // -- while simplification --
    b = bodyOf('fusedWhileSum');
    check('fusedWhileSum', b && countSimplifiedWhile(b) >= 1, 'expected while loop with condition');

    b = bodyOf('fusedBreakFromNestedIf');
    check('fusedBreakFromNestedIf', b && countSimplifiedWhile(b) >= 1, 'expected while loop with condition');

    b = bodyOf('nestedWhileLoops');
    check('nestedWhileLoops', b && countSimplifiedWhile(b) >= 2, 'expected >= 2 while loops with conditions');

    b = bodyOf('whileWithInnerContinue');
    check('whileWithInnerContinue', b && countSimplifiedWhile(b) >= 1, 'expected while loop with condition');

    // -- do-while --
    b = bodyOf('doWhileBreakOuter');
    check('doWhileBreakOuter', b && /\bdo\s*\{/.test(b), 'expected do-while loop');

    b = bodyOf('fusedDoWhile');
    check('fusedDoWhile', b && /\bdo\s*\{/.test(b), 'expected do-while loop');

    // -- flat switch dispatch (labeled block count < case count = flattened) --
    b = bodyOf('switchRequiresLabel');
    check(
      'switchRequiresLabel',
      b && (b.match(/\w+\s*:\s*\{/g) || []).length < (b.match(/\bcase\s+\d+\s*:/g) || []).length,
      'expected flat switch (fewer labeled blocks than cases)'
    );
    // Guards the prenorm round-trip drift: binaryen appends a synthetic
    // trailing `unreachable` to a function body root whose effective type
    // is unreachable but whose declared return type is non-unreachable.
    // If buildNodeIndex_ fails to account for this sibling, the dispatch
    // wrapper ends up at the wrong position and its metadata is lost.
    // The resulting emit puts `return` inside the default case instead of
    // after the switch — producing "missing return" in Java and miscompiles
    // in the other backends.
    check(
      'switchRequiresLabel',
      b && /\}\s*return\b/.test(b),
      'expected return after the switch closes (prenorm synthetic-unreachable marker)'
    );

    b = bodyOf('nonWrappingDispatch');
    check(
      'nonWrappingDispatch',
      b && (b.match(/\w+\s*:\s*\{/g) || []).length < (b.match(/\bcase\s+\d+\s*:/g) || []).length,
      'expected flat switch (fewer labeled blocks than cases)'
    );
    // Guards the barney_core drift case: binary round-trip can strip the
    // dispatch wrapper label, and case-action `br $outer` must degrade to
    // unlabeled `break;` exiting the switch.  If any labeled break survives
    // here, there is no enclosing labeled scope to resolve it.
    check(
      'nonWrappingDispatch',
      b && !/\bbreak\s+[A-Za-z_$][\w$]*\s*;/.test(b),
      'expected no labeled break (would be orphan after round-trip drift)'
    );

    b = bodyOf('wrappingDispatchEpilogue');
    check(
      'wrappingDispatchEpilogue',
      b && (b.match(/\w+\s*:\s*\{/g) || []).length < (b.match(/\bcase\s+\d+\s*:/g) || []).length,
      'expected flat switch (fewer labeled blocks than cases)'
    );

    b = bodyOf('terminatorDispatch');
    check(
      'terminatorDispatch',
      b && (b.match(/\w+\s*:\s*\{/g) || []).length < (b.match(/\bcase\s+\d+\s*:/g) || []).length,
      'expected flat switch (fewer labeled blocks than cases)'
    );
    // Same prenorm round-trip marker as switchRequiresLabel — default-case
    // return must be emitted after the switch, not inside it.
    check(
      'terminatorDispatch',
      b && /\}\s*return\b/.test(b),
      'expected return after the switch closes (prenorm synthetic-unreachable marker)'
    );

    // -- redundant block removal --
    b = bodyOf('redundantLoopBlock');
    check('redundantLoopBlock', b && countSimplifiedWhile(b) >= 1, 'expected while loop with condition');

    // -- multi-guard while (compound condition) --
    b = bodyOf('multiGuardWhile');
    check('multiGuardWhile', b && countSimplifiedWhile(b) >= 1, 'expected while loop with compound condition');

    // -- switch label elision (no labeled block wrapping the switch) --
    b = bodyOf('switchNoLabel');
    if (b) {
      check('switchNoLabel', (b.match(/\bcase\s+\d+\s*:/g) || []).length >= 2, 'expected flat switch with cases');
      check('switchNoLabel', !(b.match(/\w+\s*:\s*switch\s*\(/g) || []).length, 'expected switch without label prefix');
      // Same prenorm round-trip marker as switchRequiresLabel.
      check(
        'switchNoLabel',
        /\}\s*return\b/.test(b),
        'expected return after the switch closes (prenorm synthetic-unreachable marker)'
      );
    } else {
      check('switchNoLabel', false, 'function body not found');
    }

    // -- fused for loop label elision --
    b = bodyOf('fusedForNoLabel');
    if (b) {
      check('fusedForNoLabel', /\bfor\s*\(/.test(b), 'expected for loop');
      check('fusedForNoLabel', !(b.match(/\w+\s*:\s*for\s*\(/g) || []).length, 'expected for loop without label prefix');
    } else {
      check('fusedForNoLabel', false, 'function body not found');
    }

    // -- no-while regression (non-fused block with tail code) --
    // Rule-2: a loop sitting in a non-fused block must NOT be promoted to
    // while.  If it were, while-exit would fall through to the tail code
    // that the original br-to-outer would skip, breaking determinism.
    b = bodyOf('noWhileBlockTail');
    if (b) {
      check('noWhileBlockTail', countSimplifiedWhile(b) === 0, 'expected no while-loop (block has tail code, not fused)');
      check('noWhileBlockTail', /\bfor\s*\(/.test(b), 'expected for-loop emission');
    } else {
      check('noWhileBlockTail', false, 'function body not found');
    }

    // -- if-guarded while (LWI): loop body is an If; promoted to while --
    b = bodyOf('ifGuardedWhileInner');
    check('ifGuardedWhileInner', b && countSimplifiedWhile(b) >= 1, 'expected while loop (LWI)');

    // -- terminal-exit loop (LCT/LFT): for-loop with unconditional exit --
    b = bodyOf('terminalExitLoop');
    if (b) {
      check('terminalExitLoop', /\bfor\s*\(/.test(b), 'expected for-loop (terminal-exit)');
      check('terminalExitLoop', countSimplifiedWhile(b) === 0, 'expected no while-loop (terminal-exit is for-loop)');
    } else {
      check('terminalExitLoop', false, 'function body not found');
    }

    // -- do-while + trailing exit (LDA/LEA) --
    b = bodyOf('doWhileWithExitTail');
    check('doWhileWithExitTail', b && /\bdo\s*\{/.test(b), 'expected do-while loop (LDA/LEA)');

    // -- bare do-while (LEB): condition carries side effects (local.tee) --
    b = bodyOf('bareDoWhileLoop');
    check('bareDoWhileLoop', b && /\bdo\s*\{/.test(b), 'expected do-while loop (LEB)');

    // -- switch-continue loop (LCS/LFS): for-loop with bottom switch --
    b = bodyOf('switchContinueLoop');
    if (b) {
      check('switchContinueLoop', /\bfor\s*\(/.test(b), 'expected for-loop (LCS/LFS)');
      check('switchContinueLoop', /\bswitch\s*\(/.test(b), 'expected switch dispatch at loop bottom');
    } else {
      check('switchContinueLoop', false, 'function body not found');
    }

    // -- root switch state machine (rs$): collapses outer chain + loop+switch --
    // Guards that rs$ processing doesn't leave orphan blocks or mis-route
    // the case-action break paths after outer chain collapse.
    b = bodyOf('rootSwitchStateMachine');
    if (b) {
      check('rootSwitchStateMachine', /\bswitch\s*\(/.test(b), 'expected switch dispatch');
      // With rs$, the outer chain block should be elided — there should be
      // no labeled break to a synthetic outer block wrapper.
      check('rootSwitchStateMachine', (b.match(/\bcase\s+\d+\s*:/g) || []).length >= 3, 'expected >=3 cases in dispatch');
    } else {
      check('rootSwitchStateMachine', false, 'function body not found');
    }

    // -- Pattern B fusion (loop with named body block) --
    // Loop should emit as a single loop construct; the inner block label
    // must not escape as a separate labeled wrapper.
    b = bodyOf('loopWithNamedBodyBlock');
    if (b) {
      check(
        'loopWithNamedBodyBlock',
        /\bwhile\s*\(/.test(b) || /\bfor\s*\(/.test(b) || /\bdo\s*\{/.test(b),
        'expected fused loop construct (while/for/do-while)'
      );
    } else {
      check('loopWithNamedBodyBlock', false, 'function body not found');
    }

    // -- 3-arm if-else chain --
    b = bodyOf('ifElseChainThree');
    if (b) {
      // Count `else` structures (should be >=2 after if-else recovery).
      const elseCount = (b.match(/\}\s*else\b/g) || []).length;
      check('ifElseChainThree', elseCount >= 2, 'expected >=2 else branches in recovered chain');
    } else {
      check('ifElseChainThree', false, 'function body not found');
    }
  }

  // -- if-else recovery (IR restructuring, always active) --
  b = bodyOf('ifElseSimple');
  check('ifElseSimple', b && /\}\s*else\s*\{/.test(b), 'expected if/else structure');

  // -- guard elision (IR restructuring, always active) --
  b = bodyOf('guardElisionProduct');
  check('guardElisionProduct', b && !/\w+\s*:\s*\{/.test(b), 'expected guard elision (no labeled block)');

  // -- local init folding (var declaration line contains folded values) --
  b = bodyOf('localInitFolding');
  if (b) {
    const varLine = (b.match(/\bvar\b[^;]*;/) || [''])[0];
    check('localInitFolding', /\b10\b/.test(varLine), 'expected var init with value 10');
    check('localInitFolding', /\b20\b/.test(varLine), 'expected var init with value 20');
  } else {
    check('localInitFolding', false, 'function body not found');
  }

  // -- local init folding mixed (non-foldable before foldable) --
  b = bodyOf('localInitFoldingMixed');
  if (b) {
    const varLine = (b.match(/\bvar\b[^;]*;/) || [''])[0];
    check('localInitFoldingMixed', /\b42\b/.test(varLine), 'expected var init with value 42');
    // The non-foldable local.set (base = param + 100) must NOT be skipped.
    check('localInitFoldingMixed', /100/.test(b), 'expected non-foldable base computation (+ 100) present');
  } else {
    check('localInitFoldingMixed', false, 'function body not found');
  }

  // -- local init repeated set: first foldable, second is a runtime store --
  // initOverrides records 10 on the first local; the second store (20) is
  // preserved as a regular assignment.  The function returns x*20+30 so
  // the value 20 must appear somewhere in the body.
  b = bodyOf('localInitRepeatedSet');
  if (b) {
    const varLine = (b.match(/\bvar\b[^;]*;/) || [''])[0];
    check('localInitRepeatedSet', /\b10\b/.test(varLine), 'expected var init with value 10 (first set folded)');
    check('localInitRepeatedSet', /\b20\b/.test(b), 'expected runtime assignment of value 20 (second set NOT folded)');
    check('localInitRepeatedSet', /\b30\b/.test(varLine), 'expected var init with value 30');
  } else {
    check('localInitRepeatedSet', false, 'function body not found');
  }

  // -- local init all-zero: no override values; leading sets become nops --
  // hasOverrides is false (all folded values are zero) but hasZeroFolds is
  // true, so the zeroFoldSet visitor replaces each leading local.set 0 with
  // nop.  The body must still emit the subsequent non-zero assignments.
  b = bodyOf('localInitAllZero');
  if (b) {
    check('localInitAllZero', /\b5\b/.test(b), 'expected (x+5) term present');
    check('localInitAllZero', /\b3\b/.test(b), 'expected (x*3) term present');
    check('localInitAllZero', /\b7\b/.test(b), 'expected (x-7) term present');
  } else {
    check('localInitAllZero', false, 'function body not found');
  }

  // -- root value block: function body is an unnamed value-typed block.
  // The last child must be emitted as `return <tail>`, not as a dangling
  // expression followed by a `return 0` stabilizer.  Regression guard for
  // the tryEmitRootValueBlock_ intercept in AbstractCodegen.
  //
  // Tail expression is `i32.add(p(0), p(1))` — the return must contain the
  // `+` operator.  Bug signature: the tail is emitted as a dangling stmt
  // and replaced by `return 0` (or `return 0|0`), which has no `+`.
  b = bodyOf('rootValueBlock');
  if (b) {
    check('rootValueBlock', /return\b/.test(b), 'expected a return statement');
    check('rootValueBlock', !/^\s*return\s+0\s*(\||;)/m.test(b), 'expected real tail value, not bare `return 0` stabilizer');
    check('rootValueBlock', /return\s+[^;]*\+/.test(b), 'expected return to contain the `+` tail operator');
  } else {
    check('rootValueBlock', false, 'function body not found');
  }

  if (failures.length) {
    throw new Error('Code structure validation FAILED:\n  ' + failures.join('\n  '));
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest, validateCode};
