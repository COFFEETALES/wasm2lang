<?php
declare(strict_types=1);

$moduleImports = [];

// ---------------------------------------------------------------------------
// Code structure validation helpers (PHP backend)
// ---------------------------------------------------------------------------

/**
 * Resolves an export name to the internal closure variable name via the
 * module's return statement: return ['exportName' => $varName, ...];
 */
function w2lResolveExport(string $code, string $exportName): ?string
{
    if (!preg_match('/return\s*\[([^\]]+)\]/s', $code, $m)) return null;
    $escaped = preg_quote($exportName, '/');
    if (!preg_match("/'" . $escaped . "'\s*=>\s*(\\\$\w+)/", $m[1], $m2)) return null;
    return $m2[1];
}

/**
 * Extracts a closure body by finding "$varName = function(" and brace-counting.
 */
function w2lExtractBody(string $code, string $varName): ?string
{
    $marker = $varName . ' = function(';
    $start = strpos($code, $marker);
    if ($start === false) return null;
    $depth = 0;
    $bodyStart = -1;
    $len = strlen($code);
    for ($i = $start; $i < $len; $i++) {
        $ch = $code[$i];
        if ($ch === '{') {
            if ($bodyStart === -1) $bodyStart = $i;
            $depth++;
        } elseif ($ch === '}') {
            $depth--;
            if ($depth === 0) return substr($code, $bodyStart + 1, $i - $bodyStart - 1);
        }
    }
    return null;
}

/** Resolves export name and extracts the closure body. */
function w2lBodyOf(string $code, string $exportName): ?string
{
    $varName = w2lResolveExport($code, $exportName);
    if ($varName === null) return null;
    return w2lExtractBody($code, $varName);
}

/**
 * Counts simplified while loops (while( that are NOT } while( from do-while
 * tails, and NOT while (false) from labeled-block wrappers).
 */
function w2lCountSimplifiedWhile(string $body): int
{
    preg_match_all('/while\s*\(/', $body, $all);
    preg_match_all('/\}\s*while\s*\(/', $body, $doWhile);
    preg_match_all('/while\s*\(\s*false\s*\)/', $body, $falseWhile);
    return count($all[0]) - count($doWhile[0]) - count($falseWhile[0]);
}

/**
 * Validates that wasm2lang:codegen structural transformations are present
 * in the generated PHP code.  Only runs for the _codegen variant.
 *
 * @param string $code     Raw PHP source code.
 * @param string $testName Test name (includes _codegen or _none suffix).
 */
$validateCode = function (string $code, string $testName): void {
    if (substr($testName, -8) !== '_codegen' && substr($testName, -8) !== '_prenorm') return;

    $failures = [];
    $check = function (string $name, bool $cond, string $msg) use (&$failures): void {
        if (!$cond) $failures[] = $name . ': ' . $msg;
    };

    // Simplification checks only apply to the prenorm variant (--pre-normalized
    // enables backend simplifications; the codegen variant verifies correctness
    // without them).
    $hasSimplifications = substr($testName, -8) === '_prenorm' || substr($testName, -8) === '_codegen';

    if ($hasSimplifications) {
        // -- while simplification --
        $b = w2lBodyOf($code, 'fusedWhileSum');
        $check('fusedWhileSum', $b !== null && w2lCountSimplifiedWhile($b) >= 1, 'expected while loop with condition');

        $b = w2lBodyOf($code, 'fusedBreakFromNestedIf');
        $check('fusedBreakFromNestedIf', $b !== null && w2lCountSimplifiedWhile($b) >= 1, 'expected while loop with condition');

        $b = w2lBodyOf($code, 'nestedWhileLoops');
        $check('nestedWhileLoops', $b !== null && w2lCountSimplifiedWhile($b) >= 2, 'expected >= 2 while loops with conditions');

        $b = w2lBodyOf($code, 'whileWithInnerContinue');
        $check('whileWithInnerContinue', $b !== null && w2lCountSimplifiedWhile($b) >= 1, 'expected while loop with condition');

        // -- do-while --
        $b = w2lBodyOf($code, 'doWhileBreakOuter');
        $check('doWhileBreakOuter', $b !== null && (bool) preg_match('/\bdo\s*\{/', $b), 'expected do-while loop');

        $b = w2lBodyOf($code, 'fusedDoWhile');
        $check('fusedDoWhile', $b !== null && (bool) preg_match('/\bdo\s*\{/', $b), 'expected do-while loop');

        // -- flat switch dispatch --
        // PHP: labeled blocks use do-while(false). Flattened dispatch has fewer
        // while(false) wrappers than case entries.
        $b = w2lBodyOf($code, 'switchRequiresLabel');
        if ($b !== null) {
            preg_match_all('/while\s*\(\s*false\s*\)/', $b, $_wf); preg_match_all('/\bcase\s+\d+\s*:/', $b, $_cs);
            $check('switchRequiresLabel', count($_wf[0]) < count($_cs[0]), 'expected flat switch (fewer labeled blocks than cases)');
        } else { $check('switchRequiresLabel', false, 'function body not found'); }

        $b = w2lBodyOf($code, 'nonWrappingDispatch');
        if ($b !== null) {
            preg_match_all('/while\s*\(\s*false\s*\)/', $b, $_wf); preg_match_all('/\bcase\s+\d+\s*:/', $b, $_cs);
            $check('nonWrappingDispatch', count($_wf[0]) < count($_cs[0]), 'expected flat switch (fewer labeled blocks than cases)');
        } else { $check('nonWrappingDispatch', false, 'function body not found'); }

        $b = w2lBodyOf($code, 'wrappingDispatchEpilogue');
        if ($b !== null) {
            preg_match_all('/while\s*\(\s*false\s*\)/', $b, $_wf); preg_match_all('/\bcase\s+\d+\s*:/', $b, $_cs);
            $check('wrappingDispatchEpilogue', count($_wf[0]) < count($_cs[0]), 'expected flat switch (fewer labeled blocks than cases)');
        } else { $check('wrappingDispatchEpilogue', false, 'function body not found'); }

        $b = w2lBodyOf($code, 'terminatorDispatch');
        if ($b !== null) {
            preg_match_all('/while\s*\(\s*false\s*\)/', $b, $_wf); preg_match_all('/\bcase\s+\d+\s*:/', $b, $_cs);
            $check('terminatorDispatch', count($_wf[0]) < count($_cs[0]), 'expected flat switch (fewer labeled blocks than cases)');
        } else { $check('terminatorDispatch', false, 'function body not found'); }

        // -- redundant block removal --
        $b = w2lBodyOf($code, 'redundantLoopBlock');
        $check('redundantLoopBlock', $b !== null && w2lCountSimplifiedWhile($b) >= 1, 'expected while loop with condition');

        // -- multi-guard while (compound condition) --
        $b = w2lBodyOf($code, 'multiGuardWhile');
        $check('multiGuardWhile', $b !== null && w2lCountSimplifiedWhile($b) >= 1, 'expected while loop with compound condition');

        // -- switch label elision --
        // PHP: switch without a do-while(false) wrapper means no label was needed.
        $b = w2lBodyOf($code, 'switchNoLabel');
        if ($b !== null) {
            preg_match_all('/\bcase\s+\d+\s*:/', $b, $_cs);
            $check('switchNoLabel', count($_cs[0]) >= 2, 'expected flat switch with cases');
            $check('switchNoLabel', !preg_match('/while\s*\(\s*false\s*\)\s*;\s*\n.*switch\s*\(/', $b), 'expected switch without labeled block wrapper');
        } else { $check('switchNoLabel', false, 'function body not found'); }

        // -- fused for loop label elision --
        $b = w2lBodyOf($code, 'fusedForNoLabel');
        if ($b !== null) {
            $check('fusedForNoLabel', (bool) preg_match('/\bfor\s*\(/', $b), 'expected for loop');
            preg_match_all('/while\s*\(\s*false\s*\)/', $b, $_wf);
            $check('fusedForNoLabel', count($_wf[0]) === 0, 'expected loop without labeled block wrapper');
        } else { $check('fusedForNoLabel', false, 'function body not found'); }
    }

    // -- if-else recovery (IR restructuring, always active) --
    $b = w2lBodyOf($code, 'ifElseSimple');
    $check('ifElseSimple', $b !== null && (bool) preg_match('/\}\s*else\s*\{/', $b), 'expected if/else structure');

    // -- guard elision (IR restructuring, always active) --
    $b = w2lBodyOf($code, 'guardElisionProduct');
    $check('guardElisionProduct', $b !== null && !preg_match('/while\s*\(\s*false\s*\)/', $b), 'expected guard elision (no labeled block wrapper)');

    // -- local init folding --
    // PHP declarations are semicolon-joined on one line: $l1 = 10; $l2 = 20; ...
    // Match a line with 2+ "$var = val;" assignments and check for folded values.
    $b = w2lBodyOf($code, 'localInitFolding');
    if ($b !== null) {
        $hasDeclLine = preg_match('/^[ \t]*(\$\w+\s*=\s*[^;]+;\s*){2,}/m', $b, $declMatch);
        $check('localInitFolding', $hasDeclLine && strpos($declMatch[0], '10') !== false, 'expected init value 10 in declarations');
        $check('localInitFolding', $hasDeclLine && strpos($declMatch[0], '20') !== false, 'expected init value 20 in declarations');
    } else {
        $check('localInitFolding', false, 'function body not found');
    }

    // -- local init folding mixed (non-foldable before foldable) --
    $b = w2lBodyOf($code, 'localInitFoldingMixed');
    if ($b !== null) {
        $hasDeclLine = preg_match('/^[ \t]*(\$\w+\s*=\s*[^;]+;\s*){2,}/m', $b, $declMatch);
        $check('localInitFoldingMixed', $hasDeclLine && strpos($declMatch[0], '42') !== false, 'expected init value 42 in declarations');
        $check('localInitFoldingMixed', strpos($b, '100') !== false, 'expected non-foldable base computation (+ 100) present');
    } else {
        $check('localInitFoldingMixed', false, 'function body not found');
    }

    if (count($failures) > 0) {
        throw new \RuntimeException("Code structure validation FAILED:\n  " . implode("\n  ", $failures));
    }
};

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['fused_while_limits'] as $v) {
        $exports['exerciseFusedWhile']($v);
    }

    foreach ($data['fused_break_inputs'] as $v) {
        $exports['exerciseFusedBreakFromIf']($v);
    }

    foreach ($data['nested_while_triples'] as $triple) {
        $exports['exerciseNestedWhile']($triple[0], $triple[1], $triple[2]);
    }

    foreach ($data['while_continue_limits'] as $v) {
        $exports['exerciseWhileWithContinue']($v);
    }

    foreach ($data['distant_exit_pairs'] as $pair) {
        $exports['exerciseDistantExit']($pair[0], $pair[1]);
    }

    foreach ($data['do_while_break_starts'] as $v) {
        $exports['exerciseDoWhileBreak']($v);
    }

    foreach ($data['fused_do_while_inputs'] as $v) {
        $exports['exerciseFusedDoWhile']($v);
    }

    foreach ($data['multi_break_triples'] as $triple) {
        $exports['exerciseMultiBreak']($triple[0], $triple[1], $triple[2]);
    }

    foreach ($data['if_else_pairs'] as $pair) {
        $exports['exerciseIfElseSimple']($pair[0], $pair[1]);
    }

    foreach ($data['if_else_kept_pairs'] as $pair) {
        $exports['exerciseIfElseKeptLabel']($pair[0], $pair[1]);
    }

    foreach ($data['switch_requires_label_indices'] as $v) {
        $exports['exerciseSwitchRequiresLabel']($v);
    }

    foreach ($data['non_wrapping_dispatch_triples'] as $triple) {
        $exports['exerciseNonWrappingDispatch']($triple[0], $triple[1], $triple[2]);
    }

    foreach ($data['wrapping_dispatch_epilogue_pairs'] as $pair) {
        $exports['exerciseWrappingDispatchEpilogue']($pair[0], $pair[1]);
    }

    foreach ($data['terminator_dispatch_triples'] as $triple) {
        $exports['exerciseTerminatorDispatch']($triple[0], $triple[1], $triple[2]);
    }

    foreach ($data['guard_elision_product_values'] as $v) {
        $exports['exerciseGuardElisionProduct']($v);
    }

    foreach ($data['guard_elision_retained_pairs'] as $pair) {
        $exports['exerciseGuardElisionRetained']($pair[0], $pair[1]);
    }

    foreach ($data['redundant_loop_block_limits'] as $v) {
        $exports['exerciseRedundantLoopBlock']($v);
    }

    foreach ($data['local_init_folding_limits'] as $v) {
        $exports['exerciseLocalInitFolding']($v);
    }

    foreach ($data['local_init_folding_mixed_limits'] as $v) {
        $exports['exerciseLocalInitFoldingMixed']($v);
    }

    foreach ($data['multi_guard_while_pairs'] as $pair) {
        $exports['exerciseMultiGuardWhile']($pair[0], $pair[1]);
    }

    foreach ($data['switch_no_label_pairs'] as $pair) {
        $exports['exerciseSwitchNoLabel']($pair[0], $pair[1]);
    }

    foreach ($data['fused_for_no_label_limits'] as $v) {
        $exports['exerciseFusedForNoLabel']($v);
    }

    foreach ($data['no_while_block_tail_limits'] as $v) {
        $exports['exerciseNoWhileBlockTail']($v);
    }
};

$dumpMemory = true;
