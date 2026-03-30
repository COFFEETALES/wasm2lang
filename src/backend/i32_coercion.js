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
 *   opStr: string,
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
 * @private
 * @param {number} category
 * @param {string} operator
 * @param {boolean} unsigned
 * @param {boolean} rotateLeft
 * @return {!Wasm2Lang.Backend.I32Coercion.BinaryOpInfo}
 */
Wasm2Lang.Backend.I32Coercion.createBinaryOpInfo_ = function (category, operator, unsigned, rotateLeft) {
  return {
    category: category,
    opStr: operator,
    unsigned: unsigned,
    rotateLeft: rotateLeft
  };
};

/**
 * @private
 * @param {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} map
 * @param {number} category
 * @param {boolean} unsigned
 * @param {boolean} rotateLeft
 * @param {!Array<!Array<*>>} entries
 * @return {void}
 */
Wasm2Lang.Backend.I32Coercion.registerBinaryOps_ = function (map, category, unsigned, rotateLeft, entries) {
  for (var /** @type {number} */ i = 0, /** @const {number} */ entryCount = entries.length; i !== entryCount; ++i) {
    var /** @const {!Array<*>} */ entry = entries[i];
    var /** @const {number} */ op = /** @type {number} */ (entry[0]);
    var /** @const {string} */ operator = /** @type {string} */ (entry[1]);
    map[op] = Wasm2Lang.Backend.I32Coercion.createBinaryOpInfo_(category, operator, unsigned, rotateLeft);
  }
};

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
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, A, false, false, [
      [binaryen.AddInt32, '+'],
      [binaryen.SubInt32, '-']
    ]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, M, false, false, [[binaryen.MulInt32, '*']]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, D, false, false, [
      [binaryen.DivSInt32, '/'],
      [binaryen.RemSInt32, '%']
    ]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, D, true, false, [
      [binaryen.DivUInt32, '/'],
      [binaryen.RemUInt32, '%']
    ]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, B, false, false, [
      [binaryen.AndInt32, '&'],
      [binaryen.OrInt32, '|'],
      [binaryen.XorInt32, '^'],
      [binaryen.ShlInt32, '<<'],
      [binaryen.ShrSInt32, '>>']
    ]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, B, true, false, [[binaryen.ShrUInt32, '>>>']]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, R, false, true, [[binaryen.RotLInt32, '']]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, R, false, false, [[binaryen.RotRInt32, '']]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, C, false, false, [
      [binaryen.EqInt32, '=='],
      [binaryen.NeInt32, '!='],
      [binaryen.LtSInt32, '<'],
      [binaryen.LeSInt32, '<='],
      [binaryen.GtSInt32, '>'],
      [binaryen.GeSInt32, '>=']
    ]);
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(m, C, true, false, [
      [binaryen.LtUInt32, '<'],
      [binaryen.LeUInt32, '<='],
      [binaryen.GtUInt32, '>'],
      [binaryen.GeUInt32, '>=']
    ]);
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
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND8_S = 4;
/** @const {number} */ Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND16_S = 5;

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
  if (binaryen.ExtendS8Int32 === op) return Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND8_S;
  if (binaryen.ExtendS16Int32 === op) return Wasm2Lang.Backend.I32Coercion.UNARY_EXTEND16_S;
  return -1;
};
