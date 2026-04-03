'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.AsmjsCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.reservedWords_ = Wasm2Lang.Backend.AsmjsCodegen.RESERVED_;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ B = Wasm2Lang.Backend.AsmjsCodegen;
  this.binaryRenderers_[C.OP_ARITHMETIC] = B.renderArithmeticBinary_;
  this.binaryRenderers_[C.OP_MULTIPLY] = B.renderMultiplyBinary_;
  this.binaryRenderers_[C.OP_DIVISION] = B.renderDivisionBinary_;
  this.binaryRenderers_[C.OP_BITWISE] = B.renderBitwiseBinary_;
  this.binaryRenderers_[C.OP_ROTATE] = B.renderRotateBinary_;
  this.binaryRenderers_[C.OP_COMPARISON] = B.renderComparisonBinary_;
};

Wasm2Lang.Backend.AsmjsCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.AsmjsCodegen.prototype.constructor = Wasm2Lang.Backend.AsmjsCodegen;

/** @protected @type {number} */
Wasm2Lang.Backend.AsmjsCodegen.prototype.heapPageCount_ = 0;

Wasm2Lang.Backend.registerBackend('asmjs', Wasm2Lang.Backend.AsmjsCodegen);
