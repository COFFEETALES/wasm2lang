'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.CsharpCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  this.reservedWords_ = Wasm2Lang.Backend.CsharpCodegen.RESERVED_;
  this.preSanitizeRegex_ = /\$/g;
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const */ install = Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_;
  install(
    this.binaryRenderers_,
    Cs.renderArithmeticBinary_,
    Cs.renderMultiplyBinary_,
    Cs.renderDivisionBinary_,
    Cs.renderBitwiseBinary_,
    Cs.renderRotateBinary_,
    Cs.renderComparisonBinary_
  );
  install(
    this.i64BinaryRenderers_,
    Cs.renderArithmeticBinary_,
    Cs.renderMultiplyBinary_,
    Cs.renderI64DivisionBinary_,
    Cs.renderI64BitwiseBinary_,
    Cs.renderI64RotateBinary_,
    Cs.renderI64ComparisonBinary_
  );
};

Wasm2Lang.Backend.CsharpCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.CsharpCodegen.prototype.constructor = Wasm2Lang.Backend.CsharpCodegen;
Wasm2Lang.Backend.registerBackend('csharp', Wasm2Lang.Backend.CsharpCodegen);

/**
 * C# handles i64 natively via {@code long} — no lowering needed.
 *
 * @override
 * @return {boolean}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.needsI64Lowering = function () {
  return false;
};
