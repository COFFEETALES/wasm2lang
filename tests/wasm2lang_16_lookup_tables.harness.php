<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['square_inputs'] as $n) {
        $exports['exerciseSquares']($n);
    }

    foreach ($data['binary_search_needles'] as $needle) {
        $exports['exerciseBinarySearch']($needle);
    }

    foreach ($data['fib_memo_inputs'] as $n) {
        $exports['exerciseFibMemo']($n);
    }

    foreach ($data['bit_pattern_inputs'] as $n) {
        $exports['exerciseBitPatterns']($n);
    }

    $scratch = 1536;

    foreach ($data['crc32_strings'] as $str) {
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $buff[$scratch + $i] = $str[$i];
        }
        $exports['exerciseCrc32PreCalc']($scratch, $len);
    }
};

$dumpMemory = true;
