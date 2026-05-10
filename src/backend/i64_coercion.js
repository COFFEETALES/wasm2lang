'use strict';

// ---------------------------------------------------------------------------
// i64 binary-op and unary-op classification.
//
// Mirrors the I32Coercion structure but for 64-bit integer operations.
// Only used by backends that handle i64 natively (e.g. Java).
// Reuses the same OP_* category constants and BinaryOpInfo typedef from
// I32Coercion so that binary renderers share the same dispatch table shape.
// The dispatch tables themselves are built from the shared
// {@code I32Coercion.BINARY_OP_SPEC_} / {@code UNARY_OP_SPEC_*} specs by
// resolving each entry against the {@code 'Int64'} binaryen op-constant suffix.
// ---------------------------------------------------------------------------

/**
 * Lazily-built map from binaryen i64 binary-op constants to descriptors.
 *
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>}
 */
Wasm2Lang.Backend.I64Coercion.binaryOpMap_ = null;

/**
 * Classifies a binaryen i64 binary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo}
 */
Wasm2Lang.Backend.I64Coercion.classifyBinaryOp = function (binaryen, op) {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  if (!I.binaryOpMap_) I.binaryOpMap_ = Wasm2Lang.Backend.I32Coercion.buildBinaryOpMapForWidth(binaryen, 'Int64');
  return I.binaryOpMap_[op] || null;
};

// ---------------------------------------------------------------------------
// i64 unary-op classification.
// ---------------------------------------------------------------------------

/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_EQZ = 0;
/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_CLZ = 1;
/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_CTZ = 2;
/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_POPCNT = 3;
/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND8_S = 4;
/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND16_S = 5;
/** @const {number} */ Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND32_S = 6;

/**
 * i64 unary spec.  Mirrors {@code I32Coercion.UNARY_OP_SPEC_I32_} with the
 * additional {@code ExtendS32} entry that exists only for i64.
 *
 * @private
 * @const {!Array<!Array<*>>}
 */
Wasm2Lang.Backend.I64Coercion.UNARY_OP_SPEC_I64_ = /** @return {!Array<!Array<*>>} */ (function () {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  return [
    ['EqZ', I.UNARY_EQZ],
    ['Clz', I.UNARY_CLZ],
    ['Ctz', I.UNARY_CTZ],
    ['Popcnt', I.UNARY_POPCNT],
    ['ExtendS8', I.UNARY_EXTEND8_S],
    ['ExtendS16', I.UNARY_EXTEND16_S],
    ['ExtendS32', I.UNARY_EXTEND32_S]
  ];
})();

/**
 * Lazily-built map from binaryen i64 unary-op constants to UNARY_* categories.
 *
 * @private
 * @type {?Object<number, number>}
 */
Wasm2Lang.Backend.I64Coercion.unaryOpMap_ = null;

/**
 * Classifies a binaryen i64 unary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {number}  One of the UNARY_* constants, or {@code -1} if unknown.
 */
Wasm2Lang.Backend.I64Coercion.classifyUnaryOp = function (binaryen, op) {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  if (!I.unaryOpMap_)
    I.unaryOpMap_ = Wasm2Lang.Backend.I32Coercion.buildUnaryOpMapForWidth(binaryen, I.UNARY_OP_SPEC_I64_, 'Int64');
  // typeof guard is load-bearing: a valid UNARY_EQZ value of 0 would otherwise
  // be misread as absent.
  var /** @const {number|undefined} */ cat = I.unaryOpMap_[op];
  return 'number' === typeof cat ? cat : -1;
};
