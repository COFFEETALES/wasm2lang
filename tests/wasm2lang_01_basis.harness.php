<?php
declare(strict_types=1);

/**
 * PHP test harness for wasm2lang_01_basis.
 *
 * IMPORTANT: The closures capture {@code &$memBuffer} by reference.
 * That variable does not exist yet when this file is {@code require}d — PHP
 * implicitly creates it as {@code null}.  The runner later executes
 * {@code eval($code)} which assigns the real buffer to the same variable in
 * the same scope, and the closures see the update through the reference.
 */

/**
 * @param string $buffer
 * @param int    $startIndex
 * @return string
 */
$readZeroTerminatedString = function (string &$buffer, int $startIndex): string {
    $output = '';
    for ($byteIndex = $startIndex; ord($buffer[$byteIndex]) !== 0; ++$byteIndex) {
        $output .= $buffer[$byteIndex];
    }
    return $output;
};

$moduleImports = [
    'hostOnBufferReady' => function () use (&$memBuffer, &$stdoutWrite, $readZeroTerminatedString): void {
        $actualOutput = $readZeroTerminatedString($memBuffer, 128);
        $stdoutWrite($actualOutput);
    },
];

/**
 * @param string     $buff
 * @param callable   $out
 * @param array      $exports
 * @param array|null $data  Shared edge-case corpus (from wasm2lang.shared.data.json).
 */
$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite,
    $readZeroTerminatedString
): void {
    $stdoutWrite = $out;
    $exports['emitSegmentsToHost']();

    $exports['alignHeapTop']();
    $startOffset = $exports['getHeapTop']();

    // MVP ops — shared i32/f32/f64 triples.
    foreach ($data['i32_f32_f64_triples'] as $t) {
        $exports['exerciseMVPOps']($t[0], $t[1], $t[2]);
    }

    $exports['exerciseOverflowOps']();
    $exports['exerciseEdgeCases']();

    // br_table dispatch — shared branch indices.
    foreach ($data['branch_indices'] as $index) {
        $exports['exerciseBrTable']($index);
    }

    // br_table with loop target — shared countdown values.
    foreach ($data['loop_countdown_values'] as $startCount) {
        $exports['exerciseBrTableLoop']($startCount);
    }

    // Counted loop — shared loop pairs.
    foreach ($data['loop_pairs'] as $scenario) {
        $exports['exerciseCountedLoop']($scenario[0], $scenario[1]);
    }

    // Do-while countdown — shared do-while values.
    foreach ($data['do_while_values'] as $countdownStart) {
        $exports['exerciseDoWhileLoop']($countdownStart);
    }

    // Do-while variant — function-specific scenarios.
    foreach ([[1, 10], [3, 1], [7, 0], [2, 4]] as $scenario) {
        $exports['exerciseDoWhileVariantA']($scenario[0], $scenario[1]);
    }

    // Nested loop + switch dispatch — function-specific scenarios.
    foreach ([[0, 0], [1, 0], [3, 0], [3, 2], [4, -1]] as $scenario) {
        $exports['exerciseNestedLoops']($scenario[0], $scenario[1]);
    }

    // Loop state machine — shared i32 triples.
    foreach ($data['i32_triples'] as $scenario) {
        $exports['exerciseSwitchInLoop']($scenario[0], $scenario[1], $scenario[2]);
    }

    // br_table with duplicate targets — function-specific (differs from branch_indices).
    foreach ([0, 1, 2, 3, 4, 5, -1, 99] as $index) {
        $exports['exerciseBrTableMultiTarget']($index);
    }

    // Nested switches — function-specific scenarios.
    foreach ([[0, 0], [0, 1], [0, -1], [0, 5], [1, 0], [2, 0], [-1, 0], [9, 0]] as $scenario) {
        $exports['exerciseNestedSwitch']($scenario[0], $scenario[1]);
    }

    // br_table with an internal default target — function-specific subset.
    foreach ([0, 1, 2, 3, -1, 99] as $index) {
        $exports['exerciseSwitchDefaultInternal']($index);
    }

    // Multi-exit loop + switch — function-specific scenarios.
    foreach ([[0, 0], [0, 50], [1, 1], [2, -5], [2, 5], [3, 7], [-1, 42], [9, 42]] as $scenario) {
        $exports['exerciseMultiExitSwitchLoop']($scenario[0], $scenario[1]);
    }

    // Conditional escape loop + switch — function-specific scenarios.
    foreach ([[10, 0], [30, 0], [1, 0], [0, 5], [-10, 2], [60, 2], [5, -1]] as $scenario) {
        $exports['exerciseSwitchConditionalEscape']($scenario[0], $scenario[1]);
    }

    // Nested arithmetic trees — shared i32 values.
    foreach ($data['i32_values'] as $a) {
        $exports['exerciseNestedArithmetic']($a);
    }

    // Memory-driven arithmetic — shared i32 pairs.
    foreach ($data['i32_pairs'] as $scenario) {
        $exports['exerciseMemoryArithmetic']($scenario[0], $scenario[1]);
    }

    // Mixed-type chains — first 4 shared mixed-type cases.
    foreach (array_slice($data['mixed_type_cases'], 0, 4) as $scenario) {
        $exports['exerciseMixedTypeChains']($scenario[0], $scenario[1], $scenario[2]);
    }

    // Edge arithmetic — no parameters.
    $exports['exerciseEdgeArithmetic']();

    // Mixed-width loads — shared subword cases.
    foreach ($data['subword_cases'] as $scenario) {
        $exports['exerciseMixedWidthLoads']($scenario[0], $scenario[1]);
    }

    // Load-to-float — function-specific pairs (differs from subword_cases).
    foreach ([[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 256], [-128, 127]] as $scenario) {
        $exports['exerciseLoadToFloat']($scenario[0], $scenario[1]);
    }

    // Cross-type pipeline — shared mixed-type cases.
    foreach ($data['mixed_type_cases'] as $scenario) {
        $exports['exerciseCrossTypePipeline']($scenario[0], $scenario[1], $scenario[2]);
    }

    // Sub-word store/reload — shared subword cases.
    foreach ($data['subword_cases'] as $scenario) {
        $exports['exerciseSubWordStoreReload']($scenario[0], $scenario[1]);
    }

    // Precision and reinterpret — shared mixed-type cases.
    foreach ($data['mixed_type_cases'] as $scenario) {
        $exports['exercisePrecisionAndReinterpret']($scenario[0], $scenario[1], $scenario[2]);
    }
};

$dumpMemory = true;
