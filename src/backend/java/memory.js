'use strict';

/**
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  if ('0' === baseExpr) return String(offset);
  return P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_);
};

/**
 * @override
 * @protected
 * @param {string} expr
 * @param {number=} opt_condCat
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.formatCondition_ = function (expr, opt_condCat) {
  if ('' === expr) return '(0 != 0)';
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32 === opt_condCat) {
    return P.isFullyParenthesized(expr) ? expr : '(' + expr + ')';
  }
  if (Wasm2Lang.Backend.AbstractCodegen.CAT_I64 === opt_condCat) {
    return '(' + P.wrap_(expr, P.PREC_EQUALITY_, true) + ' != 0L)';
  }
  return '(' + P.wrap_(expr, P.PREC_EQUALITY_, true) + ' != 0)';
};

/**
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  var /** @const {string} */ buf = 'this.' + this.n_('buffer');
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) {
    this.markHelper_('$w2l_v128_load');
    return this.n_('$w2l_v128_load') + '(' + buf + ', ' + ptrExpr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return buf + '.getDouble(' + ptrExpr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return buf + '.getFloat(' + ptrExpr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    if (8 === bytes) {
      return buf + '.getLong(' + ptrExpr + ')';
    }
    if (4 === bytes) {
      return isSigned ? '(long)' + buf + '.getInt(' + ptrExpr + ')' : '(' + buf + '.getInt(' + ptrExpr + ') & 0xFFFFFFFFL)';
    }
    if (2 === bytes) {
      return isSigned ? '(long)' + buf + '.getShort(' + ptrExpr + ')' : '(' + buf + '.getShort(' + ptrExpr + ') & 0xFFFFL)';
    }
    return isSigned ? '(long)' + buf + '.get(' + ptrExpr + ')' : '(' + buf + '.get(' + ptrExpr + ') & 0xFFL)';
  }
  if (4 === bytes) {
    return buf + '.getInt(' + ptrExpr + ')';
  }
  if (2 === bytes) {
    if (isSigned) {
      return buf + '.getShort(' + ptrExpr + ')';
    }
    return '(' + buf + '.getShort(' + ptrExpr + ') & 0xFFFF)';
  }
  // 1 byte.
  if (isSigned) {
    return buf + '.get(' + ptrExpr + ')';
  }
  return '(' + buf + '.get(' + ptrExpr + ') & 0xFF)';
};

/**
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderStore_ = function (binaryen, ptrExpr, valueExpr, wasmType, bytes, opt_valueCat) {
  var /** @const {number} */ valueCat = void 0 !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  var /** @const {string} */ buf = 'this.' + this.n_('buffer');
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) {
    this.markHelper_('$w2l_v128_store');
    return this.n_('$w2l_v128_store') + '(' + buf + ', ' + ptrExpr + ', ' + valueExpr + ');';
  }
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return buf + '.putDouble(' + ptrExpr + ', ' + this.coerceToType_(binaryen, valueExpr, valueCat, wasmType) + ');';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return buf + '.putFloat(' + ptrExpr + ', ' + this.coerceToType_(binaryen, valueExpr, valueCat, wasmType) + ');';
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    var /** @const {string} */ coercedI64 = this.coerceToType_(binaryen, valueExpr, valueCat, binaryen.i64);
    if (8 === bytes) {
      return buf + '.putLong(' + ptrExpr + ', ' + coercedI64 + ');';
    }
    if (4 === bytes) {
      return buf + '.putInt(' + ptrExpr + ', (int)(' + coercedI64 + '));';
    }
    if (2 === bytes) {
      return buf + '.putShort(' + ptrExpr + ', (short)(' + coercedI64 + '));';
    }
    return buf + '.put(' + ptrExpr + ', (byte)(' + coercedI64 + '));';
  }
  var /** @const {string} */ coercedValue = this.coerceToType_(binaryen, valueExpr, valueCat, binaryen.i32);
  if (4 === bytes) {
    return buf + '.putInt(' + ptrExpr + ', ' + coercedValue + ');';
  }
  if (2 === bytes) {
    return buf + '.putShort(' + ptrExpr + ', (short)(' + coercedValue + '));';
  }
  return buf + '.put(' + ptrExpr + ', (byte)(' + coercedValue + '));';
};

/**
 * Returns the Java functional-interface lane for a wasm type.
 * i32 → 'Int', i64 → 'Long', f32/f64 → 'Double'.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.javaLane_ = function (binaryen, wasmType) {
  if (binaryen.i64 === wasmType) return 'Long';
  if (binaryen.f32 === wasmType || binaryen.f64 === wasmType) return 'Double';
  return 'Int';
};

/**
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.JavaCodegen.UNARY_IFACE_ = {
  'Int_Int': ['IntUnaryOperator', 'applyAsInt'],
  'Int_Long': ['IntToLongFunction', 'applyAsLong'],
  'Int_Double': ['IntToDoubleFunction', 'applyAsDouble'],
  'Long_Int': ['LongToIntFunction', 'applyAsInt'],
  'Long_Long': ['LongUnaryOperator', 'applyAsLong'],
  'Long_Double': ['LongToDoubleFunction', 'applyAsDouble'],
  'Double_Int': ['DoubleToIntFunction', 'applyAsInt'],
  'Double_Long': ['DoubleToLongFunction', 'applyAsLong'],
  'Double_Double': ['DoubleUnaryOperator', 'applyAsDouble']
};

/**
 * Renders a call to an imported function, choosing the appropriate Java
 * functional interface and invocation method based on the wasm signature.
 *
 * @param {!Binaryen} binaryen
 * @param {string} importBaseName
 * @param {!Array<string>} callArgs
 * @param {number} callType
 * @param {!Array<number>=} opt_paramTypes
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderImportCallExpr_ = function (
  binaryen,
  importBaseName,
  callArgs,
  callType,
  opt_paramTypes
) {
  var /** @const {string} */ field = 'this.' + this.n_('$if_' + this.safeName_(importBaseName));
  var /** @const {boolean} */ isVoid = binaryen.none === callType || 0 === callType;
  var /** @const {number} */ numArgs = callArgs.length;
  var /** @const {function(!Binaryen, number): string} */ lane = Wasm2Lang.Backend.JavaCodegen.javaLane_;
  var /** @const {string} */ retLane = isVoid ? 'Void' : lane(binaryen, callType);
  var /** @const {boolean} */ needsFloatCast = binaryen.f32 === callType;

  // --- 0 args ---
  if (0 === numArgs) {
    if (isVoid) return '((Runnable)' + field + ').run()';
    var /** @const {string} */ supplier =
        'Long' === retLane ? 'LongSupplier' : 'Double' === retLane ? 'DoubleSupplier' : 'IntSupplier';
    var /** @const {string} */ getMethod = 'Long' === retLane ? 'getAsLong' : 'Double' === retLane ? 'getAsDouble' : 'getAsInt';
    var /** @type {string} */ sup = '((java.util.function.' + supplier + ')' + field + ').' + getMethod + '()';
    return needsFloatCast ? '(float)' + sup : sup;
  }

  var /** @const {string} */ paramLane = lane(
      binaryen,
      opt_paramTypes && opt_paramTypes.length > 0 ? opt_paramTypes[0] : binaryen.i32
    );

  // --- 1 arg, void return ---
  if (isVoid && 1 === numArgs) {
    var /** @const {string} */ consumer =
        'Long' === paramLane ? 'LongConsumer' : 'Double' === paramLane ? 'DoubleConsumer' : 'IntConsumer';
    return '((java.util.function.' + consumer + ')' + field + ').accept(' + callArgs[0] + ')';
  }

  // --- 1 arg, non-void return ---
  if (1 === numArgs) {
    var /** @const {string} */ key = paramLane + '_' + retLane;
    var /** @const {!Array<string>|undefined} */ entry = Wasm2Lang.Backend.JavaCodegen.UNARY_IFACE_[key];
    if (entry) {
      var /** @type {string} */ r =
          '((java.util.function.' + entry[0] + ')' + field + ').' + entry[1] + '(' + callArgs[0] + ')';
      return needsFloatCast ? '(float)' + r : r;
    }
  }

  // --- 2 args, non-void return ---
  if (!isVoid && 2 === numArgs) {
    var /** @const {string} */ binIface =
        'Long' === paramLane ? 'LongBinaryOperator' : 'Double' === paramLane ? 'DoubleBinaryOperator' : 'IntBinaryOperator';
    var /** @const {string} */ binMethod =
        'Long' === paramLane ? 'applyAsLong' : 'Double' === paramLane ? 'applyAsDouble' : 'applyAsInt';
    var /** @type {string} */ bin =
        '((java.util.function.' + binIface + ')' + field + ').' + binMethod + '(' + callArgs[0] + ', ' + callArgs[1] + ')';
    return needsFloatCast ? '(float)' + bin : bin;
  }

  // Fallback: direct call (will not compile, but documents intent).
  return field + '(' + callArgs.join(', ') + ')';
};
