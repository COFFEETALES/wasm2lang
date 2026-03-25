<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null): void {
    $exports['alignHeapTop']();
    $scratch = 0;

    foreach ($data['crc32_inputs'] as $str) {
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $buff[$scratch + $i] = $str[$i];
        }
        $exports['exerciseCrc32']($scratch, $len);
    }
};

$dumpMemory = true;
