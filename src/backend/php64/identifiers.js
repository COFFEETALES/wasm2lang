'use strict';

// ---------------------------------------------------------------------------
// Mangler integration.
// ---------------------------------------------------------------------------

/**
 * Returns a PHP variable name (with {@code $} sigil) for a module-scope
 * identifier.  When unmangled, the key may already start with {@code $}
 * (e.g. {@code "$g_foo"}).  When mangled, the result never starts with
 * {@code $}.  This helper ensures exactly one leading {@code $}.
 *
 * @param {string} key  Module-scope identifier key.
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.phpVar_ = function (key) {
  var /** @const {string} */ name = this.n_(key);
  return '$' === name.charAt(0) ? name : '$' + name;
};

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getFixedModuleBindings_ = function (options) {
  void options;
  return ['buffer', '_w2l_i', '_w2l_f32'];
};

/** @const {number} */
Wasm2Lang.Backend.Php64Codegen.TEMP_P_ = 0;

/** @const {number} */
Wasm2Lang.Backend.Php64Codegen.TEMP_S_ = 1;

/** @const {number} */
Wasm2Lang.Backend.Php64Codegen.TEMP_V_ = 2;

/**
 * @override
 * @return {number}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getInlineTempCount_ = function () {
  return 3;
};

/**
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.getAllHelperNames_ = function () {
  return [
    '_w2l_clz',
    '_w2l_copysign_f32',
    '_w2l_copysign_f64',
    '_w2l_convert_u_i32_to_f32',
    '_w2l_convert_u_i32_to_f64',
    '_w2l_ctz',
    '_w2l_imul',
    '_w2l_nearest_f32',
    '_w2l_nearest_f64',
    '_w2l_popcnt',
    '_w2l_reinterpret_f32_to_i32',
    '_w2l_reinterpret_i32_to_f32',
    '_w2l_trunc_f32',
    '_w2l_trunc_f64',
    '_w2l_trunc_s_f32_to_i32',
    '_w2l_trunc_s_f64_to_i32',
    '_w2l_trunc_sat_s_f32_to_i32',
    '_w2l_trunc_sat_s_f64_to_i32',
    '_w2l_trunc_sat_u_f32_to_i32',
    '_w2l_trunc_sat_u_f64_to_i32',
    '_w2l_trunc_u_f32_to_i32',
    '_w2l_trunc_u_f64_to_i32'
  ];
};

/**
 * Returns a local variable name with PHP {@code $} sigil.  When the mangler
 * is active the mangled name is prefixed with {@code $}; otherwise the
 * default {@code $l{index}} form already starts with {@code $}.
 *
 * @override
 * @param {number} index
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.localN_ = function (index) {
  if (this.mangler_) {
    return '$' + this.mangler_.ln(index);
  }
  return '$l' + index;
};

/**
 * @override
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.safeName_ = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(
    Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name.replace(/[^a-zA-Z0-9_]/g, '_')),
    Wasm2Lang.Backend.Php64Codegen.RESERVED_,
    true
  );
};
