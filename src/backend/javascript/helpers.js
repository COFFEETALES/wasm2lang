'use strict';

// ---------------------------------------------------------------------------
// BigInt-based i64 helpers.
//
// Appended after the asm.js helper bundle so that i32/float helpers inherited
// from the base class (ctz/popcnt/rotl/rotr/copysign/trunc/nearest/trunc_sat)
// continue to run unchanged — their {@code |0} coercions are harmless in
// non-asm.js code.  The BigInt i64 helpers split the 64-bit value into two
// 32-bit halves via {@code Number(x >> 32n)} and {@code Number(x & 0xFFFFFFFFn)}
// and delegate to {@code Math.clz32} / {@code Math.imul} for the bit-counting
// kernels.
//
// Reinterpret and unaligned i64 load/store helpers use the
// {@code BigInt64Array} ({@code HEAP64}) view that aliases the same buffer as
// {@code HEAPF64}.  Writing the bit pattern through {@code HEAP64} and reading
// through {@code HEAPF64} (or vice versa) preserves the exact 64-bit pattern
// without transiting a JS Number — matching the asm.js {@code HEAPF32}/
// {@code HEAP32} reinterpret pattern at 64-bit width.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.emitHelpers_ = function (
  scratchByteOffset,
  scratchWordIndex,
  scratchQwordIndex,
  heapPageCount
) {
  var /** @const {!Array<string>} */ lines = Wasm2Lang.Backend.AsmjsCodegen.prototype.emitHelpers_.call(
      this,
      scratchByteOffset,
      scratchWordIndex,
      scratchQwordIndex,
      heapPageCount
    );

  var /** @const {!Object<string, boolean>} */ used = /** @type {!Object<string, boolean>} */ (
      this.usedHelpers_ || Object.create(null)
    );
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const */ self = this;
  /**
   * @param {string} s
   * @return {string}
   */
  var n = function (s) {
    return self.n_(s);
  };
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ nMathClz32 = n('Math_clz32');
  var /** @const {string} */ nMathImul = n('Math_imul');
  var /** @const {string} */ scratchQ = String(scratchQwordIndex);
  var /** @const {string} */ scratchByte = String(scratchByteOffset);

  if (used['$w2l_i64_clz']) {
    self.markBinding_('Math_clz32');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_i64_clz') + '(' + l0 + ') {\n' +
      pad2 + 'if (' + l0 + ' === 0n) return 64n;\n' +
      pad2 + 'var ' + l1 + ' = Number((' + l0 + ' >> 32n) & 0xFFFFFFFFn) | 0;\n' +
      pad2 + 'var ' + l2 + ' = Number(' + l0 + ' & 0xFFFFFFFFn) | 0;\n' +
      pad2 + 'if (' + l1 + ' !== 0) return BigInt(' + nMathClz32 + '(' + l1 + '));\n' +
      pad2 + 'return 32n + BigInt(' + nMathClz32 + '(' + l2 + '));\n' +
      pad1 + '}';
  }

  if (used['$w2l_i64_ctz']) {
    self.markBinding_('Math_clz32');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_i64_ctz') + '(' + l0 + ') {\n' +
      pad2 + 'if (' + l0 + ' === 0n) return 64n;\n' +
      pad2 + 'var ' + l1 + ' = Number((' + l0 + ' >> 32n) & 0xFFFFFFFFn) | 0;\n' +
      pad2 + 'var ' + l2 + ' = Number(' + l0 + ' & 0xFFFFFFFFn) | 0;\n' +
      pad2 + 'if (' + l2 + ' !== 0) return BigInt(31 - ' + nMathClz32 + '(' + l2 + ' & -' + l2 + '));\n' +
      pad2 + 'return 32n + BigInt(31 - ' + nMathClz32 + '(' + l1 + ' & -' + l1 + '));\n' +
      pad1 + '}';
  }

  if (used['$w2l_i64_popcnt']) {
    self.markBinding_('Math_imul');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_i64_popcnt') + '(' + l0 + ') {\n' +
      pad2 + 'var ' + l1 + ' = Number((' + l0 + ' >> 32n) & 0xFFFFFFFFn) | 0;\n' +
      pad2 + 'var ' + l2 + ' = Number(' + l0 + ' & 0xFFFFFFFFn) | 0;\n' +
      pad2 + l1 + ' = ' + l1 + ' - ((' + l1 + ' >>> 1) & 0x55555555);\n' +
      pad2 + l1 + ' = (' + l1 + ' & 0x33333333) + ((' + l1 + ' >>> 2) & 0x33333333);\n' +
      pad2 + l1 + ' = (' + l1 + ' + (' + l1 + ' >>> 4)) & 0x0f0f0f0f;\n' +
      pad2 + l1 + ' = ' + nMathImul + '(' + l1 + ', 0x01010101) >>> 24;\n' +
      pad2 + l2 + ' = ' + l2 + ' - ((' + l2 + ' >>> 1) & 0x55555555);\n' +
      pad2 + l2 + ' = (' + l2 + ' & 0x33333333) + ((' + l2 + ' >>> 2) & 0x33333333);\n' +
      pad2 + l2 + ' = (' + l2 + ' + (' + l2 + ' >>> 4)) & 0x0f0f0f0f;\n' +
      pad2 + l2 + ' = ' + nMathImul + '(' + l2 + ', 0x01010101) >>> 24;\n' +
      pad2 + 'return BigInt(' + l1 + ' + ' + l2 + ');\n' +
      pad1 + '}';
  }

  if (used['$w2l_i64_rotl']) {
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_i64_rotl') + '(' + l0 + ', ' + l1 + ') {\n' +
      pad2 + l1 + ' = ' + l1 + ' & 63n;\n' +
      pad2 + 'if (' + l1 + ' === 0n) return ' + l0 + ';\n' +
      pad2 + 'var ' + l2 + ' = BigInt.asUintN(64, ' + l0 + ');\n' +
      pad2 + 'return BigInt.asIntN(64, (' + l2 + ' << ' + l1 + ') | (' + l2 + ' >> (64n - ' + l1 + ')));\n' +
      pad1 + '}';
  }

  if (used['$w2l_i64_rotr']) {
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_i64_rotr') + '(' + l0 + ', ' + l1 + ') {\n' +
      pad2 + l1 + ' = ' + l1 + ' & 63n;\n' +
      pad2 + 'if (' + l1 + ' === 0n) return ' + l0 + ';\n' +
      pad2 + 'var ' + l2 + ' = BigInt.asUintN(64, ' + l0 + ');\n' +
      pad2 + 'return BigInt.asIntN(64, (' + l2 + ' >> ' + l1 + ') | (' + l2 + ' << (64n - ' + l1 + ')));\n' +
      pad1 + '}';
  }

  var /** @const {string} */ nTrap = n('$w2l_trap');

  /**
   * @param {string} helperName
   * @param {string} rangeCheck
   * @param {boolean} needsFround
   */
  var emitTruncI64 = function (helperName, rangeCheck, needsFround) {
    if (!used[helperName]) return;
    self.markBinding_('$w2l_trap');
    if (needsFround) self.markBinding_('Math_fround');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n(helperName) + '(' + l0 + ') {\n' +
      pad2 + 'if (' + l0 + ' !== ' + l0 + ') { ' + nTrap + '(); return 0n; }\n' +
      pad2 + rangeCheck + '\n' +
      pad2 + 'return BigInt(' + l0 + ' < 0 ? Math.ceil(' + l0 + ') : Math.floor(' + l0 + '));\n' +
      pad1 + '}';
  };

  emitTruncI64(
    '$w2l_trunc_s_f32_to_i64',
    'if (' + l0 + ' >= 9223372036854775808.0 || ' + l0 + ' < -9223372036854775808.0) { ' + nTrap + '(); return 0n; }',
    false
  );
  emitTruncI64(
    '$w2l_trunc_u_f32_to_i64',
    'if (' + l0 + ' >= 18446744073709551616.0 || ' + l0 + ' <= -1.0) { ' + nTrap + '(); return 0n; }',
    false
  );
  emitTruncI64(
    '$w2l_trunc_s_f64_to_i64',
    'if (' + l0 + ' >= 9223372036854775808.0 || ' + l0 + ' < -9223372036854775808.0) { ' + nTrap + '(); return 0n; }',
    false
  );
  emitTruncI64(
    '$w2l_trunc_u_f64_to_i64',
    'if (' + l0 + ' >= 18446744073709551616.0 || ' + l0 + ' <= -1.0) { ' + nTrap + '(); return 0n; }',
    false
  );

  /**
   * @param {string} helperName
   * @param {string} lowClampLit  BigInt literal for negative clamp.
   * @param {string} highClampLit  BigInt literal for positive clamp.
   * @param {string} lowRangeLit  Number literal for negative threshold.
   * @param {string} highRangeLit  Number literal for positive threshold.
   */
  var emitTruncSatI64 = function (helperName, lowClampLit, highClampLit, lowRangeLit, highRangeLit) {
    if (!used[helperName]) return;
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n(helperName) + '(' + l0 + ') {\n' +
      pad2 + 'if (' + l0 + ' !== ' + l0 + ') return 0n;\n' +
      pad2 + 'if (' + l0 + ' <= ' + lowRangeLit + ') return ' + lowClampLit + ';\n' +
      pad2 + 'if (' + l0 + ' >= ' + highRangeLit + ') return ' + highClampLit + ';\n' +
      pad2 + 'return BigInt(' + l0 + ' < 0 ? Math.ceil(' + l0 + ') : Math.floor(' + l0 + '));\n' +
      pad1 + '}';
  };

  emitTruncSatI64(
    '$w2l_trunc_sat_s_f32_to_i64',
    '-9223372036854775808n',
    '9223372036854775807n',
    '-9223372036854775808.0',
    '9223372036854775808.0'
  );
  emitTruncSatI64('$w2l_trunc_sat_u_f32_to_i64', '0n', '18446744073709551615n', '0.0', '18446744073709551616.0');
  emitTruncSatI64(
    '$w2l_trunc_sat_s_f64_to_i64',
    '-9223372036854775808n',
    '9223372036854775807n',
    '-9223372036854775808.0',
    '9223372036854775808.0'
  );
  emitTruncSatI64('$w2l_trunc_sat_u_f64_to_i64', '0n', '18446744073709551615n', '0.0', '18446744073709551616.0');

  if (used['$w2l_reinterpret_f64_to_i64']) {
    self.markBinding_('HEAPF64');
    self.markBinding_('HEAP64');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_reinterpret_f64_to_i64') + '(' + l0 + ') {\n' +
      pad2 + n('HEAPF64') + '[' + scratchQ + '] = ' + l0 + ';\n' +
      pad2 + 'var ' + l1 + ' = ' + n('HEAP64') + '[' + scratchQ + '];\n' +
      pad2 + n('HEAP64') + '[' + scratchQ + '] = 0n;\n' +
      pad2 + 'return ' + l1 + ';\n' +
      pad1 + '}';
  }

  if (used['$w2l_reinterpret_i64_to_f64']) {
    self.markBinding_('HEAP64');
    self.markBinding_('HEAPF64');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_reinterpret_i64_to_f64') + '(' + l0 + ') {\n' +
      pad2 + n('HEAP64') + '[' + scratchQ + '] = ' + l0 + ';\n' +
      pad2 + 'var ' + l1 + ' = ' + n('HEAPF64') + '[' + scratchQ + '];\n' +
      pad2 + n('HEAP64') + '[' + scratchQ + '] = 0n;\n' +
      pad2 + 'return ' + l1 + ';\n' +
      pad1 + '}';
  }

  if (used['$w2l_store_i64']) {
    self.markBinding_('HEAP64');
    self.markBinding_('HEAPU8');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_store_i64') + '(' + l0 + ', ' + l1 + ') {\n' +
      pad2 + n('HEAP64') + '[' + scratchQ + '] = ' + l1 + ';\n' +
      pad2 + 'for (var ' + l2 + ' = 0; ' + l2 + ' < 8; ++' + l2 + ') {\n' +
      pad2 + pad1 + n('HEAPU8') + '[(' + l0 + ' + ' + l2 + ')] = ' + n('HEAPU8') + '[' + scratchByte + ' + ' + l2 + '];\n' +
      pad2 + '}\n' +
      pad2 + n('HEAP64') + '[' + scratchQ + '] = 0n;\n' +
      pad1 + '}';
  }

  if (used['$w2l_load_i64']) {
    self.markBinding_('HEAPU8');
    self.markBinding_('HEAP64');
    // prettier-ignore
    lines[lines.length] =
      pad1 + 'function ' + n('$w2l_load_i64') + '(' + l0 + ') {\n' +
      pad2 + 'for (var ' + l2 + ' = 0; ' + l2 + ' < 8; ++' + l2 + ') {\n' +
      pad2 + pad1 + n('HEAPU8') + '[' + scratchByte + ' + ' + l2 + '] = ' + n('HEAPU8') + '[(' + l0 + ' + ' + l2 + ')];\n' +
      pad2 + '}\n' +
      pad2 + 'var ' + l1 + ' = ' + n('HEAP64') + '[' + scratchQ + '];\n' +
      pad2 + n('HEAP64') + '[' + scratchQ + '] = 0n;\n' +
      pad2 + 'return ' + l1 + ';\n' +
      pad1 + '}';
  }

  return lines;
};
