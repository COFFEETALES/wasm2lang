<?php
declare(strict_types=1);

$moduleImports = [];

$runTest = function (string &$buff, callable $out, array $exports): void {
    $exports['alignHeapTop']();
    $exports['exerciseBulkMemory']($exports['getHeapTop']());
};

$dumpMemory = true;
