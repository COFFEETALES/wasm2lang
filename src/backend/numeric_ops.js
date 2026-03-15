'use strict';

/**
 * Descriptor returned by {@code classifyBinaryOp} for non-i32 numeric ops.
 *
 * @typedef {{
 *   opName: string,
 *   retType: number,
 *   operandType: number,
 *   opStr: string,
 *   isComparison: boolean
 * }}
 */
Wasm2Lang.Backend.NumericOps.BinaryOpInfo;

/**
 * Descriptor returned by {@code classifyUnaryOp}.
 *
 * @typedef {{
 *   opName: string,
 *   retType: number,
 *   operandType: number
 * }}
 */
Wasm2Lang.Backend.NumericOps.UnaryOpInfo;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.NumericOps.BinaryOpInfo>}
 */
Wasm2Lang.Backend.NumericOps.binaryOpMap_ = null;

/**
 * @private
 * @type {?Object<number, !Wasm2Lang.Backend.NumericOps.UnaryOpInfo>}
 */
Wasm2Lang.Backend.NumericOps.unaryOpMap_ = null;

/**
 * @private
 * @param {number} resultType
 * @param {string} name
 * @param {number} operandType
 * @param {string} operator
 * @param {boolean} isComparison
 * @return {!Wasm2Lang.Backend.NumericOps.BinaryOpInfo}
 */
Wasm2Lang.Backend.NumericOps.createBinaryOpInfo_ = function (resultType, name, operandType, operator, isComparison) {
  return {
    opName: name,
    retType: resultType,
    operandType: operandType,
    opStr: operator,
    isComparison: isComparison
  };
};

/**
 * @private
 * @param {!Object<number, !Wasm2Lang.Backend.NumericOps.BinaryOpInfo>} map
 * @param {number} resultType
 * @param {number} operandType
 * @param {boolean} isComparison
 * @param {!Array<!Array<*>>} entries
 * @return {void}
 */
Wasm2Lang.Backend.NumericOps.registerBinaryOps_ = function (map, resultType, operandType, isComparison, entries) {
  for (var /** number */ i = 0, /** @const {number} */ entryCount = entries.length; i !== entryCount; ++i) {
    var /** @const {!Array<*>} */ entry = entries[i];
    var /** @const {number} */ op = /** @type {number} */ (entry[0]);
    var /** @const {string} */ name = /** @type {string} */ (entry[1]);
    var /** @const {string} */ operator = /** @type {string} */ (entry[2]);
    map[op] = Wasm2Lang.Backend.NumericOps.createBinaryOpInfo_(resultType, name, operandType, operator, isComparison);
  }
};

/**
 * @private
 * @param {string} name
 * @param {number} operandType
 * @param {number} resultType
 * @return {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo}
 */
Wasm2Lang.Backend.NumericOps.createUnaryOpInfo_ = function (name, operandType, resultType) {
  return {
    opName: name,
    operandType: operandType,
    retType: resultType
  };
};

/**
 * @private
 * @param {!Object<number, !Wasm2Lang.Backend.NumericOps.UnaryOpInfo>} map
 * @param {number} operandType
 * @param {number} resultType
 * @param {!Array<!Array<*>>} entries
 * @return {void}
 */
Wasm2Lang.Backend.NumericOps.registerUnaryOps_ = function (map, operandType, resultType, entries) {
  for (var /** number */ i = 0, /** @const {number} */ entryCount = entries.length; i !== entryCount; ++i) {
    var /** @const {!Array<*>} */ entry = entries[i];
    var /** @const {number} */ op = /** @type {number} */ (entry[0]);
    var /** @const {string} */ name = /** @type {string} */ (entry[1]);
    map[op] = Wasm2Lang.Backend.NumericOps.createUnaryOpInfo_(name, operandType, resultType);
  }
};

/**
 * Classifies a non-i32 numeric binary operation.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.NumericOps.BinaryOpInfo}
 */
Wasm2Lang.Backend.NumericOps.classifyBinaryOp = function (binaryen, op) {
  if (!Wasm2Lang.Backend.NumericOps.binaryOpMap_) {
    var /** @const {!Object<number, !Wasm2Lang.Backend.NumericOps.BinaryOpInfo>} */ m =
        /** @type {!Object<number, !Wasm2Lang.Backend.NumericOps.BinaryOpInfo>} */ (Object.create(null));

    Wasm2Lang.Backend.NumericOps.registerBinaryOps_(m, binaryen.f32, binaryen.f32, false, [
      [binaryen.AddFloat32, 'add', '+'],
      [binaryen.SubFloat32, 'sub', '-'],
      [binaryen.MulFloat32, 'mul', '*'],
      [binaryen.DivFloat32, 'div', '/'],
      [binaryen.MinFloat32, 'min', ''],
      [binaryen.MaxFloat32, 'max', ''],
      [binaryen.CopySignFloat32, 'copysign', '']
    ]);
    Wasm2Lang.Backend.NumericOps.registerBinaryOps_(m, binaryen.i32, binaryen.f32, true, [
      [binaryen.EqFloat32, 'eq', '=='],
      [binaryen.NeFloat32, 'ne', '!='],
      [binaryen.LtFloat32, 'lt', '<'],
      [binaryen.GtFloat32, 'gt', '>'],
      [binaryen.LeFloat32, 'le', '<='],
      [binaryen.GeFloat32, 'ge', '>=']
    ]);

    Wasm2Lang.Backend.NumericOps.registerBinaryOps_(m, binaryen.f64, binaryen.f64, false, [
      [binaryen.AddFloat64, 'add', '+'],
      [binaryen.SubFloat64, 'sub', '-'],
      [binaryen.MulFloat64, 'mul', '*'],
      [binaryen.DivFloat64, 'div', '/'],
      [binaryen.MinFloat64, 'min', ''],
      [binaryen.MaxFloat64, 'max', ''],
      [binaryen.CopySignFloat64, 'copysign', '']
    ]);
    Wasm2Lang.Backend.NumericOps.registerBinaryOps_(m, binaryen.i32, binaryen.f64, true, [
      [binaryen.EqFloat64, 'eq', '=='],
      [binaryen.NeFloat64, 'ne', '!='],
      [binaryen.LtFloat64, 'lt', '<'],
      [binaryen.GtFloat64, 'gt', '>'],
      [binaryen.LeFloat64, 'le', '<='],
      [binaryen.GeFloat64, 'ge', '>=']
    ]);

    Wasm2Lang.Backend.NumericOps.binaryOpMap_ = m;
  }

  return Wasm2Lang.Backend.NumericOps.binaryOpMap_[op] || null;
};

/**
 * Classifies a non-i32 numeric unary operation or conversion.
 *
 * @param {!Binaryen} binaryen
 * @param {number} op
 * @return {?Wasm2Lang.Backend.NumericOps.UnaryOpInfo}
 */
Wasm2Lang.Backend.NumericOps.classifyUnaryOp = function (binaryen, op) {
  if (!Wasm2Lang.Backend.NumericOps.unaryOpMap_) {
    var /** @const {!Object<number, !Wasm2Lang.Backend.NumericOps.UnaryOpInfo>} */ m =
        /** @type {!Object<number, !Wasm2Lang.Backend.NumericOps.UnaryOpInfo>} */ (Object.create(null));

    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f32, binaryen.f32, [
      [binaryen.AbsFloat32, 'abs'],
      [binaryen.NegFloat32, 'neg'],
      [binaryen.CeilFloat32, 'ceil'],
      [binaryen.FloorFloat32, 'floor'],
      [binaryen.TruncFloat32, 'trunc'],
      [binaryen.NearestFloat32, 'nearest'],
      [binaryen.SqrtFloat32, 'sqrt']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f64, binaryen.f64, [
      [binaryen.AbsFloat64, 'abs'],
      [binaryen.NegFloat64, 'neg'],
      [binaryen.CeilFloat64, 'ceil'],
      [binaryen.FloorFloat64, 'floor'],
      [binaryen.TruncFloat64, 'trunc'],
      [binaryen.NearestFloat64, 'nearest'],
      [binaryen.SqrtFloat64, 'sqrt']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f32, binaryen.i32, [
      [binaryen.TruncSFloat32ToInt32, 'trunc_s_f32_to_i32'],
      [binaryen.TruncUFloat32ToInt32, 'trunc_u_f32_to_i32'],
      [binaryen.TruncSatSFloat32ToInt32, 'trunc_sat_s_f32_to_i32'],
      [binaryen.TruncSatUFloat32ToInt32, 'trunc_sat_u_f32_to_i32']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f64, binaryen.i32, [
      [binaryen.TruncSFloat64ToInt32, 'trunc_s_f64_to_i32'],
      [binaryen.TruncUFloat64ToInt32, 'trunc_u_f64_to_i32'],
      [binaryen.TruncSatSFloat64ToInt32, 'trunc_sat_s_f64_to_i32'],
      [binaryen.TruncSatUFloat64ToInt32, 'trunc_sat_u_f64_to_i32']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.i32, binaryen.f32, [
      [binaryen.ConvertSInt32ToFloat32, 'convert_s_i32_to_f32'],
      [binaryen.ConvertUInt32ToFloat32, 'convert_u_i32_to_f32'],
      [binaryen.ReinterpretInt32, 'reinterpret_i32_to_f32']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.i32, binaryen.f64, [
      [binaryen.ConvertSInt32ToFloat64, 'convert_s_i32_to_f64'],
      [binaryen.ConvertUInt32ToFloat64, 'convert_u_i32_to_f64']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f64, binaryen.f32, [
      [binaryen.DemoteFloat64, 'demote_f64_to_f32']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f32, binaryen.f64, [
      [binaryen.PromoteFloat32, 'promote_f32_to_f64']
    ]);
    Wasm2Lang.Backend.NumericOps.registerUnaryOps_(m, binaryen.f32, binaryen.i32, [
      [binaryen.ReinterpretFloat32, 'reinterpret_f32_to_i32']
    ]);

    Wasm2Lang.Backend.NumericOps.unaryOpMap_ = m;
  }

  return Wasm2Lang.Backend.NumericOps.unaryOpMap_[op] || null;
};
