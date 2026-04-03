'use strict';

// ---------------------------------------------------------------------------
// Bootstrap: backend registry, mangler profile registry, buildReservedSet,
// AbstractCodegen constructor, and BinaryRenderer_ typedef.
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
 * Builds a reserved-word lookup table from an array of words.
 *
 * @param {!Array<string>} words
 * @return {!Object<string, boolean>}
 */
Wasm2Lang.Backend.buildReservedSet = function (words) {
  var /** @const {!Object<string, boolean>} */ set = /** @type {!Object<string, boolean>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ wordLen = words.length; i < wordLen; ++i) {
    set[words[i]] = true;
  }
  return set;
};

/**
 * Builds a standard rejectName function for a mangler profile.
 * Rejects names starting with a digit or matching a reserved word.
 *
 * @param {!Object<string, boolean>} reserved
 * @param {boolean} caseInsensitive  If true, lower-cases before lookup.
 * @return {function(string): boolean}
 */
Wasm2Lang.Backend.buildRejectName = function (reserved, caseInsensitive) {
  return /** @param {string} name @return {boolean} */ function (name) {
    var /** @const {number} */ ch = name.charCodeAt(0);
    return (48 <= ch && ch <= 57) || !!reserved[caseInsensitive ? name.toLowerCase() : name];
  };
};

/**
 * @constructor
 */
Wasm2Lang.Backend.AbstractCodegen = function () {
  /** @protected @type {?Object<string, boolean>} */
  this.usedHelpers_ = null;

  /** @protected @type {?Object<string, boolean>} */
  this.usedBindings_ = null;

  /** @protected @type {?Object<string, number>} */
  this.castNames_ = null;

  /** @protected @type {?Wasm2Lang.Backend.IdentifierMangler} */
  this.mangler_ = null;

  /** @protected @type {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */
  this.passRunResultIndex_ = null;

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
