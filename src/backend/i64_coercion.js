'use strict';

// ---------------------------------------------------------------------------
// i64 binary-op and unary-op classification.
//
// Mirrors the I32Coercion structure but for 64-bit integer operations.
// Only used by backends that handle i64 natively (e.g. Java).
// Reuses the same OP_* category constants and BinaryOpInfo typedef from
// I32Coercion so that binary renderers share the same dispatch table shape.
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
 * @suppress {accessControls}
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo}
 */
Wasm2Lang.Backend.I64Coercion.classifyBinaryOp = function (binaryen, op) {
  if (!Wasm2Lang.Backend.I64Coercion.binaryOpMap_) {
    var /** @const {number} */ A = Wasm2Lang.Backend.I32Coercion.OP_ARITHMETIC;
    var /** @const {number} */ M = Wasm2Lang.Backend.I32Coercion.OP_MULTIPLY;
    var /** @const {number} */ D = Wasm2Lang.Backend.I32Coercion.OP_DIVISION;
    var /** @const {number} */ B = Wasm2Lang.Backend.I32Coercion.OP_BITWISE;
    var /** @const {number} */ R = Wasm2Lang.Backend.I32Coercion.OP_ROTATE;
    var /** @const {number} */ C = Wasm2Lang.Backend.I32Coercion.OP_COMPARISON;
    var /** @const {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */ (Object.create(null));
    var /** @const */ reg = Wasm2Lang.Backend.I32Coercion.registerBinaryOps_;
    reg(m, A, false, false, [
      [binaryen.AddInt64, '+'],
      [binaryen.SubInt64, '-']
    ]);
    reg(m, M, false, false, [[binaryen.MulInt64, '*']]);
    reg(m, D, false, false, [
      [binaryen.DivSInt64, '/'],
      [binaryen.RemSInt64, '%']
    ]);
    reg(m, D, true, false, [
      [binaryen.DivUInt64, '/'],
      [binaryen.RemUInt64, '%']
    ]);
    reg(m, B, false, false, [
      [binaryen.AndInt64, '&'],
      [binaryen.OrInt64, '|'],
      [binaryen.XorInt64, '^'],
      [binaryen.ShlInt64, '<<'],
      [binaryen.ShrSInt64, '>>']
    ]);
    reg(m, B, true, false, [[binaryen.ShrUInt64, '>>>']]);
    reg(m, R, false, true, [[binaryen.RotLInt64, '']]);
    reg(m, R, false, false, [[binaryen.RotRInt64, '']]);
    reg(m, C, false, false, [
      [binaryen.EqInt64, '=='],
      [binaryen.NeInt64, '!='],
      [binaryen.LtSInt64, '<'],
      [binaryen.LeSInt64, '<='],
      [binaryen.GtSInt64, '>'],
      [binaryen.GeSInt64, '>=']
    ]);
    reg(m, C, true, false, [
      [binaryen.LtUInt64, '<'],
      [binaryen.LeUInt64, '<='],
      [binaryen.GtUInt64, '>'],
      [binaryen.GeUInt64, '>=']
    ]);
    Wasm2Lang.Backend.I64Coercion.binaryOpMap_ = m;
  }
  return Wasm2Lang.Backend.I64Coercion.binaryOpMap_[op] || null;
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
 * Classifies a binaryen i64 unary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {number}  One of the UNARY_* constants, or {@code -1} if unknown.
 */
Wasm2Lang.Backend.I64Coercion.classifyUnaryOp = function (binaryen, op) {
  if (binaryen.EqZInt64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_EQZ;
  if (binaryen.ClzInt64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_CLZ;
  if (binaryen.CtzInt64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_CTZ;
  if (binaryen.PopcntInt64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_POPCNT;
  if (binaryen.ExtendS8Int64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND8_S;
  if (binaryen.ExtendS16Int64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND16_S;
  if (binaryen.ExtendS32Int64 === op) return Wasm2Lang.Backend.I64Coercion.UNARY_EXTEND32_S;
  return -1;
};
