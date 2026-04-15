'use strict';

// ---------------------------------------------------------------------------
// Shared base for the JavaScript-family backends (asm.js + modern JavaScript).
//
// JsCommonCodegen is an abstract intermediate between AbstractCodegen and the
// concrete asm.js / modern-JS backends.  It carries the code that is identical
// between the two targets: static i32 binary-op renderers, static coercion
// helpers ({@code |0} / {@code >>>0} / {@code +}), and the i32 renderer setup
// in the constructor.
//
// JsCommonCodegen is NOT registered as a backend — it has no {@code emitCode}
// of its own and cannot be instantiated as a strategy.  Only its concrete
// subclasses register.
//
// @constructor
// @extends {Wasm2Lang.Backend.AbstractCodegen}
// ---------------------------------------------------------------------------

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JsCommonCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  this.binaryRenderers_[C.OP_ARITHMETIC] = J.renderArithmeticBinary_;
  this.binaryRenderers_[C.OP_MULTIPLY] = J.renderMultiplyBinary_;
  this.binaryRenderers_[C.OP_DIVISION] = J.renderDivisionBinary_;
  this.binaryRenderers_[C.OP_BITWISE] = J.renderBitwiseBinary_;
  this.binaryRenderers_[C.OP_ROTATE] = J.renderRotateBinary_;
  this.binaryRenderers_[C.OP_COMPARISON] = J.renderComparisonBinary_;
};

Wasm2Lang.Backend.JsCommonCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.JsCommonCodegen.prototype.constructor = Wasm2Lang.Backend.JsCommonCodegen;

/**
 * Heap page count seeded by the shared module-shell emitter and read by
 * memory-size / memory-grow control-flow renderers.
 *
 * @protected
 * @type {number}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.heapPageCount_ = 0;

/**
 * Concrete backends (asm.js, modern JS) emit their conditional runtime
 * helper bundle through this method.  The base declaration here just
 * informs the type checker — the body is provided by subclasses.
 *
 * @protected
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.emitHelpers_ = function (
  scratchByteOffset,
  scratchWordIndex,
  scratchQwordIndex,
  heapPageCount
) {
  return [];
};
