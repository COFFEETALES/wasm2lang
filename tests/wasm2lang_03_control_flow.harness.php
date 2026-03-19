<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null): void {
    $exports['alignHeapTop']();

    foreach ($data['branch_indices'] as $index) {
        $exports['exerciseBrTable']($index);
    }
    foreach ($data['loop_countdown_values'] as $startCount) {
        $exports['exerciseBrTableLoop']($startCount);
    }
    foreach ($data['loop_pairs'] as $scenario) {
        $exports['exerciseCountedLoop']($scenario[0], $scenario[1]);
    }
    foreach ($data['do_while_values'] as $countdownStart) {
        $exports['exerciseDoWhileLoop']($countdownStart);
    }
    foreach ([[1, 10], [3, 1], [7, 0], [2, 4]] as $scenario) {
        $exports['exerciseDoWhileVariantA']($scenario[0], $scenario[1]);
    }
    foreach ([[0, 0], [1, 0], [3, 0], [3, 2], [4, -1]] as $scenario) {
        $exports['exerciseNestedLoops']($scenario[0], $scenario[1]);
    }
    foreach ($data['i32_triples'] as $scenario) {
        $exports['exerciseSwitchInLoop']($scenario[0], $scenario[1], $scenario[2]);
    }
    foreach ([0, 1, 2, 3, 4, 5, -1, 99] as $index) {
        $exports['exerciseBrTableMultiTarget']($index);
    }
    foreach ([[0, 0], [0, 1], [0, -1], [0, 5], [1, 0], [2, 0], [-1, 0], [9, 0]] as $scenario) {
        $exports['exerciseNestedSwitch']($scenario[0], $scenario[1]);
    }
    foreach ([0, 1, 2, 3, -1, 99] as $index) {
        $exports['exerciseSwitchDefaultInternal']($index);
    }
    foreach ([[0, 0], [0, 50], [1, 1], [2, -5], [2, 5], [3, 7], [-1, 42], [9, 42]] as $scenario) {
        $exports['exerciseMultiExitSwitchLoop']($scenario[0], $scenario[1]);
    }
    foreach ([[10, 0], [30, 0], [1, 0], [0, 5], [-10, 2], [60, 2], [5, -1]] as $scenario) {
        $exports['exerciseSwitchConditionalEscape']($scenario[0], $scenario[1]);
    }
};

$dumpMemory = true;
