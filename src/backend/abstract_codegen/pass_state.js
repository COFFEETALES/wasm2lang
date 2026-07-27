'use strict';

// ---------------------------------------------------------------------------
// Pass-run metadata accessors, helper/binding tracking, expression category
// constants, and default emitMetadata.
// ---------------------------------------------------------------------------

/**
 * Stores the pass-run result so backends can read per-function metadata
 * (e.g. localInitOverrides from LocalInitFoldingPass).
 *
 * @param {!Wasm2Lang.Wasm.Tree.PassRunResult} result
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.setPassRunResult_ = function (result) {
  // prettier-ignore
  var /** @const {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ index =
    /** @type {!Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} */ (Object.create(null));
  var /** @const {!Array<!Wasm2Lang.Wasm.Tree.PassMetadata>} */ funcs = result.functions;
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = funcs.length; i !== len; ++i) {
    var /** @const {string|void} */ name = funcs[i].passFuncName;
    if (name) {
      index[name] = funcs[i];
    }
  }
  this.passRunResultIndex_ = index;
};

/**
 * Runs the transient semantic control-flow analysis exactly once for a module
 * before emission. The pass owns its result instead of writing PassMetadata,
 * so the index cannot leak into w2l_codegen_meta serialization.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.prepareControlFlowSummary_ = function (wasmModule, binaryen) {
  // Raw/baseline emission never returns SKIP_SUBTREE, so its normal codegen
  // child results already carry every summary needed by the parent. Avoid an
  // analysis pass entirely on that fast path.
  if (!this.useSimplifications_) return;
  if (this.controlFlowSummaryModule_ === wasmModule && this.controlFlowSummaryIndex_) return;

  var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis} */ analysis =
      new Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis();
  Wasm2Lang.Wasm.Tree.PassRunner.runOnModule(wasmModule, [analysis], binaryen);
  this.controlFlowSummaryIndex_ = analysis.getIndex();
  this.controlFlowSummaryModule_ = wasmModule;
};

/**
 * Looks up the semantic control summary for one expression in the active
 * module. Pointer keys are nested under function names so the index remains
 * correct even if a Binaryen implementation reuses pointer values.
 *
 * @protected
 * @param {string} functionName
 * @param {number} expressionPointer
 * @return {?Wasm2Lang.Wasm.Tree.ControlFlowSummary}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getControlFlowSummary_ = function (functionName, expressionPointer) {
  var /** @const {?Wasm2Lang.Wasm.Tree.ControlFlowSummaryIndex} */ index = this.controlFlowSummaryIndex_;
  if (!index) return null;
  var /** @const {(!Wasm2Lang.Wasm.Tree.FunctionControlFlowSummaryIndex|undefined)} */ functionIndex = index[functionName];
  return functionIndex ? functionIndex[String(expressionPointer)] || null : null;
};

/**
 * Enables control-flow simplifications (flat switch, loop simplification,
 * block-loop fusion) during code emission.  Called from the processor when
 * {@code --pre-normalized} is active.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.enableSimplifications_ = function () {
  this.useSimplifications_ = true;
  this.irFusedBlocks_ = /** @type {!Object<string, string>} */ (Object.create(null));
};

/**
 * Returns the local-init overrides for a given function, or null if none.
 * Delegates to LocalInitFoldingApplication.
 *
 * @protected
 * @param {string} funcName
 * @return {?Object<string, *>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getLocalInitOverrides_ = function (funcName) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingApplication.getLocalInitOverrides(this.passRunResultIndex_, funcName);
};

/**
 * Returns the loop plan for a given function and loop name, or null if none.
 * Delegates to LoopSimplificationApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} loopName
 * @return {?Wasm2Lang.Wasm.Tree.LoopPlan}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getLoopPlan_ = function (funcName, loopName) {
  if (!this.useSimplifications_) return null;
  return Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.getLoopPlan(
    this.passRunResultIndex_,
    funcName,
    loopName
  );
};

/**
 * Returns the BlockFusionPlan for the given block, or null.
 * Delegates to BlockLoopFusionApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} blockName
 * @return {?Wasm2Lang.Wasm.Tree.BlockFusionPlan}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getBlockFusionPlan_ = function (funcName, blockName) {
  if (!this.useSimplifications_) return null;
  var /** @type {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ plan =
      Wasm2Lang.Wasm.Tree.CustomPasses.BlockLoopFusionApplication.getBlockFusionPlan(
        this.passRunResultIndex_,
        funcName,
        blockName
      );
  if (plan) return plan;
  if (this.irFusedBlocks_) {
    var /** @const {string} */ irKey = funcName + '\0' + blockName;
    var /** @const {string|undefined} */ irVariant = this.irFusedBlocks_[irKey];
    if (irVariant) {
      return /** @type {!Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ ({fusionVariant: irVariant});
    }
  }
  return null;
};

/**
 * Returns true if the given block is a switch-dispatch block.
 * Delegates to SwitchDispatchApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.isBlockSwitchDispatch_ = function (funcName, blockName) {
  if (!this.useSimplifications_) return false;
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.isBlockSwitchDispatch(
    this.passRunResultIndex_,
    funcName,
    blockName
  );
};

/**
 * Returns true if the given block is a root-switch block.
 * Delegates to SwitchDispatchApplication.
 *
 * @protected
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.isBlockRootSwitch_ = function (funcName, blockName) {
  if (!this.useSimplifications_) return false;
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.isBlockRootSwitch(
    this.passRunResultIndex_,
    funcName,
    blockName
  );
};

/**
 * Returns the backend's helper dependency map, or null if none.
 * Concrete backends override this to return their static HELPER_DEPS_.
 *
 * @protected
 * @return {?Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getHelperDeps_ = function () {
  return null;
};

/**
 * Records a helper function name as used and transitively marks its
 * dependencies via {@code getHelperDeps_}.
 *
 * @protected
 * @param {string} name
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.markHelper_ = function (name) {
  if (!this.usedHelpers_ || this.usedHelpers_[name]) return;
  this.usedHelpers_[name] = true;
  var /** @const {?Object<string, !Array<string>>} */ depsMap = this.getHelperDeps_();
  if (depsMap) {
    var /** @const {!Array<string>|void} */ deps = depsMap[name];
    if (deps) {
      for (var /** @type {number} */ i = 0, /** @const {number} */ len = deps.length; i !== len; ++i) {
        this.markHelper_(deps[i]);
      }
    }
  }
};

/**
 * Records a module-level binding name as used (heap views, stdlib imports).
 *
 * @protected
 * @param {string} name
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.markBinding_ = function (name) {
  if (this.usedBindings_) {
    this.usedBindings_[name] = true;
  }
};

// ---------------------------------------------------------------------------
// Trap-site allocation (--trap-sites).
//
// Site ids are handed out BY THE EMISSION ITSELF, never by a separate pre-pass
// walk.  The emitter does not visit every Unreachable node in the IR: emitEnter_
// returns SKIP_SUBTREE for root-switch / switch-dispatch blocks and simplified
// loops, whose bodies are then re-rendered by sub-walks over child slices that
// break early on a terminal child.  An independent DFS would therefore disagree
// with the emission on both the count and the order of trap sites.
//
// Determinism across the two emits (discovery + real, see runUsageDiscovery_)
// holds because the only difference between them is {@code mangler_}, which
// affects identifier text and nothing about traversal order or the
// SKIP_SUBTREE decisions.  Both passes allocate the same ids for the same
// sites; the counter is reset per emit and only the last table is published.
// ---------------------------------------------------------------------------

/**
 * Prepares per-emit trap-site state.  Must be called at the top of every
 * concrete {@code emitCode}, alongside the {@code usedHelpers_} /
 * {@code usedBindings_} resets.
 *
 * @protected
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @param {!Array<!BinaryenFunctionInfo>} definedFunctions  Emitted-function
 *     sequence, in emission order.
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resetTrapSites_ = function (options, definedFunctions) {
  this.trapSitesEnabled_ = !!options.trapSites;
  this.trapSiteCounter_ = 0;
  this.trapSiteOrdinals_ = /** @type {!Object<string, number>} */ (Object.create(null));
  if (!this.trapSitesEnabled_) {
    this.trapSites_ = null;
    this.trapFuncOrdinals_ = null;
    return;
  }
  this.trapSites_ = [];
  var /** @const {!Object<string, number>} */ ordinals = /** @type {!Object<string, number>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = definedFunctions.length; i !== len; ++i) {
    ordinals[definedFunctions[i].name] = i;
  }
  this.trapFuncOrdinals_ = ordinals;
};

/**
 * Publishes the finished table.  Mirrors {@code lastEmitUsedHelpers_}: the
 * discovery emit overwrites it and the real emit overwrites it again, so the
 * artifact always reflects the emit that produced the source.
 *
 * @protected
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.publishTrapSites_ = function () {
  this.lastEmitTrapSites_ = this.trapSites_;
};

/**
 * Returns the site table produced by the most recent code emission, or
 * {@code null} when {@code --trap-sites} was off.
 *
 * @return {?Array<!Wasm2Lang.Backend.TrapSite>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getTrapSites = function () {
  return this.lastEmitTrapSites_;
};

/**
 * Returns the next per-container ordinal for {@code key} and advances it.
 *
 * @private
 * @param {string} key
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.nextTrapOrdinal_ = function (key) {
  var /** @const {?Object<string, number>} */ map = this.trapSiteOrdinals_;
  if (!map) return 0;
  var /** @const {number} */ current = key in map ? map[key] : 0;
  map[key] = current + 1;
  return current;
};

/**
 * Returns {@code name} when it can be trusted to come from a real name
 * section, {@code null} otherwise.
 *
 * Binaryen fabricates decimal names ({@code "0"}, {@code "12"}) for a binary
 * with no name section, and renames import internals to {@code $fimport$N} on
 * round-trip, with no API to ask which names are authored.  The contract for
 * the site table is to never invent a {@code funcName}, so both shapes are
 * dropped and the consumer falls back to {@code funcIndex}.  A genuine name
 * section could legally contain {@code "0"}; erring toward omission is the
 * whole point.
 *
 * @private
 * @param {string} name
 * @return {?string}
 */
Wasm2Lang.Backend.AbstractCodegen.trustedFunctionName_ = function (name) {
  if ('' === name) return null;
  if (/^[0-9]+$/.test(name)) return null;
  if (/^\$?fimport\$[0-9]+$/.test(name)) return null;
  return name;
};

/**
 * Allocates a trap site for an IR node inside {@code functionInfo}.
 *
 * @protected
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {?BinaryenFunctionInfo} functionInfo
 * @return {number} The site id, or {@code -1} when instrumentation is off.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.allocateTrapSite_ = function (kind, functionInfo) {
  var /** @const {?Array<!Wasm2Lang.Backend.TrapSite>} */ sites = this.trapSites_;
  if (!this.trapSitesEnabled_ || !sites) return -1;
  var /** @const {string} */ name = functionInfo ? functionInfo.name : '';
  var /** @const {?Object<string, number>} */ ordinals = this.trapFuncOrdinals_;
  var /** @const {number} */ funcIndex = ordinals && name in ordinals ? ordinals[name] : -1;
  var /** @const {number} */ siteId = this.trapSiteCounter_++;
  sites.push({
    id: siteId,
    kind: kind,
    funcIndex: funcIndex,
    funcName: Wasm2Lang.Backend.AbstractCodegen.trustedFunctionName_(name),
    helper: null,
    ordinal: this.nextTrapOrdinal_(name)
  });
  return siteId;
};

/**
 * Allocates a trap site inside a shared runtime helper body.
 *
 * Helper bodies are static templates emitted once per module, after every
 * function body, and only for the helpers the bodies actually marked.  They
 * belong to no wasm function, so the row carries {@code helper} instead of
 * {@code funcIndex}/{@code funcName}.  Allocating them from the same counter
 * keeps ids dense; ordering is deterministic because {@code emitHelpers_} runs
 * at a fixed point after the body loop in every backend.
 *
 * @protected
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {string} helperName
 * @return {number} The site id, or {@code -1} when instrumentation is off.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.allocateHelperTrapSite_ = function (kind, helperName) {
  var /** @const {?Array<!Wasm2Lang.Backend.TrapSite>} */ sites = this.trapSites_;
  // getAllHelperNames_ re-runs emitHelpers_ in collect mode to harvest the
  // helper roster; the bodies it builds are thrown away, so allocating there
  // would burn ids and append phantom rows.
  if (this.helperNameCollector_) return -1;
  if (!this.trapSitesEnabled_ || !sites) return -1;
  var /** @const {number} */ siteId = this.trapSiteCounter_++;
  sites.push({
    id: siteId,
    kind: kind,
    funcIndex: -1,
    funcName: null,
    helper: helperName,
    ordinal: this.nextTrapOrdinal_(' helper ' + helperName)
  });
  return siteId;
};

/**
 * Builds the diagnostic text carried by a trap on the backends whose abort is
 * a native {@code throw} (java, csharp, php64).
 *
 * Those three have no {@code $w2l_trap} indirection and no foreign-object
 * binding to route one through; the exception is the host-visible channel, and
 * a message is the one payload every host can read without new plumbing (and
 * without adding an identifier whose mere registration would shift every
 * mangled name on backends that have no usage filter).  The shape is stable
 * and trivially parseable: {@code w2l trap kind=<n> site=<n>}.
 *
 * The string is embedded in the emitted source, so it must never contain a
 * quote or a backslash — both inputs are integers, so it cannot.
 *
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.trapMessage_ = function (kind, siteId) {
  return 'w2l trap kind=' + String(kind) + ' site=' + String(siteId);
};

/**
 * Serializes a site table to the {@code <out-file>.traps.json} payload.
 *
 * Every key is a quoted string literal so ADVANCED_OPTIMIZATIONS cannot rename
 * it — the JSON is a wire format read by a separate program.  The rows are
 * emitted in id order (which is allocation order), so the artifact is
 * byte-stable for a byte-stable module.
 *
 * @param {!Array<!Wasm2Lang.Backend.TrapSite>} sites
 * @param {string} languageOut
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderTrapSiteTable = function (sites, languageOut) {
  var /** @const {!Array<string>} */ kindLines = [];
  var /** @const {!Array<string>} */ kindNames = Wasm2Lang.Backend.TRAP_KIND_NAMES;
  for (var /** @type {number} */ k = 1; k <= Wasm2Lang.Backend.TRAP_KIND_MAX; ++k) {
    kindLines.push('    "' + String(k) + '": ' + JSON.stringify(kindNames[k]));
  }
  var /** @const {!Array<string>} */ rowLines = [];
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = sites.length; i !== len; ++i) {
    var /** @const {!Wasm2Lang.Backend.TrapSite} */ site = sites[i];
    var /** @const {!Array<string>} */ fields = [];
    fields.push('"id": ' + String(site.id));
    fields.push('"kind": ' + String(site.kind));
    fields.push('"kindName": ' + JSON.stringify(Wasm2Lang.Backend.describeTrapKind(site.kind)));
    if (null === site.helper) {
      fields.push('"funcIndex": ' + String(site.funcIndex));
      if (null !== site.funcName) {
        fields.push('"funcName": ' + JSON.stringify(site.funcName));
      }
    } else {
      fields.push('"helper": ' + JSON.stringify(site.helper));
    }
    fields.push('"ordinal": ' + String(site.ordinal));
    rowLines.push('    {' + fields.join(', ') + '}');
  }
  return (
    '{\n' +
    '  "version": 1,\n' +
    '  "language": ' +
    JSON.stringify(languageOut) +
    ',\n' +
    '  "siteCount": ' +
    String(sites.length) +
    ',\n' +
    '  "kinds": {\n' +
    kindLines.join(',\n') +
    '\n  },\n' +
    '  "sites": [\n' +
    rowLines.join(',\n') +
    (0 === rowLines.length ? '' : '\n') +
    '  ]\n' +
    '}\n'
  );
};

/**
 * Unified helper emission path shared by all backends.  Each backend's local
 * {@code h(name, bindings, body)} closure delegates here so that the helper
 * name is routed through a single funnel.  Two modes:
 *
 *  - Collect mode ({@code helperNameCollector_} is non-null): records the
 *    helper name into the collector and returns.  Used by
 *    {@code getAllHelperNames_} to auto-derive the full set of emittable
 *    helpers without duplicating the list.
 *  - Emit mode (default): if {@code usedHelpers_[name]} is set, marks any
 *    declared bindings and appends {@code body} to {@code bucket}.
 *
 * @protected
 * @param {!Array<string>} bucket  Emission sink (ignored in collect mode).
 * @param {string} name  Helper function name (the key used for usage tracking).
 * @param {?Array<string>} bindings  Binding names to mark if this helper is
 *     emitted, or {@code null} for backends that do not track bindings.
 * @param {string} body  Fully-formed helper definition text.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitOrCollectHelper_ = function (bucket, name, bindings, body) {
  var /** @const {?Array<string>} */ collector = this.helperNameCollector_;
  if (collector) {
    collector.push(name);
    return;
  }
  if (!this.usedHelpers_ || !this.usedHelpers_[name]) return;
  if (bindings) {
    for (var /** @type {number} */ bi = 0, /** @const {number} */ bLen = bindings.length; bi !== bLen; ++bi) {
      this.markBinding_(bindings[bi]);
    }
  }
  bucket.push(body);
};

/**
 * Default helper emission — returns an empty array.  Concrete backends
 * override this to emit their runtime helper definitions.
 *
 * @protected
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitHelpers_ = function (
  scratchByteOffset,
  scratchWordIndex,
  scratchQwordIndex,
  heapPageCount
) {
  void scratchByteOffset;
  void scratchWordIndex;
  void scratchQwordIndex;
  void heapPageCount;
  return [];
};

// ---------------------------------------------------------------------------
// Expression category constants.
//
// Each emitted expression carries a category that tells consumers whether
// coercion has already been applied.  Consumers call coerceToType_ which
// skips redundant coercion when the category satisfies the target type.
//
// i32 categories (0-4) are defined in I32Coercion and reused here.
// ---------------------------------------------------------------------------

/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_VOID = -1;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_F32 = 5;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_F64 = 6;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_RAW = 7;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32 = 8;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_I64 = 9;
/** @const {number} */ Wasm2Lang.Backend.AbstractCodegen.CAT_V128 = 10;

/**
 * Shared type→category dispatch.  {@code catForCoercedType_} and
 * {@code catForConstType_} differ only in the i32 and fallback returns.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @param {number} i32Cat
 * @param {number} defaultCat
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.catForType_ = function (binaryen, wasmType, i32Cat, defaultCat) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) return i32Cat;
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) return Wasm2Lang.Backend.AbstractCodegen.CAT_F32;
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) return Wasm2Lang.Backend.AbstractCodegen.CAT_F64;
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) return Wasm2Lang.Backend.AbstractCodegen.CAT_I64;
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) return Wasm2Lang.Backend.AbstractCodegen.CAT_V128;
  return defaultCat;
};

/**
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.catForCoercedType_ = function (binaryen, wasmType) {
  return Wasm2Lang.Backend.AbstractCodegen.catForType_(
    binaryen,
    wasmType,
    Wasm2Lang.Backend.I32Coercion.SIGNED,
    Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
  );
};

/**
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.catForConstType_ = function (binaryen, wasmType) {
  return Wasm2Lang.Backend.AbstractCodegen.catForType_(
    binaryen,
    wasmType,
    Wasm2Lang.Backend.I32Coercion.FIXNUM,
    Wasm2Lang.Backend.AbstractCodegen.CAT_RAW
  );
};

/**
 * Returns the category for a "value-type read" — a bare local.get/global.get
 * expression or the result of select/if-as-expression.  Default delegates to
 * {@code catForCoercedType_} (i32 → SIGNED).  Asm.js overrides to return INT
 * for i32 so consumer sites can add {@code |0} coercions as needed.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.catForValueTypeRead_ = function (binaryen, wasmType) {
  return Wasm2Lang.Backend.AbstractCodegen.catForCoercedType_(binaryen, wasmType);
};

/**
 * Default metadata emission — returns the raw option string.  Concrete
 * backends override this to emit language-specific static-memory initialization.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitMetadata = function (wasmModule, options) {
  void wasmModule;
  return /** @type {string} */ (options.emitMetadata);
};
