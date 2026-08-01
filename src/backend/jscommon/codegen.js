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
    pad +
    trapName +
    '(' +
    Wasm2Lang.Backend.JsCommonCodegen.trapCallArguments_(kind, siteId) +
    ');\n' +
    this.renderTrapAbortStatement_(indent, kind, siteId)
  );
};

/**
 * Formats the hook arguments.  A negative {@code siteId} is
 * {@code --trap-sites=kind}: the kind travels alone, which is the whole cost
 * of that mode at the call site — one extra immediate, no table, no ids.
 *
 * Bare integer literals, never {@code kind|0}: an asm.js numeric literal is a
 * {@code fixnum}, hence {@code signed}, hence already a valid {@code extern}
 * FFI argument, so the coercions would be dead bytes.
 *
 * @private
 * @param {number} kind
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.trapCallArguments_ = function (kind, siteId) {
  if (0 > siteId) return String(kind);
  return String(kind) + ', ' + String(siteId);
};

/**
 * Renders the unconditional abort emitted after the host hook.
 *
 * asm.js has no {@code throw} — it is a strict subset, and the only constructs
 * that can stop a trap site from falling through are ones that never return.
 * Of those, {@code $w2l_abort()} (unbounded self-recursion, see
 * {@code asmjs/helpers.js}) is the only one that also leaves evidence: stack
 * exhaustion surfaces as a throwable error naming the helper, in a few
 * milliseconds.  A bare {@code while (1) {}} stops just as reliably and tells
 * nobody anything — it hangs the tab, which is not a better outcome than the
 * corruption it replaced.  The modern-JS backend overrides this with a real
 * {@code throw}, so it never marks the helper and never emits it.
 *
 * Marking here is safe in the way {@code renderUnreachableStatement_} is not:
 * this is a HELPER, gated by {@code usedHelpers_}, so a mark that the block
 * trimmer later renders moot costs one unused definition — whereas the
 * {@code $w2l_trap} BINDING is a foreign import that must not be declared
 * unless a live call survives, which is why that one is resolved by scanning
 * the emitted text instead.
 *
 * Under {@code --trap-sites=…,host-abort} nothing is emitted here at all, and
 * the helper is therefore never marked, never registered and never defined.
 * That is a deliberate downgrade, not a cheaper equivalent: the trap site goes
 * back to falling through, so a host that returns from the hook resumes the
 * caller on the {@code return 0} that follows every trap site — a fabricated
 * value indistinguishable from a real one, which is the exact failure the
 * abort exists to prevent.  The mode buys back the one thing the abort cannot
 * give: an artifact with no call-graph cycle, for a consumer whose delivery
 * pipeline rejects self-recursion outright and for whom the default is
 * therefore not shippable in either payload mode.  It shifts the whole
 * obligation onto the host, which must never return from {@code $w2l_trap} —
 * throw an {@code Error}, or latch a flag that the driver loop checks before
 * re-entering the module.
 *
 * @protected
 * @param {number} indent
 * @param {number} kind
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.renderTrapAbortStatement_ = function (indent, kind, siteId) {
  if (this.trapHostAbort_) return '';
  this.markHelper_('$w2l_abort');
  return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + this.n_('$w2l_abort') + '();\n';
};

/**
 * Adds the hook-call form to the liveness patterns.
 *
 * asm.js has no {@code throw} and therefore no message to grep for — its abort
 * is a helper call, and under {@code host-abort} there is no abort at all — so
 * the call itself is the only textual evidence that a site survived.  The
 * binding name is unambiguous in both modes: unmangled it is {@code $w2l_trap},
 * and mangled it is a token the encoder assigned to that key alone, so a call
 * to it cannot be anything else.  The leading class guards against matching a
 * longer identifier that merely ends with the token.
 *
 * @override
 * @protected
 * @return {!Array<!RegExp>}
 */
Wasm2Lang.Backend.JsCommonCodegen.prototype.trapSiteLivenessPatterns_ = function () {
  var /** @const {string} */ escaped = this.n_('$w2l_trap').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(Wasm2Lang.Backend.AbstractCodegen.TRAP_MESSAGE_SITE_PATTERN_, 'g'),
    new RegExp('(?:^|[^A-Za-z0-9_$])' + escaped + '\\(\\s*\\d+\\s*,\\s*(\\d+)\\s*\\)', 'g')
  ];
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
  if (!this.trapSitesEnabled_) {
    return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + this.n_('$w2l_trap') + '();\n';
  }
  // The abort matters more here than at an `unreachable`: every trapping
  // truncation helper follows its trap call with `return 0`, so a host that
  // does not throw hands the caller a fabricated zero for a value that has no
  // representable result.  Allocating the id before delegating keeps textual
  // order equal to allocation order, which the site table depends on.
  return this.renderTrapStatement_(indent, kind, this.allocateHelperTrapSite_(kind, helperName));
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
