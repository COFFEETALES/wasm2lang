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

    // Trunc/convert chains with wide-range random float input.
    foreach ($data['trunc_convert_pairs'] as $p) {
        $exports['exerciseTruncConvert']($p[0], $p[1]);
    }

    $exports['exerciseOverflowOps']();
    $exports['exerciseEdgeCases']();

    // Exported mutable global: exercise via getter/setter and function.
    $exports['counter$set'](42);
    $exports['exerciseGlobalExports']($exports['counter']());
    $exports['counter$set'](100);
    $exports['exerciseGlobalExports']($exports['counter']());
};

$dumpMemory = true;
