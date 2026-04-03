<?php
declare(strict_types=1);

$moduleImports = [
    'i32_to_f32' => function (int $x): float {
        return (float) $x;
    },
    'i32_to_f64' => function (int $x): float {
        return (float) $x;
    },
    'f32_to_i32' => function (float $x): int {
        return (int) $x;
    },
    'f64_to_i32' => function (float $x): int {
        return (int) $x;
    },
];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();

    foreach ($data['cast_triples'] as $t) {
        $exports['exerciseI32Casts']($t[0], $t[1], $t[2]);
    }

    $exports['exerciseCastEdgeCases']();
};

$dumpMemory = true;
