# Changelog

## v2026.04.110

### Added

- JavaScript backend: new emitter built on shared `jscommon/` infrastructure. Uses BigInt for i64 (skips i64-to-i32 lowering via `needsI64Lowering()`), typed arrays for memory, DataView for f64.
- `--pre-normalized` CLI option for a two-step `wasm2lang:codegen` workflow: the first invocation normalizes and writes binary, the second reads it with `--pre-normalized --emit-code`. The backend falls back to IR-based structural detection for loop and control-flow patterns whose `w2l_` label hints were stripped during binary serialization.
- `w2l_codegen_meta` WASM custom section: persists `wasm2lang:codegen` pass analysis (loop plans, block-removal / guard-elision maps, switch dispatch, if-else recovery, local-init folding) so the two-step workflow recovers pass decisions without re-running the passes.
- Three new codegen-prep passes: `IfElseRecoveryPass` (rewrites `block + if-then-break` into `if/else`), `BlockGuardElisionPass` (rewrites `block + br_if` into `if (!cond)`), `RedundantBlockRemovalPass` (strips unreferenced labels and unwraps single-child blocks).
- Flat-switch chain terminator detection accepts `return` and `unreachable` alongside `break`.
- Three new test suites (`wasm2lang_15_globals_blocks`, `wasm2lang_16_lookup_tables`, `wasm2lang_17_codegen_passes`) and per-pass postbuild fixtures.

### Changed

- Asm.js rotate emission (`rotl`/`rotr`) now calls `$w2l_rotl32`/`$w2l_rotr32` helpers instead of inlining `(a << n) | (a >>> (32 - n))`, preventing exponential code-size growth on nested rotate chains.
- `eqz` on a comparison now negates the inner operator directly (e.g., `a !== b`) instead of materializing to an integer and testing against zero.
- `coerceCallResult_` extracted as an overridable hook: asm.js keeps FFI-f32 promotion (`Math_fround(+expr)` for host imports); the JavaScript backend overrides it to a no-op.
- `invertCondition` op dispatch replaced with a lazily-built lookup table keyed by binaryen op code.
- Backend boilerplate consolidated: shared mangler profiles, shared control-flow helpers, shared pass-accessor declarations via `declareNamedFlagAccessor_`.
- `binaryen:max` optimizer Fatal() recovery generalized: passes that trigger fatal IR-reduction errors (including `coalesce-locals`) are skipped instead of aborting the pipeline.
- Flat-switch epilogues and outer-label breaks preserved through dispatch detection.
- Closure-compiler arguments moved into `dist_artifacts/closure_flags.txt`; test pipeline I/O hardened with cross-variant output consistency checks.

### Fixed

- BigInt crash in i64 local-init folding metadata: zero-init i64 values now deserialize correctly through the `w2l_codegen_meta` round-trip.
- Java backend `noWhileBlockTail`: terminal-statement tracking suppresses the trailing `break` that the Java compiler rejects as unreachable.
- Flat-switch wrapper detection now inspects `br_table` targets instead of relying on the trailing-`br` heuristic, catching non-wrapping dispatches.
- Flat-switch epilogue detection for non-wrapping dispatches and PHP label-stack pop ordering corrected.
- Orphan labeled-break from flat-switch non-wrapping dispatch when the target loop label had been elided.
- Loop simplification while-detection now handles non-fused blocks, not only the `lb$`-prefixed fused shape.

## v2026.04.109

### Added

- `--out-file` CLI option: write output to a file instead of stdout, using an fd-based output sink.
- `optimize-for-js` binaryen pass for asm.js targets: simplifies JS-unfriendly ops (reinterprets, copysign) before lowering.
- `merge-blocks` and `remove-unused-names` passes added to the shared final IR preparation phase for both `binaryen:min` and `binaryen:max`.
- `coalesce-locals` pass in `binaryen:max`: merges non-interfering locals for tighter variable declarations.
- `remove-unused-module-elements` pass in `binaryen:max`: strips unreachable functions and globals after optimization.
- `avoid-reinterprets` pass (two rounds) in `binaryen:max` for asm.js targets: replaces reinterpret ops with store+load patterns.
- If-guarded while-loop detection (`lwi`/`lyi` variants) in the loop simplification pass: recognizes `(loop (if cond (then body (br loop))))` patterns produced by aggressive optimization and emits `while (cond) { body }`.

### Changed

- `binaryen:max` pipeline restructured to match binaryen wasm2js's proven approach: full `module.optimize()` now runs post-lowering (after i64-to-i32) instead of pre-lowering, allowing the optimizer to clean up lowering artifacts, inline small functions, and propagate constants through the lowered IR. Pre-lowering passes (`simplify-locals-nonesting`, `precompute-propagate`) prepare the IR for the full optimization pass.
- `applyBinaryenNormalization_` now accepts a `targetLanguage` parameter, enabling backend-specific binaryen passes (e.g. `optimize-for-js`, `avoid-reinterprets` for asm.js only).
- Traversal hot paths, normalization pass context reuse, and code emission performance optimized.

### Fixed

- `usedLabels` gap in flat switch emission: `emitLabeledGroupBody_` in `switch_dispatch_apply.js` now marks `state.usedLabels` for all external break/continue targets, preventing target loop labels from being incorrectly elided.
- Asm.js intish base address coercion: LoadId/StoreId handlers coerce intish-category base expressions (from `rem_u`/`div_u`) with `|0` before offset addition, fixing `intish + fixnum` asm.js type violations that manifested with `binaryen:max`.
- Misaligned integer load/store codegen: byte-decomposition helpers and direct binaryen alignment API used for sub-naturally-aligned accesses.

## v2026.04.108

### Added

- SIMD128 support for the Java backend: `IntVector`-based v128 code emission covering binary ops (add, sub, mul, min, max, and/or/xor, saturating arithmetic), comparisons (eq, ne, lt, gt, le, ge with signed and unsigned variants), unary ops, shuffle, extract/replace lane, shift, splat, load/store, and ternary (bitselect). Shared `SIMDOps` classification layer in `src/backend/simd_ops.js` with Java-specific rendering in `src/backend/java/simd_ops.js`.
- Cast-module import interception: functions imported from a `"cast"` module (e.g. `i32_to_f32`, `f64_to_i32`) are intercepted and emitted as native language-level type casts instead of function calls across all three backends. Unsigned cast variants (`u32`/`u64`) added with appropriate per-backend rendering.
- Spec-compliant trapping for asm.js non-saturating truncation (`trunc_s`/`trunc_u` for f32→i32 and f64→i32): NaN and out-of-range inputs call an imported `__wasm2lang_trap` function instead of silently producing wrong results. Helper dependency resolution via `HELPER_DEPS_` map with transitive `markHelper_` in the asm.js backend.
- Exported mutable global support: getter/setter accessor functions emitted for all three backends, with `MutableGlobals` added to the feature validation allow-list.
- `CAT_V128` expression category for v128-typed expressions in the shared coercion model.
- `ValueType.isV128` helper and `v128` type name in the shared value-type module.
- Seven SIMD node schema registrations (SIMDExtractId, SIMDReplaceId, SIMDShuffleId, SIMDTernaryId, SIMDShiftId, SIMDLoadId, SIMDLoadStoreLaneId) in the traversal kernel.
- 417 binaryen extern type definitions for SIMD operations.
- `createEnterLeaveVisitor` helper on `CustomPasses` for binding both enter and leave callbacks with shared state.
- Three new tests: `wasm2lang_12_casts` (i32 cast round-trips across all backends), `wasm2lang_13_i64_casts` (i64 cast variants, Java-only), `wasm2lang_14_simd` (SIMD lane/arithmetic/shuffle/compare exercises, Java-only).

### Changed

- INTISH coercion deferral in the asm.js backend: arithmetic, multiply, and rotate binary ops now return `INTISH` category instead of `SIGNED`, deferring `|0` coercion until a consumer actually requires an integer type. `prepareI32BinaryOperand_` materializes `|0` only when an INTISH value feeds into another binary op that requires a coerced operand. Eliminates redundant `|0` wrapping in expression chains.
- Non-saturating truncation ops (`trunc_s_f32_to_i32`, `trunc_s_f64_to_i32`) in the asm.js backend switched from inline `~~` expressions to helper functions with NaN/range checks and trap calls.
- Java numeric unary ops refactored: simple casts consolidated into `CAST_UNARY_OPS_` table, helper-delegated ops into `HELPER_UNARY_OPS_` table, replacing long if-else chains.
- Shared binary op renderers (`renderPlainBitwiseBinary_`, `renderPlainArithmeticBinary_`, `renderPlainMultiplyBinary_`) extracted to `AbstractCodegen` for cross-backend reuse.
- Helper dependency resolution lifted from per-backend `markHelper_` overrides to the base class via `getHelperDeps_()` hook.
- `resolveStdlibBindings_` shared method extracted for Java and asm.js stdlib import classification, replacing duplicated inline logic.
- Loop simplification pass internals refactored: `walkSubtree_` generic tree walker replaces duplicated recursive logic in `containsBreakableNesting_` and `containsTargetingBranch_`.
- Static memory `collectI32InitOps_` refactored with extracted `scanRepeat`/`emitFill` inner functions.

## v2026.04.107

### Added

- Loop label elision for asm.js and Java backends: `break`/`continue` statements targeting the immediately enclosing loop omit the label, and the loop declaration omits its label when no nested context requires it. Tracks breakable context via `breakableStack` and `usedLabels` on the shared emit state. Switch sentinels ensure labels are preserved when breaks originate from inside flat-switch or root-switch dispatch code.
- `isBreakLabelImplicit_` static method on `AbstractCodegen`: determines whether an unlabeled `break`/`continue` would reach the same target, distinguishing break (innermost loop or switch) from continue (innermost loop, transparent to switches).
- README: "How it works" pipeline diagram, "Features" section with eight capability highlights, "Changelog" section, and changelog badge in the header.

### Changed

- Redundant explicit type casts eliminated in Java backend: `(int)` on `getShort()`/`get()` loads removed (Java auto-widens `byte`/`short` to `int`), `renderCoercionByType_` removed from CallId, CallIndirectId, SelectId, and expression IfId return paths (method return types are statically known).
- Redundant `_w2l_i()` / `renderCoercionByType_` calls eliminated in PHP backend for internal (non-imported, non-stdlib) function call results — return values are already coerced at the ReturnId boundary.
- Java static memory initialization switched from 32-bit `IntBuffer.put()` to 64-bit `ByteBuffer.putLong()` with `putInt()` fallback for odd leading/trailing words and fill-loop optimization for 8+ identical i64 pairs.
- PHP static memory initialization switched from `pack('V*', ...)` (32-bit words) to `pack('P*', ...)` (64-bit little-endian) with `pack('V', ...)` fallback for odd trailing words and expression fallback for values >= 2^63.
- Infinite loop keyword standardized to `for (;;)` across all three backends (was `while (1)` in asm.js, `while (true)` in Java and PHP).
- Raw SwitchId (br_table) case targets now mark resolved labels in `usedLabels`, ensuring loop declarations retain labels when referenced from inside switch statements.
- Root-switch exit paths mark `rootSwitchLoopName` in `usedLabels` to preserve the loop label when exit code generates `break` statements inside the root switch.

## v2026.04.106

### Added

- i64 comparison inversion in the loop simplification pass: `i64.ne`/`i64.eq` conditions now recognized for do-while and while-loop detection after i64 lowering.
- 34 binaryen extern type definitions for i64 comparison operators.

### Changed

- Post-i64-lowering pass sequence improved: `simplify-locals-notee-nostructure` + `vacuum` + `merge-blocks` + `reorder-locals` eliminates dead stores created by tee-fold and local coalescing.
- BinaryenExpressionInfo property access converted from bracket notation (`expr['id']`) to dot notation (`expr.id`) across all backends and custom passes — 200+ sites in 12 files, enabled by the existing `@record` extern declaration.
- Asm.js boundary coercion model refined: category tags now align with the asm.js type lattice (`INT` for local.get/comparisons, `SIGNED` for bitwise/shift results, `FIXNUM` for Math_clz32/constants), eliminating redundant `|0` annotations at return and call boundaries.
- Float/double boundary coercion extended: `coerceAtBoundary_` skips wrapping for `CAT_F32`/`CAT_F64` expressions (Math_fround, +expr, typed locals), removing double `Math_fround(Math_fround(...))` and `+(+(...))` patterns.
- Shared `coerceToType_` skip list extended with `INT` category for i32 local.set assignments.

### Fixed

- Java backend shift operator precedence: `bitwiseAllowRightEqual` used instead of hardcoded `true`, fixing `(a >> b) ^ c` grouping.
- i64 const rendering in local init folding: `renderI64Const_` called instead of `renderConst_` for i64-typed constants.
- `BinaryenExpressionInfo.prototype.target` extern type corrected from `(number|undefined)` to `(string|undefined)` — matches the actual binaryen API return value for CallId expressions.

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
