'use strict';

// ---------------------------------------------------------------------------
// Java binary-op renderers.  The i32 and i64 variants differ only by the
// name of the wrapper class that hosts the unsigned / rotate helpers
// (`Integer` vs `Long`), plus the extra `(int)` cast that `Long.rotate*`
// requires on the rotation amount.  Three factory methods express those
// axes so the six exported renderers collapse into one-line bindings.
// ---------------------------------------------------------------------------

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderArithmeticBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainArithmeticBinary_;

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderMultiplyBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainMultiplyBinary_;

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderBitwiseBinary_ = Wasm2Lang.Backend.AbstractCodegen.renderPlainBitwiseBinary_;

/**
 * Builds a division/remainder renderer that routes unsigned ops through the
 * `<intClass>.divideUnsigned` / `<intClass>.remainderUnsigned` static
 * helpers and emits a plain infix `/` / `%` for the signed case.
 *
 * @private
 * @param {string} intClass  Wrapper class — {@code 'Integer'} for i32 or
 *                           {@code 'Long'} for i64.
 * @return {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.JavaCodegen.makeDivisionRenderer_ = function (intClass) {
  var /** @type {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */ renderer = function (self, info, L, R) {
      void self;
      if (info.unsigned) {
        var /** @const {string} */ method = '/' === info.opStr ? 'divideUnsigned' : 'remainderUnsigned';
        return intClass + '.' + method + '(' + L + ', ' + R + ')';
      }
      var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      return P.renderInfix(L, info.opStr, R, P.PREC_MULTIPLICATIVE_);
    };
  return renderer;
};

/**
 * Builds a rotate renderer routed through `<intClass>.rotateLeft` /
 * `<intClass>.rotateRight`.  Long rotations require the shift amount as an
 * int, so {@code castAmountToInt} wraps the right-hand operand accordingly.
 *
 * @private
 * @param {string} intClass
 * @param {boolean} castAmountToInt  True when {@code intClass === 'Long'}.
 * @return {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.JavaCodegen.makeRotateRenderer_ = function (intClass, castAmountToInt) {
  var /** @type {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */ renderer = function (self, info, L, R) {
      void self;
      var /** @const {string} */ amountExpr = castAmountToInt ? '(int)(' + R + ')' : R;
      var /** @const {string} */ method = info.rotateLeft ? 'rotateLeft' : 'rotateRight';
      return intClass + '.' + method + '(' + L + ', ' + amountExpr + ')';
    };
  return renderer;
};

/**
 * Builds a comparison renderer.  Unsigned comparisons materialize through
 * `<intClass>.compareUnsigned(L, R) <op> 0`; signed comparisons map straight
 * to the infix operator carried on {@code info.opStr}.
 *
 * @private
 * @param {string} intClass
 * @return {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_}
 */
Wasm2Lang.Backend.JavaCodegen.makeComparisonRenderer_ = function (intClass) {
  var /** @type {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */ renderer = function (self, info, L, R) {
      void self;
      var /** @const */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
      if (info.unsigned) {
        return P.renderInfix(intClass + '.compareUnsigned(' + L + ', ' + R + ')', info.opStr, '0', P.PREC_RELATIONAL_);
      }
      return P.renderInfix(L, info.opStr, R, P.PREC_RELATIONAL_);
    };
  return renderer;
};

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderDivisionBinary_ = Wasm2Lang.Backend.JavaCodegen.makeDivisionRenderer_('Integer');

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderRotateBinary_ = Wasm2Lang.Backend.JavaCodegen.makeRotateRenderer_('Integer', false);

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderComparisonBinary_ = Wasm2Lang.Backend.JavaCodegen.makeComparisonRenderer_('Integer');

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderI64DivisionBinary_ = Wasm2Lang.Backend.JavaCodegen.makeDivisionRenderer_('Long');

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderI64RotateBinary_ = Wasm2Lang.Backend.JavaCodegen.makeRotateRenderer_('Long', true);

/** @const {!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} */
Wasm2Lang.Backend.JavaCodegen.renderI64ComparisonBinary_ = Wasm2Lang.Backend.JavaCodegen.makeComparisonRenderer_('Long');
