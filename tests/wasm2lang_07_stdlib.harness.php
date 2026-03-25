<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports, ?array $data = null) use (
    &$stdoutWrite
): void {
    $stdoutWrite = $out;
    $exports['alignHeapTop']();
    $exports['exerciseStdlibMath1']();
    $exports['exerciseStdlibMath2']();
    $exports['exerciseStdlibConstants']();
};

$dumpMemory = true;
