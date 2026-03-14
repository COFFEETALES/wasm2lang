'use strict';

// ---------------------------------------------------------------------------
// i32 value categories.
//
// Modelled after the asm.js type lattice but backend-agnostic.  Each emitted
// expression carries one of these categories so consumers can decide whether
// coercion is needed and, if so, which kind.
//
//   fixnum  ⊂  signed  ⊂  int
//   fixnum  ⊂  unsigned ⊂  int
//   intish  (needs coercion to reach int)
// ---------------------------------------------------------------------------

/** @const {number} */ Wasm2Lang.Backend.I32Coercion.FIXNUM = 0;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.SIGNED = 1;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNSIGNED = 2;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.INT = 3;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.INTISH = 4;

/**
 * Returns true when {@code fromType} is a subtype of {@code toType} — i.e. no
 * coercion is required.
 *
 * @param {number} fromType  The result type of the child expression.
 * @param {number} toType    The type the consumer requires.
 * @return {boolean}
 */
Wasm2Lang.Backend.I32Coercion.satisfies = function (fromType, toType) {
  if (fromType === toType) return true;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  // fixnum satisfies everything except intish (which is not a consumer target).
  if (C.FIXNUM === fromType) return true;
  // signed → int,  unsigned → int.
  if (C.INT === toType) return C.SIGNED === fromType || C.UNSIGNED === fromType;
  return false;
};

// ---------------------------------------------------------------------------
// Numeric-constant detection.
// ---------------------------------------------------------------------------

/**
 * Returns true when the expression string is a decimal integer literal
 * (optionally negative).  Such literals are asm.js "fixnum" values that
 * satisfy both signed and unsigned contexts without coercion.
 *
 * @param {string} str
 * @return {boolean}
 */
Wasm2Lang.Backend.I32Coercion.isConstant = function (str) {
  return /^-?\d+$/.test(str);
};

// ---------------------------------------------------------------------------
// Binary-op classification.
// ---------------------------------------------------------------------------

/** @const {number} */ Wasm2Lang.Backend.I32Coercion.OP_ARITHMETIC = 0;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.OP_MULTIPLY = 1;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.OP_DIVISION = 2;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.OP_BITWISE = 3;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.OP_ROTATE = 4;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.OP_COMPARISON = 5;

/**
 * Descriptor returned by {@code classifyBinaryOp}.  Properties use
 * dot-notation and are renamed consistently by Closure within the compilation
 * unit.
 *
 * @typedef {{
 *   category: number,
 *   operator: string,
 *   unsigned: boolean,
 *   rotateLeft: boolean
 * }}
 */
Wasm2Lang.Backend.I32Coercion.BinaryOpInfo;

/**
 * Lazily-built map from binaryen i32 binary-op constants to descriptors.
 *
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>}
 */
Wasm2Lang.Backend.I32Coercion.binaryOpMap_ = null;

/**
 * Classifies a binaryen i32 binary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo}
 */
Wasm2Lang.Backend.I32Coercion.classifyBinaryOp = function (binaryen, op) {
  if (!Wasm2Lang.Backend.I32Coercion.binaryOpMap_) {
    var /** @const {number} */ A = Wasm2Lang.Backend.I32Coercion.OP_ARITHMETIC;
    var /** @const {number} */ M = Wasm2Lang.Backend.I32Coercion.OP_MULTIPLY;
    var /** @const {number} */ D = Wasm2Lang.Backend.I32Coercion.OP_DIVISION;
    var /** @const {number} */ B = Wasm2Lang.Backend.I32Coercion.OP_BITWISE;
    var /** @const {number} */ R = Wasm2Lang.Backend.I32Coercion.OP_ROTATE;
    var /** @const {number} */ C = Wasm2Lang.Backend.I32Coercion.OP_COMPARISON;
    var /** @const {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */
      m = /** @type {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */ (Object.create(null));
    // @formatter:off
    m[binaryen.AddInt32] = {category: A, operator: '+', unsigned: false, rotateLeft: false};
    m[binaryen.SubInt32] = {category: A, operator: '-', unsigned: false, rotateLeft: false};
    m[binaryen.MulInt32] = {category: M, operator: '*', unsigned: false, rotateLeft: false};
    m[binaryen.DivSInt32] = {category: D, operator: '/', unsigned: false, rotateLeft: false};
    m[binaryen.DivUInt32] = {category: D, operator: '/', unsigned: true, rotateLeft: false};
    m[binaryen.RemSInt32] = {category: D, operator: '%', unsigned: false, rotateLeft: false};
    m[binaryen.RemUInt32] = {category: D, operator: '%', unsigned: true, rotateLeft: false};
    m[binaryen.AndInt32] = {category: B, operator: '&', unsigned: false, rotateLeft: false};
    m[binaryen.OrInt32] = {category: B, operator: '|', unsigned: false, rotateLeft: false};
    m[binaryen.XorInt32] = {category: B, operator: '^', unsigned: false, rotateLeft: false};
    m[binaryen.ShlInt32] = {category: B, operator: '<<', unsigned: false, rotateLeft: false};
    m[binaryen.ShrSInt32] = {category: B, operator: '>>', unsigned: false, rotateLeft: false};
    m[binaryen.ShrUInt32] = {category: B, operator: '>>>', unsigned: true, rotateLeft: false};
    m[binaryen.RotLInt32] = {category: R, operator: '', unsigned: false, rotateLeft: true};
    m[binaryen.RotRInt32] = {category: R, operator: '', unsigned: false, rotateLeft: false};
    m[binaryen.EqInt32] = {category: C, operator: '==', unsigned: false, rotateLeft: false};
    m[binaryen.NeInt32] = {category: C, operator: '!=', unsigned: false, rotateLeft: false};
    m[binaryen.LtSInt32] = {category: C, operator: '<', unsigned: false, rotateLeft: false};
    m[binaryen.LtUInt32] = {category: C, operator: '<', unsigned: true, rotateLeft: false};
    m[binaryen.LeSInt32] = {category: C, operator: '<=', unsigned: false, rotateLeft: false};
    m[binaryen.LeUInt32] = {category: C, operator: '<=', unsigned: true, rotateLeft: false};
    m[binaryen.GtSInt32] = {category: C, operator: '>', unsigned: false, rotateLeft: false};
    m[binaryen.GtUInt32] = {category: C, operator: '>', unsigned: true, rotateLeft: false};
    m[binaryen.GeSInt32] = {category: C, operator: '>=', unsigned: false, rotateLeft: false};
    m[binaryen.GeUInt32] = {category: C, operator: '>=', unsigned: true, rotateLeft: false};
    // @formatter:on
    Wasm2Lang.Backend.I32Coercion.binaryOpMap_ = m;
  }
  return Wasm2Lang.Backend.I32Coercion.binaryOpMap_[op] || null;
};

/**
 * Returns the result value-category produced by a binary operation.
 *
 * @param {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo} info
 * @return {number}
 */
Wasm2Lang.Backend.I32Coercion.binaryResultType = function (info) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  switch (info.category) {
    case C.OP_COMPARISON:
      return C.INT;
    case C.OP_BITWISE:
      return info.unsigned ? C.UNSIGNED : C.SIGNED;
    default:
      // Arithmetic, multiply, division, rotate all produce intish before
      // backend-specific truncation.  Backends apply their own coercion
      // (e.g. |0 for asm.js) and then upgrade the result to SIGNED.
      return C.INTISH;
  }
};

// ---------------------------------------------------------------------------
// Unary-op classification.
// ---------------------------------------------------------------------------

/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNARY_EQZ = 0;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNARY_CLZ = 1;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNARY_CTZ = 2;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNARY_POPCNT = 3;

/**
 * Classifies a binaryen i32 unary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {number}  One of the UNARY_* constants, or {@code -1} if unknown.
 */
Wasm2Lang.Backend.I32Coercion.classifyUnaryOp = function (binaryen, op) {
  if (binaryen.EqZInt32 === op) return Wasm2Lang.Backend.I32Coercion.UNARY_EQZ;
  if (binaryen.ClzInt32 === op) return Wasm2Lang.Backend.I32Coercion.UNARY_CLZ;
  if (binaryen.CtzInt32 === op) return Wasm2Lang.Backend.I32Coercion.UNARY_CTZ;
  if (binaryen.PopcntInt32 === op) return Wasm2Lang.Backend.I32Coercion.UNARY_POPCNT;
  return -1;
};
