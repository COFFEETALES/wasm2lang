'use strict';

/**
 * @override
 * @protected
 * @param {string} expr
 * @param {number=} opt_condCat
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.formatCondition_ = function (expr, opt_condCat) {
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
 * Renders a memory load.  Multi-byte accesses go through little-endian
 * instance helpers over the {@code byte[]} buffer; single-byte accesses
 * index the buffer directly ({@code byte} widens to {@code int} implicitly,
 * {@code (sbyte)} reinterprets for the signed case).
 *
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  var /** @const {string} */ buf = 'this.' + this.n_('buffer');
  var /** @const */ self = this;
  var call = /** @param {string} name @return {string} */ function (name) {
    self.markHelper_(name);
    return 'this.' + self.n_(name) + '(' + ptrExpr + ')';
  };
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return call('$w2l_load_f64');
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return call('$w2l_load_f32');
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    if (8 === bytes) {
      return call('$w2l_load_i64');
    }
    if (4 === bytes) {
      return isSigned ? '(long)' + call('$w2l_load_i32') : '(long)(uint)' + call('$w2l_load_i32');
    }
    if (2 === bytes) {
      return '(long)' + call(isSigned ? '$w2l_load_s16' : '$w2l_load_u16');
    }
    return isSigned ? '(long)(sbyte)' + buf + '[' + ptrExpr + ']' : '(long)' + buf + '[' + ptrExpr + ']';
  }
  if (4 === bytes) {
    return call('$w2l_load_i32');
  }
  if (2 === bytes) {
    return call(isSigned ? '$w2l_load_s16' : '$w2l_load_u16');
  }
  // 1 byte.
  if (isSigned) {
    return '(sbyte)' + buf + '[' + ptrExpr + ']';
  }
  return buf + '[' + ptrExpr + ']';
};

/**
 * Renders a memory store statement (without indentation, with trailing
 * semicolon).
 *
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderStore_ = function (
  binaryen,
  ptrExpr,
  valueExpr,
  wasmType,
  bytes,
  opt_valueCat
) {
  var /** @const {number} */ valueCat = void 0 !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  var /** @const {string} */ buf = 'this.' + this.n_('buffer');
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ self = this;
  var call = /** @param {string} name @param {string} value @return {string} */ function (name, value) {
    self.markHelper_(name);
    return 'this.' + self.n_(name) + '(' + ptrExpr + ', ' + value + ');';
  };
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return call('$w2l_store_f64', P.stripOuter(this.coerceToType_(binaryen, valueExpr, valueCat, wasmType)));
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return call('$w2l_store_f32', P.stripOuter(this.coerceToType_(binaryen, valueExpr, valueCat, wasmType)));
  }
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) {
    var /** @const {string} */ coercedI64 = this.coerceToType_(binaryen, valueExpr, valueCat, binaryen.i64);
    if (8 === bytes) {
      return call('$w2l_store_i64', P.stripOuter(coercedI64));
    }
    if (4 === bytes) {
      return call('$w2l_store_i32', Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('int', coercedI64));
    }
    if (2 === bytes) {
      return call('$w2l_store_16', Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('int', coercedI64));
    }
    return buf + '[' + ptrExpr + '] = ' + Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('byte', coercedI64) + ';';
  }
  var /** @const {string} */ coercedValue = this.coerceToType_(binaryen, valueExpr, valueCat, binaryen.i32);
  if (4 === bytes) {
    return call('$w2l_store_i32', P.stripOuter(coercedValue));
  }
  if (2 === bytes) {
    return call('$w2l_store_16', P.stripOuter(coercedValue));
  }
  return buf + '[' + ptrExpr + '] = ' + Wasm2Lang.Backend.CsharpCodegen.narrowingCast_('byte', coercedValue) + ';';
};

/**
 * Builds the {@code Func<...>} / {@code Action<...>} delegate type for an
 * imported function's wasm signature.
 *
 * @param {!Binaryen} binaryen
 * @param {!Array<number>} paramTypes
 * @param {number} callType
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.csharpDelegateType_ = function (binaryen, paramTypes, callType) {
  var /** @const {boolean} */ isVoid = binaryen.none === callType || 0 === callType;
  var /** @const {!Array<string>} */ typeNames = [];
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = paramTypes.length; i !== len; ++i) {
    typeNames[typeNames.length] = Wasm2Lang.Backend.CsharpCodegen.csharpTypeName_(binaryen, paramTypes[i]);
  }
  if (isVoid) {
    return 0 === typeNames.length ? 'System.Action' : 'System.Action<' + typeNames.join(', ') + '>';
  }
  typeNames[typeNames.length] = Wasm2Lang.Backend.CsharpCodegen.csharpTypeName_(binaryen, callType);
  return 'System.Func<' + typeNames.join(', ') + '>';
};

/**
 * Renders a call to an imported function: the stored {@code object} field is
 * cast to the {@code Func}/{@code Action} delegate matching the wasm
 * signature and invoked directly.
 *
 * @param {!Binaryen} binaryen
 * @param {string} importBaseName
 * @param {!Array<string>} callArgs
 * @param {number} callType
 * @param {!Array<number>=} opt_paramTypes
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderImportCallExpr_ = function (
  binaryen,
  importBaseName,
  callArgs,
  callType,
  opt_paramTypes
) {
  var /** @const {string} */ field = 'this.' + this.n_('$if_' + this.safeName_(importBaseName));
  var /** @const {string} */ delegateType = Wasm2Lang.Backend.CsharpCodegen.csharpDelegateType_(
      binaryen,
      opt_paramTypes || [],
      callType
    );
  return '((' + delegateType + ')' + field + ')(' + callArgs.join(', ') + ')';
};
