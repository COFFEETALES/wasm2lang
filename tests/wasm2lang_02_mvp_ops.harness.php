<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    // MVP ops — shared i32/f32/f64 triples.
    foreach ($data['i32_f32_f64_triples'] as $t) {
        $exports['exerciseMVPOps']($t[0], $t[1], $t[2]);
    }

    $exports['exerciseOverflowOps']();
    $exports['exerciseEdgeCases']();
};

$dumpMemory = true;
