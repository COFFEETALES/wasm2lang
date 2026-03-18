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
 * @param string   $buff
 * @param callable $out
 * @param array    $exports
 */
$runTest = function (string &$buff, callable $out, array $exports) use (
    &$stdoutWrite,
    $readZeroTerminatedString
): void {
    $stdoutWrite = $out;
    $exports['emitSegmentsToHost']();

    $exports['alignHeapTop']();
    $startOffset = $exports['getHeapTop']();

    // Primary parameter set.
    $exports['exerciseMVPOps'](42, 3.5, 2.75);

    // Edge-case parameter sets.
    $exports['exerciseMVPOps'](0, 0.0, 0.0);
    $exports['exerciseMVPOps'](-1, 0.5, 0.5);
    $exports['exerciseMVPOps'](2147483647, 100.0, 100.0);

    // Additional parameter sets.
    $exports['exerciseMVPOps'](1, 1.0, 1.0);
    $exports['exerciseMVPOps'](-2147483648, 3.0, 3.0);
    $exports['exerciseMVPOps'](255, 0.125, 0.125);
    $exports['exerciseMVPOps'](16, 4.0, 4.0);

    $exports['exerciseOverflowOps']();
    $exports['exerciseEdgeCases']();

    // br_table dispatch: direct cases, default, and adversarial indices.
    foreach ([0, 1, 2, 3, 4, -1, 99, -2147483648] as $index) {
        $exports['exerciseBrTable']($index);
    }

    // br_table with loop target: positive countdowns and already-terminal starts.
    foreach ([5, 2, 1, 0, -3, 9] as $startCount) {
        $exports['exerciseBrTableLoop']($startCount);
    }

    // Counted loop: forward ranges, empty ranges, reverse ranges, and negatives.
    foreach ([[0, 5], [2, 2], [-2, 3], [5, 1], [7, 8]] as $scenario) {
        $exports['exerciseCountedLoop']($scenario[0], $scenario[1]);
    }

    // Do-while countdown: normal factorial path and non-positive entry values.
    foreach ([5, 1, 0, -3] as $countdownStart) {
        $exports['exerciseDoWhileLoop']($countdownStart);
    }

    // Do-while variant: long, short, and zero-budget entries.
    foreach ([[1, 10], [3, 1], [7, 0], [2, 4]] as $scenario) {
        $exports['exerciseDoWhileVariantA']($scenario[0], $scenario[1]);
    }

    // Nested loop + switch dispatch: empty outer loop, direct default, and alternating resets.
    foreach ([[0, 0], [1, 0], [3, 0], [3, 2], [4, -1]] as $scenario) {
        $exports['exerciseNestedLoops']($scenario[0], $scenario[1]);
    }

    // Loop state machine: multi-step transitions, direct case 2, terminal, and default exits.
    foreach ([[0, 0, 3], [0, 20, 5], [2, 9, 4], [3, 7, 2], [4, 99, 9], [-1, 5, 1]] as $scenario) {
        $exports['exerciseSwitchInLoop']($scenario[0], $scenario[1], $scenario[2]);
    }

    // br_table with duplicate targets: shared targets and default routing.
    foreach ([0, 1, 2, 3, 4, 5, -1, 99] as $index) {
        $exports['exerciseBrTableMultiTarget']($index);
    }

    // Nested switches: inner defaults, outer defaults, and outer non-zero cases.
    foreach ([[0, 0], [0, 1], [0, -1], [0, 5], [1, 0], [2, 0], [-1, 0], [9, 0]] as $scenario) {
        $exports['exerciseNestedSwitch']($scenario[0], $scenario[1]);
    }

    // br_table with an internal default target.
    foreach ([0, 1, 2, 3, -1, 99] as $index) {
        $exports['exerciseSwitchDefaultInternal']($index);
    }

    // Multi-exit loop + switch: completed, alternate, and default-driven exits.
    foreach ([[0, 0], [0, 50], [1, 1], [2, -5], [2, 5], [3, 7], [-1, 42], [9, 42]] as $scenario) {
        $exports['exerciseMultiExitSwitchLoop']($scenario[0], $scenario[1]);
    }

    // Conditional escape loop + switch: looping, immediate default exits, and direct escape checks.
    foreach ([[10, 0], [30, 0], [1, 0], [0, 5], [-10, 2], [60, 2], [5, -1]] as $scenario) {
        $exports['exerciseSwitchConditionalEscape']($scenario[0], $scenario[1]);
    }

    // Nested arithmetic trees: deeply nested i32 expressions.
    foreach ([42, 0, -1, 2147483647, 1, 255, -100] as $a) {
        $exports['exerciseNestedArithmetic']($a);
    }

    // Memory-driven arithmetic: store/load/compute chains.
    foreach ([[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 256]] as $scenario) {
        $exports['exerciseMemoryArithmetic']($scenario[0], $scenario[1]);
    }

    // Mixed-type chains: cross-type conversions and arithmetic.
    foreach ([[42, 3.5, 2.75], [0, 0.0, 0.0], [-1, -1.5, -1.5], [100, 0.125, 100.0]] as $scenario) {
        $exports['exerciseMixedTypeChains']($scenario[0], $scenario[1], $scenario[2]);
    }

    // Edge arithmetic: overflow, boundary, and identity tests.
    $exports['exerciseEdgeArithmetic']();

    // Mixed-width loads: signed/unsigned byte and halfword arithmetic.
    foreach ([[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 128], [-128, -1]] as $scenario) {
        $exports['exerciseMixedWidthLoads']($scenario[0], $scenario[1]);
    }

    // Load-to-float: memory loads converted to f32/f64 and combined.
    foreach ([[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 256], [-128, 127]] as $scenario) {
        $exports['exerciseLoadToFloat']($scenario[0], $scenario[1]);
    }

    // Cross-type pipeline: deep multi-stage mixed-type pipelines.
    foreach ([[42, 3.5, 2.75], [0, 0.0, 0.0], [-1, -1.5, -1.5], [100, 0.125, 100.0], [255, 10.0, -50.0]] as $scenario) {
        $exports['exerciseCrossTypePipeline']($scenario[0], $scenario[1], $scenario[2]);
    }

    // Sub-word store/reload: store8/store16 computed values, byte-assembly, multi-stage chains.
    foreach ([[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 128], [-128, -1]] as $scenario) {
        $exports['exerciseSubWordStoreReload']($scenario[0], $scenario[1]);
    }

    // Precision and reinterpret: f32 precision boundaries, fractional truncation, reinterpret chains.
    foreach ([[42, 3.5, 2.75], [0, 0.0, 0.0], [-1, -1.5, -1.5], [100, 0.125, 100.0], [255, 10.0, -50.0]] as $scenario) {
        $exports['exercisePrecisionAndReinterpret']($scenario[0], $scenario[1], $scenario[2]);
    }
};

$dumpMemory = true;
