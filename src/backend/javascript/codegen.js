'use strict';

/**
 * JavaScript backend.  Subclasses {@code AsmjsCodegen} to inherit the
 * i32 binary-op table, coercion helpers, and module shell skeleton, but
 * overrides boundary coercion, memory access (DataView), and i64 handling
 * (BigInt) so the emitted code runs outside the asm.js type system.
 *
 * @constructor
 * @extends {Wasm2Lang.Backend.AsmjsCodegen}
 */
Wasm2Lang.Backend.JavaScriptCodegen = function () {
  Wasm2Lang.Backend.AsmjsCodegen.call(this);
  this.reservedWords_ = Wasm2Lang.Backend.JavaScriptCodegen.RESERVED_;
  var /** @const */ M = Wasm2Lang.Backend.JavaScriptCodegen;
  var /** @const */ install = Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_;
  install(
    this.binaryRenderers_,
    null,
    null,
    M.renderI32DivisionBinary_,
    null,
    M.renderI32RotateBinary_,
    M.renderI32ComparisonBinary_
  );
  install(
    this.i64BinaryRenderers_,
    M.renderI64ArithmeticBinary_,
    M.renderI64MultiplyBinary_,
    M.renderI64DivisionBinary_,
    M.renderI64BitwiseBinary_,
    M.renderI64RotateBinary_,
    M.renderI64ComparisonBinary_
  );
};

Wasm2Lang.Backend.JavaScriptCodegen.prototype = Object.create(Wasm2Lang.Backend.AsmjsCodegen.prototype);
Wasm2Lang.Backend.JavaScriptCodegen.prototype.constructor = Wasm2Lang.Backend.JavaScriptCodegen;

/**
 * JavaScript handles i64 natively via BigInt — no lowering needed.
 *
 * @override
 * @return {boolean}
 */
Wasm2Lang.Backend.JavaScriptCodegen.prototype.needsI64Lowering = function () {
  return false;
};

Wasm2Lang.Backend.registerBackend('javascript', Wasm2Lang.Backend.JavaScriptCodegen);
