<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['cast_triples'] as $t) {
        $exports['exerciseI32Casts']($t[0], $t[1], $t[2]);
        $exports['exerciseU32Casts']($t[0], $t[1], $t[2]);
    }

    $exports['exerciseCastEdgeCases']();
};

$dumpMemory = true;
