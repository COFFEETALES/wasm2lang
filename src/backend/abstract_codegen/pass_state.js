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
 * @param {?Object<string, string>=} opt_exportNameMap  internalName →
 *     exportName, for the backends (java, csharp) that declare an exported
 *     function under its export name instead of its mangled internal name.
 *     Stored per emit so a stale map from a previous module cannot leak into
 *     {@code emittedFunctionSymbol_}.
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resetTrapSites_ = function (options, definedFunctions, opt_exportNameMap) {
  this.trapSitesEnabled_ = !!options.trapSites;
  // Read unconditionally rather than only when the flag is on: the only reader
  // is a renderer that the flag-off path never reaches, so gating it here would
  // add a branch that protects nothing and leave a stale value behind on a
  // codegen reused across emits.
  this.trapHostAbort_ = !!options.trapHostAbort;
  this.trapSiteCounter_ = 0;
  this.trapSiteOrdinals_ = /** @type {!Object<string, number>} */ (Object.create(null));
  this.trapExportNames_ = opt_exportNameMap || null;
  // `kind` mode leaves instrumentation on but allocates no ids: with no row
  // store, both allocators return -1, and -1 is what every renderer reads as
  // "emit the kind alone".  Keeping the mode in one place — the absence of the
  // array — means no renderer needs a second flag to consult.
  if (!this.trapSitesEnabled_ || false === options.trapSiteIds) {
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
 * When the assembled source is supplied, the rows whose text did not survive
 * emission are dropped first — see {@code selectLiveTrapSites_}.
 *
 * @protected
 * @param {string=} opt_emittedSource  The fully assembled module source.
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.publishTrapSites_ = function (opt_emittedSource) {
  var /** @const {?Array<!Wasm2Lang.Backend.TrapSite>} */ sites = this.trapSites_;
  if (sites && 'string' === typeof opt_emittedSource) {
    this.lastEmitTrapSites_ = this.selectLiveTrapSites_(sites, /** @type {string} */ (opt_emittedSource));
    this.lastEmitAllocatedTrapSiteCount_ = sites.length;
    return;
  }
  this.lastEmitTrapSites_ = sites;
  this.lastEmitAllocatedTrapSiteCount_ = sites ? sites.length : 0;
};

/**
 * Site-id capture pattern common to every backend whose abort is a native
 * {@code throw}: the payload rides the exception message, so the id is present
 * verbatim in the source.  Group 1 is the site id.
 *
 * @protected @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.TRAP_MESSAGE_SITE_PATTERN_ = 'w2l trap kind=\\d+ site=(\\d+)';

/**
 * Returns the patterns that locate a trap site that SURVIVED into the emitted
 * source.  Group 1 of each must capture the site id.
 *
 * The default covers javascript, java, csharp and php64, whose abort embeds
 * {@code w2l trap kind=<n> site=<n>} in the source.  asm.js has no message —
 * its abort is a helper call, and under {@code host-abort} it has no abort at
 * all — so {@code JsCommonCodegen} adds the hook-call form, which is
 * unambiguous because the trap binding's name (mangled or not) denotes nothing
 * else in the module.
 *
 * @protected
 * @return {!Array<!RegExp>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.trapSiteLivenessPatterns_ = function () {
  return [new RegExp(Wasm2Lang.Backend.AbstractCodegen.TRAP_MESSAGE_SITE_PATTERN_, 'g')];
};

/**
 * Drops the rows whose text never reached the output.
 *
 * Ids are handed out by the emission, but the emission is not the last word on
 * what ships.  Three paths discard text that was already rendered:
 * {@code effectiveReachableBlockChildCount_} trims block children past the
 * first terminal one (235 of the 244 dead ids on the reference module),
 * {@code emitOrCollectHelper_} discards a helper body nothing marked as used
 * (9), and {@code propagateTerminalChild_} drops effect-free operands after a
 * terminal sibling.  That left the table a 95 % superset — 257 rows for 13
 * reachable sites here, 918 for 54 on the consumer's build — an artifact
 * sixteen times larger than the information in it.
 *
 * Ids are NOT renumbered.  A site id is what the host receives at runtime, so
 * it has to keep meaning the same thing across this filter; the table simply
 * becomes sparse, and {@code allocatedSiteCount} in the artifact records how
 * many rows were dropped so the gaps are documented rather than mysterious.
 *
 * Detection is textual on purpose: it is the same ground truth a consumer can
 * reproduce with a grep over the artifact, and it is blind to WHY a site died,
 * so a future trimmer needs no change here.  A false negative costs function
 * attribution for one site — the host still receives its kind — which is the
 * benign direction to fail in.
 *
 * @protected
 * @param {!Array<!Wasm2Lang.Backend.TrapSite>} sites
 * @param {string} emittedSource
 * @return {!Array<!Wasm2Lang.Backend.TrapSite>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.selectLiveTrapSites_ = function (sites, emittedSource) {
  var /** @const {!Array<!RegExp>} */ patterns = this.trapSiteLivenessPatterns_();
  if (0 === patterns.length) return sites;

  var /** @const {!Object<string, boolean>} */ live = /** @type {!Object<string, boolean>} */ (Object.create(null));
  for (var /** @type {number} */ p = 0, /** @const {number} */ pLen = patterns.length; p !== pLen; ++p) {
    var /** @const {!RegExp} */ pattern = patterns[p];
    pattern.lastIndex = 0;
    for (var /** @type {?RegExpResult} */ match = pattern.exec(emittedSource); match; match = pattern.exec(emittedSource)) {
      live[match[1]] = true;
    }
  }

  var /** @const {!Array<!Wasm2Lang.Backend.TrapSite>} */ kept = [];
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = sites.length; i !== len; ++i) {
    if (String(sites[i].id) in live) kept.push(sites[i]);
  }
  return kept;
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
 * Returns how many site ids the most recent emission allocated.  Larger than
 * {@code getTrapSites().length} whenever dead rows were filtered out; the
 * difference is what the artifact reports so the id gaps are documented.
 *
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getAllocatedTrapSiteCount = function () {
  return this.lastEmitAllocatedTrapSiteCount_;
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
 * Returns the identifier a defined function is DECLARED UNDER in the emitted
 * source, so the site table can be joined to a host stack trace.
 *
 * The default is the jscommon / java-non-exported form
 * {@code n_(safeName_(name))}, which resolves to the mangled token when
 * {@code --mangler} is active because {@code n_} consults the same mangler the
 * emitter does.  Backends whose declaration site differs override this:
 * java/csharp use the export name for exported functions, php64 declares a
 * closure variable.
 *
 * Only ever called from the allocators below, i.e. never when
 * {@code --trap-sites} is off — the flag-off byte-identity contract does not
 * depend on this method being cheap or even correct.  {@code mangler_.mn} is a
 * pure lookup that falls back to the original name, so calling it here cannot
 * register a key and therefore cannot shift any other mangled name.
 *
 * @protected
 * @param {?BinaryenFunctionInfo} functionInfo
 * @return {?string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emittedFunctionSymbol_ = function (functionInfo) {
  if (!functionInfo || '' === functionInfo.name) return null;
  var /** @const {?Object<string, string>} */ exportNames = this.trapExportNames_;
  if (exportNames && functionInfo.name in exportNames) {
    // java/csharp declare an exported function under its public export name,
    // unmangled — that is the symbol a stack frame shows.
    return this.safeName_(exportNames[functionInfo.name]);
  }
  return this.n_(this.safeName_(functionInfo.name));
};

/**
 * Returns the identifier a runtime helper is declared under in the emitted
 * source.  Helpers are registered in the mangler roster under their own name,
 * so {@code n_} is the whole answer on every backend that declares them as
 * functions; php64 overrides it because helpers there are closure variables.
 *
 * @protected
 * @param {string} helperName
 * @return {?string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emittedHelperSymbol_ = function (helperName) {
  return this.n_(helperName);
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
    symbol: this.emittedFunctionSymbol_(functionInfo),
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
    symbol: this.emittedHelperSymbol_(helperName),
    helper: helperName,
    ordinal: this.nextTrapOrdinal_('\0helper\0' + helperName)
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
 * A negative {@code siteId} means {@code --trap-sites=kind}: no ids were
 * allocated, so the {@code site=} half is omitted rather than reporting a
 * fabricated {@code -1} that no table would resolve.
 *
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.trapMessage_ = function (kind, siteId) {
  if (0 > siteId) return 'w2l trap kind=' + String(kind);
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
 * Format version 2 differs from 1 in two ways, both driven by what a consumer
 * actually needed after adopting the feature: every row can now carry
 * {@code symbol}, the identifier the container is declared under in the emitted
 * source (which is what joins a stack frame to a row, and the only thing that
 * still works under {@code --mangler}); and rows whose text did not survive
 * emission are no longer written, with {@code allocatedSiteCount} recording how
 * many ids were handed out so the resulting gaps in {@code id} are explicit.
 * Lookup by id is unchanged, so a v1 reader that indexes {@code sites} by
 * {@code id} keeps working.
 *
 * @param {!Array<!Wasm2Lang.Backend.TrapSite>} sites
 * @param {string} languageOut
 * @param {number=} opt_allocatedSiteCount  Ids allocated before filtering;
 *     defaults to the row count for callers that do not filter.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderTrapSiteTable = function (sites, languageOut, opt_allocatedSiteCount) {
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
    if (null !== site.symbol) {
      fields.push('"symbol": ' + JSON.stringify(site.symbol));
    }
    fields.push('"ordinal": ' + String(site.ordinal));
    rowLines.push('    {' + fields.join(', ') + '}');
  }
  var /** @const {number} */ allocatedCount =
      'number' === typeof opt_allocatedSiteCount ? /** @type {number} */ (opt_allocatedSiteCount) : sites.length;
  return (
    '{\n' +
    '  "version": 2,\n' +
    '  "language": ' +
    JSON.stringify(languageOut) +
    ',\n' +
    '  "siteCount": ' +
    String(sites.length) +
    ',\n' +
    '  "allocatedSiteCount": ' +
    String(allocatedCount) +
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
 * Emits the eager-select helper family for the class-shaped backends.  Java
 * and C# spell the body identically — a ternary on the condition operand —
 * so the only per-language input is the list of (wasm suffix, target type)
 * pairs.  The list is walked in order and each entry reaches
 * {@code emitOrCollectHelper_} exactly where the unrolled calls used to:
 * {@code precomputeMangledNames_} assigns encoder slots positionally over the
 * roster this collect pass produces, so reordering the list would rename
 * every identifier registered after it.
 *
 * @protected
 * @param {function(string, string): void} emitHelper  The backend's local
 *     {@code h(name, body)} closure.
 * @param {!Array<string>} suffixAndType  Flat {@code [suffix, targetType, …]}.
 * @param {string} pad1
 * @param {string} pad2
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSelectHelperFamily_ = function (emitHelper, suffixAndType, pad1, pad2) {
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  for (var /** @type {number} */ i = 0, /** @const {number} */ len = suffixAndType.length; i !== len; i += 2) {
    var /** @const {string} */ helperName = '$w2l_select_' + suffixAndType[i];
    var /** @const {string} */ t = suffixAndType[i + 1];
    emitHelper(
      helperName,
      pad1 +
        'static ' +
        t +
        ' ' +
        this.n_(helperName) +
        '(' +
        t +
        ' ' +
        l0 +
        ', ' +
        t +
        ' ' +
        l1 +
        ', int ' +
        l2 +
        ') {\n' +
        pad2 +
        'return ' +
        l2 +
        ' != 0 ? ' +
        l0 +
        ' : ' +
        l1 +
        ';\n' +
        pad1 +
        '}'
    );
  }
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
  return /** @type {string} */ (options.emitMetadata);
};
