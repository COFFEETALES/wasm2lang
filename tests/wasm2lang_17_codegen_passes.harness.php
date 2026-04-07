<?php
declare(strict_types=1);

$moduleImports = [];

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

    foreach ($data['guard_elision_product_values'] as $v) {
        $exports['exerciseGuardElisionProduct']($v);
    }

    foreach ($data['guard_elision_retained_pairs'] as $pair) {
        $exports['exerciseGuardElisionRetained']($pair[0], $pair[1]);
    }

    foreach ($data['redundant_loop_block_limits'] as $v) {
        $exports['exerciseRedundantLoopBlock']($v);
    }
};

$dumpMemory = true;
