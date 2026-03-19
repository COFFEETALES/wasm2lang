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

  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {string} */ l0 = this.localN_(0);

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
  if (used['$w2l_convert_u_i32_to_f64']) {
    lines[lines.length] = pad1 + 'static double ' + this.n_('$w2l_convert_u_i32_to_f64') + '(int ' + l0 + ') {';
    lines[lines.length] = pad2 + 'return (double)Integer.toUnsignedLong(' + l0 + ');';
    lines[lines.length] = pad1 + '}';
  }

  return lines;
};
