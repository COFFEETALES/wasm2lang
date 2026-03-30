# Changelog

## v2026.03.105

### Added

- Native i64 support in the Java backend: `long` type for all 64-bit integer operations (arithmetic, bitwise, shift, rotate, unsigned division/comparison), i64 memory load/store, and 15 conversion/reinterpret unary handlers — with `needsI64Lowering()` hook so Java skips binaryen's i64-to-i32 lowering entirely.
- `ValueType` utility module (`src/backend/value_types.js`): shared type-checking helpers replacing ad-hoc `=== binaryen.i32` comparisons across backends.
- `binaryen:max` optimization pipeline with `safeGetExpressionInfo` wrapper for binaryen C++ fatal error recovery.
- If-guarded while-loop detection (`lw$`/`ly$` prefixes) emitting native `while (cond) { ... }` across all three backends.
- `i32.extend8_s` and `i32.extend16_s` sign-extension instructions across all three backends.
- Bulk memory operations (`memory.copy`, `memory.fill`) and `memory.grow` across all three backends.
- Per-test build configuration: `.build.languages` and `.build.normalize` files for selective backend/normalization overrides.
- i64 operations test (`wasm2lang_11_i64_ops`): 50+ edge cases, Java-only, CRC32-validated.
- Algorithms test suite (`wasm2lang_08_algorithms`): fibonacci, collatz, GCD, select, popcount, string reversal, memory copy.
- Dedicated memory test (`wasm2lang_09_memory`): bulk memory and memory grow validation with CRC32 checksums.
- `$g_Infinity` and `$g_NaN` registered with the asm.js identifier mangler.
- 69 binaryen extern type definitions for i64 operations.

### Fixed

- Binaryen segment name probing after i64-to-i32 lowering: suppressed `Fatal()` stderr and exit code corruption when `remove-non-js-ops` splits segments.
- Asm.js global identifier keys now consistently use `'$g_' + safeName_(name)`, fixing unmangled output for names with hyphens.
- `simplify-locals-notee-nostructure` replaces `simplify-locals` to prevent `local.tee` reintroduction after `flatten`.

### Changed

- i64-to-i32 lowering gated by `needsI64Lowering()` — each backend controls whether the lowering sequence runs.
- Unused import and global declarations stripped from all three backend emitters via `markBinding_()` tracking.
- Identifier rejection logic centralized into backend mangler profiles.
- JSDoc `@type` annotations normalized across 41 source files (181 instances).
- Test suite consolidated from 12 to 10 tests, then expanded to 11 with i64 ops.

## v2026.03.104

### Added

- Do-while loop normalization pass (`ld$` prefix): emits `do { ... } while (cond)` for loops ending with a conditional self-continue.
- Boolean operand materialization: comparison/eqz results wrapped as `(expr ? 1 : 0)` before arithmetic use.

### Changed

- Abstract codegen class further refactored after the v2026.03.103 split.

## v2026.03.103

### Changed

- Abstract codegen class split from a single 2733-line file into 7 focused modules.
- Redundant outermost parentheses eliminated from generated expressions via improved precedence tracking.

## v2026.03.102

### Added

- Browser playground: interactive WAT editor with syntax highlighting and three-backend transpilation preview.

### Fixed

- CLI entry point for `npm install -g` usage: added shebang and switched to Node module resolution for binaryen.

## v2026.03.101

### Fixed

- `if (result i32)` now correctly emitted as a ternary expression with type-appropriate coercion in all three backends.

## v2026.03.100

Initial npm release of the rewritten wasm2lang transpiler.

### Features

- Three backend targets: asm.js, PHP64, and Java.
- Traversal-based code emission with typed expression metadata and coercion elimination.
- Identifier mangling via Feistel-round permutation.
- Function table support with per-signature grouping and power-of-two padding.
- Six custom wasm2lang passes: switch dispatch (`sw$`), root switch (`rs$`), block-loop fusion (`lb$`), loop simplification (`lc$`/`ld$`/`lw$`/`ly$`), local usage analysis, and drop-const elision.
- Three binaryen normalization bundles: `binaryen:none`, `binaryen:min`, `binaryen:max`.
- Ten-test verification suite with CRC32 checksum validation across all backends.
