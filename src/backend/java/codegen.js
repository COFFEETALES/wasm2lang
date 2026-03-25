'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JavaCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  this.binaryRenderers_[C.OP_ARITHMETIC] = J.renderArithmeticBinary_;
  this.binaryRenderers_[C.OP_MULTIPLY] = J.renderMultiplyBinary_;
  this.binaryRenderers_[C.OP_DIVISION] = J.renderDivisionBinary_;
  this.binaryRenderers_[C.OP_BITWISE] = J.renderBitwiseBinary_;
  this.binaryRenderers_[C.OP_ROTATE] = J.renderRotateBinary_;
  this.binaryRenderers_[C.OP_COMPARISON] = J.renderComparisonBinary_;
};

Wasm2Lang.Backend.JavaCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.JavaCodegen.prototype.constructor = Wasm2Lang.Backend.JavaCodegen;
Wasm2Lang.Backend.registerBackend('java', Wasm2Lang.Backend.JavaCodegen);
