'use strict';

// ---------------------------------------------------------------------------
// Java SIMD128 rendering — IntVector-based v128 code emission.
// ---------------------------------------------------------------------------

/**
 * Expression-template binary ops: opName → infix fragment.
 * Result = L + fragment + R + ')'.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_BINARY_EXPRS_ = {
  'add': '.add(',
  'sub': '.sub(',
  'mul': '.mul(',
  'min_s': '.min(',
  'max_s': '.max(',
  'and': '.lanewise(VectorOperators.AND, ',
  'or': '.lanewise(VectorOperators.OR, ',
  'xor': '.lanewise(VectorOperators.XOR, ',
  'add_sat_s': '.lanewise(VectorOperators.SADD, ',
  'add_sat_u': '.lanewise(VectorOperators.SUADD, ',
  'sub_sat_s': '.lanewise(VectorOperators.SSUB, ',
  'sub_sat_u': '.lanewise(VectorOperators.SUSUB, ',
  'avgr_u': '.lanewise(VectorOperators.UAVERGE, '
};

/**
 * Comparison binary ops: opName → VectorOperators comparison name.
 *
 * @private
 * @const {!Object<string, string>}
 */
Wasm2Lang.Backend.JavaCodegen.SIMD_CMP_OPS_ = {
  'eq': 'EQ',
  'ne': 'NE',
  'lt_s': 'LT',
  'lt': 'LT',
  'gt_s': 'GT',
  'gt': 'GT',
  'le_s': 'LE',
  'le': 'LE',
  'ge_s': 'GE',
  'ge': 'GE',
  'lt_u': 'UNSIGNED_LT',
  'gt_u': 'UNSIGNED_GT',
  'le_u': 'UNSIGNED_LE',
  'ge_u': 'UNSIGNED_GE'
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.BinaryOpInfo} info
 * @param {string} L
 * @param {string} R
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitSIMDBinaryOp_ = function (binaryen, info, L, R) {
  void binaryen;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {string} */ opName = info.opName;

  // Table-driven expression-template ops.
  var /** @type {string|void} */ mid = Wasm2Lang.Backend.JavaCodegen.SIMD_BINARY_EXPRS_[opName];
  if (mid) return {emittedString: L + mid + R + ')', resultCat: A.CAT_V128};

  // Table-driven comparison ops.
  var /** @type {string|void} */ cmpOp = Wasm2Lang.Backend.JavaCodegen.SIMD_CMP_OPS_[opName];
  if (cmpOp) return {emittedString: Wasm2Lang.Backend.JavaCodegen.simdCompare_(L, cmpOp, R), resultCat: A.CAT_V128};

  // andnot: L AND (NOT R).
  if ('andnot' === opName)
    return {
      emittedString: L + '.lanewise(VectorOperators.AND, ' + R + '.lanewise(VectorOperators.NOT))',
      resultCat: A.CAT_V128
    };

  // Unsigned min/max via XOR-flip.
  if ('min_u' === opName)
    return {emittedString: Wasm2Lang.Backend.JavaCodegen.simdUnsignedMinMax_(L, R, 'min'), resultCat: A.CAT_V128};
  if ('max_u' === opName)
    return {emittedString: Wasm2Lang.Backend.JavaCodegen.simdUnsignedMinMax_(L, R, 'max'), resultCat: A.CAT_V128};

  // Swizzle.
  if ('swizzle' === opName)
    return {
      emittedString:
        L +
        '.rearrange(VectorShuffle.fromValues(IntVector.SPECIES_128, ' +
        R +
        '.lane(0), ' +
        R +
        '.lane(1), ' +
        R +
        '.lane(2), ' +
        R +
        '.lane(3)))',
      resultCat: A.CAT_V128
    };

  return {emittedString: '/* unsupported SIMD binary: ' + opName + ' */', resultCat: A.CAT_V128};
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.SIMDOps.UnaryOpInfo} info
 * @param {string} operandExpr
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitSIMDUnaryOp_ = function (binaryen, info, operandExpr) {
  void binaryen;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const {string} */ opName = info.opName;
  var /** @const {boolean} */ isScalar = info.scalarResult;

  // Splat.
  if ('splat' === opName) {
    return {emittedString: 'IntVector.broadcast(IntVector.SPECIES_128, ' + operandExpr + ')', resultCat: A.CAT_V128};
  }

  // v128 bitwise.
  if ('not' === opName) return {emittedString: operandExpr + '.lanewise(VectorOperators.NOT)', resultCat: A.CAT_V128};

  // Any/all true — scalar i32 result.
  if ('any_true' === opName) {
    return {emittedString: operandExpr + '.reduceLanes(VectorOperators.OR) != 0 ? 1 : 0', resultCat: C.SIGNED};
  }
  if ('all_true' === opName) {
    return {
      emittedString: operandExpr + '.eq(IntVector.zero(IntVector.SPECIES_128)).not().allTrue() ? 1 : 0',
      resultCat: C.SIGNED
    };
  }

  // Bitmask — scalar i32 result.
  if ('bitmask' === opName) {
    return {
      emittedString: '(int)(' + operandExpr + '.lt(IntVector.zero(IntVector.SPECIES_128)).toLong() & 0xF)',
      resultCat: C.SIGNED
    };
  }

  // Neg/abs.
  if ('neg' === opName) return {emittedString: operandExpr + '.neg()', resultCat: A.CAT_V128};
  if ('abs' === opName) return {emittedString: operandExpr + '.abs()', resultCat: A.CAT_V128};

  if (isScalar) {
    return {emittedString: '/* unsupported SIMD unary scalar: ' + opName + ' */', resultCat: C.SIGNED};
  }
  return {emittedString: '/* unsupported SIMD unary: ' + opName + ' */', resultCat: A.CAT_V128};
};

// ---------------------------------------------------------------------------
// Internal SIMD helpers for Java code emission.
// ---------------------------------------------------------------------------

/**
 * Renders a SIMD comparison as a blend of -1/0 vectors.
 *
 * @param {string} L
 * @param {string} cmpOp  VectorOperators comparison name.
 * @param {string} R
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.simdCompare_ = function (L, cmpOp, R) {
  return (
    'IntVector.zero(IntVector.SPECIES_128).blend(IntVector.broadcast(IntVector.SPECIES_128, -1), ' +
    L +
    '.compare(VectorOperators.' +
    cmpOp +
    ', ' +
    R +
    '))'
  );
};

/**
 * Renders an unsigned min/max using XOR-flip to signed comparison.
 *
 * @param {string} L
 * @param {string} R
 * @param {string} minOrMax  'min' or 'max'.
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.simdUnsignedMinMax_ = function (L, R, minOrMax) {
  var /** @const {string} */ flip = 'IntVector.broadcast(IntVector.SPECIES_128, Integer.MIN_VALUE)';
  return (
    L +
    '.lanewise(VectorOperators.XOR, ' +
    flip +
    ').' +
    minOrMax +
    '(' +
    R +
    '.lanewise(VectorOperators.XOR, ' +
    flip +
    ')).lanewise(VectorOperators.XOR, ' +
    flip +
    ')'
  );
};
