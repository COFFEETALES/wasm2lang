'use strict';

/**
 * Inter-helper dependencies (opcode-specific helpers only).
 * Core helpers (_w2l_i, _w2l_f32) are always emitted and omitted here.
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_ = {
  '_w2l_clz': [],
  '_w2l_ctz': [],
  '_w2l_popcnt': [],
  '_w2l_imul': [],
  '_w2l_copysign_f64': [],
  '_w2l_copysign_f32': ['_w2l_copysign_f64'],
  '_w2l_trunc_f64': [],
  '_w2l_trunc_f32': ['_w2l_trunc_f64'],
  '_w2l_nearest_f64': [],
  '_w2l_nearest_f32': ['_w2l_nearest_f64'],
  '_w2l_trunc_s_f32_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_u_f32_to_i32': ['_w2l_trunc_u_f64_to_i32'],
  '_w2l_trunc_s_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_u_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_sat_s_f32_to_i32': ['_w2l_trunc_sat_s_f64_to_i32'],
  '_w2l_trunc_sat_u_f32_to_i32': ['_w2l_trunc_sat_u_f64_to_i32'],
  '_w2l_trunc_sat_s_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_sat_u_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_convert_u_i32_to_f32': [],
  '_w2l_convert_u_i32_to_f64': [],
  '_w2l_reinterpret_f32_to_i32': [],
  '_w2l_reinterpret_i32_to_f32': [],
  '_w2l_memory_fill': [],
  '_w2l_memory_copy': [],
  '_w2l_memory_grow': []
};

/**
 * Records a helper as used and transitively marks its dependencies.
 *
 * @override
 * @protected
 * @param {string} name
 */
Wasm2Lang.Backend.Php64Codegen.prototype.markHelper_ = function (name) {
  if (!this.usedHelpers_ || this.usedHelpers_[name]) {
    return;
  }
  this.usedHelpers_[name] = true;
  var /** @const {!Array<string>|void} */ deps = Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_[name];
  if (deps) {
    for (var /** number */ i = 0, /** @const {number} */ len = deps.length; i !== len; ++i) {
      this.markHelper_(deps[i]);
    }
  }
};
