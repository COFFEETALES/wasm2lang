'use strict';

// ---------------------------------------------------------------------------
// IdentifierMangler class (constructor first, so statics attach correctly).
// ---------------------------------------------------------------------------

/**
 * Keyed deterministic identifier mangler.
 *
 * Precomputes two namespaces: module-scope names and a reusable local pool.
 * After {@code precompute()} resolves, lookups via {@code mn()} and
 * {@code ln()} are synchronous.
 *
 * @constructor
 * @param {string} key  User-supplied mangling key.
 * @param {string} languageId  Backend language identifier (e.g. 'asmjs').
 */
Wasm2Lang.Backend.IdentifierMangler = function (key, languageId) {
  /** @private @const {!Wasm2Lang.Backend.ManglerProfile} */
  this.profile_ = Wasm2Lang.Backend.getManglerProfile(languageId) || {
    reservedWords: /** @type {!Object<string, boolean>} */ (Object.create(null)),
    rejectName: /** @param {string} name @return {boolean} */ function (name) {
      var /** @const {number} */ ch = name.charCodeAt(0);
      return 48 <= ch && ch <= 57;
    },
    singleCharset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
    blockCharset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz0123456789',
    caseInsensitive: false
  };

  /** @private @const {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_} */
  this.spec_ = Wasm2Lang.Backend.IdentifierMangler.buildEncoderSpec_(
    key,
    this.profile_.singleCharset,
    this.profile_.blockCharset
  );

  /**
   * Ordered list of module-scope original identifiers, in registration order.
   * @private @const {!Array<string>}
   */
  this.moduleKeys_ = [];

  /**
   * Original → mangled for module scope.  Populated by precompute().
   * @private @const {!Object<string, string>}
   */
  this.moduleNames_ = /** @type {!Object<string, string>} */ (Object.create(null));

  /**
   * Local pool: index → mangled name.  Populated by precompute().
   * @private @type {!Array<string>}
   */
  this.localPool_ = [];
};

// ---------------------------------------------------------------------------
// Aquitaine encoder (embedded from user-provided keyed name generator).
//
// Maps sequential integers to short identifier strings using a keyed
// Feistel-network permutation over Web Crypto SHA-256.  The public API
// is promise-based because subtle.digest is asynchronous.
// ---------------------------------------------------------------------------

/** @private @const {number} */
Wasm2Lang.Backend.IdentifierMangler.ENCODER_ROUNDS_ = 5;

/** @private @const {number} */
Wasm2Lang.Backend.IdentifierMangler.ENCODER_MAX_CHARS_ = 4;

/**
 * @private
 * @typedef {{
 *   chars: string,
 *   len: number,
 *   leftModulus: number,
 *   ofs: number,
 *   rightModulus: number,
 *   tierSize: number
 * }}
 */
Wasm2Lang.Backend.IdentifierMangler.EncoderTier_;

/**
 * @private
 * @typedef {{
 *   encKey: string,
 *   rounds: number,
 *   tiers: !Array<!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_>
 * }}
 */
Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_;

/**
 * Builds the encoder specification from charsets and parameters.
 *
 * @private
 * @param {string} key
 * @param {string} singleCharset  Characters allowed for single-char identifiers.
 * @param {string} blockCharset   Characters allowed at non-first positions (typically includes digits).
 * @return {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_}
 */
Wasm2Lang.Backend.IdentifierMangler.buildEncoderSpec_ = function (key, singleCharset, blockCharset) {
  var /** @const {!Array<!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_>} */ tiers = [];
  var /** @type {number} */ offset = 0;
  for (var /** @type {number} */ length = 1; length <= Wasm2Lang.Backend.IdentifierMangler.ENCODER_MAX_CHARS_; ++length) {
    var /** @const {string} */ charset = 1 === length ? singleCharset : blockCharset;
    var /** @const {number} */ range = charset.length;
    var /** @const {number} */ stateLength = Math.max(2, length);
    var /** @const {number} */ rightDigits = Math.floor(stateLength / 2);
    var /** @const {number} */ tierSize = Math.pow(range, length);
    tiers[tiers.length] = {
      chars: charset,
      len: length,
      leftModulus: Math.pow(range, stateLength - rightDigits),
      ofs: offset,
      rightModulus: Math.pow(range, rightDigits),
      tierSize: tierSize
    };
    offset += tierSize;
  }
  return {encKey: key, rounds: Wasm2Lang.Backend.IdentifierMangler.ENCODER_ROUNDS_, tiers: tiers};
};

/**
 * @private
 * @param {string} text
 * @return {!Uint8Array}
 */
Wasm2Lang.Backend.IdentifierMangler.encodeUtf8_ = function (text) {
  return new TextEncoder().encode(text);
};

/**
 * @private
 * @param {number} r
 * @param {string} key
 * @param {number} range
 * @param {number} round
 * @return {!Promise<number>}
 */
Wasm2Lang.Backend.IdentifierMangler.invokeRound_ = function (r, key, range, round) {
  var /** @const {string} */ dataString = key + '\0' + round + '\0' + r;
  var /** @const {!Uint8Array} */ inputData = Wasm2Lang.Backend.IdentifierMangler.encodeUtf8_(dataString);
  // prettier-ignore
  var /** @const {!webCrypto.SubtleCrypto} */ subtle =
      /** @type {!webCrypto.SubtleCrypto} */ (/** @type {!webCrypto.Crypto} */ (globalThis.crypto).subtle);
  return subtle.digest('SHA-256', inputData).then(
    /** @param {!ArrayBuffer} hashBuffer @return {number} */ function (hashBuffer) {
      return new DataView(hashBuffer).getUint32(0, true) % range;
    }
  );
};

/**
 * @private
 * @param {number} value
 * @param {string} charset
 * @param {number} length
 * @return {string}
 */
Wasm2Lang.Backend.IdentifierMangler.numberToText_ = function (value, charset, length) {
  var /** @const {number} */ range = charset.length;
  var /** @const {!Array<string>} */ chars = new Array(length);
  for (var /** @type {number} */ idx = length - 1; idx >= 0; --idx) {
    chars[idx] = charset.charAt(value % range);
    value = Math.floor(value / range);
  }
  return chars.join('');
};

/**
 * Runs the keyed Feistel permutation (forward direction).
 *
 * @private
 * @param {number} value
 * @param {!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_} tier
 * @param {string} key
 * @param {number} rounds
 * @return {!Promise<number>}
 */
Wasm2Lang.Backend.IdentifierMangler.feistelPermute_ = function (value, tier, key, rounds) {
  /**
   * @param {number} left
   * @param {number} right
   * @param {number} leftMod
   * @param {number} rightMod
   * @param {number} round
   * @return {!Promise<!Array<number>>}
   */
  function runRounds(left, right, leftMod, rightMod, round) {
    if (round === rounds) {
      return Promise.resolve([left, right, rightMod]);
    }
    return Wasm2Lang.Backend.IdentifierMangler.invokeRound_(right, key, leftMod, round).then(function (f) {
      return runRounds(right, (left + f) % leftMod, rightMod, leftMod, round + 1);
    });
  }

  /** @param {number} v @return {!Promise<number>} */
  function walk(v) {
    var /** @const {!Array<number>} */ state = [Math.floor(v / tier.rightModulus), v % tier.rightModulus];
    return runRounds(state[0], state[1], tier.leftModulus, tier.rightModulus, 0).then(function (fin) {
      var /** @const {number} */ nextValue = fin[0] * fin[2] + fin[1];
      return nextValue >= tier.tierSize ? walk(nextValue) : nextValue;
    });
  }

  return walk(value);
};

/**
 * @private
 * @param {number} numberValue
 * @param {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_} spec
 * @return {!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_}
 */
Wasm2Lang.Backend.IdentifierMangler.getTierByNumber_ = function (numberValue, spec) {
  for (var /** @type {number} */ i = 0, /** @const {number} */ tierLen = spec.tiers.length; i < tierLen; ++i) {
    var /** @const {!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_} */ tier = spec.tiers[i];
    if (numberValue < tier.ofs + tier.tierSize) {
      return tier;
    }
  }
  throw new Error('Number out of tier range.');
};

/**
 * Encodes a sequential integer to a short identifier string.
 *
 * @private
 * @param {number} numberValue
 * @param {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_} spec
 * @return {!Promise<string>}
 */
Wasm2Lang.Backend.IdentifierMangler.encode_ = function (numberValue, spec) {
  var /** @const {!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_} */ tier =
      Wasm2Lang.Backend.IdentifierMangler.getTierByNumber_(numberValue, spec);
  return Wasm2Lang.Backend.IdentifierMangler.feistelPermute_(numberValue - tier.ofs, tier, spec.encKey, spec.rounds).then(
    function (encoded) {
      return Wasm2Lang.Backend.IdentifierMangler.numberToText_(encoded, tier.chars, tier.len);
    }
  );
};

// ---------------------------------------------------------------------------
// Instance methods.
// ---------------------------------------------------------------------------

/**
 * Registers module-scope identifiers for mangling.  Must be called before
 * {@code precompute()}.  Duplicates are silently ignored.
 *
 * @param {!Array<string>} keys
 */
Wasm2Lang.Backend.IdentifierMangler.prototype.registerModuleBindings = function (keys) {
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = keys.length; i !== len; ++i) {
    var /** @const {string} */ k = keys[i];
    if (!(k in this.moduleNames_)) {
      this.moduleKeys_[this.moduleKeys_.length] = k;
      this.moduleNames_[k] = k; // placeholder until precompute
    }
  }
};

/**
 * Precomputes all mangled names.  Local pool names occupy encoder indices
 * 0..M-1 and module-scope names occupy M..M+N-1, guaranteeing uniqueness by
 * construction (the Aquitaine encoder is a bijection within each tier).
 *
 * Locals are allocated first so they claim the shortest (single-character)
 * identifiers, since locals appear far more frequently in emitted code than
 * module-level declarations.
 *
 * @param {number} localPoolSize  Number of local pool entries needed.
 * @return {!Promise<void>}
 */
Wasm2Lang.Backend.IdentifierMangler.prototype.precompute = function (localPoolSize) {
  var /** @const {number} */ moduleCount = this.moduleKeys_.length;
  var /** @const {number} */ totalCount = localPoolSize + moduleCount;
  var /** @const */ self = this;

  return Wasm2Lang.Backend.IdentifierMangler.resolveNames_(totalCount, this.spec_, this.profile_).then(function (names) {
    self.localPool_ = names.slice(0, localPoolSize);
    for (var /** @type {number} */ i = 0; i < moduleCount; ++i) {
      self.moduleNames_[self.moduleKeys_[i]] = names[localPoolSize + i];
    }
  });
};

/**
 * Returns the mangled module-scope name for the given original identifier.
 * Falls back to the original if the key was not registered.
 *
 * @param {string} originalName
 * @return {string}
 */
Wasm2Lang.Backend.IdentifierMangler.prototype.mn = function (originalName) {
  var /** @const {string|void} */ mangled = this.moduleNames_[originalName];
  return 'string' === typeof mangled ? mangled : originalName;
};

/**
 * Returns the mangled local-scope name for the given pool index.
 *
 * @param {number} index
 * @return {string}
 */
Wasm2Lang.Backend.IdentifierMangler.prototype.ln = function (index) {
  return index < this.localPool_.length ? this.localPool_[index] : '_l' + index;
};

/**
 * Resolves {@code count} unique mangled names using the Aquitaine encoder.
 *
 * Names rejected by the profile's {@code rejectName} callback are skipped.
 * Since the encoder is a bijection, unique counter values always produce
 * unique outputs, so the only reason to skip is legality — not collision.
 *
 * @private
 * @param {number} count
 * @param {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_} spec
 * @param {!Wasm2Lang.Backend.ManglerProfile} profile
 * @return {!Promise<!Array<string>>}
 */
Wasm2Lang.Backend.IdentifierMangler.resolveNames_ = function (count, spec, profile) {
  var /** @const {boolean} */ ciCheck = profile.caseInsensitive;
  var /** @const {!Object<string, boolean>} */ seenLower = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ names = [];
  var /** @type {number} */ counter = 0;

  /**
   * @param {number} idx
   * @return {!Promise<!Array<string>>}
   */
  function resolveOne(idx) {
    if (idx >= count) {
      return Promise.resolve(names);
    }
    return tryNext(idx);
  }

  /**
   * @param {number} idx
   * @return {!Promise<!Array<string>>}
   */
  function tryNext(idx) {
    var /** @const {number} */ c = counter++;
    return Wasm2Lang.Backend.IdentifierMangler.encode_(c, spec).then(function (name) {
      if (profile.rejectName(name)) {
        return tryNext(idx);
      }
      // For case-insensitive languages (PHP), reject names that collide
      // when lowercased — e.g. 'I' and 'i' are the same PHP function.
      if (ciCheck) {
        var /** @const {string} */ lower = name.toLowerCase();
        if (seenLower[lower]) {
          return tryNext(idx);
        }
        seenLower[lower] = true;
      }
      names[idx] = name;
      return resolveOne(idx + 1);
    });
  }

  return resolveOne(0);
};
