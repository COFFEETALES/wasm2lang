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
 * Emits a trap call for wasm {@code unreachable}.  The module-shell emitter
 * in {@code jscommon/emit_code.js} declares the {@code $w2l_trap} binding
 * only after scanning the emitted function bodies for the mangled call —
 * marking here would register the dependency even when the surrounding
 * block trimmer (reachableBlockChildCount_) drops the call as dead code,
 * which happens for the unreachable placeholders binaryen inserts after
 * unconditional control flow during binary serialization.
 *
 * @override
 * @protected
 * @param {number} indent
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderUnreachableStatement_ = function (indent) {
  return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + this.n_('$w2l_trap') + '();\n';
};

/**
 * Returns the {@code --define} key consulted by {@code resolveHeapSize_} for
 * this backend.  The module-shell emitter in {@code jscommon/emit_code.js}
 * and the per-backend metadata emitter must agree on the key, otherwise the
 * internal scratch offsets disagree with the actual {@code ArrayBuffer}
 * length (silent OOB reads that return {@code undefined}).  The default is
 * the modern-JS key {@code JS_HEAP_SIZE}; {@code AsmjsCodegen} overrides to
 * {@code ASMJS_HEAP_SIZE}.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.getHeapSizeDefinitionKey_ = function () {
  return 'JS_HEAP_SIZE';
};
