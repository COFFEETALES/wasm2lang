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
    $exports['exerciseMVPOps'](42, 3.5, 2.75);
};

$dumpMemory = true;
