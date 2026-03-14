'use strict';

/**
 * Descriptor returned by {@code classifyBinaryOp} for non-i32 numeric ops.
 *
 * @typedef {{
 *   name: string,
 *   resultType: number,
 *   operandType: number,
 *   operator: string,
 *   isComparison: boolean
 * }}
 */
Wasm2Lang.Backend.NumericOps.BinaryOpInfo;

/**
 * Descriptor returned by {@code classifyUnaryOp}.
 *
 * @typedef {{
 *   name: string,
 *   resultType: number,
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

    var /** @const {function(number, string, number, string, boolean): !Wasm2Lang.Backend.NumericOps.BinaryOpInfo} */ make =
        function (resultType, name, operandType, operator, isComparison) {
          return {
            name: name,
            resultType: resultType,
            operandType: operandType,
            operator: operator,
            isComparison: isComparison
          };
        };

    m[binaryen.AddFloat32] = make(binaryen.f32, 'add', binaryen.f32, '+', false);
    m[binaryen.SubFloat32] = make(binaryen.f32, 'sub', binaryen.f32, '-', false);
    m[binaryen.MulFloat32] = make(binaryen.f32, 'mul', binaryen.f32, '*', false);
    m[binaryen.DivFloat32] = make(binaryen.f32, 'div', binaryen.f32, '/', false);
    m[binaryen.MinFloat32] = make(binaryen.f32, 'min', binaryen.f32, '', false);
    m[binaryen.MaxFloat32] = make(binaryen.f32, 'max', binaryen.f32, '', false);
    m[binaryen.CopySignFloat32] = make(binaryen.f32, 'copysign', binaryen.f32, '', false);
    m[binaryen.EqFloat32] = make(binaryen.i32, 'eq', binaryen.f32, '==', true);
    m[binaryen.NeFloat32] = make(binaryen.i32, 'ne', binaryen.f32, '!=', true);
    m[binaryen.LtFloat32] = make(binaryen.i32, 'lt', binaryen.f32, '<', true);
    m[binaryen.GtFloat32] = make(binaryen.i32, 'gt', binaryen.f32, '>', true);
    m[binaryen.LeFloat32] = make(binaryen.i32, 'le', binaryen.f32, '<=', true);
    m[binaryen.GeFloat32] = make(binaryen.i32, 'ge', binaryen.f32, '>=', true);

    m[binaryen.AddFloat64] = make(binaryen.f64, 'add', binaryen.f64, '+', false);
    m[binaryen.SubFloat64] = make(binaryen.f64, 'sub', binaryen.f64, '-', false);
    m[binaryen.MulFloat64] = make(binaryen.f64, 'mul', binaryen.f64, '*', false);
    m[binaryen.DivFloat64] = make(binaryen.f64, 'div', binaryen.f64, '/', false);
    m[binaryen.MinFloat64] = make(binaryen.f64, 'min', binaryen.f64, '', false);
    m[binaryen.MaxFloat64] = make(binaryen.f64, 'max', binaryen.f64, '', false);
    m[binaryen.CopySignFloat64] = make(binaryen.f64, 'copysign', binaryen.f64, '', false);
    m[binaryen.EqFloat64] = make(binaryen.i32, 'eq', binaryen.f64, '==', true);
    m[binaryen.NeFloat64] = make(binaryen.i32, 'ne', binaryen.f64, '!=', true);
    m[binaryen.LtFloat64] = make(binaryen.i32, 'lt', binaryen.f64, '<', true);
    m[binaryen.GtFloat64] = make(binaryen.i32, 'gt', binaryen.f64, '>', true);
    m[binaryen.LeFloat64] = make(binaryen.i32, 'le', binaryen.f64, '<=', true);
    m[binaryen.GeFloat64] = make(binaryen.i32, 'ge', binaryen.f64, '>=', true);

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

    var /** @const {function(string, number, number): !Wasm2Lang.Backend.NumericOps.UnaryOpInfo} */ make = function (
        name,
        operandType,
        resultType
      ) {
        return {
          name: name,
          operandType: operandType,
          resultType: resultType
        };
      };

    m[binaryen.AbsFloat32] = make('abs', binaryen.f32, binaryen.f32);
    m[binaryen.NegFloat32] = make('neg', binaryen.f32, binaryen.f32);
    m[binaryen.CeilFloat32] = make('ceil', binaryen.f32, binaryen.f32);
    m[binaryen.FloorFloat32] = make('floor', binaryen.f32, binaryen.f32);
    m[binaryen.TruncFloat32] = make('trunc', binaryen.f32, binaryen.f32);
    m[binaryen.NearestFloat32] = make('nearest', binaryen.f32, binaryen.f32);
    m[binaryen.SqrtFloat32] = make('sqrt', binaryen.f32, binaryen.f32);

    m[binaryen.AbsFloat64] = make('abs', binaryen.f64, binaryen.f64);
    m[binaryen.NegFloat64] = make('neg', binaryen.f64, binaryen.f64);
    m[binaryen.CeilFloat64] = make('ceil', binaryen.f64, binaryen.f64);
    m[binaryen.FloorFloat64] = make('floor', binaryen.f64, binaryen.f64);
    m[binaryen.TruncFloat64] = make('trunc', binaryen.f64, binaryen.f64);
    m[binaryen.NearestFloat64] = make('nearest', binaryen.f64, binaryen.f64);
    m[binaryen.SqrtFloat64] = make('sqrt', binaryen.f64, binaryen.f64);

    m[binaryen.TruncSFloat32ToInt32] = make('trunc_s_f32_to_i32', binaryen.f32, binaryen.i32);
    m[binaryen.TruncUFloat32ToInt32] = make('trunc_u_f32_to_i32', binaryen.f32, binaryen.i32);
    m[binaryen.TruncSFloat64ToInt32] = make('trunc_s_f64_to_i32', binaryen.f64, binaryen.i32);
    m[binaryen.TruncUFloat64ToInt32] = make('trunc_u_f64_to_i32', binaryen.f64, binaryen.i32);
    m[binaryen.TruncSatSFloat32ToInt32] = make('trunc_sat_s_f32_to_i32', binaryen.f32, binaryen.i32);
    m[binaryen.TruncSatUFloat32ToInt32] = make('trunc_sat_u_f32_to_i32', binaryen.f32, binaryen.i32);
    m[binaryen.TruncSatSFloat64ToInt32] = make('trunc_sat_s_f64_to_i32', binaryen.f64, binaryen.i32);
    m[binaryen.TruncSatUFloat64ToInt32] = make('trunc_sat_u_f64_to_i32', binaryen.f64, binaryen.i32);
    m[binaryen.ConvertSInt32ToFloat32] = make('convert_s_i32_to_f32', binaryen.i32, binaryen.f32);
    m[binaryen.ConvertUInt32ToFloat32] = make('convert_u_i32_to_f32', binaryen.i32, binaryen.f32);
    m[binaryen.ConvertSInt32ToFloat64] = make('convert_s_i32_to_f64', binaryen.i32, binaryen.f64);
    m[binaryen.ConvertUInt32ToFloat64] = make('convert_u_i32_to_f64', binaryen.i32, binaryen.f64);
    m[binaryen.DemoteFloat64] = make('demote_f64_to_f32', binaryen.f64, binaryen.f32);
    m[binaryen.PromoteFloat32] = make('promote_f32_to_f64', binaryen.f32, binaryen.f64);
    m[binaryen.ReinterpretFloat32] = make('reinterpret_f32_to_i32', binaryen.f32, binaryen.i32);
    m[binaryen.ReinterpretInt32] = make('reinterpret_i32_to_f32', binaryen.i32, binaryen.f32);

    Wasm2Lang.Backend.NumericOps.unaryOpMap_ = m;
  }

  return Wasm2Lang.Backend.NumericOps.unaryOpMap_[op] || null;
};
