'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.Php64Codegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ H = Wasm2Lang.Backend.Php64Codegen;
  this.binaryRenderers_[C.OP_ARITHMETIC] = H.renderArithmeticBinary_;
  this.binaryRenderers_[C.OP_MULTIPLY] = H.renderMultiplyBinary_;
  this.binaryRenderers_[C.OP_DIVISION] = H.renderDivisionBinary_;
  this.binaryRenderers_[C.OP_BITWISE] = H.renderBitwiseBinary_;
  this.binaryRenderers_[C.OP_ROTATE] = H.renderRotateBinary_;
  this.binaryRenderers_[C.OP_COMPARISON] = H.renderComparisonBinary_;
};

Wasm2Lang.Backend.Php64Codegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.Php64Codegen.prototype.constructor = Wasm2Lang.Backend.Php64Codegen;
Wasm2Lang.Backend.registerBackend('php64', Wasm2Lang.Backend.Php64Codegen);
