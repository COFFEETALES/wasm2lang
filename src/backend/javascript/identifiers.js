'use strict';

// ---------------------------------------------------------------------------
// Mangler integration for JavaScript.
//
// Extends the asm.js fixed-binding set with the {@code HEAP64}
// {@code BigInt64Array} view.  The module closure itself has no inner
// function name (the outer {@code var} binding already names it), so no
// {@code javascriptModule} registration is required.  The helper roster is
// extended with the BigInt-based i64 helpers emitted by {@code helpers.js}.
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
  var /** @const {number} */ asmjsIdx = bindings.indexOf('asmjsModule');
  if (-1 !== asmjsIdx) bindings.splice(asmjsIdx, 1);
  bindings[bindings.length] = 'HEAP64';
  return bindings;
};
