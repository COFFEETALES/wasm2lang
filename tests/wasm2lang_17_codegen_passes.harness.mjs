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

    b = bodyOf('nonWrappingDispatch');
    check(
      'nonWrappingDispatch',
      b && (b.match(/\w+\s*:\s*\{/g) || []).length < (b.match(/\bcase\s+\d+\s*:/g) || []).length,
      'expected flat switch (fewer labeled blocks than cases)'
    );

    b = bodyOf('wrappingDispatchEpilogue');
    check(
      'wrappingDispatchEpilogue',
      b && (b.match(/\w+\s*:\s*\{/g) || []).length < (b.match(/\bcase\s+\d+\s*:/g) || []).length,
      'expected flat switch (fewer labeled blocks than cases)'
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

  if (failures.length) {
    throw new Error('Code structure validation FAILED:\n  ' + failures.join('\n  '));
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest, validateCode};
