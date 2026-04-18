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
