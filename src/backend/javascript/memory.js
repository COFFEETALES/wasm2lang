'use strict';

// ---------------------------------------------------------------------------
// Typed-array memory access for JavaScript.
//
// Reuses the asm.js HEAP*/HEAPF* views for i32/f32/f64 traffic and adds a
// BigInt64Array view ({@code HEAP64}) for aligned 8-byte i64 load/store.
// Sub-width i64 loads/stores narrow through the i8/i16/i32 views with
// {@code BigInt(...)} wraps and {@code BigInt.asIntN(N, ...)} / Number(...)
// narrowing.
//
// SpiderMonkey canonicalizes NaN bits whenever a float transits a JS Number
// boundary in non-asm.js code (so {@code HEAPF32[i] = val} and
// {@code HEAPF64[i] = val} both lose NaN-payload bits).  Detect the direct
// {@code f32.store(f32.reinterpret_i32(x))} and
// {@code f64.store(f64.reinterpret_i64(x))} patterns and route them through
// integer-view stores instead.  For aligned stores that means
// {@code HEAP32[ptr>>2] = x} / {@code HEAP64[ptr>>3] = x}; for unaligned
// stores it means {@code $w2l_store_i32_a1}/{@code $w2l_store_i32_a2} (i32)
// or {@code $w2l_store_i64} (i64), all of which byte-copy through HEAPU8 so
// the original bit pattern reaches memory unchanged.
//
// Unlike asm.js, JavaScript has no validator requiring {@code |0} on pointer
// sums or {@code >> 0} on byte-view indices — typed-array indexing coerces
// via {@code ToIndex}, and multi-byte views use {@code >> 1/2/3} which
// itself runs {@code ToInt32} on the operand.  The overrides in this file
// drop both annotations so memory expressions read as plain JavaScript.
// ---------------------------------------------------------------------------

/**
 * Runtime-helper byte-view indices: JavaScript needs no {@code >> 0}
 * coercion since typed-array indexing runs {@code ToIndex} itself.  This
 * strips the asm.js coercion from {@code HEAPU8[...]} accesses emitted
 * inside shared helpers like {@code $w2l_store_f64}/{@code $w2l_load_f64}.
 *
 * @override
 * @protected
 * @param {string} ptrExpr
 * @param {number} byteOffset
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderHelperByteIndex_ = function (ptrExpr, byteOffset) {
  if (0 === byteOffset) return ptrExpr;
  return ptrExpr + ' + ' + String(byteOffset);
};

/**
 * JavaScript typed-array indexing auto-coerces the index — no {@code |0}
 * is needed on the sum.  Keep the zero-offset fast path.
 *
 * @override
 * @protected
 * @param {string} baseExpr
 * @param {number} offset
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderPtrWithOffset_ = function (baseExpr, offset) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (0 === offset) return baseExpr;
  if ('0' === baseExpr) return String(offset);
  return P.renderInfix(baseExpr, '+', String(offset), P.PREC_ADDITIVE_);
};

/**
 * Byte-width views ({@code HEAP8}/{@code HEAPU8}) need no {@code >> 0} in
 * plain JavaScript — the typed-array {@code ToIndex} conversion already
 * truncates the index.  Multi-byte views still need {@code >> 1/2/3} because
 * typed arrays index by element, not by byte offset.
 *
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderHeapAccess_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  if (1 !== bytes || !Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) {
    return Wasm2Lang.Backend.AsmjsCodegen.prototype.renderHeapAccess_.call(this, binaryen, ptrExpr, wasmType, bytes, isSigned);
  }
  var /** @const {string} */ viewName = isSigned ? 'HEAP8' : 'HEAPU8';
  this.markBinding_(viewName);
  return this.n_(viewName) + '[' + ptrExpr + ']';
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @param {number} align
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned, align) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (V.isI64(binaryen, wasmType)) {
    if (8 === bytes) {
      if (align >= 8) {
        this.markBinding_('HEAP64');
        return this.n_('HEAP64') + '[' + P.renderInfix(ptrExpr, '>>', '3', P.PREC_SHIFT_) + ']';
      }
      return this.renderHelperCall_(binaryen, '$w2l_load_i64', [ptrExpr], binaryen.i64);
    }
    var /** @type {string} */ narrowView;
    var /** @type {string} */ narrowShift;
    if (4 === bytes) {
      narrowView = 'HEAP32';
      narrowShift = '2';
    } else if (2 === bytes) {
      narrowView = isSigned ? 'HEAP16' : 'HEAPU16';
      narrowShift = '1';
    } else {
      narrowView = isSigned ? 'HEAP8' : 'HEAPU8';
      narrowShift = '0';
    }
    this.markBinding_(narrowView);
    var /** @const {string} */ indexed =
        '0' === narrowShift ? ptrExpr : P.renderInfix(ptrExpr, '>>', narrowShift, P.PREC_SHIFT_);
    var /** @type {string} */ narrow = this.n_(narrowView) + '[' + indexed + ']';
    if (4 === bytes && !isSigned) {
      narrow = P.renderInfix(narrow, '>>>', '0', P.PREC_SHIFT_);
    }
    this.markHelper_('$w2l_bigint');
    return this.n_('$w2l_bigint') + '(' + narrow + ')';
  }
  // Non-i64 loads: typed-array reads already produce properly-typed Numbers in
  // JavaScript (HEAP8/HEAPU8/HEAP16/HEAPU16/HEAP32 return int32-ranged values;
  // HEAPF32/HEAPF64 return the corresponding float).  Skip the asm.js outer
  // {@code |0}/{@code Math.fround} wrap.  Unaligned paths still go through
  // helpers that self-coerce their return value.
  if (align < bytes && bytes > 1) {
    var /** @type {string} */ loadHelper;
    if (V.isFloat(binaryen, wasmType)) {
      loadHelper = '$w2l_load_' + V.typeName(binaryen, wasmType);
      return this.renderHelperCall_(binaryen, loadHelper, [ptrExpr], wasmType);
    }
    loadHelper = '$w2l_load_i' + (bytes << 3) + '_a' + align;
    return this.renderHelperCall_(binaryen, loadHelper, [ptrExpr], wasmType);
  }
  return this.renderHeapAccess_(binaryen, ptrExpr, wasmType, bytes, isSigned);
};

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number} align
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderStore_ = function (
  binaryen,
  ptrExpr,
  valueExpr,
  wasmType,
  bytes,
  align,
  opt_valueCat
) {
  var /** @const */ V = Wasm2Lang.Backend.ValueType;
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {number} */ valueCat = void 0 !== opt_valueCat ? opt_valueCat : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;

  if (V.isF32(binaryen, wasmType)) {
    var /** @const {?string} */ reinterpret32Inner = this.unwrapF32ReinterpretI32_(valueExpr);
    if (null !== reinterpret32Inner) {
      if (align >= bytes) {
        this.markBinding_('HEAP32');
        return this.n_('HEAP32') + '[' + P.renderInfix(ptrExpr, '>>', '2', P.PREC_SHIFT_) + '] = ' + reinterpret32Inner + ';';
      }
      var /** @const {string} */ i32StoreHelper = 1 === align ? '$w2l_store_i32_a1' : '$w2l_store_i32_a2';
      this.markHelper_(i32StoreHelper);
      return this.n_(i32StoreHelper) + '(' + ptrExpr + ', ' + reinterpret32Inner + ');';
    }
  }

  if (V.isF64(binaryen, wasmType)) {
    var /** @const {?string} */ reinterpret64Inner = this.unwrapF64ReinterpretI64_(valueExpr);
    if (null !== reinterpret64Inner) {
      if (align >= bytes) {
        this.markBinding_('HEAP64');
        return this.n_('HEAP64') + '[' + P.renderInfix(ptrExpr, '>>', '3', P.PREC_SHIFT_) + '] = ' + reinterpret64Inner + ';';
      }
      this.markHelper_('$w2l_store_i64');
      return this.n_('$w2l_store_i64') + '(' + ptrExpr + ', ' + reinterpret64Inner + ');';
    }
  }

  if (V.isI64(binaryen, wasmType)) {
    var /** @const {string} */ i64Value = this.coerceToType_(binaryen, valueExpr, valueCat, binaryen.i64);
    if (8 === bytes) {
      if (align >= 8) {
        this.markBinding_('HEAP64');
        return this.n_('HEAP64') + '[' + P.renderInfix(ptrExpr, '>>', '3', P.PREC_SHIFT_) + '] = ' + i64Value + ';';
      }
      this.markHelper_('$w2l_store_i64');
      return this.n_('$w2l_store_i64') + '(' + ptrExpr + ', ' + i64Value + ');';
    }
    var /** @const {number} */ narrowBits = bytes << 3;
    this.markHelper_('$w2l_number');
    this.markHelper_('$w2l_bigint_asintn');
    var /** @const {string} */ narrowed =
        this.n_('$w2l_number') + '(' + this.n_('$w2l_bigint_asintn') + '(' + narrowBits + ', ' + P.stripOuter(i64Value) + '))';
    var /** @type {string} */ storeView;
    var /** @type {string} */ storeShift;
    if (4 === bytes) {
      storeView = 'HEAP32';
      storeShift = '2';
    } else if (2 === bytes) {
      storeView = 'HEAP16';
      storeShift = '1';
    } else {
      storeView = 'HEAP8';
      storeShift = '0';
    }
    this.markBinding_(storeView);
    var /** @const {string} */ storeIndex =
        '0' === storeShift ? ptrExpr : P.renderInfix(ptrExpr, '>>', storeShift, P.PREC_SHIFT_);
    return this.n_(storeView) + '[' + storeIndex + '] = ' + narrowed + ';';
  }

  return Wasm2Lang.Backend.AsmjsCodegen.prototype.renderStore_.call(
    this,
    binaryen,
    ptrExpr,
    valueExpr,
    wasmType,
    bytes,
    align,
    opt_valueCat
  );
};

/**
 * Returns the i32 argument when {@code expr} has the shape
 * {@code Math.fround($w2l_reinterpret_i32_to_f32(X))} or
 * {@code $w2l_reinterpret_i32_to_f32(X)}.  Returns {@code null} when the
 * expression does not match that exact pattern.  Used to rewrite
 * {@code f32.store(f32.reinterpret_i32(X))} into a {@code HEAP32} store so
 * the integer bit pattern reaches memory without transiting a JS Number.
 *
 * @protected
 * @param {string} expr
 * @return {?string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.unwrapF32ReinterpretI32_ = function (expr) {
  var /** @const {?string} */ unfrounded = this.stripHelperWrapper_(expr, this.n_('Math_fround') + '(');
  var /** @const {string} */ candidate = null !== unfrounded ? unfrounded : expr;
  return this.stripHelperWrapper_(candidate, this.n_('$w2l_reinterpret_i32_to_f32') + '(');
};

/**
 * Returns the i64 argument when {@code expr} has the shape
 * {@code $w2l_reinterpret_i64_to_f64(X)}.  Returns {@code null} when the
 * expression does not match that exact pattern.  Used to rewrite
 * {@code f64.store(f64.reinterpret_i64(X))} into a {@code HEAP64} store so
 * the BigInt bit pattern reaches memory without transiting a JS Number.
 *
 * @protected
 * @param {string} expr
 * @return {?string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.unwrapF64ReinterpretI64_ = function (expr) {
  return this.stripHelperWrapper_(expr, this.n_('$w2l_reinterpret_i64_to_f64') + '(');
};

/**
 * Strips a single {@code prefix + '(' + arg + ')'} wrapper from {@code expr}
 * and returns {@code arg}, or {@code null} when the expression does not
 * have that exact shape.  Shared by the F32/F64 reinterpret unwrap helpers.
 *
 * @protected
 * @param {string} expr
 * @param {string} prefix  Must include the trailing {@code '('}.
 * @return {?string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.stripHelperWrapper_ = function (expr, prefix) {
  if (0 === expr.indexOf(prefix) && ')' === expr.charAt(expr.length - 1) && this.isBalancedHelperArg_(expr, prefix.length)) {
    return expr.substring(prefix.length, expr.length - 1);
  }
  return null;
};

/**
 * Checks that the closing paren at {@code expr.length - 1} pairs with the
 * opening paren at {@code argStart - 1}, so we don't accidentally slice a
 * suffix of a larger expression like
 * {@code $w2l_reinterpret_i64_to_f64(x) + y}.
 *
 * @protected
 * @param {string} expr
 * @param {number} argStart  Index just past the opening paren.
 * @return {boolean}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.isBalancedHelperArg_ = function (expr, argStart) {
  var /** @type {number} */ depth = 1;
  var /** @const {number} */ endIndex = expr.length - 1;
  for (var /** @type {number} */ i = argStart; i < endIndex; ++i) {
    var /** @const {string} */ c = expr.charAt(i);
    if ('(' === c) ++depth;
    else if (')' === c) {
      if (0 === --depth) return false;
    }
  }
  return 1 === depth;
};
