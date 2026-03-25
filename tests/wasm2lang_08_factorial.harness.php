<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null): void {
    $exports['alignHeapTop']();

    foreach ($data['factorial_inputs'] as $n) {
        $exports['exerciseFactorial']($n);
    }
};

$dumpMemory = true;
