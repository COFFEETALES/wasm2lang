'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.Php64Codegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  this.reservedWords_ = Wasm2Lang.Backend.Php64Codegen.RESERVED_;
  this.caseInsensitiveReserved_ = true;
  this.preSanitizeRegex_ = /[^a-zA-Z0-9_]/g;
  var /** @const */ H = Wasm2Lang.Backend.Php64Codegen;
  Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_(
    this.binaryRenderers_,
    H.renderArithmeticBinary_,
    H.renderMultiplyBinary_,
    H.renderDivisionBinary_,
    H.renderBitwiseBinary_,
    H.renderRotateBinary_,
    H.renderComparisonBinary_
  );
};

Wasm2Lang.Backend.Php64Codegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.Php64Codegen.prototype.constructor = Wasm2Lang.Backend.Php64Codegen;
Wasm2Lang.Backend.registerBackend('php64', Wasm2Lang.Backend.Php64Codegen);
