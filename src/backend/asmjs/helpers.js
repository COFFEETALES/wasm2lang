'use strict';

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitHelpers_ = function (scratchByteOffset, scratchWordIndex, scratchQwordIndex) {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_ || {};
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);

  // Pre-resolve mangled names used across multiple helpers.
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ l3 = this.localN_(3);
  var /** @const {string} */ nHEAPU8 = this.n_('HEAPU8');
  var /** @const {string} */ nHEAP32 = this.n_('HEAP32');
  var /** @const {string} */ nHEAPF32 = this.n_('HEAPF32');
  var /** @const {string} */ nHEAPF64 = this.n_('HEAPF64');
  var /** @const {string} */ nMathFround = this.n_('Math_fround');
  var /** @const {string} */ nMathAbs = this.n_('Math_abs');
  var /** @const {string} */ nMathCeil = this.n_('Math_ceil');
  var /** @const {string} */ nMathFloor = this.n_('Math_floor');
  var /** @const {string} */ nMathClz32 = this.n_('Math_clz32');

  if (used['$w2l_ctz']) {
    this.markBinding_('Math_clz32');
    // params: l0=$x; vars: l1=$y
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_ctz') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0;';
    lines[lines.length] = pad2 + 'if ((' + l0 + '|0) == 0) {';
    lines[lines.length] = pad2 + pad(1) + 'return 32|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + l1 + ' = ' + l0 + ' & (-' + l0 + '|0);';
    lines[lines.length] = pad2 + 'return 32 - ' + nMathClz32 + '(' + l1 + ' - 1|0)|0;';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_popcnt']) {
    // params: l0=$x; vars: l1=$n
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_popcnt') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0;';
    lines[lines.length] = pad2 + 'while ((' + l0 + '|0) != 0) {';
    lines[lines.length] = pad2 + pad(1) + l0 + ' = ' + l0 + ' & (' + l0 + ' - 1|0);';
    lines[lines.length] = pad2 + pad(1) + l1 + ' = ' + l1 + ' + 1|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ' + l1 + '|0;';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_copysign_f64']) {
    this.markBinding_('Math_abs');
    // params: l0=$x, l1=$y
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_copysign_f64') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + l1 + ' = +' + l1 + ';';
    lines[lines.length] = pad2 + l0 + ' = +' + nMathAbs + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l1 + ' < 0.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return +(-' + l0 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l1 + ' == 0.0) {';
    lines[lines.length] = pad2 + pad(1) + 'if (1.0 / ' + l1 + ' < 0.0) {';
    lines[lines.length] = pad2 + pad(2) + 'return +(-' + l0 + ');';
    lines[lines.length] = pad2 + pad(1) + '}';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return +' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_copysign_f32']) {
    this.markBinding_('Math_abs');
    this.markBinding_('Math_fround');
    // params: l0=$x, l1=$y
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_copysign_f32') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + nMathAbs + '(+' + l0 + '));';
    lines[lines.length] = pad2 + 'if (' + l1 + ' < ' + nMathFround + '(0.0)) {';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(-' + l0 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l1 + ' == ' + nMathFround + '(0.0)) {';
    lines[lines.length] = pad2 + pad(1) + 'if (1.0 / +' + l1 + ' < 0.0) {';
    lines[lines.length] = pad2 + pad(2) + 'return ' + nMathFround + '(-' + l0 + ');';
    lines[lines.length] = pad2 + pad(1) + '}';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_f64']) {
    this.markBinding_('Math_ceil');
    this.markBinding_('Math_floor');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'return +(' + l0 + ' < 0.0 ? ' + nMathCeil + '(' + l0 + ') : ' + nMathFloor + '(' + l0 + '));';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_f32']) {
    this.markBinding_('Math_ceil');
    this.markBinding_('Math_floor');
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] =
      pad2 +
      'return ' +
      nMathFround +
      '(+' +
      l0 +
      ' < 0.0 ? ' +
      nMathCeil +
      '(+' +
      l0 +
      ') : ' +
      nMathFloor +
      '(+' +
      l0 +
      '));';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_nearest_f64']) {
    this.markBinding_('Math_floor');
    // params: l0=$x; vars: l1=$floor, l2=$diff, l3=$i
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_nearest_f64') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0.0, ' + l2 + ' = 0.0, ' + l3 + ' = 0;';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFloor + '(' + l0 + ');';
    lines[lines.length] = pad2 + l2 + ' = +' + l0 + ' - +' + l1 + ';';
    lines[lines.length] = pad2 + 'if (' + l2 + ' < 0.5) {';
    lines[lines.length] = pad2 + pad(1) + 'return +' + l1 + ';';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l2 + ' > 0.5) {';
    lines[lines.length] = pad2 + pad(1) + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (' + l0 + ' < 0.0) { return +(-0.0); } }';
    lines[lines.length] = pad2 + pad(1) + 'return +(' + l1 + ' + 1.0);';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + l3 + ' = ~~' + l1 + ';';
    lines[lines.length] = pad2 + 'if ((' + l3 + ' & 1) == 0) {';
    lines[lines.length] = pad2 + pad(1) + 'return +' + l1 + ';';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (' + l0 + ' < 0.0) { return +(-0.0); } }';
    lines[lines.length] = pad2 + 'return +(' + l1 + ' + 1.0);';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_nearest_f32']) {
    this.markBinding_('Math_floor');
    this.markBinding_('Math_fround');
    // params: l0=$x; vars: l1=$floor, l2=$diff, l3=$i
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_nearest_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0.0, ' + l2 + ' = 0.0, ' + l3 + ' = 0;';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFloor + '(+' + l0 + ');';
    lines[lines.length] = pad2 + l2 + ' = +' + l0 + ' - +' + l1 + ';';
    lines[lines.length] = pad2 + 'if (' + l2 + ' < 0.5) {';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'if (' + l2 + ' > 0.5) {';
    lines[lines.length] =
      pad2 + pad(1) + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (+' + l0 + ' < 0.0) { return ' + nMathFround + '(-0.0); } }';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(' + l1 + ' + 1.0);';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + l3 + ' = ~~' + l1 + ';';
    lines[lines.length] = pad2 + 'if ((' + l3 + ' & 1) == 0) {';
    lines[lines.length] = pad2 + pad(1) + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] =
      pad2 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (+' + l0 + ' < 0.0) { return ' + nMathFround + '(-0.0); } }';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l1 + ' + 1.0);';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_u_f32_to_i32']) {
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_u_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(+' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~+' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f64_to_i32']) {
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_u_f64_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f32_to_i32']) {
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_s_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 2147483648.0) return 2147483647|0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' <= -2147483649.0) return -2147483648|0;';
    lines[lines.length] = pad2 + 'return ~~+' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f32_to_i32']) {
    this.markBinding_('Math_fround');
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_u_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 4294967296.0) return -1|0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' < 0.0) return 0;';
    lines[lines.length] = pad2 + 'if (+' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(+' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~+' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f64_to_i32']) {
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_s_f64_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return 2147483647|0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' <= -2147483649.0) return -2147483648|0;';
    lines[lines.length] = pad2 + 'return ~~' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f64_to_i32']) {
    // params: l0=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_trunc_sat_u_f64_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = +' + l0 + ';';
    lines[lines.length] = pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 4294967296.0) return -1|0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' < 0.0) return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) {';
    lines[lines.length] = pad2 + pad(1) + 'return (~~(' + l0 + ' - 2147483648.0) + -2147483648)|0;';
    lines[lines.length] = pad2 + '}';
    lines[lines.length] = pad2 + 'return ~~' + l0 + '|0;';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_store_f32']) {
    this.markBinding_('HEAPF32');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    this.markBinding_('Math_fround');
    // params: l0=$p, l1=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_store_f32') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad2 + nHEAPF32 + '[' + scratchWordIndex + '] = ' + nMathFround + '(' + l1 + ');';
    for (var /** number */ f32si = 0; f32si !== 4; ++f32si) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        (0 === f32si ? l0 + ' >> 0' : l0 + ' + ' + String(f32si) + ' >> 0') +
        '] = ' +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f32si) +
        '];';
    }
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_load_f32']) {
    this.markBinding_('HEAPF32');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    this.markBinding_('Math_fround');
    // params: l0=$p; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_load_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = ' + nMathFround + '(0);';
    for (var /** number */ f32li = 0; f32li !== 4; ++f32li) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f32li) +
        '] = ' +
        nHEAPU8 +
        '[' +
        (0 === f32li ? l0 + ' >> 0' : l0 + ' + ' + String(f32li) + ' >> 0') +
        '];';
    }
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + nHEAPF32 + '[' + scratchWordIndex + ']);';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_store_f64']) {
    this.markBinding_('HEAPF64');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    // params: l0=$p, l1=$x
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_store_f64') + '(' + l0 + ', ' + l1 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + l1 + ' = +' + l1 + ';';
    lines[lines.length] = pad2 + nHEAPF64 + '[' + scratchQwordIndex + '] = ' + l1 + ';';
    for (var /** number */ f64si = 0; f64si !== 8; ++f64si) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        (0 === f64si ? l0 + ' >> 0' : l0 + ' + ' + String(f64si) + ' >> 0') +
        '] = ' +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f64si) +
        '];';
    }
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + nHEAP32 + '[' + String(scratchWordIndex + 1) + '] = 0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_load_f64']) {
    this.markBinding_('HEAPF64');
    this.markBinding_('HEAPU8');
    this.markBinding_('HEAP32');
    // params: l0=$p; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_load_f64') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0.0;';
    for (var /** number */ f64li = 0; f64li !== 8; ++f64li) {
      lines[lines.length] =
        pad2 +
        nHEAPU8 +
        '[' +
        String(scratchByteOffset + f64li) +
        '] = ' +
        nHEAPU8 +
        '[' +
        (0 === f64li ? l0 + ' >> 0' : l0 + ' + ' + String(f64li) + ' >> 0') +
        '];';
    }
    lines[lines.length] = pad2 + l1 + ' = +' + nHEAPF64 + '[' + scratchQwordIndex + '];';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + nHEAP32 + '[' + String(scratchWordIndex + 1) + '] = 0;';
    lines[lines.length] = pad2 + 'return +' + l1 + ';';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_reinterpret_f32_to_i32']) {
    this.markBinding_('HEAPF32');
    this.markBinding_('HEAP32');
    this.markBinding_('Math_fround');
    // params: l0=$x; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_reinterpret_f32_to_i32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = 0;';
    lines[lines.length] = pad2 + nHEAPF32 + '[' + scratchWordIndex + '] = ' + nMathFround + '(' + l0 + ');';
    lines[lines.length] = pad2 + l1 + ' = ' + nHEAP32 + '[' + scratchWordIndex + ']|0;';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + 'return ' + l1 + '|0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_reinterpret_i32_to_f32']) {
    this.markBinding_('HEAP32');
    this.markBinding_('HEAPF32');
    this.markBinding_('Math_fround');
    // params: l0=$x; vars: l1=$r
    lines[lines.length] = pad1 + 'function ' + this.n_('$w2l_reinterpret_i32_to_f32') + '(' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + l0 + '|0;';
    lines[lines.length] = pad2 + 'var ' + l1 + ' = ' + nMathFround + '(0);';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = ' + l0 + ';';
    lines[lines.length] = pad2 + l1 + ' = ' + nMathFround + '(' + nHEAPF32 + '[' + scratchWordIndex + ']);';
    lines[lines.length] = pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;';
    lines[lines.length] = pad2 + 'return ' + nMathFround + '(' + l1 + ');';
    lines[lines.length] = pad1 + '}';
  }

  return lines;
};
