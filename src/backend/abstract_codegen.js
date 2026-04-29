'use strict';

// ---------------------------------------------------------------------------
// Bootstrap: backend registry, mangler profile registry, AbstractCodegen
// constructor, and BinaryRenderer_ typedef.
//
// Split files under abstract_codegen/ attach additional statics and prototype
// methods after this file loads.
// ---------------------------------------------------------------------------

/**
 * Maps language identifiers to backend constructors.
 * Each concrete backend registers itself via {@code registerBackend}.
 *
 * @private
 * @const {!Object<string, function(new: Wasm2Lang.Backend.AbstractCodegen)>}
 */
Wasm2Lang.Backend.registry_ = Object.create(null);

/**
 * Registers a backend constructor for a given language identifier.
 *
 * @param {string} languageId  The {@code languageOut} option value (e.g. 'asmjs').
 * @param {function(new: Wasm2Lang.Backend.AbstractCodegen)} ctor
 * @return {void}
 */
Wasm2Lang.Backend.registerBackend = function (languageId, ctor) {
  Wasm2Lang.Backend.registry_[languageId] = ctor;
};

/**
 * Creates the backend for the given language identifier.  Falls back to
 * {@code AbstractCodegen} when the identifier has no registered backend.
 *
 * @param {string} languageId
 * @return {!Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.createBackend = function (languageId) {
  var /** @const {(function(new: Wasm2Lang.Backend.AbstractCodegen)|void)} */ ctor = Wasm2Lang.Backend.registry_[languageId];
  if (ctor) {
    return new ctor();
  }
  return new Wasm2Lang.Backend.AbstractCodegen();
};

// ---------------------------------------------------------------------------
// Mangler profile registry.
//
// Defined here (abstract_codegen.js) rather than in identifier_mangler.js so
// that concrete backends, which load before the mangler, can register their
// profiles at declaration time.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   reservedWords: !Object<string, boolean>,
 *   rejectName: function(string): boolean,
 *   singleCharset: string,
 *   blockCharset: string,
 *   caseInsensitive: boolean
 * }}
 */
Wasm2Lang.Backend.ManglerProfile;

/**
 * Profile registry populated by backends via {@code registerManglerProfile}.
 *
 * @private
 * @const {!Object<string, !Wasm2Lang.Backend.ManglerProfile>}
 */
Wasm2Lang.Backend.manglerProfileRegistry_ = Object.create(null);

/**
 * Registers a mangler profile for a backend language.  Called by each
 * concrete backend alongside {@code Backend.registerBackend}.
 *
 * @param {string} languageId
 * @param {!Wasm2Lang.Backend.ManglerProfile} profile
 * @return {void}
 */
Wasm2Lang.Backend.registerManglerProfile = function (languageId, profile) {
  Wasm2Lang.Backend.manglerProfileRegistry_[languageId] = profile;
};

/**
 * Returns the mangler profile registered for the given language, or
 * {@code undefined} if none has been registered.
 *
 * @param {string} languageId
 * @return {!Wasm2Lang.Backend.ManglerProfile|void}
 */
Wasm2Lang.Backend.getManglerProfile = function (languageId) {
  return Wasm2Lang.Backend.manglerProfileRegistry_[languageId];
};

/**
 * Defines and registers a mangler profile for a backend language in one call.
 * Builds the reserved-word set, a rejectName predicate (rejecting digit-led
 * names plus reserved words, case-folding when requested), and the default
 * charsets (case-insensitive profiles use lowercase-only charsets without
 * {@code $}).  Returns the reserved-word set so concrete backends can assign
 * it to their {@code reservedWords_} field.
 *
 * @param {string} languageId
 * @param {!Array<string>} words
 * @param {boolean} caseInsensitive
 * @return {!Object<string, boolean>}
 */
Wasm2Lang.Backend.defineLanguageManglerProfile = function (languageId, words, caseInsensitive) {
  var /** @const {!Object<string, boolean>} */ reserved = /** @type {!Object<string, boolean>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ wordLen = words.length; i < wordLen; ++i) {
    reserved[words[i]] = true;
  }
  var /** @const {string} */ alpha = caseInsensitive
      ? 'abcdefghijklmnopqrstuvwxyz_'
      : '$ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  Wasm2Lang.Backend.registerManglerProfile(languageId, {
    reservedWords: reserved,
    rejectName: /** @param {string} name @return {boolean} */ function (name) {
      var /** @const {number} */ ch = name.charCodeAt(0);
      return (48 <= ch && ch <= 57) || !!reserved[caseInsensitive ? name.toLowerCase() : name];
    },
    singleCharset: alpha,
    blockCharset: alpha + '0123456789',
    caseInsensitive: caseInsensitive
  });
  return reserved;
};

/**
 * @constructor
 */
Wasm2Lang.Backend.AbstractCodegen = function () {
  /** @protected @type {?Object<string, boolean>} */
  this.usedHelpers_ = null;

  /** @protected @type {?Object<string, boolean>} */
  this.usedBindings_ = null;

  /** @protected @type {?Array<string>} */
  this.helperNameCollector_ = null;

  /** @protected @type {?Object<string, string>} */
  this.castNames_ = null;

  /** @protected @type {?Wasm2Lang.Backend.IdentifierMangler} */
  this.mangler_ = null;

  /**
   * Snapshot of the final {@code usedHelpers_} populated by the most recent
   * {@code emitCode} invocation, captured before {@code emitCode} resets the
   * working field to null.  {@code runUsageDiscovery_} reads it to seed the
   * helper-registration filter; subsequent emit invocations overwrite it.
   * @protected @type {?Object<string, boolean>}
   */
  this.lastEmitUsedHelpers_ = null;

  /** @protected @type {?Object<string, boolean>} */
  this.lastEmitUsedBindings_ = null;

  /**
   * Filter sets populated by {@code runUsageDiscovery_} from the snapshot
   * fields above.  When non-null, {@code precomputeMangledNames_} skips
   * registering helpers and cold-tier bindings whose keys are absent — the
   * encoder slot freed by each skipped key is reclaimed by an identifier
   * that the emit will actually reference.
   * @protected @type {?Object<string, boolean>}
   */
  this.discoveredHelpers_ = null;

  /** @protected @type {?Object<string, boolean>} */
  this.discoveredBindings_ = null;

  /** @protected @type {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */
  this.passRunResultIndex_ = null;

  /**
   * Active local-init overrides for the current function.  When non-null,
   * the first local.set for each index present in the map is suppressed
   * (its value is already folded into the var declaration).
   * Reset per function in walkAndAppendBody_.
   * @protected @type {?{map: !Object<string, number>, consumed: !Object<string, boolean>}}
   */
  this.localInitOverridesActive_ = null;

  /**
   * When true, control-flow simplifications (flat switch, loop
   * simplification, block-loop fusion) are applied during code emission.
   * Set via {@code enableSimplifications_} when --pre-normalized is active.
   * @protected @type {boolean}
   */
  this.useSimplifications_ = false;

  /**
   * IR-detected block-loop fusions, keyed by {@code funcName + '\0' + blockName}.
   * Populated during emitEnter_ when structural detection finds a fusion
   * pattern that metadata lookup missed (e.g. after binary round-trip).
   * Checked by getBlockFusionPlan_ as a fallback.
   * @protected @type {?Object<string, string>}
   */
  this.irFusedBlocks_ = null;

  /**
   * When true, coerceToType_ skips f64 coercion for CAT_F32 expressions
   * (the language auto-widens float to double).  Set by Java and PHP.
   * @protected @type {boolean}
   */
  this.f32WidensToF64_ = false;

  /**
   * Reserved-word lookup table for the target language.  Set by concrete
   * backend constructors; when non-null, safeName_ applies reserved-word
   * resolution via resolveReservedIdentifier_.
   * @protected @type {?Object<string, boolean>}
   */
  this.reservedWords_ = null;

  /** @protected @type {boolean} */
  this.caseInsensitiveReserved_ = false;

  /**
   * Optional pre-sanitize regex applied by safeName_ before safeIdentifier_.
   * PHP sets this to strip {@code $} characters that are not valid in PHP
   * identifiers (PHP uses {@code $} as a variable sigil).
   * @protected @type {?RegExp}
   */
  this.preSanitizeRegex_ = null;

  /**
   * Per-category binary-op renderers, populated by each backend constructor.
   * Indexed by {@code Wasm2Lang.Backend.I32Coercion.OP_*} constants.
   * @protected @type {!Array<!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined>}
   */
  this.binaryRenderers_ = [];

  /**
   * Per-category i64 binary-op renderers, populated by backends that handle
   * i64 natively (e.g. Java).
   * Indexed by {@code Wasm2Lang.Backend.I32Coercion.OP_*} constants.
   * @protected @type {!Array<!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined>}
   */
  this.i64BinaryRenderers_ = [];

  /**
   * Per-function node counts collected during walkAndAppendBody_.
   * Eliminates the need for the abstract emitCode's separate traversal.
   * @protected @type {?Object<string, number>}
   */
  this.diagnosticNodeCounts_ = null;

  /**
   * Expression IDs seen across all function bodies during codegen traversal.
   * @protected @type {?Object<number, boolean>}
   */
  this.diagnosticSeenIds_ = null;
};

/**
 * A binary-op rendering function.  Receives the backend instance as the
 * first argument because the functions are stored as static references
 * (not bound to a prototype), avoiding Closure Compiler's @override
 * output-ordering issue with Object.create prototype chains.
 *
 * @typedef {function(!Wasm2Lang.Backend.AbstractCodegen,
 *     !Wasm2Lang.Backend.I32Coercion.BinaryOpInfo, string, string): string}
 */
Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_;

/**
 * Installs binary-op renderers into a backend's renderer table at the slot
 * indices defined by {@code Wasm2Lang.Backend.I32Coercion.OP_*}.  Positional
 * arguments map 1:1 to OP_ARITHMETIC, OP_MULTIPLY, OP_DIVISION, OP_BITWISE,
 * OP_ROTATE, OP_COMPARISON.  A {@code null} slot leaves the existing entry
 * (used by JavaScript backend to override only some of the parent's slots).
 *
 * @protected
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_|undefined>} table
 * @param {?Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} arith
 * @param {?Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} mult
 * @param {?Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} div
 * @param {?Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} bitw
 * @param {?Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} rot
 * @param {?Wasm2Lang.Backend.AbstractCodegen.BinaryRenderer_} comp
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_ = function (table, arith, mult, div, bitw, rot, comp) {
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  if (arith) table[C.OP_ARITHMETIC] = arith;
  if (mult) table[C.OP_MULTIPLY] = mult;
  if (div) table[C.OP_DIVISION] = div;
  if (bitw) table[C.OP_BITWISE] = bitw;
  if (rot) table[C.OP_ROTATE] = rot;
  if (comp) table[C.OP_COMPARISON] = comp;
};

/**
 * Returns whether this backend requires i64-to-i32 lowering.
 * Backends that handle i64 natively (e.g. Java) override this to return
 * {@code false}, causing the normalization pipeline to skip the
 * {@code flatten → remove-non-js-ops → flatten → i64-to-i32-lowering}
 * binaryen pass sequence.
 *
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.needsI64Lowering = function () {
  return true;
};
