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
    binaryen.getExpressionInfo(nodeCtx.expressionPointer)
  );
  return Wasm2Lang.Wasm.Tree.CustomPasses.applyMarkerRenaming_(marker, targetSet, exclusionSet, binaryen, module, expr);
};

/**
 * Applies label-prefix renaming to BreakId, SwitchId, and BlockId nodes
 * whose label is in the target set (and not in the optional exclusion set).
 * Returns a REPLACE_NODE decision if renaming was applied, null otherwise.
 *
 * This is the shared rename infrastructure for marker-based passes (sw$, lb$,
 * rs$) that detect a pattern in enter_, build a set of affected labels, then
 * rename matching labels in leave_.
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
  var /** @const {number} */ id = expr.id;
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  if (id === binaryen.BreakId) {
    var /** @const {?string} */ breakName = /** @type {?string} */ (expr.name);
    if (breakName && breakName in targetSet && (!exclusionSet || !(breakName in exclusionSet))) {
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.break(
          marker + breakName,
          /** @type {number} */ (expr.condition || 0),
          /** @type {number} */ (expr.value || 0)
        )
      };
    }
  }

  if (id === binaryen.SwitchId) {
    var /** @const {!Array<string>} */ names = /** @type {!Array<string>} */ ((expr.names || []).slice(0));
    var /** @const {number} */ nameCount = names.length;
    var /** @type {boolean} */ hasChanges = false;
    var /** @type {number} */ i = 0;

    for (i = 0; i !== nameCount; ++i) {
      if (names[i] in targetSet && (!exclusionSet || !(names[i] in exclusionSet))) {
        names[i] = marker + names[i];
        hasChanges = true;
      }
    }

    var /** @const {string} */ defaultName = /** @type {string} */ (expr.defaultName || '');
    var /** @type {string} */ newDefault = defaultName;
    if ('' !== defaultName && defaultName in targetSet && (!exclusionSet || !(defaultName in exclusionSet))) {
      newDefault = marker + defaultName;
      hasChanges = true;
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

  if (id === binaryen.BlockId) {
    var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
    if (blockName && blockName in targetSet && (!exclusionSet || !(blockName in exclusionSet))) {
      return {
        decisionAction: REPLACE_NODE,
        expressionPointer: module.block(
          marker + blockName,
          /** @type {!Array<number>} */ ((expr.children || []).slice(0)),
          expr.type
        )
      };
    }
  }

  return null;
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
  for (var /** number */ i = 0, /** @const {number} */ keyLen = keys.length; i < keyLen; ++i) {
    out[keys[i]] = projectFn(raw[keys[i]]);
  }
  return out;
};
