'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JavaCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  this.reservedWords_ = Wasm2Lang.Backend.JavaCodegen.RESERVED_;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  this.binaryRenderers_[C.OP_ARITHMETIC] = J.renderArithmeticBinary_;
  this.binaryRenderers_[C.OP_MULTIPLY] = J.renderMultiplyBinary_;
  this.binaryRenderers_[C.OP_DIVISION] = J.renderDivisionBinary_;
  this.binaryRenderers_[C.OP_BITWISE] = J.renderBitwiseBinary_;
  this.binaryRenderers_[C.OP_ROTATE] = J.renderRotateBinary_;
  this.binaryRenderers_[C.OP_COMPARISON] = J.renderComparisonBinary_;
  this.i64BinaryRenderers_[C.OP_ARITHMETIC] = J.renderArithmeticBinary_;
  this.i64BinaryRenderers_[C.OP_MULTIPLY] = J.renderMultiplyBinary_;
  this.i64BinaryRenderers_[C.OP_DIVISION] = J.renderI64DivisionBinary_;
  this.i64BinaryRenderers_[C.OP_BITWISE] = J.renderBitwiseBinary_;
  this.i64BinaryRenderers_[C.OP_ROTATE] = J.renderI64RotateBinary_;
  this.i64BinaryRenderers_[C.OP_COMPARISON] = J.renderI64ComparisonBinary_;
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
