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
 * Per-width binary-op spec, parameterized by the binaryen op-constant suffix
 * ({@code 'Int32'} or {@code 'Int64'}).  Each tuple is
 * {@code [category, unsigned, rotateLeft, [[binaryenOpName, operatorString], ...]]}.
 * Shared by the i32 and i64 classifiers since their dispatch tables have
 * identical shape; only the binaryen op-constant suffix differs.
 *
 * @private
 * @const {!Array<!Array<*>>}
 */
Wasm2Lang.Backend.I32Coercion.BINARY_OP_SPEC_ = /** @return {!Array<!Array<*>>} */ (function () {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  return [
    [
      C.OP_ARITHMETIC,
      false,
      false,
      [
        ['Add', '+'],
        ['Sub', '-']
      ]
    ],
    [C.OP_MULTIPLY, false, false, [['Mul', '*']]],
    [
      C.OP_DIVISION,
      false,
      false,
      [
        ['DivS', '/'],
        ['RemS', '%']
      ]
    ],
    [
      C.OP_DIVISION,
      true,
      false,
      [
        ['DivU', '/'],
        ['RemU', '%']
      ]
    ],
    [
      C.OP_BITWISE,
      false,
      false,
      [
        ['And', '&'],
        ['Or', '|'],
        ['Xor', '^'],
        ['Shl', '<<'],
        ['ShrS', '>>']
      ]
    ],
    [C.OP_BITWISE, true, false, [['ShrU', '>>>']]],
    [C.OP_ROTATE, false, true, [['RotL', '']]],
    [C.OP_ROTATE, false, false, [['RotR', '']]],
    [
      C.OP_COMPARISON,
      false,
      false,
      [
        ['Eq', '=='],
        ['Ne', '!='],
        ['LtS', '<'],
        ['LeS', '<='],
        ['GtS', '>'],
        ['GeS', '>=']
      ]
    ],
    [
      C.OP_COMPARISON,
      true,
      false,
      [
        ['LtU', '<'],
        ['LeU', '<='],
        ['GtU', '>'],
        ['GeU', '>=']
      ]
    ]
  ];
})();

/**
 * Builds a binary-op descriptor map by resolving each spec entry's binaryen
 * op-constant via {@code binaryen[name + suffix]}.  Used by the i32 and i64
 * classifiers to share a single dispatch-table source (BINARY_OP_SPEC_).
 *
 * @param {!Binaryen} binaryen
 * @param {string} suffix  Width suffix ({@code 'Int32'} or {@code 'Int64'}).
 * @return {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>}
 */
Wasm2Lang.Backend.I32Coercion.buildBinaryOpMapForWidth = function (binaryen, suffix) {
  var /** @const {!Array<!Array<*>>} */ spec = Wasm2Lang.Backend.I32Coercion.BINARY_OP_SPEC_;
  var /** @const {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */
    map = /** @type {!Object<number, !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo>} */ (Object.create(null));
  for (var /** @type {number} */ gi = 0, /** @const {number} */ glen = spec.length; gi !== glen; ++gi) {
    var /** @const {!Array<*>} */ group = spec[gi];
    var /** @const {number} */ category = /** @type {number} */ (group[0]);
    var /** @const {boolean} */ unsigned = /** @type {boolean} */ (group[1]);
    var /** @const {boolean} */ rotateLeft = /** @type {boolean} */ (group[2]);
    var /** @const {!Array<!Array<*>>} */ entries = /** @type {!Array<!Array<*>>} */ (group[3]);
    for (var /** @type {number} */ ei = 0, /** @const {number} */ elen = entries.length; ei !== elen; ++ei) {
      var /** @const {!Array<*>} */ entry = entries[ei];
      var /** @const {number} */ op = /** @type {number} */ (binaryen[/** @type {string} */ (entry[0]) + suffix]);
      map[op] = {
        category: category,
        opStr: /** @type {string} */ (entry[1]),
        unsigned: unsigned,
        rotateLeft: rotateLeft
      };
    }
  }
  return map;
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
  if (!C.binaryOpMap_) C.binaryOpMap_ = C.buildBinaryOpMapForWidth(binaryen, 'Int32');
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
 * Per-width unary-op spec.  Each tuple is
 * {@code [binaryenOpNamePrefix, UNARY_* category]}.  The {@code binaryen}
 * lookup uses {@code prefix + suffix} where suffix is {@code 'Int32'} or
 * {@code 'Int64'}.  i32 omits {@code ExtendS32} (no such i32 op).
 *
 * @private
 * @const {!Array<!Array<*>>}
 */
Wasm2Lang.Backend.I32Coercion.UNARY_OP_SPEC_I32_ = /** @return {!Array<!Array<*>>} */ (function () {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  return [
    ['EqZ', C.UNARY_EQZ],
    ['Clz', C.UNARY_CLZ],
    ['Ctz', C.UNARY_CTZ],
    ['Popcnt', C.UNARY_POPCNT],
    ['ExtendS8', C.UNARY_EXTEND8_S],
    ['ExtendS16', C.UNARY_EXTEND16_S]
  ];
})();

/**
 * Builds the unary-op category map by resolving each prefix against
 * {@code binaryen[prefix + suffix]}.
 *
 * @param {!Binaryen} binaryen
 * @param {!Array<!Array<*>>} spec
 * @param {string} suffix  Width suffix ({@code 'Int32'} or {@code 'Int64'}).
 * @return {!Object<number, number>}
 */
Wasm2Lang.Backend.I32Coercion.buildUnaryOpMapForWidth = function (binaryen, spec, suffix) {
  var /** @const {!Object<number, number>} */ map = {};
  for (var /** @type {number} */ i = 0, /** @const {number} */ n = spec.length; i !== n; ++i) {
    var /** @const {!Array<*>} */ entry = spec[i];
    map[/** @type {number} */ (binaryen[/** @type {string} */ (entry[0]) + suffix])] = /** @type {number} */ (entry[1]);
  }
  return map;
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
  if (!C.unaryOpMap_) C.unaryOpMap_ = C.buildUnaryOpMapForWidth(binaryen, C.UNARY_OP_SPEC_I32_, 'Int32');
  // typeof guard is load-bearing: a valid UNARY_EQZ value of 0 would otherwise
  // be misread as absent.
  var /** @const {number|undefined} */ cat = C.unaryOpMap_[op];
  return 'number' === typeof cat ? cat : -1;
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
