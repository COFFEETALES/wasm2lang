'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.JsCommonCodegen}
 */
Wasm2Lang.Backend.AsmjsCodegen = function () {
  Wasm2Lang.Backend.JsCommonCodegen.call(this);
  this.reservedWords_ = Wasm2Lang.Backend.AsmjsCodegen.RESERVED_;
};

Wasm2Lang.Backend.AsmjsCodegen.prototype = Object.create(Wasm2Lang.Backend.JsCommonCodegen.prototype);
Wasm2Lang.Backend.AsmjsCodegen.prototype.constructor = Wasm2Lang.Backend.AsmjsCodegen;

Wasm2Lang.Backend.registerBackend('asmjs', Wasm2Lang.Backend.AsmjsCodegen);
