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
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ M = Wasm2Lang.Backend.JavaScriptCodegen;
  this.i64BinaryRenderers_[C.OP_ARITHMETIC] = M.renderI64ArithmeticBinary_;
  this.i64BinaryRenderers_[C.OP_MULTIPLY] = M.renderI64MultiplyBinary_;
  this.i64BinaryRenderers_[C.OP_DIVISION] = M.renderI64DivisionBinary_;
  this.i64BinaryRenderers_[C.OP_BITWISE] = M.renderI64BitwiseBinary_;
  this.i64BinaryRenderers_[C.OP_ROTATE] = M.renderI64RotateBinary_;
  this.i64BinaryRenderers_[C.OP_COMPARISON] = M.renderI64ComparisonBinary_;
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
