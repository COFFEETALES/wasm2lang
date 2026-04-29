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
 * Returns the array {@code [localN_(0), …, localN_(numParams-1)]}.
 *
 * @protected
 * @param {number} numParams
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.buildParamNameList_ = function (numParams) {
  var /** @const {!Array<string>} */ names = [];
  for (var /** @type {number} */ pi = 0; pi !== numParams; ++pi) names[pi] = this.localN_(pi);
  return names;
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
  var /** @const {?Object<string, *>} */ initOverrides = this.getLocalInitOverrides_(funcName);
  var /** @const {!Array<string>} */ result = [];
  for (var /** @type {number} */ vi = 0, /** @const {number} */ numVars = varTypes.length; vi !== numVars; ++vi) {
    var /** @const {number} */ localType = varTypes[vi];
    var /** @const {number} */ localIdx = numParams + vi;
    var /** @const {*} */ overrideValue = initOverrides ? initOverrides[String(localIdx)] : void 0;
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
    return '$' + Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(binaryenName);
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
 * the label kind and block-to-loop fusion redirection, and marks the resolved
 * label as used in {@code state.usedLabels}.
 *
 * Used by asm.js and Java backends for SwitchId and flat-switch external-target
 * handling where the same mark-and-resolve pattern was previously repeated.
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} targetName
 * @return {string}  Statement string ending in {@code ';\n'}.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resolveBreakTarget_ = function (state, targetName) {
  var /** @const {string} */ actual = state.fusedBlockToLoop[targetName] || targetName;
  var /** @const {string} */ kind = state.labelKinds[targetName] || 'block';
  var /** @const {string} */ keyword = 'loop' === kind ? 'continue' : 'break';
  return this.markAndRenderLabeledJump_(state, keyword, actual);
};

/**
 * Marks an already-resolved label as used and renders the corresponding
 * labeled jump statement.  Shared by callers that know the final target name
 * and keyword directly (no fusion/kind lookup needed).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} keyword  {@code 'break'} or {@code 'continue'}.
 * @param {string} resolvedName
 * @return {string}  Statement string ending in {@code ';\n'}.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.markAndRenderLabeledJump_ = function (state, keyword, resolvedName) {
  state.usedLabels[resolvedName] = true;
  return this.renderLabeledJump_(state.labelMap, keyword, resolvedName);
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
 * Backend hook: returns the subset of fixed module-scope identifiers that
 * appear most frequently in emitted function bodies and therefore deserve
 * the shortest mangled names.  Default empty — concrete backends override.
 *
 * Names returned here are registered ahead of locals, internal functions,
 * and helpers so that they claim the encoder's first single-letter slots.
 *
 * @protected
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getHotModuleBindings_ = function (options) {
  void options;
  return [];
};

/**
 * Returns {@code true} when {@code text} contains a call to the identifier
 * {@code name} — i.e., the name appears immediately followed by {@code "("}
 * with no preceding identifier character.  Used by the JS-family module-shell
 * emitter to detect live {@code $w2l_trap} references after dead-code
 * trimming, without false-positives when {@code name} is a substring suffix
 * of another mangled identifier (e.g. {@code mangledTrap === "t"} matched
 * inside {@code "Jt("}).
 *
 * @protected
 * @param {string} text
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.containsIdentifierCall_ = function (text, name) {
  var /** @const {number} */ nLen = name.length;
  if (0 === nLen) return false;
  var /** @type {number} */ idx = 0;
  for (;;) {
    var /** @const {number} */ found = text.indexOf(name, idx);
    if (-1 === found) return false;
    if (40 === text.charCodeAt(found + nLen)) {
      var /** @const {number} */ prev = found > 0 ? text.charCodeAt(found - 1) : 0;
      var /** @const {boolean} */ prevIsIdent =
          (48 <= prev && prev <= 57) || (65 <= prev && prev <= 90) || (97 <= prev && prev <= 122) || 95 === prev || 36 === prev;
      if (!prevIsIdent) return true;
    }
    idx = found + 1;
  }
};

/**
 * Returns every helper function name the backend's {@code emitHelpers_} is
 * capable of emitting.
 *
 * Implemented by running {@code emitHelpers_} in a collect-only dry pass:
 * each {@code h(name, ...)} call (routed through {@code emitOrCollectHelper_})
 * records {@code name} into a temporary collector instead of emitting a body.
 * This keeps the emittable-helper list and the actual emission in lock-step
 * with a single source of truth, eliminating the drift that a hand-maintained
 * override would introduce.
 *
 * @protected
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getAllHelperNames_ = function () {
  var /** @const {!Array<string>} */ collector = [];
  this.helperNameCollector_ = collector;
  try {
    this.emitHelpers_(0, 0, 0, 0);
  } finally {
    this.helperNameCollector_ = null;
  }
  collector.sort();
  return collector;
};

/**
 * Backend hook: returns the subset of fixed module-scope bindings that are
 * structurally required and must be registered with the mangler regardless
 * of usage discovery.  These are the closure parameters and module-function
 * names that the emitter inserts via {@code n_(...)} without going through
 * {@code markBinding_}, so a discovery walk would miss them and they would
 * leak into the output unmangled.
 *
 * Default empty.  Concrete backends override.
 *
 * @protected
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getAlwaysRegisteredBindings_ = function (options) {
  void options;
  return [];
};

/**
 * Runs a throwaway {@code emitCode} pass with the mangler disabled to
 * populate {@code usedHelpers_} / {@code usedBindings_} as if a real emit
 * had occurred, then captures them into {@code discoveredHelpers_} /
 * {@code discoveredBindings_} so {@code precomputeMangledNames_} can register
 * only the keys that will actually appear in the output.
 *
 * Without this pass, the precompute eagerly registers every emittable helper
 * and every fixed cold-tier binding, burning encoder slots on names that the
 * emitter never references.  With it, modules that use only a handful of
 * helpers (e.g. the {@code cast} sample which inlines all eight i32/f32/f64
 * coercions and never reaches a runtime helper) reclaim those slots for
 * other identifiers — pushing names like {@code Math_floor} and
 * {@code Math_sqrt} from the two-character tier into the single-character
 * tier.
 *
 * State is fully restored after the pass: {@code mangler_} stays null
 * (precompute will reinitialize it), {@code usedHelpers_} /
 * {@code usedBindings_} are reset to null, and any transient fields the
 * emit phase populates ({@code castNames_}, {@code heapPageCount_},
 * {@code helperNameCollector_}) are reverted to their pre-pass values.
 *
 * Only meaningful when the invocation emits source code — binary-only
 * emission does not exercise the helper or binding marking infrastructure.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.runUsageDiscovery_ = function (wasmModule, options) {
  if ('string' !== typeof options.emitCode) return;
  var /** @const {?Wasm2Lang.Backend.IdentifierMangler} */ savedMangler = this.mangler_;
  this.mangler_ = null;
  try {
    this.emitCode(wasmModule, options);
    this.discoveredHelpers_ = this.lastEmitUsedHelpers_;
    this.discoveredBindings_ = this.lastEmitUsedBindings_;
  } finally {
    this.mangler_ = savedMangler;
    this.lastEmitUsedHelpers_ = null;
    this.lastEmitUsedBindings_ = null;
  }
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

  // Register module-scope identifiers in priority order — earlier keys
  // claim shorter mangled names (the encoder allocates the single-character
  // tier first, then the two-character tier, etc.).
  //
  // Tier order, hottest first:
  //   1. Hot fixed bindings (HEAP arrays, Math_fround, Math_imul, …)
  //   2. Internal function names — referenced once per call site
  //   3. Imports — same
  //   4. Module globals — accessed inside function bodies
  //   5. Exported global getter/setter accessors — called via the export object
  //   6. All emittable helper function names — each is declared once but
  //      may be called many times from user code (e.g. $w2l_store_f64)
  //   7. Cold fixed bindings (closure params, rare Math constants, $w2l_trap)
  //   8. Function table bindings (only present when the module uses tables)
  //
  // {@code registerModuleBindings} silently skips duplicates, so the cold
  // pass that re-registers everything from {@code getFixedModuleBindings_}
  // only adds the keys not already promoted by {@code getHotModuleBindings_}.
  var /** @const {!Array<string>} */ keys = [];

  // 1. Hot fixed bindings.
  var /** @const {!Array<string>} */ hot = this.getHotModuleBindings_(options);
  for (var /** @type {number} */ ho = 0, /** @const {number} */ hoLen = hot.length; ho !== hoLen; ++ho) {
    keys[keys.length] = hot[ho];
  }

  // 2. Internal function names (module order).
  for (var /** @type {number} */ fn = 0, /** @const {number} */ fnLen = moduleInfo.functions.length; fn !== fnLen; ++fn) {
    keys[keys.length] = this.safeName_(moduleInfo.functions[fn].name);
  }

  // 3. Import bindings (module order).  Cast imports (rewritten to native
  //    coercion expressions) and stdlib Math imports (rewritten to inline
  //    {@code Math_*} references) never produce {@code $if_*} call sites,
  //    so excluding them frees up encoder slots for genuinely hot names.
  var /** @const {!Object<string, string>} */ castNamesMap = moduleInfo.castNames;
  var /** @const */ classifyStdlib = Wasm2Lang.Backend.AbstractCodegen.classifyStdlibImport;
  for (var /** @type {number} */ ii = 0, /** @const {number} */ iLen = moduleInfo.impFuncs.length; ii !== iLen; ++ii) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_} */ impFunc = moduleInfo.impFuncs[ii];
    if (impFunc.wasmFuncName in castNamesMap) continue;
    if ('math_func' === classifyStdlib(impFunc.importModule, impFunc.importBaseName)) continue;
    keys[keys.length] = '$if_' + this.safeName_(impFunc.importBaseName);
  }

  // 4. Module globals (module order).
  for (var /** @type {number} */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    keys[keys.length] = '$g_' + this.safeName_(moduleInfo.globals[gi].globalName);
  }

  // 5. Exported global getter / setter accessors (built from exported names).
  var /** @const {!Array<!Wasm2Lang.Backend.AbstractCodegen.ExportedGlobalInfo_>} */ expGlobals = moduleInfo.expGlobals;
  for (var /** @type {number} */ eg = 0, /** @const {number} */ egLen = expGlobals.length; eg !== egLen; ++eg) {
    var /** @const {string} */ egExportSafe = this.safeName_(expGlobals[eg].exportName);
    keys[keys.length] = '$get_' + egExportSafe;
    if (expGlobals[eg].globalMutable) {
      keys[keys.length] = '$set_' + egExportSafe;
    }
  }

  // 6. Helper function names.  When usage discovery has populated
  //    {@code discoveredHelpers_}, register only the helpers the emit will
  //    actually reference (deps already expanded transitively by
  //    {@code markHelper_}); otherwise fall back to the full sorted list
  //    from {@code getAllHelperNames_}.
  var /** @const {?Object<string, boolean>} */ usedHelpers = this.discoveredHelpers_;
  var /** @const {!Array<string>} */ helpers = this.getAllHelperNames_();
  for (var /** @type {number} */ hi = 0, /** @const {number} */ hLen = helpers.length; hi !== hLen; ++hi) {
    if (usedHelpers && !usedHelpers[helpers[hi]]) continue;
    keys[keys.length] = helpers[hi];
  }

  // 7. Cold fixed bindings — anything from {@code getFixedModuleBindings_}
  //    that wasn't already promoted to the hot tier above.  When discovery
  //    populated {@code discoveredBindings_}, restrict to the union of
  //    structurally-required bindings ({@code getAlwaysRegisteredBindings_})
  //    and bindings that an emit-time {@code markBinding_} call observed.
  var /** @const {?Object<string, boolean>} */ usedBindings = this.discoveredBindings_;
  var /** @type {?Object<string, boolean>} */ alwaysSet = null;
  if (usedBindings) {
    alwaysSet = /** @type {!Object<string, boolean>} */ (Object.create(null));
    var /** @const {!Array<string>} */ alwaysList = this.getAlwaysRegisteredBindings_(options);
    for (var /** @type {number} */ ai = 0, /** @const {number} */ aLen = alwaysList.length; ai !== aLen; ++ai) {
      alwaysSet[alwaysList[ai]] = true;
    }
  }
  var /** @const {!Array<string>} */ fixed = this.getFixedModuleBindings_(options);
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fLen = fixed.length; fi !== fLen; ++fi) {
    var /** @const {string} */ fixedKey = fixed[fi];
    if (usedBindings && !usedBindings[fixedKey] && (!alwaysSet || !alwaysSet[fixedKey])) continue;
    keys[keys.length] = fixedKey;
  }

  // 8. Function table bindings (per-signature table, stub, and interface names).
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
