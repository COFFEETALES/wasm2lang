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

    $scratch = 1088;
    foreach ($data['crc32_inputs'] as $str) {
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $buff[$scratch + $i] = $str[$i];
        }
        $exports['exerciseCrc32']($scratch, $len);
    }
};

$dumpMemory = true;
