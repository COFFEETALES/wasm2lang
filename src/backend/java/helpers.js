'use strict';

/**
 * Inter-helper dependencies (opcode-specific helpers only).
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.JavaCodegen.HELPER_DEPS_ = {
  '$w2l_trunc_f32': ['$w2l_trunc_f64'],
  '$w2l_trunc_s_f32_to_i32': ['$w2l_trunc_s_f64_to_i32'],
  '$w2l_trunc_s_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_u_f32_to_i32': ['$w2l_trunc_u_f64_to_i32'],
  '$w2l_trunc_u_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_s_f32_to_i32': ['$w2l_trunc_sat_s_f64_to_i32'],
  '$w2l_trunc_sat_s_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_u_f32_to_i32': ['$w2l_trunc_sat_u_f64_to_i32'],
  '$w2l_trunc_sat_u_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_s_f32_to_i64': ['$w2l_trunc_s_f64_to_i64'],
  '$w2l_trunc_s_f64_to_i64': ['$w2l_trunc_f64'],
  '$w2l_trunc_u_f32_to_i64': ['$w2l_trunc_u_f64_to_i64'],
  '$w2l_trunc_u_f64_to_i64': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_s_f32_to_i64': ['$w2l_trunc_sat_s_f64_to_i64'],
  '$w2l_trunc_sat_s_f64_to_i64': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_u_f32_to_i64': ['$w2l_trunc_sat_u_f64_to_i64'],
  '$w2l_trunc_sat_u_f64_to_i64': ['$w2l_trunc_f64']
};

/** @override @protected @return {?Object<string, !Array<string>>} */
Wasm2Lang.Backend.JavaCodegen.prototype.getHelperDeps_ = function () {
  return Wasm2Lang.Backend.JavaCodegen.HELPER_DEPS_;
};

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitHelpers_ = function () {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_ || {};

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

  if (used['$w2l_trunc_s_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_s_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) throw new ArithmeticException();';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] =
      pad2 + 'if (' + l0 + ' >= 2147483648.0 || ' + l0 + ' < -2147483648.0) throw new ArithmeticException();';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f64_to_i32']) {
    lines[lines.length] = pad1 + 'static int ' + this.n_('$w2l_trunc_u_f64_to_i32') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) throw new ArithmeticException();';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 4294967296.0 || ' + l0 + ' < 0.0) throw new ArithmeticException();';
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 2147483648.0) return (int)(' + l0 + ' - 2147483648.0) + -2147483648;';
    lines[lines.length] = pad2 + 'return (int)' + l0 + ';';
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

  if (used['$w2l_convert_u_i32_to_f32']) {
    lines[lines.length] = pad1 + 'static float ' + this.n_('$w2l_convert_u_i32_to_f32') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (float)Integer.toUnsignedLong(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }
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
  if (used['$w2l_trunc_s_f64_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_s_f64_to_i64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) throw new ArithmeticException();';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    // prettier-ignore
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 9.223372036854776E18 || ' + l0 + ' < -9.223372036854776E18) throw new ArithmeticException();';
    lines[lines.length] = pad2 + 'return (long)' + l0 + ';';
    lines[lines.length] = pad1 + '}';
  }
  if (used['$w2l_trunc_u_f64_to_i64']) {
    lines[lines.length] = pad1 + 'static long ' + this.n_('$w2l_trunc_u_f64_to_i64') + '(double ' + l0 + ') {';
    lines[lines.length] = pad2 + 'if (Double.isNaN(' + l0 + ')) throw new ArithmeticException();';
    lines[lines.length] = pad2 + l0 + ' = ' + this.n_('$w2l_trunc_f64') + '(' + l0 + ');';
    lines[lines.length] =
      pad2 + 'if (' + l0 + ' >= 1.8446744073709552E19 || ' + l0 + ' < 0.0) throw new ArithmeticException();';
    // prettier-ignore
    lines[lines.length] = pad2 + 'if (' + l0 + ' >= 9.223372036854776E18) return (long)(' + l0 + ' - 9.223372036854776E18) + Long.MIN_VALUE;';
    lines[lines.length] = pad2 + 'return (long)' + l0 + ';';
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

  if (used['$w2l_v128_load']) {
    lines[lines.length] =
      pad1 + 'static IntVector ' + n('$w2l_v128_load') + '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ') {';
    lines[lines.length] =
      pad2 +
      'return IntVector.fromArray(IntVector.SPECIES_128, new int[]{' +
      l0 +
      '.getInt(' +
      l1 +
      '), ' +
      l0 +
      '.getInt(' +
      l1 +
      ' + 4), ' +
      l0 +
      '.getInt(' +
      l1 +
      ' + 8), ' +
      l0 +
      '.getInt(' +
      l1 +
      ' + 12)}, 0);';
    lines[lines.length] = pad1 + '}';
  }

  if (used['$w2l_v128_store']) {
    lines[lines.length] =
      pad1 + 'static void ' + n('$w2l_v128_store') + '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ', IntVector ' + l2 + ') {';
    lines[lines.length] = pad2 + l0 + '.putInt(' + l1 + ', ' + l2 + '.lane(0));';
    lines[lines.length] = pad2 + l0 + '.putInt(' + l1 + ' + 4, ' + l2 + '.lane(1));';
    lines[lines.length] = pad2 + l0 + '.putInt(' + l1 + ' + 8, ' + l2 + '.lane(2));';
    lines[lines.length] = pad2 + l0 + '.putInt(' + l1 + ' + 12, ' + l2 + '.lane(3));';
    lines[lines.length] = pad1 + '}';
  }

  // f32→f64 delegation stubs: all follow the same cast-and-delegate pattern.
  var /** @const {!Array<string>} */ F32_DELEGATES = [
      '$w2l_trunc_f32',
      '$w2l_trunc_s_f32_to_i32',
      '$w2l_trunc_u_f32_to_i32',
      '$w2l_trunc_sat_s_f32_to_i32',
      '$w2l_trunc_sat_u_f32_to_i32',
      '$w2l_trunc_s_f32_to_i64',
      '$w2l_trunc_u_f32_to_i64',
      '$w2l_trunc_sat_s_f32_to_i64',
      '$w2l_trunc_sat_u_f32_to_i64'
    ];
  for (var /** @type {number} */ di = 0; di < F32_DELEGATES.length; ++di) {
    var /** @type {string} */ dName = F32_DELEGATES[di];
    if (!used[dName]) continue;
    var /** @type {string} */ dTarget = dName.replace('_f32', '_f64');
    var /** @type {string} */ dRet;
    var /** @type {string} */ dCast;
    if (dName.indexOf('_to_i64') !== -1) {
      dRet = 'long';
      dCast = '';
    } else if (dName.indexOf('_to_i32') !== -1) {
      dRet = 'int';
      dCast = '';
    } else {
      dRet = 'float';
      dCast = '(float)';
    }
    lines[lines.length] = pad1 + 'static ' + dRet + ' ' + n(dName) + '(float ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return ' + dCast + n(dTarget) + '((double)' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  return lines;
};
