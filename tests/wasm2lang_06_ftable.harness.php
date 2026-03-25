<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['i32_pairs'] as $p) {
        $exports['exerciseDispatchPair']($p[0], $p[1]);
    }

    foreach ($data['float_pairs'] as $p) {
        $exports['exerciseFloatPair']($p[0], $p[1]);
    }

    foreach ($data['i32_triples'] as $t) {
        $exports['exerciseTriple']($t[0], $t[1], $t[2]);
    }

    foreach ($data['i32_pairs'] as $p) {
        $exports['exerciseChained']($p[0], $p[1]);
    }

    $exports['exerciseEdgeCases']();

    foreach ($data['dynamic_dispatch'] as $d) {
        $exports['exerciseDynamicIndex']($d[0], $d[1], $d[2]);
    }
};

$dumpMemory = true;
