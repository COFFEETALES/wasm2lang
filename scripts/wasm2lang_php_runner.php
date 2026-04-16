<?php
declare(strict_types=1);

/**
 * wasm2lang PHP test runner.
 *
 * PHP equivalent of wasm2lang_wasm_asmjs_runner.js.
 *
 * Usage:
 *   cat <test>.php | php wasm2lang_php_runner.php --test-name <dir>/<base>
 */

/** @var Closure(string): void */
$stdoutWrite = function (string $s): void {
    fwrite(STDOUT, $s);
};

// ---- Parse command-line arguments ----

$obj = [];
$obj['test-name'] = '';

/** @var string */
$pendingOptionName = '';
$args = array_slice($argv, 1);

foreach ($args as $currentArg) {
    if ('--' === substr($currentArg, 0, 2)) {
        if (2 === strlen($currentArg)) {
            continue;
        }
        $pendingOptionName = '';
        $obj[substr($currentArg, 2)] = true;
        $pendingOptionName = $currentArg;
    } elseif ('' !== $pendingOptionName) {
        $obj[substr($pendingOptionName, 2)] = $currentArg;
        $pendingOptionName = '';
    }
}

/** @var string */
$testName = (string) $obj['test-name'];

// ---- Load harness ----

$harnessPath = __DIR__ . '/' . $testName . '.harness.php';

if (is_file($harnessPath)) {
    /*
     * The harness PHP file is expected to define:
     *   $moduleImports      (array)     — imported functions keyed by name
     *   $runTest            (Closure)   — function(string &$memBuffer, Closure $stdoutWrite, array $exports): void
     *   $dumpMemory         (bool)      — optional, default true
     */
    require $harnessPath;
}

if (!isset($dumpMemory)) {
    $dumpMemory = true;
}

// ---- Read PHP module code from stdin ----

$code = file_get_contents('php://stdin');

if (false === $code || '' === $code) {
    fwrite(STDERR, 'No input received on stdin.' . PHP_EOL);
    exit(1);
}

if (isset($validateCode)) {
    $validateCode($code, $testName);
}

/** @var array|null */
$instanceMemoryBuffer = null;

/*
 * Evaluate the PHP module code read from stdin.
 *
 * The evaluated code is expected to define:
 *   $memBuffer  (string)   — binary string (little-endian byte buffer)
 *   $module     (Closure)  — function(array $foreign, string &$buffer): array
 *                             returning an associative array of exported functions
 */
$code = preg_replace('/^\s*<\?(php)?/i', '', $code, 1);
$code = preg_replace('/\?>\s*$/', '', $code, 1);

if (null === $code) {
    fwrite(STDERR, 'Failed to normalize PHP input before evaluation.' . PHP_EOL);
    exit(1);
}

eval($code);

if (!isset($memBuffer) || !isset($module)) {
    fwrite(STDERR, 'Evaluated code did not define $memBuffer and $module.' . PHP_EOL);
    exit(1);
}

/** @var array */
$exports = $module($moduleImports ?? [], $memBuffer);
// Alias — harness callbacks that captured &$instanceMemoryBuffer now see
// the same string that the module closures mutate via &$buffer.
$instanceMemoryBuffer = &$memBuffer;

if (isset($runTest)) {
    $sharedData = null;
    $testBase = preg_replace('/_(baseline|codegen|none|prenorm|nopre)$/', '', basename($testName));
    $dataPath = __DIR__ . '/' . $testBase . '.shared.data.json';
    if (is_file($dataPath)) {
        $sharedData = json_decode(file_get_contents($dataPath), true);
    }
    $runTest($memBuffer, $stdoutWrite, $exports, $sharedData);
}

// ---- Memory CRC32 dump ----

if ($dumpMemory && null !== $memBuffer) {
    /** Buffer is already a binary string — crc32() operates on it directly. */
    $crc = crc32($memBuffer) & 0xFFFFFFFF;

    $stdoutWrite('Memory CRC32: 0x' . str_pad(dechex($crc), 8, '0', STR_PAD_LEFT) . "\n");
}
