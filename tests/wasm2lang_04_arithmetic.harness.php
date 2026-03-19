<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['i32_values'] as $a) {
        $exports['exerciseNestedArithmetic']($a);
    }

    foreach ($data['i32_pairs'] as $scenario) {
        $exports['exerciseMemoryArithmetic']($scenario[0], $scenario[1]);
    }

    foreach (array_slice($data['mixed_type_cases'], 0, 4) as $scenario) {
        $exports['exerciseMixedTypeChains']($scenario[0], $scenario[1], $scenario[2]);
    }

    $exports['exerciseEdgeArithmetic']();
};

$dumpMemory = true;
