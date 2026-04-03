'use strict';

/**
 * @const
 */
var Wasm2Lang = {};

/**
 * @namespace
 */
Wasm2Lang.Backend = {};

/**
 * Shared i32 coercion model — asm.js-derived value categories and binary/unary
 * op classification reusable across all backends.
 *
 * @const
 */
Wasm2Lang.Backend.I32Coercion = {};

/**
 * Shared wasm numeric-type helpers.
 *
 * @const
 */
Wasm2Lang.Backend.ValueType = {};

/**
 * Shared i64 coercion model — binary/unary op classification for backends
 * that handle i64 natively.
 *
 * @const
 */
Wasm2Lang.Backend.I64Coercion = {};

/**
 * Shared non-i32 numeric-op classification.
 *
 * @const
 */
Wasm2Lang.Backend.NumericOps = {};

/**
 * Shared SIMD128 op classification for v128 operations that flow through
 * BinaryId and UnaryId.
 *
 * @const
 */
Wasm2Lang.Backend.SIMDOps = {};

/**
 * @namespace
 */
Wasm2Lang.CLI = {};

/**
 * @namespace
 */
Wasm2Lang.Options = {};

/**
 * @namespace
 */
Wasm2Lang.Utilities = {};

/**
 * @const
 */
Wasm2Lang.OutputSink = {};

/**
 * @namespace
 */
Wasm2Lang.Wasm = {};

/**
 * @namespace
 */
Wasm2Lang.Wasm.Tree = {};
