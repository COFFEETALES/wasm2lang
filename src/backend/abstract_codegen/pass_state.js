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
    collector[collector.length] = name;
    return;
  }
  if (!this.usedHelpers_ || !this.usedHelpers_[name]) return;
  if (bindings) {
    for (var /** @type {number} */ bi = 0, /** @const {number} */ bLen = bindings.length; bi !== bLen; ++bi) {
      this.markBinding_(bindings[bi]);
    }
  }
  bucket[bucket.length] = body;
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
