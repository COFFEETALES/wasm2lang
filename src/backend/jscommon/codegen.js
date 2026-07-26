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
  var /** @const */ J = Wasm2Lang.Backend.JsCommonCodegen;
  Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_(
    this.binaryRenderers_,
    J.renderArithmeticBinary_,
    J.renderMultiplyBinary_,
    J.renderDivisionBinary_,
    J.renderBitwiseBinary_,
    J.renderRotateBinary_,
    J.renderComparisonBinary_
  );
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
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderUnreachableStatement_ = function (indent, siteId) {
  return this.renderTrapStatement_(indent, Wasm2Lang.Backend.TrapKind.UNREACHABLE, siteId);
};

/**
 * Renders one trap site as a statement.
 *
 * Without {@code --trap-sites} this is byte-for-byte the historical
 * {@code $w2l_trap();} — the whole opt-in guarantee rests on this branch.
 *
 * With it, the host hook receives {@code (kind, siteId)} and the emitted code
 * then aborts on its own.  The abort is not redundant: the hook is an ordinary
 * foreign function, and if a host forgets to throw, the pre-existing shape
 * ({@code $w2l_trap(); return 0;}) resumes the caller with a fabricated zero —
 * silent corruption, which is exactly the failure this feature exists to kill.
 *
 * The arguments are bare integer literals rather than {@code kind|0, siteId|0}:
 * an asm.js numeric literal is a {@code fixnum}, hence {@code signed}, hence a
 * valid {@code extern} FFI argument.  Verified against SpiderMonkey's
 * {@code isAsmJSModule} — the coercions would be dead bytes on a path the
 * project's style rules say to keep bare.
 *
 * @protected
 * @param {number} indent
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderTrapStatement_ = function (indent, kind, siteId) {
  var /** @const {string} */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_(indent);
  var /** @const {string} */ trapName = this.n_('$w2l_trap');
  if (!this.trapSitesEnabled_) {
    return pad + trapName + '();\n';
  }
  return (
    pad + trapName + '(' + String(kind) + ', ' + String(siteId) + ');\n' + this.renderTrapAbortStatement_(indent, kind, siteId)
  );
};

/**
 * Renders the unconditional abort emitted after the host hook.
 *
 * asm.js has no {@code throw} — it is a strict subset in which the only way to
 * guarantee the trap site does not fall through is to stop making progress.
 * {@code while (1) {}} is valid asm.js (verified against SpiderMonkey's
 * validator) and turns "silently wrong result" into "deterministic halt",
 * which is diagnosable.  The modern-JS backend overrides this with a real
 * {@code throw}.
 *
 * @protected
 * @param {number} indent
 * @param {number} kind
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderTrapAbortStatement_ = function (indent, kind, siteId) {
  void kind;
  void siteId;
  return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + 'while (1) {}\n';
};

/**
 * Renders a trap call from inside a shared runtime helper body.
 *
 * Helper bodies are static templates with no wasm expression behind them, so
 * the site is allocated against the helper name instead of a function.  Called
 * while the body string is being built, so textual order is allocation order.
 *
 * @protected
 * @param {number} indent
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {string} helperName
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderHelperTrapCall_ = function (indent, kind, helperName) {
  var /** @const {string} */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_(indent);
  var /** @const {string} */ trapName = this.n_('$w2l_trap');
  if (!this.trapSitesEnabled_) {
    return pad + trapName + '();\n';
  }
  var /** @const {number} */ siteId = this.allocateHelperTrapSite_(kind, helperName);
  // The abort matters more here than at an `unreachable`: every trapping
  // truncation helper follows its trap call with `return 0`, so a host that
  // does not throw hands the caller a fabricated zero for a value that has no
  // representable result.
  return (
    pad + trapName + '(' + String(kind) + ', ' + String(siteId) + ');\n' + this.renderTrapAbortStatement_(indent, kind, siteId)
  );
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
