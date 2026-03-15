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
  /** @private @const {!Wasm2Lang.Backend.IdentifierMangler.Profile} */
  this.profile_ = Wasm2Lang.Backend.IdentifierMangler.PROFILES[languageId] || {
    reservedWords: Wasm2Lang.Backend.IdentifierMangler.JS_RESERVED_,
    disallowDollarStart: false,
    caseInsensitive: false
  };

  /** @private @const {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_} */
  this.spec_ = Wasm2Lang.Backend.IdentifierMangler.buildEncoderSpec_(key, this.profile_.caseInsensitive);

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

/** @private @const {string} */
Wasm2Lang.Backend.IdentifierMangler.SINGLE_CHARSET_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/** @private @const {string} */
Wasm2Lang.Backend.IdentifierMangler.BLOCK_CHARSET_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz0123456789';

/** @private @const {string} */
Wasm2Lang.Backend.IdentifierMangler.CI_SINGLE_CHARSET_ = 'abcdefghijklmnopqrstuvwxyz_';

/** @private @const {string} */
Wasm2Lang.Backend.IdentifierMangler.CI_BLOCK_CHARSET_ = 'abcdefghijklmnopqrstuvwxyz_0123456789';

/** @private @const {number} */
Wasm2Lang.Backend.IdentifierMangler.ENCODER_ROUNDS_ = 5;

/** @private @const {number} */
Wasm2Lang.Backend.IdentifierMangler.ENCODER_MAX_CHARS_ = 4;

/**
 * @private
 * @param {string} charset
 * @return {!Object<string, number>}
 */
Wasm2Lang.Backend.IdentifierMangler.buildCharsetIndex_ = function (charset) {
  var /** @type {!Object<string, number>} */ indexByChar = Object.create(null);
  for (var /** number */ i = 0; i < charset.length; ++i) {
    indexByChar[charset.charAt(i)] = i;
  }
  return indexByChar;
};

/**
 * @private
 * @param {number} base
 * @param {number} exponent
 * @return {number}
 */
Wasm2Lang.Backend.IdentifierMangler.intPow_ = function (base, exponent) {
  var /** @type {number} */ result = 1;
  for (var /** number */ i = 0; i < exponent; ++i) {
    result *= base;
  }
  return result;
};

/**
 * @private
 * @typedef {{
 *   chars: string,
 *   domainSize: number,
 *   indexByChar: !Object<string, number>,
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
 *   maxNumber: number,
 *   rounds: number,
 *   tiers: !Array<!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_>
 * }}
 */
Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_;

/**
 * @private
 * @param {number} length
 * @param {string} singleCharset
 * @param {string} blockCharset
 * @param {number} offset
 * @return {!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_}
 */
Wasm2Lang.Backend.IdentifierMangler.newEncoderTier_ = function (length, singleCharset, blockCharset, offset) {
  var /** @const {string} */ charset = 1 === length ? singleCharset : blockCharset;
  var /** @const {number} */ range = charset.length;
  var /** @const {number} */ stateLength = Math.max(2, length);
  var /** @const {number} */ rightDigits = Math.floor(stateLength / 2);
  var /** @const {number} */ leftDigits = stateLength - rightDigits;

  return {
    chars: charset,
    domainSize: Wasm2Lang.Backend.IdentifierMangler.intPow_(range, stateLength),
    indexByChar: Wasm2Lang.Backend.IdentifierMangler.buildCharsetIndex_(charset),
    len: length,
    leftModulus: Wasm2Lang.Backend.IdentifierMangler.intPow_(range, leftDigits),
    ofs: offset,
    rightModulus: Wasm2Lang.Backend.IdentifierMangler.intPow_(range, rightDigits),
    tierSize: Wasm2Lang.Backend.IdentifierMangler.intPow_(range, length)
  };
};

/**
 * Builds the encoder specification from charsets and parameters.
 *
 * @private
 * @param {string} key
 * @param {boolean} caseInsensitive  When true, uses a single-case charset
 *     so the bijection domain matches the usable identifier space.
 * @return {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_}
 */
Wasm2Lang.Backend.IdentifierMangler.buildEncoderSpec_ = function (key, caseInsensitive) {
  var /** @const {string} */ sc = caseInsensitive
      ? Wasm2Lang.Backend.IdentifierMangler.CI_SINGLE_CHARSET_
      : Wasm2Lang.Backend.IdentifierMangler.SINGLE_CHARSET_;
  var /** @const {string} */ bc = caseInsensitive
      ? Wasm2Lang.Backend.IdentifierMangler.CI_BLOCK_CHARSET_
      : Wasm2Lang.Backend.IdentifierMangler.BLOCK_CHARSET_;
  var /** @const {number} */ maxChars = Wasm2Lang.Backend.IdentifierMangler.ENCODER_MAX_CHARS_;
  var /** @const {!Array<!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_>} */ tiers = [];
  var /** @type {number} */ offset = 0;

  for (var /** number */ length = 1; length <= maxChars; ++length) {
    var /** @const {!Wasm2Lang.Backend.IdentifierMangler.EncoderTier_} */ tier =
        Wasm2Lang.Backend.IdentifierMangler.newEncoderTier_(length, sc, bc, offset);
    tiers[tiers.length] = tier;
    offset += tier.tierSize;
  }

  return {encKey: key, maxNumber: offset - 1, rounds: Wasm2Lang.Backend.IdentifierMangler.ENCODER_ROUNDS_, tiers: tiers};
};

/**
 * @private
 * @param {string} text
 * @return {!Uint8Array}
 */
Wasm2Lang.Backend.IdentifierMangler.encodeUtf8_ = function (text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  // Node.js Buffer fallback.
  // prettier-ignore
  return /** @type {!Uint8Array} */ (Buffer.from(text, 'utf8'));
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
  // Access subtle.digest via bracket notation to suppress Closure property checks.
  /** @type {!Object} */
  var cryptoObj;
  if (typeof globalThis !== 'undefined') {
    var /** @const {*} */ gCrypto = /** @type {*} */ (globalThis)['crypto'];
    if (gCrypto) {
      cryptoObj = /** @type {!Object} */ (gCrypto);
    }
  }
  if (!cryptoObj) {
    cryptoObj = /** @type {!Object} */ (require('crypto')['webcrypto']);
  }
  var /** @const {!Object} */ subtleObj = /** @type {!Object} */ (cryptoObj['subtle']);
  var /** @const {function(string, !Uint8Array): !Promise<!ArrayBuffer>} */ digestFn =
      /** @type {function(string, !Uint8Array): !Promise<!ArrayBuffer>} */ (subtleObj['digest']);
  // prettier-ignore
  return digestFn.call(subtleObj, 'SHA-256', inputData
  ).then(/** @param {!ArrayBuffer} hashBuffer @return {number} */ function (hashBuffer) {
    return new DataView(/** @type {!ArrayBuffer} */ (hashBuffer)).getUint32(0, true) % range;
  });
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
  for (var /** number */ idx = length - 1; idx >= 0; --idx) {
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
  for (var /** number */ i = 0; i < spec.tiers.length; ++i) {
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
// Reserved word sets for backend profiles.
// ---------------------------------------------------------------------------

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.IdentifierMangler.JS_RESERVED_ = /** @type {!Object<string, boolean>} */ (Object.create(null));

(function () {
  var /** @const {!Array<string>} */ words = [
      'abstract',
      'arguments',
      'await',
      'boolean',
      'break',
      'byte',
      'case',
      'catch',
      'char',
      'class',
      'const',
      'continue',
      'debugger',
      'default',
      'delete',
      'do',
      'double',
      'else',
      'enum',
      'eval',
      'export',
      'extends',
      'false',
      'final',
      'finally',
      'float',
      'for',
      'function',
      'goto',
      'if',
      'implements',
      'import',
      'in',
      'instanceof',
      'int',
      'interface',
      'let',
      'long',
      'native',
      'new',
      'null',
      'of',
      'package',
      'private',
      'protected',
      'public',
      'return',
      'short',
      'static',
      'super',
      'switch',
      'synchronized',
      'this',
      'throw',
      'throws',
      'transient',
      'true',
      'try',
      'typeof',
      'undefined',
      'var',
      'void',
      'volatile',
      'while',
      'with',
      'yield',
      'NaN',
      'Infinity'
    ];
  for (var /** number */ i = 0; i < words.length; ++i) {
    Wasm2Lang.Backend.IdentifierMangler.JS_RESERVED_[words[i]] = true;
  }
})();

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.IdentifierMangler.PHP_RESERVED_ = /** @type {!Object<string, boolean>} */ (Object.create(null));

(function () {
  var /** @const {!Array<string>} */ words = [
      'abstract',
      'and',
      'array',
      'as',
      'break',
      'callable',
      'case',
      'catch',
      'class',
      'clone',
      'const',
      'continue',
      'declare',
      'default',
      'die',
      'do',
      'echo',
      'else',
      'elseif',
      'empty',
      'enddeclare',
      'endfor',
      'endforeach',
      'endif',
      'endswitch',
      'endwhile',
      'eval',
      'exit',
      'extends',
      'false',
      'final',
      'finally',
      'fn',
      'for',
      'foreach',
      'function',
      'global',
      'goto',
      'if',
      'implements',
      'include',
      'include_once',
      'instanceof',
      'insteadof',
      'interface',
      'isset',
      'list',
      'match',
      'namespace',
      'new',
      'null',
      'or',
      'print',
      'private',
      'protected',
      'public',
      'readonly',
      'require',
      'require_once',
      'return',
      'static',
      'switch',
      'throw',
      'trait',
      'true',
      'try',
      'unset',
      'use',
      'var',
      'while',
      'xor',
      'yield'
    ];
  for (var /** number */ i = 0; i < words.length; ++i) {
    Wasm2Lang.Backend.IdentifierMangler.PHP_RESERVED_[words[i]] = true;
  }
})();

/** @const {!Object<string, boolean>} */
Wasm2Lang.Backend.IdentifierMangler.JAVA_RESERVED_ = /** @type {!Object<string, boolean>} */ (Object.create(null));

(function () {
  var /** @const {!Array<string>} */ words = [
      'abstract',
      'assert',
      'boolean',
      'break',
      'byte',
      'case',
      'catch',
      'char',
      'class',
      'const',
      'continue',
      'default',
      'do',
      'double',
      'else',
      'enum',
      'extends',
      'false',
      'final',
      'finally',
      'float',
      'for',
      'goto',
      'if',
      'implements',
      'import',
      'instanceof',
      'int',
      'interface',
      'long',
      'native',
      'new',
      'null',
      'package',
      'private',
      'protected',
      'public',
      'return',
      'short',
      'static',
      'strictfp',
      'super',
      'switch',
      'synchronized',
      'this',
      'throw',
      'throws',
      'transient',
      'true',
      'try',
      'var',
      'void',
      'volatile',
      'while'
    ];
  for (var /** number */ i = 0; i < words.length; ++i) {
    Wasm2Lang.Backend.IdentifierMangler.JAVA_RESERVED_[words[i]] = true;
  }
})();

// ---------------------------------------------------------------------------
// Mangler profiles per backend language.
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   reservedWords: !Object<string, boolean>,
 *   disallowDollarStart: boolean,
 *   caseInsensitive: boolean
 * }}
 */
Wasm2Lang.Backend.IdentifierMangler.Profile;

/** @const {!Object<string, !Wasm2Lang.Backend.IdentifierMangler.Profile>} */
Wasm2Lang.Backend.IdentifierMangler.PROFILES = {
  'asmjs': {
    reservedWords: Wasm2Lang.Backend.IdentifierMangler.JS_RESERVED_,
    disallowDollarStart: false,
    caseInsensitive: false
  },
  'php64': {
    reservedWords: Wasm2Lang.Backend.IdentifierMangler.PHP_RESERVED_,
    disallowDollarStart: true,
    caseInsensitive: true
  },
  'java': {
    reservedWords: Wasm2Lang.Backend.IdentifierMangler.JAVA_RESERVED_,
    disallowDollarStart: false,
    caseInsensitive: false
  }
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
  for (var /** number */ i = 0, /** @const {number} */ len = keys.length; i !== len; ++i) {
    var /** @const {string} */ k = keys[i];
    if (!(k in this.moduleNames_)) {
      this.moduleKeys_[this.moduleKeys_.length] = k;
      this.moduleNames_[k] = k; // placeholder until precompute
    }
  }
};

/**
 * Precomputes all mangled names.  Module-scope names occupy encoder indices
 * 0..N-1 and local pool names occupy N..N+M-1, guaranteeing uniqueness by
 * construction (the Aquitaine encoder is a bijection within each tier).
 *
 * @param {number} localPoolSize  Number of local pool entries needed.
 * @return {!Promise<void>}
 */
Wasm2Lang.Backend.IdentifierMangler.prototype.precompute = function (localPoolSize) {
  var /** @const {number} */ moduleCount = this.moduleKeys_.length;
  var /** @const {number} */ totalCount = moduleCount + localPoolSize;
  var /** @const */ self = this;

  return Wasm2Lang.Backend.IdentifierMangler.resolveNames_(totalCount, this.spec_, this.profile_).then(function (names) {
    for (var /** number */ i = 0; i < moduleCount; ++i) {
      self.moduleNames_[self.moduleKeys_[i]] = names[i];
    }
    self.localPool_ = names.slice(moduleCount);
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
 * Names that start with a digit, collide with reserved words, or (when the
 * profile requires it) start with {@code $} are skipped.  Since the encoder
 * is a bijection, unique counter values always produce unique outputs, so
 * the only reason to skip is legality — not collision.
 *
 * @private
 * @param {number} count
 * @param {!Wasm2Lang.Backend.IdentifierMangler.EncoderSpec_} spec
 * @param {!Wasm2Lang.Backend.IdentifierMangler.Profile} profile
 * @return {!Promise<!Array<string>>}
 */
Wasm2Lang.Backend.IdentifierMangler.resolveNames_ = function (count, spec, profile) {
  var /** @const {!Object<string, boolean>} */ reserved = profile.reservedWords;
  var /** @const {boolean} */ noDollar = profile.disallowDollarStart;
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
      var /** @const {number} */ ch = name.charCodeAt(0);
      // Reject digit-leading (0x30-0x39), reserved words, and $ if profile disallows.
      if ((48 <= ch && ch <= 57) || reserved[name] || (noDollar && 36 === ch)) {
        return tryNext(idx);
      }
      // For case-insensitive languages (PHP), reject names that collide
      // when lowercased — e.g. 'I' and 'i' are the same PHP function.
      if (ciCheck) {
        var /** @const {string} */ lower = name.toLowerCase();
        if (reserved[lower] || seenLower[lower]) {
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
