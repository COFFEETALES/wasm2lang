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
 * Builds a binary-op descriptor map from a list of
 * {@code [category, unsigned, rotateLeft, entries]} groups.  Shared by the
 * i32 and i64 classifiers since their dispatch tables have identical shape.
 *
 * @param {!Array<!Array<*>>} groups
 * @return {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>}
 */
Wasm2Lang.Backend.I32Coercion.buildBinaryOpMap = function (groups) {
  var /** @const {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */
    m = /** @type {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ n = groups.length; i !== n; ++i) {
    var /** @const {!Array<*>} */ g = groups[i];
    Wasm2Lang.Backend.I32Coercion.registerBinaryOps_(
      m,
      /** @type {number} */ (g[0]),
      /** @type {boolean} */ (g[1]),
      /** @type {boolean} */ (g[2]),
      /** @type {!Array<!Array<*>>} */ (g[3])
    );
  }
  return m;
};

/**
 * Classifies a binaryen i32 binary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.I32Coercion.BinaryOpInfo}
 */
Wasm2Lang.Backend.I32Coercion.classifyBinaryOp = function (binaryen, op) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (!C.binaryOpMap_) {
    C.binaryOpMap_ = C.buildBinaryOpMap([
      [
        C.OP_ARITHMETIC,
        false,
        false,
        [
          [binaryen.AddInt32, '+'],
          [binaryen.SubInt32, '-']
        ]
      ],
      [C.OP_MULTIPLY, false, false, [[binaryen.MulInt32, '*']]],
      [
        C.OP_DIVISION,
        false,
        false,
        [
          [binaryen.DivSInt32, '/'],
          [binaryen.RemSInt32, '%']
        ]
      ],
      [
        C.OP_DIVISION,
        true,
        false,
        [
          [binaryen.DivUInt32, '/'],
          [binaryen.RemUInt32, '%']
        ]
      ],
      [
        C.OP_BITWISE,
        false,
        false,
        [
          [binaryen.AndInt32, '&'],
          [binaryen.OrInt32, '|'],
          [binaryen.XorInt32, '^'],
          [binaryen.ShlInt32, '<<'],
          [binaryen.ShrSInt32, '>>']
        ]
      ],
      [C.OP_BITWISE, true, false, [[binaryen.ShrUInt32, '>>>']]],
      [C.OP_ROTATE, false, true, [[binaryen.RotLInt32, '']]],
      [C.OP_ROTATE, false, false, [[binaryen.RotRInt32, '']]],
      [
        C.OP_COMPARISON,
        false,
        false,
        [
          [binaryen.EqInt32, '=='],
          [binaryen.NeInt32, '!='],
          [binaryen.LtSInt32, '<'],
          [binaryen.LeSInt32, '<='],
          [binaryen.GtSInt32, '>'],
          [binaryen.GeSInt32, '>=']
        ]
      ],
      [
        C.OP_COMPARISON,
        true,
        false,
        [
          [binaryen.LtUInt32, '<'],
          [binaryen.LeUInt32, '<='],
          [binaryen.GtUInt32, '>'],
          [binaryen.GeUInt32, '>=']
        ]
      ]
    ]);
  }
  return C.binaryOpMap_[op] || null;
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
 * Lazily-built map from binaryen i32 unary-op constants to UNARY_* categories.
 *
 * @private
 * @type {?Object<number, number>}
 */
Wasm2Lang.Backend.I32Coercion.unaryOpMap_ = null;

/**
 * Reads a numeric category from a keyed table, returning {@code -1} when the
 * key is absent.  Centralizes the {@code typeof === 'number'} guard shared by
 * the i32/i64 unary classifiers, which is load-bearing because a valid
 * {@code UNARY_EQZ} value of {@code 0} would otherwise be misread as absent.
 *
 * @param {!Object<number, number>} map
 * @param {number} key
 * @return {number}
 */
Wasm2Lang.Backend.I32Coercion.lookupCategoryOrMinusOne_ = function (map, key) {
  var /** @const {number|undefined} */ cat = map[key];
  return 'number' === typeof cat ? cat : -1;
};

/**
 * Classifies a binaryen i32 unary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {number}  One of the UNARY_* constants, or {@code -1} if unknown.
 */
Wasm2Lang.Backend.I32Coercion.classifyUnaryOp = function (binaryen, op) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (!C.unaryOpMap_) {
    C.unaryOpMap_ = /** @type {!Object<number, number>} */ (
      C.buildKeyedTable([
        [binaryen.EqZInt32, C.UNARY_EQZ],
        [binaryen.ClzInt32, C.UNARY_CLZ],
        [binaryen.CtzInt32, C.UNARY_CTZ],
        [binaryen.PopcntInt32, C.UNARY_POPCNT],
        [binaryen.ExtendS8Int32, C.UNARY_EXTEND8_S],
        [binaryen.ExtendS16Int32, C.UNARY_EXTEND16_S]
      ])
    );
  }
  return C.lookupCategoryOrMinusOne_(C.unaryOpMap_, op);
};

// ---------------------------------------------------------------------------
// Table construction.
// ---------------------------------------------------------------------------

/**
 * Builds an object keyed by numeric UNARY_* / other category constants from a
 * list of {@code [key, value]} pairs.  Factors out the IIFE pattern that the
 * per-backend coercion tables would otherwise duplicate.
 *
 * @param {!Array<!Array<*>>} entries
 * @return {!Object<number, *>}
 */
Wasm2Lang.Backend.I32Coercion.buildKeyedTable = function (entries) {
  var /** @const {!Object<number, *>} */ table = {};
  for (var /** @type {number} */ i = 0, /** @const {number} */ n = entries.length; i !== n; ++i) {
    var /** @const {!Array<*>} */ entry = entries[i];
    table[/** @type {number} */ (entry[0])] = entry[1];
  }
  return table;
};
