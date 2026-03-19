<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['subword_cases'] as $scenario) {
        $exports['exerciseMixedWidthLoads']($scenario[0], $scenario[1]);
    }
    foreach ([[42, 7], [0, 0], [-1, 1], [0x12345678, -100], [255, 256], [-128, 127]] as $scenario) {
        $exports['exerciseLoadToFloat']($scenario[0], $scenario[1]);
    }
    foreach ($data['mixed_type_cases'] as $scenario) {
        $exports['exerciseCrossTypePipeline']($scenario[0], $scenario[1], $scenario[2]);
    }
    foreach ($data['subword_cases'] as $scenario) {
        $exports['exerciseSubWordStoreReload']($scenario[0], $scenario[1]);
    }
    foreach ($data['mixed_type_cases'] as $scenario) {
        $exports['exercisePrecisionAndReinterpret']($scenario[0], $scenario[1], $scenario[2]);
    }
};

$dumpMemory = true;
