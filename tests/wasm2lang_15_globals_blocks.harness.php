<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['global_pairs'] as $pair) {
        $exports['exerciseGlobals']($pair[0], $pair[1]);
    }

    $exports['exerciseFind2D']();

    foreach ($data['validation_triples'] as $triple) {
        $exports['exerciseValidation']($triple[0], $triple[1], $triple[2]);
    }

    foreach ($data['if_expr_triples'] as $triple) {
        $exports['exerciseIfExpressions']($triple[0], $triple[1], $triple[2]);
    }

    foreach ($data['mutual_recursion_inputs'] as $n) {
        $exports['exerciseMutualRecursion']($n);
    }

    foreach ($data['drop_inputs'] as $n) {
        $exports['exerciseDrop']($n);
    }
};

$dumpMemory = true;
