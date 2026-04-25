'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JavaCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  this.reservedWords_ = Wasm2Lang.Backend.JavaCodegen.RESERVED_;
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  var /** @const */ install = Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_;
  install(
    this.binaryRenderers_,
    J.renderArithmeticBinary_,
    J.renderMultiplyBinary_,
    J.renderDivisionBinary_,
    J.renderBitwiseBinary_,
    J.renderRotateBinary_,
    J.renderComparisonBinary_
  );
  install(
    this.i64BinaryRenderers_,
    J.renderArithmeticBinary_,
    J.renderMultiplyBinary_,
    J.renderI64DivisionBinary_,
    J.renderBitwiseBinary_,
    J.renderI64RotateBinary_,
    J.renderI64ComparisonBinary_
  );
};

Wasm2Lang.Backend.JavaCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.JavaCodegen.prototype.constructor = Wasm2Lang.Backend.JavaCodegen;
Wasm2Lang.Backend.registerBackend('java', Wasm2Lang.Backend.JavaCodegen);

/**
 * Java handles i64 natively via {@code long} — no lowering needed.
 *
 * @override
 * @return {boolean}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.needsI64Lowering = function () {
  return false;
};
