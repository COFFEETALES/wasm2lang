'use strict';

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitHelpers_ = function () {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_ || {};

  // Resolve transitive dependencies: f32 helpers delegate to their f64
  // counterparts, and sat/trunc helpers depend on $w2l_trunc_f64.
  if (used['$w2l_trunc_f32']) used['$w2l_trunc_f64'] = true;
  if (used['$w2l_trunc_u_f32_to_i32']) used['$w2l_trunc_u_f64_to_i32'] = true;
  if (used['$w2l_trunc_sat_s_f32_to_i32']) used['$w2l_trunc_sat_s_f64_to_i32'] = true;
  if (used['$w2l_trunc_sat_u_f32_to_i32']) used['$w2l_trunc_sat_u_f64_to_i32'] = true;
  if (used['$w2l_trunc_u_f64_to_i32']) used['$w2l_trunc_f64'] = true;
  if (used['$w2l_trunc_sat_s_f64_to_i32']) used['$w2l_trunc_f64'] = true;
  if (used['$w2l_trunc_sat_u_f64_to_i32']) used['$w2l_trunc_f64'] = true;
  if (used['$w2l_trunc_u_f32_to_i64']) used['$w2l_trunc_u_f64_to_i64'] = true;
  if (used['$w2l_trunc_sat_s_f32_to_i64']) used['$w2l_trunc_sat_s_f64_to_i64'] = true;
  if (used['$w2l_trunc_sat_u_f32_to_i64']) used['$w2l_trunc_sat_u_f64_to_i64'] = true;
  if (used['$w2l_trunc_u_f64_to_i64']) used['$w2l_trunc_f64'] = true;
  if (used['$w2l_trunc_sat_s_f64_to_i64']) used['$w2l_trunc_f64'] = true;
  if (used['$w2l_trunc_sat_u_f64_to_i64']) used['$w2l_trunc_f64'] = true;

  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ l3 = this.localN_(3);
  var /** @const */ self = this;
  /** @param {string} s @return {string} */
  var n = function (s) {
    return self.n_(s);
  };

  if (used['$w2l_trunc_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_trunc_f64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + l0 + ' < 0.0 ? Math.ceil(' + l0 + ') : Math.floor(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_trunc_f32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)' + this.n_('$w2l_trunc_f64') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_nearest_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_nearest_f64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return Math.rint(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_nearest_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_nearest_f32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)Math.rint((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_u_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_u_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return (int)(' + l0 + ' - 2147483648.0) + -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f32_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_u_f32_to_i32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_u_f64_to_i32') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_trunc_sat_s_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_s_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) return 0;';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return 2147483647;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' <= -2147483649.0) return -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_u_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) return 0;';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 4294967296.0) return -1;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' < 0.0) return 0;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return (int)(' + l0 + ' - 2147483648.0) + -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f32_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_s_f32_to_i32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_sat_s_f64_to_i32') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f32_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_sat_u_f32_to_i32') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_sat_u_f64_to_i32') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_convert_u_i32_to_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_convert_u_i32_to_f32') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)Integer.toUnsignedLong(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  // i64 helpers.
  if (used['$w2l_convert_u_i64_to_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_convert_u_i64_to_f32') + '(long ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 0L) return (float)' + l0 + ';';
    lines[lines.length] = pad2 + 'return (float)((' + l0 + ' >>> 1) | (' + l0 + ' & 1L)) * 2.0f;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_convert_u_i64_to_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_convert_u_i64_to_f64') + '(long ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 0L) return (double)' + l0 + ';';
    lines[lines.length] = pad2 + 'return (double)((' + l0 + ' >>> 1) | (' + l0 + ' & 1L)) * 2.0;';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f64_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_u_f64_to_i64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] =
      pad2 + 'if (' + l0 + ' >= 9.223372036854776E18) return (long)(' + l0 + ' - 9.223372036854776E18) + Long.MIN_VALUE;';
    lines[lines.length] = pad2 + 'return (long)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f32_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_u_f32_to_i64') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_u_f64_to_i64') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f64_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_sat_s_f64_to_i64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) return 0L;';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 9.223372036854776E18) return Long.MAX_VALUE;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' <= -9.223372036854776E18) return Long.MIN_VALUE;';
    lines[lines.length] = pad2 + 'return (long)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f64_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_sat_u_f64_to_i64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) return 0L;';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 1.8446744073709552E19) return -1L;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' < 0.0) return 0L;';
    lines[lines.length] =
      pad2 + 'if (' + l0 + ' >= 9.223372036854776E18) return (long)(' + l0 + ' - 9.223372036854776E18) + Long.MIN_VALUE;';
    lines[lines.length] = pad2 + 'return (long)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_s_f32_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_sat_s_f32_to_i64') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_sat_s_f64_to_i64') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_sat_u_f32_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_sat_u_f32_to_i64') + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + this.n_('$w2l_trunc_sat_u_f64_to_i64') + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_convert_u_i32_to_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_convert_u_i32_to_f64') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (double)Integer.toUnsignedLong(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_memory_fill']) {
    lines[lines.length] =
      pad1 +
      'static void ' +
      this.n_('$w2l_memory_fill') +
      '(java.nio.ByteBuffer ' +
      l0 +
      ', int ' +
      l1 +
      ', int ' +
      l2 +
      ', int ' +
      l3 +
      ') {';
    lines[lines.length] = pad2 + 'byte[] ' + n('$t') + ' = new byte[' + l3 + '];';
    lines[lines.length] = pad2 + 'java.util.Arrays.fill(' + n('$t') + ', (byte)' + l2 + ');';
    lines[lines.length] = pad2 + l0 + '.put(' + l1 + ', ' + n('$t') + ', 0, ' + l3 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_memory_copy']) {
    lines[lines.length] =
      pad1 +
      'static void ' +
      this.n_('$w2l_memory_copy') +
      '(java.nio.ByteBuffer ' +
      l0 +
      ', int ' +
      l1 +
      ', int ' +
      l2 +
      ', int ' +
      l3 +
      ') {';
    lines[lines.length] = pad2 + 'byte[] ' + n('$t') + ' = new byte[' + l3 + '];';
    lines[lines.length] = pad2 + l0 + '.get(' + l2 + ', ' + n('$t') + ', 0, ' + l3 + ');';
    lines[lines.length] = pad2 + l0 + '.put(' + l1 + ', ' + n('$t') + ', 0, ' + l3 + ');';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_memory_grow']) {
    var /** @const {string} */ nBuf = this.n_('buffer');
    lines[lines.length] = pad1 + 'int ' + this.n_('$w2l_memory_grow') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'int ' + l1 + ' = this.' + nBuf + '.capacity() / 65536;';
    lines[lines.length] = pad2 + 'if (' + l0 + ' == 0) return ' + l1 + ';';
    lines[lines.length] =
      pad2 +
      'java.nio.ByteBuffer ' +
      l2 +
      ' = java.nio.ByteBuffer.allocate(this.' +
      nBuf +
      '.capacity() + ' +
      l0 +
      ' * 65536).order(java.nio.ByteOrder.LITTLE_ENDIAN);';
    lines[lines.length] = pad2 + l2 + '.put(0, this.' + nBuf + ', 0, this.' + nBuf + '.capacity());';
    lines[lines.length] = pad2 + 'this.' + nBuf + ' = ' + l2 + ';';
    lines[lines.length] = pad2 + 'return ' + l1 + ';';
    lines[lines.length] = pad1 + '}';
  }

  return lines;
};
