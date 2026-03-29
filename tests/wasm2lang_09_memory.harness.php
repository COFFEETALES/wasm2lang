<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();
    $exports['exerciseBulkMemory']($exports['getHeapTop']());
    $exports['exerciseMemoryGrow']();

    foreach ($data['bulk_params'] as $p) {
        $exports['exerciseBulkFillVerify']($exports['getHeapTop'](), $p[0], $p[1]);
    }
};

$dumpMemory = true;
