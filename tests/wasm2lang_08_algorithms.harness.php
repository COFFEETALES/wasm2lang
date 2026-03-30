<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();
    $exports['initCrc32Tables']();

    foreach ($data['factorial_inputs'] as $n) {
        $exports['exerciseFactorial']($n);
    }

    foreach ($data['fibonacci_inputs'] as $n) {
        $exports['exerciseFibonacci']($n);
    }

    foreach ($data['collatz_inputs'] as $n) {
        $exports['exerciseCollatz']($n);
    }

    foreach ($data['gcd_inputs'] as $pair) {
        $exports['exerciseGcd']($pair[0], $pair[1]);
    }

    foreach ($data['select_inputs'] as $pair) {
        $exports['exerciseSelect']($pair[0], $pair[1]);
    }

    foreach ($data['bitwise_inputs'] as $v) {
        $exports['exerciseBitwise']($v);
    }

    $scratch = 1088;

    foreach ($data['string_inputs'] as $str) {
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $buff[$scratch + $i] = $str[$i];
        }
        $buff[$scratch + $len] = "\x00";
        $exports['exerciseString']($scratch);
    }

    foreach ($data['crc32_inputs'] as $str) {
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $buff[$scratch + $i] = $str[$i];
        }
        $exports['exerciseCrc32']($scratch, $len);
    }

    $exports['exerciseMemory']($scratch);
};

$dumpMemory = true;
