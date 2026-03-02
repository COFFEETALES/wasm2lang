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

//  $harnessPath = __DIR__ . '/' . $testName . '.harness.php';
//
//  if (!is_file($harnessPath)) {
//      fwrite(STDERR, 'Harness file not found: ' . $harnessPath . PHP_EOL);
//      exit(1);
//  }
//
//  /*
//   * The harness PHP file is expected to define:
//   *   $memoryPageSize     (int)
//   *   $memoryInitialPages (int)
//   *   $memoryMaximumPages (int)
//   *   $moduleImports      (array)     — imported functions keyed by name
//   *   $runTest            (Closure)   — function(string &$memBuffer, Closure $stdoutWrite, array $exports): void
//   *   $heapBase           (int)
//   *   $dumpMemory         (bool)      — optional, default false
//   */
//  require $harnessPath;
//
//  if (!isset($dumpMemory)) {
//      $dumpMemory = false;
//  }
$dumpMemory = true;

// ---- Read PHP module code from stdin ----

$code = file_get_contents('php://stdin');

if (false === $code || '' === $code) {
    fwrite(STDERR, 'No input received on stdin.' . PHP_EOL);
    exit(1);
}

/** @var array|null */
$instanceMemoryBuffer = null;

/*
 * Evaluate the PHP module code read from stdin.
 *
 * The evaluated code is expected to define:
 *   $memBuffer  (array)    — word-indexed int array (i32 words, little-endian)
 *   $module     (Closure)  — function(array $foreign, array &$buffer): array
 *                             returning an associative array of exported functions
 */
$tmpFile = tempnam(sys_get_temp_dir(), 'w2l_');
file_put_contents($tmpFile, $code);
require $tmpFile;
unlink($tmpFile);

if (!isset($memBuffer) || !isset($module)) {
    fwrite(STDERR, 'Evaluated code did not define $memBuffer and $module.' . PHP_EOL);
    exit(1);
}

/** @var array */
$exports = $module($moduleImports ?? [], $memBuffer);
$instanceMemoryBuffer = $memBuffer;

if (isset($runTest)) {
    $runTest($instanceMemoryBuffer, $stdoutWrite, $exports);
}

// ---- Memory CRC32 dump ----

if ($dumpMemory && null !== $instanceMemoryBuffer) {
    // /**
    //  * CRC32 — bit-by-bit implementation matching the JS runner.
    //  * Uses polynomial 0xEDB88320 (standard CRC-32).
    //  *
    //  * Iterates the word-indexed int array in order, extracting 4 bytes per
    //  * word in little-endian order via bit masking.  The word is masked to
    //  * 32 bits before extraction to neutralise PHP's 64-bit sign extension.
    //  *
    //  * @param array $words Word-indexed i32 array (little-endian layout).
    //  * @return int Unsigned 32-bit CRC value.
    //  */
    // $crc32 = function (array $words): int {
    //     $crc = 0xFFFFFFFF;
    //
    //     foreach ($words as $word) {
    //         $word32 = $word & 0xFFFFFFFF; // strip 64-bit sign extension
    //         for ($b = 0; $b !== 4; ++$b) {
    //             $ch = ($word32 >> ($b << 3)) & 0xFF;
    //             for ($j = 0; $j !== 8; ++$j) {
    //                 $bit = ($ch ^ $crc) & 1;
    //                 $crc = ($crc >> 1) & 0x7FFFFFFF; // unsigned right shift
    //                 if ($bit) {
    //                     $crc ^= 0xEDB88320;
    //                 }
    //                 $ch >>= 1;
    //             }
    //         }
    //     }
    //
    //     return ~$crc & 0xFFFFFFFF; // unsigned 32-bit result
    // };

    /** Pack word-indexed i32 array into a binary string, then use PHP's built-in crc32(). */
    $crc32 = function (array $words): int {
        $bin = pack('V*', ...array_map(fn($w) => $w & 0xFFFFFFFF, $words));
        return crc32($bin) & 0xFFFFFFFF; // unsigned 32-bit result
    };

    $stdoutWrite('Memory CRC32: 0x' . str_pad(dechex($crc32($instanceMemoryBuffer)), 8, '0', STR_PAD_LEFT) . "\n");
}
