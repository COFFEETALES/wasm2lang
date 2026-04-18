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
