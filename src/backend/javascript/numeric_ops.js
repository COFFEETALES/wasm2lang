'use strict';

// ---------------------------------------------------------------------------
// Numeric unary op renderers for JavaScript.
//
// Asm.js cannot express i64 conversions at all, so the asm.js renderer
// delegates them back to the base class which turns every i64 cast into a
// call to `$w2l_<opname>` — helpers that only exist for Java.  JavaScript has
// BigInt, so the simple casts (extend / wrap / convert to f64 / convert to
// f32) inline as direct BigInt ↔ Number expressions.  The trunc / trunc_sat
// / reinterpret ops still need a small runtime helper because they either
// trap on out-of-range floats or punt the bit-pattern through a scratch
// DataView slot; those helpers are emitted by {@code emitHelpers_}.
// ---------------------------------------------------------------------------

/**
 * Unary-op names that dispatch directly to a {@code $w2l_<name>} runtime
 * helper — trunc/trunc_sat ops that trap on out-of-range floats plus the
 * reinterpret_f64↔i64 pair that punts bit patterns through a DataView.  Kept
 * as a keyed table so the emitter can test membership with a single lookup
 * instead of an || chain.
 *
 * @const {!Object<string, boolean>}
 * @private
 */
Wasm2Lang.Backend.JavaScriptCodegen.JS_HELPER_UNARY_OPS_ = /** @return {!Object<string, boolean>} */ (function () {
  var /** @const {!Object<string, boolean>} */ table = {};
  table['trunc_s_f32_to_i64'] = true;
  table['trunc_u_f32_to_i64'] = true;
  table['trunc_s_f64_to_i64'] = true;
  table['trunc_u_f64_to_i64'] = true;
  table['trunc_sat_s_f32_to_i64'] = true;
  table['trunc_sat_u_f32_to_i64'] = true;
  table['trunc_sat_s_f64_to_i64'] = true;
  table['trunc_sat_u_f64_to_i64'] = true;
  table['reinterpret_i64_to_f64'] = true;
  table['reinterpret_f64_to_i64'] = true;
  return table;
})();

/**
 * @override
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Backend.NumericOps.UnaryOpInfo} info
 * @param {string} valueExpr
 * @param {number=} opt_valueCat
 * @return {string}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.renderNumericUnaryOp_ = function (binaryen, info, valueExpr, opt_valueCat) {
  var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  var /** @const {string} */ name = info.opName;

  if ('extend_s_i32_to_i64' === name) {
    return 'BigInt(' + P.stripOuter(valueExpr) + ')';
  }
  if ('extend_u_i32_to_i64' === name) {
    return 'BigInt(' + P.wrap_(valueExpr, P.PREC_SHIFT_, false) + ' >>> 0)';
  }
  if ('wrap_i64_to_i32' === name) {
    return 'Number(BigInt.asIntN(32, ' + P.stripOuter(valueExpr) + '))';
  }

  // convert_<s|u>_i64_to_<f32|f64>: the four variants share the
  // {@code Number(<maybe asUintN>(operand))} core; only the optional
  // {@code BigInt.asUintN(64, …)} wrap (unsigned) and the outer
  // {@code Math.fround} (f32) differ.
  if (
    'convert_s_i64_to_f64' === name ||
    'convert_u_i64_to_f64' === name ||
    'convert_s_i64_to_f32' === name ||
    'convert_u_i64_to_f32' === name
  ) {
    var /** @type {string} */ inner = P.stripOuter(valueExpr);
    if ('convert_u' === name.substr(0, 9)) {
      inner = 'BigInt.asUintN(64, ' + inner + ')';
    }
    var /** @const {string} */ numberExpr = 'Number(' + inner + ')';
    return '_f32' === name.substr(name.length - 4) ? this.renderMathFroundCall_(numberExpr) : numberExpr;
  }

  if (Wasm2Lang.Backend.JavaScriptCodegen.JS_HELPER_UNARY_OPS_[name]) {
    return this.renderHelperCall_(binaryen, '$w2l_' + name, [valueExpr], info.retType);
  }

  return Wasm2Lang.Backend.AsmjsCodegen.prototype.renderNumericUnaryOp_.call(this, binaryen, info, valueExpr, opt_valueCat);
};
