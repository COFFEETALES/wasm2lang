'use strict';

/**
 * Renders a typed memory load expression.
 *
 * Float accesses with declared alignment >= access width use direct
 * HEAPF32/HEAPF64 views.  Sub-naturally-aligned accesses go through
 * byte-copy helpers so wasm's unaligned memory semantics remain correct.
 *
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @param {number} align
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned, align) {
  if (Wasm2Lang.Backend.ValueType.isFloat(binaryen, wasmType)) {
    // When the WASM alignment attribute declares alignment >= access width,
    // use the direct typed-array view (HEAPF32/HEAPF64).  When alignment is
    // lower, the runtime address may not be naturally aligned — asm.js
    // typed-array views truncate the index (>> shift), silently reading from
    // a rounded-down offset — so fall back to the byte-copy helper.
    if (align >= bytes) {
      return this.renderCoercionByType_(binaryen, this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true), wasmType);
    }
    return this.renderHelperCall_(
      binaryen,
      '$w2l_load_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType),
      [ptrExpr],
      wasmType
    );
  }
  // Integer loads with sub-natural alignment: the asm.js typed-array shift
  // (>> 1 for HEAP16, >> 2 for HEAP32) truncates the address to an aligned
  // boundary, silently reading from a rounded-down offset.  Fall back to
  // smaller-width loads for correctness.
  if (align < bytes && bytes > 1) {
    var /** @const {string} */ intLoadName = '$w2l_load_i' + (bytes << 3) + '_a' + align;
    return this.renderHelperCall_(
      binaryen,
      intLoadName,
      [Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(ptrExpr)],
      wasmType
    );
  }
  return this.renderCoercionByType_(binaryen, this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, isSigned), wasmType);
};

/**
 * Renders a typed memory store statement.
 *
 * Float accesses with declared alignment >= access width use direct
 * HEAPF32/HEAPF64 views.  Sub-naturally-aligned accesses go through
 * byte-copy helpers so wasm's unaligned memory semantics remain correct.
 *
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number} align
 * @param {number=} opt_valueCat  Expression category of the value.
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderStore_ = function (
  binaryen,
  ptrExpr,
  valueExpr,
  wasmType,
  bytes,
  align,
  opt_valueCat
) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ valueCat = void 0 !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  // asm.js heap stores accept intish for i32 — skip coercion when already intish.
  var /** @const {string} */ coercedValue =
      Wasm2Lang.Backend.I32Coercion.INTISH === valueCat && Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)
        ? valueExpr
        : this.coerceToType_(binaryen, valueExpr, valueCat, wasmType);
  var /** @const {string} */ storeValue = P.stripForAssignment(coercedValue);
  if (Wasm2Lang.Backend.ValueType.isFloat(binaryen, wasmType)) {
    // Use direct HEAPF32/HEAPF64 when alignment is declared sufficient.
    // Fall back to byte-copy helpers for sub-natural alignment.
    if (align >= bytes) {
      return this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true) + ' = ' + storeValue + ';';
    }
    var /** @const {string} */ storeName = '$w2l_store_' + Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType);
    this.markHelper_(storeName);
    return this.n_(storeName) + '(' + ptrExpr + ', ' + storeValue + ');';
  }
  // Integer stores with sub-natural alignment: the asm.js typed-array shift
  // (>> 1 for HEAP16, >> 2 for HEAP32) truncates the address to an aligned
  // boundary, silently writing to a rounded-down offset.  Fall back to a
  // helper that decomposes into smaller-width stores.
  if (align < bytes && bytes > 1) {
    var /** @const {string} */ intStoreName = '$w2l_store_i' + (bytes << 3) + '_a' + align;
    this.markHelper_(intStoreName);
    return (
      this.n_(intStoreName) + '(' + Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(ptrExpr) + ', ' + storeValue + ');'
    );
  }
  return this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, true) + ' = ' + storeValue + ';';
};

// ---------------------------------------------------------------------------
// Expression emitter (leave callback).
// ---------------------------------------------------------------------------

/**
 * Renders the index expression used inside a byte-view typed-array access
 * (e.g., {@code HEAPU8[...]}) emitted from a runtime helper body.  The asm.js
 * default appends {@code >> 0} so the validator sees a signed i32 index; the
 * JavaScript backend overrides this to drop the coercion, since typed-array
 * indexing already runs {@code ToIndex} on the operand.
 *
 * @protected
 * @param {string} ptrExpr  Base pointer expression (already an i32 in asm.js).
 * @param {number} byteOffset  Constant byte offset (>= 0).
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderHelperByteIndex_ = function (ptrExpr, byteOffset) {
  if (0 === byteOffset) return ptrExpr + ' >> 0';
  return ptrExpr + ' + ' + String(byteOffset) + ' >> 0';
};

/**
 * Returns the pointer expression with an optional static byte offset applied.
 * When offset is zero the original expression is returned unchanged.  Asm.js
 * wraps the sum with {@code |0} so the validator sees a signed i32.
 *
 * @protected
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  if ('0' === baseExpr) return String(offset);
  return Wasm2Lang.Backend.JsCommonCodegen.renderSignedCoercion_(
    P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_)
  );
};

/**
 * Returns the asm.js heap-view indexed expression for a given value type,
 * width, and signedness, e.g. {@code "HEAP32[ptr >> 2]"}.
 *
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes  Access width (1, 2, or 4).
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.renderHeapAccess_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  // Shift is log2(bytes) for bytes in {1,2,4,8}; 0 is the safe default.
  var /** @const {string} */ shiftAmount = 8 === bytes ? '3' : 4 === bytes ? '2' : 2 === bytes ? '1' : '0';
  var /** @const {string} */ shiftedPtr = P.renderInfix(ptrExpr, '>>', shiftAmount, P.PREC_SHIFT_);

  /** @type {string} */
  var viewName;
  if (V.isF64(binaryen, wasmType)) viewName = 'HEAPF64';
  else if (V.isF32(binaryen, wasmType)) viewName = 'HEAPF32';
  else if (4 === bytes) viewName = 'HEAP32';
  else if (2 === bytes) viewName = isSigned ? 'HEAP16' : 'HEAPU16';
  else if (1 === bytes) viewName = isSigned ? 'HEAP8' : 'HEAPU8';
  else {
    this.markBinding_('HEAP8');
    return this.n_('HEAP8') + '[0]';
  }
  this.markBinding_(viewName);
  return this.n_(viewName) + '[' + shiftedPtr + ']';
};
