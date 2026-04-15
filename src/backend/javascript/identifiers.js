'use strict';

// ---------------------------------------------------------------------------
// Mangler integration for JavaScript.
//
// Extends the asm.js fixed-binding set with the {@code HEAP64}
// {@code BigInt64Array} view and the {@code javascriptModule} function name;
// extends the helper roster with the BigInt-based i64 helpers emitted by
// {@code helpers.js}.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.getFixedModuleBindings_ = function (options) {
  var /** @const {!Array<string>} */ bindings = Wasm2Lang.Backend.AsmjsCodegen.prototype.getFixedModuleBindings_.call(
      this,
      options
    );
  bindings[bindings.length] = 'HEAP64';
  bindings[bindings.length] = 'javascriptModule';
  return bindings;
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.getAllHelperNames_ = function () {
  var /** @const {!Array<string>} */ names = Wasm2Lang.Backend.AsmjsCodegen.prototype.getAllHelperNames_.call(this);
  names[names.length] = '$w2l_i64_clz';
  names[names.length] = '$w2l_i64_ctz';
  names[names.length] = '$w2l_i64_popcnt';
  names[names.length] = '$w2l_i64_rotl';
  names[names.length] = '$w2l_i64_rotr';
  names[names.length] = '$w2l_reinterpret_f64_to_i64';
  names[names.length] = '$w2l_reinterpret_i64_to_f64';
  names[names.length] = '$w2l_store_i64';
  names[names.length] = '$w2l_load_i64';
  names[names.length] = '$w2l_trunc_s_f32_to_i64';
  names[names.length] = '$w2l_trunc_u_f32_to_i64';
  names[names.length] = '$w2l_trunc_s_f64_to_i64';
  names[names.length] = '$w2l_trunc_u_f64_to_i64';
  names[names.length] = '$w2l_trunc_sat_s_f32_to_i64';
  names[names.length] = '$w2l_trunc_sat_u_f32_to_i64';
  names[names.length] = '$w2l_trunc_sat_s_f64_to_i64';
  names[names.length] = '$w2l_trunc_sat_u_f64_to_i64';
  return names;
};
