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
  bindings.push('HEAP64');
  bindings.push('Math_trunc');
  return bindings;
};

/**
 * Adds {@code Math_trunc} to the JS-emittable Math binding set so the
 * module-shell emitter declares {@code var Math_trunc = Math.trunc;} when
 * an i64 cast or i64 trunc helper marked it as used.  Asm.js never marks
 * {@code Math_trunc} (it uses the {@code ~~} double-bitwise-not operator
 * instead), so that backend keeps the strict asm.js stdlib subset.
 *
 * @override
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.getMathFunctionBindings_ = function () {
  return Wasm2Lang.Backend.JsCommonCodegen.MATH_FUNCTION_BINDINGS_.concat(['Math_trunc']);
};

/**
 * Inherits the asm.js hot-binding set and adds {@code HEAP64} (the
 * {@code BigInt64Array} view used by every aligned i64 load/store).
 *
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.getHotModuleBindings_ = function (options) {
  var /** @const {!Array<string>} */ bindings = Wasm2Lang.Backend.AsmjsCodegen.prototype.getHotModuleBindings_.call(
      this,
      options
    );
  bindings.push('HEAP64');
  return bindings;
};
