'use strict';

// ---------------------------------------------------------------------------
// Identifier helpers: safe naming, reserved-word resolution, padding, float
// literals, name mangling (n_, localN_, labelN_), and precomputeMangledNames_.
// ---------------------------------------------------------------------------

/**
 * Returns a safe identifier for use as a function/variable name.  Names that
 * start with a digit are prefixed with {@code "fn_"}.
 *
 * @protected
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_ = function (name) {
  // Replace characters that are not valid in JS/Java/PHP identifiers.
  name = name.replace(/[^a-zA-Z0-9_$]/g, '_');
  var /** @const {number} */ ch = name.charCodeAt(0);
  // 0x30 = '0', 0x39 = '9'
  if (48 <= ch && ch <= 57) {
    return 'fn_' + name;
  }
  return name;
};

/**
 * Resolves a candidate identifier against a reserved-word set.  If the name
 * collides, appends {@code "_"} until it is no longer reserved.
 *
 * @protected
 * @param {string} name
 * @param {!Object<string, boolean>} reservedWords  Lookup table (keys are
 *     reserved words, all lowercase for case-insensitive languages).
 * @param {boolean=} opt_caseInsensitive  When true, the check lowercases
 *     the candidate before testing (for PHP-style case-insensitive keywords).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_ = function (name, reservedWords, opt_caseInsensitive) {
  var /** @type {string} */ check = opt_caseInsensitive ? name.toLowerCase() : name;
  while (reservedWords[check]) {
    name = name + '_';
    check = opt_caseInsensitive ? name.toLowerCase() : name;
  }
  return name;
};

/**
 * Pre-built indentation strings indexed by indent level.  Populated once
 * by {@code initPadCache_} on first use.
 *
 * @private
 * @type {?Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.padCache_ = null;

/**
 * @private
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.initPadCache_ = function () {
  var /** @const {number} */ MAX = 24;
  var /** @const {!Array<string>} */ cache = new Array(MAX);
  var /** @type {string} */ s = '';
  for (var /** @type {number} */ k = 0; k < MAX; ++k) {
    cache[k] = s;
    s += '  ';
  }
  Wasm2Lang.Backend.AbstractCodegen.padCache_ = cache;
  return cache;
};

/**
 * Returns a string of {@code indent} two-space indentation units.
 *
 * @protected
 * @param {number} indent
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.pad_ = function (indent) {
  var /** @const {!Array<string>} */ cache =
      Wasm2Lang.Backend.AbstractCodegen.padCache_ || Wasm2Lang.Backend.AbstractCodegen.initPadCache_();
  if (indent < cache.length) return cache[indent];
  var /** @type {string} */ s = '';
  for (var /** @type {number} */ k = 0; k !== indent; ++k) {
    s += '  ';
  }
  return s;
};

/**
 * Formats a floating-point literal without introducing target-language
 * specific coercion syntax.
 *
 * Concrete backends decide whether the formatted literal needs additional
 * wrapping for f32/f64 semantics.
 *
 * @protected
 * @param {number} value
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_ = function (value) {
  if (!isFinite(value)) {
    return String(value);
  }
  if (0 === value && 1 / value < 0) {
    return '-0.0';
  }
  var /** @const {string} */ s = String(value);
  if (Math.floor(value) === value && -1 === s.indexOf('e') && -1 === s.indexOf('E')) {
    return s + '.0';
  }
  return s;
};

/**
 * Builds per-local init strings for function variables, applying
 * LocalInitFoldingPass overrides when available.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} funcName
 * @param {!Array<number>} varTypes
 * @param {number} numParams
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.buildLocalInitStrings_ = function (binaryen, funcName, varTypes, numParams) {
  var /** @const {?Object<string, number>} */ initOverrides = this.getLocalInitOverrides_(funcName);
  var /** @const {!Array<string>} */ result = [];
  for (var /** @type {number} */ vi = 0, /** @const {number} */ numVars = varTypes.length; vi !== numVars; ++vi) {
    var /** @const {number} */ localType = varTypes[vi];
    var /** @const {number} */ localIdx = numParams + vi;
    var /** @const {number|void} */ overrideValue = initOverrides ? initOverrides[String(localIdx)] : void 0;
    // prettier-ignore
    result[result.length] = void 0 !== overrideValue
      ? (Wasm2Lang.Backend.ValueType.isI64(binaryen, localType)
        ? this.renderI64Const_(binaryen, overrideValue)
        : this.renderConst_(binaryen, /** @type {number} */ (overrideValue), localType))
      : this.renderLocalInit_(binaryen, localType);
  }
  return result;
};

// ---------------------------------------------------------------------------
// Shared identifier mangling infrastructure.
// ---------------------------------------------------------------------------

/**
 * Returns a mangled module-scope name when the mangler is active, or the
 * original identifier unchanged.  Concrete backends may override this to
 * add sigil logic (e.g. PHP adds {@code $} prefix).
 *
 * @protected
 * @param {string} originalName
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.n_ = function (originalName) {
  return this.mangler_ ? this.mangler_.mn(originalName) : Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(originalName);
};

/**
 * Returns a mangled local-scope name when the mangler is active, or the
 * default {@code $l{index}} identifier.
 *
 * @protected
 * @param {number} index
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.localN_ = function (index) {
  return this.mangler_ ? this.mangler_.ln(index) : '$l' + index;
};

/**
 * Returns a mangled label name for a binaryen block/loop label.
 *
 * When the mangler is active, the label's pool index ({@code labelOffset +
 * sequenceNumber}) is resolved via the local pool.  When inactive, the
 * original binaryen name is returned with a {@code $} prefix.
 *
 * @protected
 * @param {!Object<string, number>} labelMap  Per-function map of binaryen
 *     label name → sequence number (mutated on first encounter).
 * @param {string} binaryenName  Raw label name from binaryen.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.labelN_ = function (labelMap, binaryenName) {
  if (!this.mangler_) {
    return '$' + binaryenName;
  }
  var /** @type {number|void} */ seq = labelMap[binaryenName];
  if ('number' !== typeof seq) {
    seq = Object.keys(labelMap).length;
    labelMap[binaryenName] = seq;
  }
  return this.localN_(seq);
};

/**
 * Formats a {@code break} or {@code continue} statement targeting a resolved
 * label name, eliding the label when the prefix allows it.
 *
 * @protected
 * @param {!Object<string, number>} labelMap
 * @param {string} keyword  {@code 'break'} or {@code 'continue'}.
 * @param {string} resolvedName  Already-resolved target (after fusion lookup).
 * @return {string}  Statement string ending in {@code ';\n'}.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderLabeledJump_ = function (labelMap, keyword, resolvedName) {
  return Wasm2Lang.Backend.AbstractCodegen.isLabelElided(resolvedName)
    ? keyword + ';\n'
    : keyword + ' ' + this.labelN_(labelMap, resolvedName) + ';\n';
};

/**
 * Resolves a target label to its break/continue statement string, looking up
 * the label kind and block-to-loop fusion redirection.
 *
 * Used by asm.js and Java backends for BreakId, SwitchId, and flat-switch
 * external-target handling where the same 4-line resolution pattern was
 * previously repeated.
 *
 * @protected
 * @param {!Object<string, string>} labelKinds   Map of label name → 'block'|'loop'.
 * @param {!Object<string, string>} fusedBlockToLoop  Fused block → loop name.
 * @param {!Object<string, number>} labelMap
 * @param {string} targetName
 * @return {string}  Statement string ending in {@code ';\n'}.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resolveBreakTarget_ = function (
  labelKinds,
  fusedBlockToLoop,
  labelMap,
  targetName
) {
  var /** @const {string} */ kind = labelKinds[targetName] || 'block';
  var /** @const {string} */ actual = fusedBlockToLoop[targetName] || targetName;
  var /** @const {string} */ keyword = 'loop' === kind ? 'continue' : 'break';
  return this.renderLabeledJump_(labelMap, keyword, actual);
};

/**
 * Sanitises a raw binaryen name for the target language, applying
 * optional pre-sanitize regex, invalid-character replacement, leading-digit
 * guard, and reserved-word resolution.  Behavior is configured via instance
 * fields set by concrete backend constructors: {@code reservedWords_},
 * {@code caseInsensitiveReserved_}, and {@code preSanitizeRegex_}.
 *
 * @protected
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.safeName_ = function (name) {
  if (this.preSanitizeRegex_) name = name.replace(this.preSanitizeRegex_, '_');
  var /** @const {string} */ safe = Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(name);
  return this.reservedWords_
    ? Wasm2Lang.Backend.AbstractCodegen.resolveReservedIdentifier_(safe, this.reservedWords_, this.caseInsensitiveReserved_)
    : safe;
};

/**
 * Backend hook returning the runtime helper prefix.
 * Default: {@code "$w2l_"} (used by asm.js and Java); PHP overrides to {@code "_w2l_"}.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getRuntimeHelperPrefix_ = function () {
  return '$w2l_';
};

/**
 * Counts the number of named block/loop labels in a function body.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.countFunctionLabels_ = function (wasmModule, binaryen, funcInfo) {
  if (0 === funcInfo.body) {
    return 0;
  }
  var /** @const {!Object<string, boolean>} */ seen = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @type {number} */ count = 0;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
      enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) {
        var /** @const {!BinaryenExpressionInfo} */ e = nc.expression;
        var /** @const {number} */ eId = e.id;
        if ((binaryen.BlockId === eId || binaryen.LoopId === eId) && e.name) {
          var /** @const {string} */ n = /** @type {string} */ (e.name);
          if (!seen[n]) {
            seen[n] = true;
            ++count;
          }
        }
        return null;
      }
    });
  this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
  return count;
};

/**
 * Backend hook: number of inline temporary variables injected into function
 * bodies (e.g. store/load scratch vars).  These occupy local-pool indices
 * after numParams + numVars and must not collide with wasm locals.
 *
 * @protected
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getInlineTempCount_ = function () {
  return 0;
};

/**
 * Backend hook: returns all fixed module-scope identifiers that should be
 * registered with the mangler.  Concrete backends override this.
 *
 * @protected
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getFixedModuleBindings_ = function (options) {
  void options;
  return [];
};

/**
 * Backend hook: returns all possible helper function names that could be
 * emitted.  Concrete backends override this.
 *
 * @protected
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getAllHelperNames_ = function () {
  return [];
};

/**
 * Precomputes mangled names for all identifiers in the module.
 *
 * Collects module-scope identifiers from: backend fixed bindings, all
 * possible helpers, globals, imports, and internal functions.  Then
 * precomputes the local pool to cover the largest function scope.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Promise<void>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.precomputeMangledNames_ = function (wasmModule, options) {
  this.mangler_ = new Wasm2Lang.Backend.IdentifierMangler(/** @type {string} */ (options.mangler), options.languageOut);

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);

  // Register all module-scope identifiers in deterministic order.
  // Frequently-referenced names (fixed bindings, globals, imports,
  // functions) are registered first so they claim shorter identifiers.
  // Helper function names are registered last — they appear at most once
  // each as declarations and rarely in call sites.
  var /** @const {!Array<string>} */ keys = [];

  // 1. Backend-specific fixed bindings (sorted for determinism).
  var /** @const {!Array<string>} */ fixed = this.getFixedModuleBindings_(options);
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fLen = fixed.length; fi !== fLen; ++fi) {
    keys[keys.length] = fixed[fi];
  }

  // 2. Globals (module order).
  for (var /** @type {number} */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    keys[keys.length] = '$g_' + this.safeName_(moduleInfo.globals[gi].globalName);
  }

  // 3. Import bindings (module order).
  for (var /** @type {number} */ ii = 0, /** @const {number} */ iLen = moduleInfo.impFuncs.length; ii !== iLen; ++ii) {
    keys[keys.length] = '$if_' + this.safeName_(moduleInfo.impFuncs[ii].importBaseName);
  }

  // 4. Internal function names (module order).
  for (var /** @type {number} */ fn = 0, /** @const {number} */ fnLen = moduleInfo.functions.length; fn !== fnLen; ++fn) {
    keys[keys.length] = this.safeName_(moduleInfo.functions[fn].name);
  }

  // 5. All possible helper function names (sorted for determinism).
  // Registered last: helpers appear at most once as declarations.
  var /** @const {!Array<string>} */ helpers = this.getAllHelperNames_();
  for (var /** @type {number} */ hi = 0, /** @const {number} */ hLen = helpers.length; hi !== hLen; ++hi) {
    keys[keys.length] = helpers[hi];
  }

  // 6. Function table bindings (per-signature table, stub, and interface names).
  var /** @const {!Array<string>} */ ftBindingKeys = Object.keys(moduleInfo.functionTables);
  if (0 !== ftBindingKeys.length) {
    keys[keys.length] = 'ftable';
    for (var /** @type {number} */ fbi = 0, /** @const {number} */ fbLen = ftBindingKeys.length; fbi !== fbLen; ++fbi) {
      var /** @const {string} */ fbSigKey = ftBindingKeys[fbi];
      keys[keys.length] = '$ftable_' + fbSigKey;
      keys[keys.length] = '$ftable_' + fbSigKey + '_stub';
      keys[keys.length] = '$ftsig_' + fbSigKey;
    }
  }

  this.mangler_.registerModuleBindings(keys);

  // Compute local pool size: max(params + vars + labels) across all
  // functions, with a minimum of 5 for helper function locals.
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @type {number} */ maxLocals = 5;
  for (var /** @type {number} */ f = 0, /** @const {number} */ fCount = moduleInfo.functions.length; f !== fCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    var /** @const {number} */ numParams = binaryen.expandType(funcInfo.params).length;
    var /** @const {number} */ numVars = /** @type {!Array<number>} */ (funcInfo.vars || []).length;
    var /** @const {number} */ numLabels = this.countFunctionLabels_(wasmModule, binaryen, funcInfo);
    var /** @const {number} */ numInlineTemps = this.getInlineTempCount_();
    if (numParams + numVars + numInlineTemps > maxLocals) {
      maxLocals = numParams + numVars + numInlineTemps;
    }
    if (numLabels > maxLocals) {
      maxLocals = numLabels;
    }
  }

  return this.mangler_.precompute(maxLocals);
};
