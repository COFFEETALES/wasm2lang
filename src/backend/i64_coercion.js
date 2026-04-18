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
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo}
 */
Wasm2Lang.Backend.I64Coercion.classifyBinaryOp = function (binaryen, op) {
  var /** @const */ I = Wasm2Lang.Backend.I64Coercion;
  if (!I.binaryOpMap_) {
    var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
    I.binaryOpMap_ = C.buildBinaryOpMap([
      [
        C.OP_ARITHMETIC,
        false,
        false,
        [
          [binaryen.AddInt64, '+'],
          [binaryen.SubInt64, '-']
        ]
      ],
      [C.OP_MULTIPLY, false, false, [[binaryen.MulInt64, '*']]],
      [
        C.OP_DIVISION,
        false,
        false,
        [
          [binaryen.DivSInt64, '/'],
          [binaryen.RemSInt64, '%']
        ]
      ],
      [
        C.OP_DIVISION,
        true,
        false,
        [
          [binaryen.DivUInt64, '/'],
          [binaryen.RemUInt64, '%']
        ]
      ],
      [
        C.OP_BITWISE,
        false,
        false,
        [
          [binaryen.AndInt64, '&'],
          [binaryen.OrInt64, '|'],
          [binaryen.XorInt64, '^'],
          [binaryen.ShlInt64, '<<'],
          [binaryen.ShrSInt64, '>>']
        ]
      ],
      [C.OP_BITWISE, true, false, [[binaryen.ShrUInt64, '>>>']]],
      [C.OP_ROTATE, false, true, [[binaryen.RotLInt64, '']]],
      [C.OP_ROTATE, false, false, [[binaryen.RotRInt64, '']]],
      [
        C.OP_COMPARISON,
        false,
        false,
        [
          [binaryen.EqInt64, '=='],
          [binaryen.NeInt64, '!='],
          [binaryen.LtSInt64, '<'],
          [binaryen.LeSInt64, '<='],
          [binaryen.GtSInt64, '>'],
          [binaryen.GeSInt64, '>=']
        ]
      ],
      [
        C.OP_COMPARISON,
        true,
        false,
        [
          [binaryen.LtUInt64, '<'],
          [binaryen.LeUInt64, '<='],
          [binaryen.GtUInt64, '>'],
          [binaryen.GeUInt64, '>=']
        ]
      ]
    ]);
  }
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
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (!I.unaryOpMap_) {
    I.unaryOpMap_ = /** @type {!Object<number, number>} */ (
      C.buildKeyedTable([
        [binaryen.EqZInt64, I.UNARY_EQZ],
        [binaryen.ClzInt64, I.UNARY_CLZ],
        [binaryen.CtzInt64, I.UNARY_CTZ],
        [binaryen.PopcntInt64, I.UNARY_POPCNT],
        [binaryen.ExtendS8Int64, I.UNARY_EXTEND8_S],
        [binaryen.ExtendS16Int64, I.UNARY_EXTEND16_S],
        [binaryen.ExtendS32Int64, I.UNARY_EXTEND32_S]
      ])
    );
  }
  return C.lookupCategoryOrMinusOne_(I.unaryOpMap_, op);
};
