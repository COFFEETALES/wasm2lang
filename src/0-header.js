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
 * Shared non-i32 numeric-op classification.
 *
 * @const
 */
Wasm2Lang.Backend.NumericOps = {};

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
 * @namespace
 */
Wasm2Lang.Wasm = {};

/**
 * @namespace
 */
Wasm2Lang.Wasm.Tree = {};
