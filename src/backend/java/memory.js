'use strict';

/**
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  return P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_);
};

/**
 * @override
 * @protected
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.formatCondition_ = function (expr) {
  if ('' === expr) return '(0 != 0)';
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  return '(' + P.wrap(expr, P.PREC_EQUALITY_, true) + ' != 0)';
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
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return buf + '.getDouble(' + ptrExpr + ')';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return buf + '.getFloat(' + ptrExpr + ')';
  }
  if (4 === bytes) {
    return buf + '.getInt(' + ptrExpr + ')';
  }
  if (2 === bytes) {
    if (isSigned) {
      return '(int)' + buf + '.getShort(' + ptrExpr + ')';
    }
    return '(' + buf + '.getShort(' + ptrExpr + ') & 0xFFFF)';
  }
  // 1 byte.
  if (isSigned) {
    return '(int)' + buf + '.get(' + ptrExpr + ')';
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
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) {
    return buf + '.putDouble(' + ptrExpr + ', ' + this.coerceToType_(binaryen, valueExpr, valueCat, wasmType) + ');';
  }
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) {
    return buf + '.putFloat(' + ptrExpr + ', ' + this.coerceToType_(binaryen, valueExpr, valueCat, wasmType) + ');';
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
 * Renders a call to an imported function, choosing the appropriate Java
 * functional interface and invocation method based on the wasm signature.
 *
 * @param {!Binaryen} binaryen
 * @param {string} importBaseName
 * @param {!Array<string>} callArgs
 * @param {number} callType
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.renderImportCallExpr_ = function (binaryen, importBaseName, callArgs, callType) {
  var /** @const {string} */ field = 'this.' + this.n_('$if_' + this.safeName_(importBaseName));
  var /** @const {boolean} */ isVoid = callType === binaryen.none || 0 === callType;
  var /** @const {number} */ numArgs = callArgs.length;

  if (isVoid && 0 === numArgs) {
    return '((Runnable)' + field + ').run()';
  }
  if (isVoid && 1 === numArgs) {
    return '((java.util.function.IntConsumer)' + field + ').accept(' + callArgs[0] + ')';
  }
  if (!isVoid && 0 === numArgs) {
    return '((java.util.function.IntSupplier)' + field + ').getAsInt()';
  }
  if (!isVoid && 1 === numArgs) {
    return '((java.util.function.IntUnaryOperator)' + field + ').applyAsInt(' + callArgs[0] + ')';
  }
  if (!isVoid && 2 === numArgs) {
    return '((java.util.function.IntBinaryOperator)' + field + ').applyAsInt(' + callArgs[0] + ', ' + callArgs[1] + ')';
  }
  // Fallback: direct call (will not compile, but documents intent).
  return field + '(' + callArgs.join(', ') + ')';
};
