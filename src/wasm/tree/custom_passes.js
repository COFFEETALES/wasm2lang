'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses = {};

/**
 * Initializes the common metadata fields shared by every pass object.
 *
 * @param {!Wasm2Lang.Wasm.Tree.Pass} target
 * @param {string} passName
 * @param {string} phase
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.initializePass = function (target, passName, phase) {
  target.passName = passName;
  target.phase = phase;
  target.validateModule = void 0;
  target.onFunctionEnter = void 0;
  target.onFunctionLeave = void 0;
};

/**
 * Creates a traversal visitor with only an enter callback.
 *
 * @param {!Object} target
 * @param {!Function} enterFn
 * @param {*} enterState
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor = function (target, enterFn, enterState) {
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: enterFn.bind(target, enterState)
  });
};

/**
 * Creates a traversal visitor with enter and leave callbacks, binding both to
 * the pass instance and a per-function state object.
 *
 * @param {!Object} target
 * @param {!Function} enterFn
 * @param {!Function} leaveFn
 * @param {*} state
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.createEnterLeaveVisitor = function (target, enterFn, leaveFn, state) {
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: enterFn.bind(target, state),
    leave: leaveFn.bind(target, state)
  });
};

/**
 * Convenience wrapper that extracts binaryen/module/expr from a traversal
 * node context and delegates to {@code applyMarkerRenaming_}.  Used by
 * leave_ callbacks that only need marker renaming (no additional logic).
 *
 * @param {string} marker
 * @param {!Object<string, boolean>} targetSet
 * @param {?Object<string, boolean>} exclusionSet
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.applyLeaveRenaming_ = function (marker, targetSet, exclusionSet, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  // prettier-ignore
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  // prettier-ignore
  var /** @const {!BinaryenExpressionInfo} */ expr = /** @type {!BinaryenExpressionInfo} */ (
    Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen,nodeCtx.expressionPointer)
  );
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyMarkerRenaming_(marker, targetSet, exclusionSet, binaryen, module, expr);
};

/**
 * Applies dynamic label-prefix renaming to BreakId, SwitchId, and BlockId
 * nodes.  For each candidate name, {@code resolveMarker} is called; a
 * non-null return value is prepended to the original name.
 *
 * @param {function(string): ?string} resolveMarker
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} module
 * @param {!BinaryenExpressionInfo} expr
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.applyMappedRenaming_ = function (resolveMarker, binaryen, module, expr) {
  var /** @const {number} */ id = expr.id;
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  if (binaryen.BreakId === id) {
    var /** @const {?string} */ breakName = /** @type {?string} */ (expr.name);
    var /** @const {?string} */ breakMarker = breakName ? resolveMarker(breakName) : null;
    if (breakMarker) {
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.break(
          breakMarker + breakName,
          /** @type {number} */ (expr.condition || 0),
          /** @type {number} */ (expr.value || 0)
        )
      };
    }
  }

  if (binaryen.SwitchId === id) {
    var /** @const {!Array<string>} */ names = /** @type {!Array<string>} */ ((expr.names || []).slice(0));
    var /** @const {number} */ nameCount = names.length;
    var /** @type {boolean} */ hasChanges = false;
    var /** @type {number} */ i = 0;

    for (i = 0; i !== nameCount; ++i) {
      var /** @const {?string} */ nameMarker = resolveMarker(names[i]);
      if (nameMarker) {
        names[i] = nameMarker + names[i];
        hasChanges = true;
      }
    }

    var /** @const {string} */ defaultName = /** @type {string} */ (expr.defaultName || '');
    var /** @type {string} */ newDefault = defaultName;
    if ('' !== defaultName) {
      var /** @const {?string} */ defMarker = resolveMarker(defaultName);
      if (defMarker) {
        newDefault = defMarker + defaultName;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.switch(
          names,
          newDefault,
          /** @type {number} */ (expr.condition || 0),
          /** @type {number} */ (expr.value || 0)
        )
      };
    }
  }

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
    var /** @const {?string} */ blockMarker = blockName ? resolveMarker(blockName) : null;
    if (blockMarker) {
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.block(
          blockMarker + blockName,
          /** @type {!Array<number>} */ ((expr.children || []).slice(0)),
          expr.type
        )
      };
    }
  }

  return null;
};

/**
 * Applies label-prefix renaming to BreakId, SwitchId, and BlockId nodes
 * whose label is in the target set (and not in the optional exclusion set).
 * Delegates to {@code applyMappedRenaming_} with a static-marker resolver.
 *
 * @param {string} marker
 * @param {!Object<string, boolean>} targetSet
 * @param {?Object<string, boolean>} exclusionSet
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} module
 * @param {!BinaryenExpressionInfo} expr
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.applyMarkerRenaming_ = function (marker, targetSet, exclusionSet, binaryen, module, expr) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyMappedRenaming_(
    /** @param {string} name @return {?string} */ function (name) {
      return name in targetSet && (!exclusionSet || !(name in exclusionSet)) ? marker : null;
    },
    binaryen,
    module,
    expr
  );
};

// ---------------------------------------------------------------------------
// Pass analysis descriptor registry
// ---------------------------------------------------------------------------

/**
 * Describes how to extract and optionally serialize a single pass family's
 * metadata from a PassMetadata object into an external-safe (quoted-key) form.
 *
 * Each pass family self-registers a descriptor so that the generic analysis
 * function can iterate all registered families without pass-specific knowledge.
 *
 * @typedef {{
 *   externalKey: string,
 *   extract: function(!Wasm2Lang.Wasm.Tree.PassMetadata):*,
 *   serialize: ?function(!Object):!Object
 * }}
 */
Wasm2Lang.Wasm.Tree.PassAnalysisDescriptor;

/**
 * @private
 * @type {!Array<!Wasm2Lang.Wasm.Tree.PassAnalysisDescriptor>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.analysisDescriptors_ = [];

/**
 * Registers a pass analysis descriptor.
 *
 * @param {!Wasm2Lang.Wasm.Tree.PassAnalysisDescriptor} descriptor
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.registerAnalysisDescriptor = function (descriptor) {
  Wasm2Lang.Wasm.Tree.CustomPasses.analysisDescriptors_[Wasm2Lang.Wasm.Tree.CustomPasses.analysisDescriptors_.length] =
    descriptor;
};

/**
 * Registers a descriptor from an explicit PassMetadata extractor.
 *
 * @param {string} externalKey
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @param {?function(!Object):!Object=} opt_serialize
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor = function (externalKey, extractFn, opt_serialize) {
  Wasm2Lang.Wasm.Tree.CustomPasses.registerAnalysisDescriptor(
    /** @type {!Wasm2Lang.Wasm.Tree.PassAnalysisDescriptor} */ ({
      externalKey: externalKey,
      extract: extractFn,
      serialize: opt_serialize || null
    })
  );
};

/**
 * Shorthand: registers a field analysis descriptor whose serializer projects
 * each plan in a per-name plan map using {@code projectFn}.  Bundles the
 * {@code registerFieldAnalysisDescriptor + serializeProjectedPlanMap} pattern
 * shared by multiple apply files.
 *
 * @param {string} externalKey
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @param {function(*):!Object} projectFn
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.registerProjectedPlanAnalysis_ = function (externalKey, extractFn, projectFn) {
  Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
    externalKey,
    extractFn,
    /** @param {!Object} raw @return {!Object} */ function (raw) {
      return Wasm2Lang.Wasm.Tree.CustomPasses.serializeProjectedPlanMap(raw, projectFn);
    }
  );
};

/**
 * Returns one extracted PassMetadata value for a function, or null when absent.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @return {*}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.getFunctionMetadataValue = function (passRunResultIndex, funcName, extractFn) {
  var /** @const {?Wasm2Lang.Wasm.Tree.PassMetadata} */ fm = passRunResultIndex ? passRunResultIndex[funcName] || null : null;
  return fm ? extractFn(fm) : null;
};

/**
 * Returns a named entry from a per-function metadata map, or null.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @param {string} name
 * @return {*}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry = function (passRunResultIndex, funcName, extractFn, name) {
  var /** @const {*} */ values = Wasm2Lang.Wasm.Tree.CustomPasses.getFunctionMetadataValue(
      passRunResultIndex,
      funcName,
      extractFn
    );
  if (!values) {
    return null;
  }
  var /** @const {!Object} */ valueObject = /** @type {!Object} */ (values);
  var /** @const {*} */ entry = valueObject[name];
  return entry || null;
};

/**
 * Returns true when a named boolean flag exists in a per-function metadata map.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.hasNamedMetadataFlag = function (passRunResultIndex, funcName, extractFn, name) {
  var /** @const {*} */ values = Wasm2Lang.Wasm.Tree.CustomPasses.getFunctionMetadataValue(
      passRunResultIndex,
      funcName,
      extractFn
    );
  return !!values && true === /** @type {!Object} */ (values)[name];
};

/**
 * Serializes a map of plans by projecting one property from each value.
 *
 * @param {!Object} raw
 * @param {function(*):!Object} projectFn
 * @return {!Object}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.serializeProjectedPlanMap = function (raw, projectFn) {
  var /** @const {!Object} */ out = Object.create(null);
  var /** @const {!Array<string>} */ keys = Object.keys(raw);
  for (var /** @type {number} */ i = 0, /** @const {number} */ keyLen = keys.length; i < keyLen; ++i) {
    out[keys[i]] = projectFn(raw[keys[i]]);
  }
  return out;
};

/**
 * Registers an analysis descriptor for a per-block plan-map field and
 * returns a named-entry accessor {@code fn(index, funcName, name) -> plan|null}.
 * When {@code opt_projectFn} is supplied, the descriptor serializes each plan
 * via that projector; otherwise the raw plan map is kept as-is.
 *
 * @param {string} externalKey
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @param {(function(*):!Object)=} opt_projectFn
 * @return {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string, string):*}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedPlanAccessor_ = function (externalKey, extractFn, opt_projectFn) {
  if (opt_projectFn) {
    Wasm2Lang.Wasm.Tree.CustomPasses.registerProjectedPlanAnalysis_(externalKey, extractFn, opt_projectFn);
  } else {
    Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(externalKey, extractFn);
  }
  return /** @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} idx @param {string} fn @param {string} name @return {*} */ function (
    idx,
    fn,
    name
  ) {
    return Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(idx, fn, extractFn, name);
  };
};

/**
 * Registers an analysis descriptor for a per-block boolean-flag map field and
 * returns a named-entry accessor {@code fn(index, funcName, name) -> boolean}.
 *
 * @param {string} externalKey
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @return {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string, string):boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedFlagAccessor_ = function (externalKey, extractFn) {
  Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(externalKey, extractFn);
  return /** @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} idx @param {string} fn @param {string} name @return {boolean} */ function (
    idx,
    fn,
    name
  ) {
    return Wasm2Lang.Wasm.Tree.CustomPasses.hasNamedMetadataFlag(idx, fn, extractFn, name);
  };
};

/**
 * Registers an analysis descriptor for a whole-function metadata field and
 * returns an accessor {@code fn(index, funcName) -> value|null}.
 *
 * @param {string} externalKey
 * @param {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} extractFn
 * @return {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string):*}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.declareFunctionFieldAccessor_ = function (externalKey, extractFn) {
  Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(externalKey, extractFn);
  return /** @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} idx @param {string} fn @return {*} */ function (
    idx,
    fn
  ) {
    return Wasm2Lang.Wasm.Tree.CustomPasses.getFunctionMetadataValue(idx, fn, extractFn);
  };
};

// ---------------------------------------------------------------------------
// Shared subtree reference checker
// ---------------------------------------------------------------------------

/**
 * Recursively checks whether any BreakId or SwitchId in the subtree
 * targets the given label name.  Shared across multiple passes.
 *
 * @param {!Binaryen} binaryen
 * @param {number} ptr
 * @param {string} targetName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.hasReference = function (binaryen, ptr, targetName) {
  if (!ptr) {
    return false;
  }
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ptr)
    );
  var /** @const {number} */ id = info.id;
  if (binaryen.BreakId === id) {
    return /** @type {?string} */ (info.name) === targetName;
  }
  if (binaryen.SwitchId === id) {
    var /** @const {!Array<string>} */ sn = /** @type {!Array<string>} */ (info.names || []);
    for (var /** @type {number} */ si = 0, /** @const {number} */ snLen = sn.length; si < snLen; ++si) {
      if (sn[si] === targetName) return true;
    }
    return /** @type {string} */ (info.defaultName || '') === targetName;
  }
  var /** @const {function(!Binaryen, number, string): boolean} */ check = Wasm2Lang.Wasm.Tree.CustomPasses.hasReference;
  if (binaryen.BlockId === id) {
    var /** @const {!Array<number>|undefined} */ ch = /** @type {!Array<number>|undefined} */ (info.children);
    if (ch) {
      for (var /** @type {number} */ ci = 0, /** @const {number} */ cLen = ch.length; ci < cLen; ++ci) {
        if (check(binaryen, ch[ci], targetName)) return true;
      }
    }
    return false;
  }
  if (binaryen.LoopId === id) {
    return check(binaryen, /** @type {number} */ (info.body || 0), targetName);
  }
  if (binaryen.IfId === id) {
    return (
      check(binaryen, /** @type {number} */ (info.ifTrue || 0), targetName) ||
      check(binaryen, /** @type {number} */ (info.ifFalse || 0), targetName)
    );
  }
  if (binaryen.DropId === id || binaryen.ReturnId === id || binaryen.LocalSetId === id || binaryen.GlobalSetId === id) {
    return check(binaryen, /** @type {number} */ (info.value || 0), targetName);
  }
  return false;
};

// ---------------------------------------------------------------------------
// Shared terminator recognition
// ---------------------------------------------------------------------------

/**
 * Returns true when the given expression is an unconditional terminator —
 * an unconditional Break, a Return, or an Unreachable.  A block ending in
 * such an expression cannot fall through to the next sibling, so no
 * additional synthetic break is needed after it.
 *
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} info
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.isUnconditionalTerminator = function (binaryen, info) {
  var /** @const {number} */ id = info.id;
  if (binaryen.ReturnId === id || binaryen.UnreachableId === id) {
    return true;
  }
  return binaryen.BreakId === id && 0 === /** @type {number} */ (info.condition || 0);
};

// ---------------------------------------------------------------------------
// Shared condition inversion
// ---------------------------------------------------------------------------

/**
 * Lazily-built lookup from binaryen comparison op code to the api+method pair
 * that produces the logical inverse.  Shared across both i32 and i64 widths.
 *
 * @private @type {?Object<number, !Array<string>>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.cmpInversionTable_ = null;

/**
 * Builds the comparison-inversion lookup.  Each row lists a mutually-inverse
 * pair as {@code [opA, opB, api, methodForA, methodForB]}: opA's inverse is
 * {@code api[methodForA]}, opB's inverse is {@code api[methodForB]}.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @return {!Object<number, !Array<string>>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.buildCmpInversionTable_ = function (binaryen) {
  var /** @const {!Array<!Array<string>>} */ rows = [
      ['EqInt32', 'NeInt32', 'i32', 'ne', 'eq'],
      ['LtSInt32', 'GeSInt32', 'i32', 'ge_s', 'lt_s'],
      ['GtSInt32', 'LeSInt32', 'i32', 'le_s', 'gt_s'],
      ['LtUInt32', 'GeUInt32', 'i32', 'ge_u', 'lt_u'],
      ['GtUInt32', 'LeUInt32', 'i32', 'le_u', 'gt_u'],
      ['EqInt64', 'NeInt64', 'i64', 'ne', 'eq'],
      ['LtSInt64', 'GeSInt64', 'i64', 'ge_s', 'lt_s'],
      ['GtSInt64', 'LeSInt64', 'i64', 'le_s', 'gt_s'],
      ['LtUInt64', 'GeUInt64', 'i64', 'ge_u', 'lt_u'],
      ['GtUInt64', 'LeUInt64', 'i64', 'le_u', 'gt_u']
    ];
  var /** @const {!Object<number, !Array<string>>} */ t = /** @type {!Object<number, !Array<string>>} */ (Object.create(null));
  for (var /** @type {number} */ i = 0, /** @const {number} */ rLen = rows.length; i < rLen; ++i) {
    var /** @const {!Array<string>} */ r = rows[i];
    t[binaryen[r[0]]] = [r[2], r[3]];
    t[binaryen[r[1]]] = [r[2], r[4]];
  }
  return t;
};

/**
 * Inverts a condition expression at the binaryen IR level.
 *
 * - Comparisons are complemented (lt_s -> ge_s, eq -> ne, etc.)
 * - eqz(x) unwraps to x (avoids double negation)
 * - Anything else gets wrapped in i32.eqz
 *
 * Shared across multiple passes and backend emitters.
 *
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} module
 * @param {number} condPtr
 * @return {number}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.invertCondition = function (binaryen, module, condPtr) {
  var /** @const {!BinaryenExpressionInfo} */ info = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, condPtr)
    );
  if (binaryen.BinaryId === info.id) {
    var /** @const {!Object<number, !Array<string>>} */ table =
        Wasm2Lang.Wasm.Tree.CustomPasses.cmpInversionTable_ ||
        (Wasm2Lang.Wasm.Tree.CustomPasses.cmpInversionTable_ =
          Wasm2Lang.Wasm.Tree.CustomPasses.buildCmpInversionTable_(binaryen));
    var /** @const {!Array<string>|undefined} */ entry = table[/** @type {number} */ (info.op)];
    if (entry) {
      var /** @const {function(number, number): number} */ fn = /** @type {function(number, number): number} */ (
          module[entry[0]][entry[1]]
        );
      return fn(/** @type {number} */ (info.left), /** @type {number} */ (info.right));
    }
  }
  if (binaryen.UnaryId === info.id && /** @type {number} */ (info.op) === binaryen.EqZInt32) {
    return /** @type {number} */ (info.value);
  }
  return module.i32.eqz(condPtr);
};
