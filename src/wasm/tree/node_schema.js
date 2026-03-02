'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.NodeSchema = {};

/**
 * @enum {string}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind = {
  SINGLE: 'single',
  LIST: 'list'
};

/**
 * @private
 * @const {!Wasm2Lang.Wasm.Tree.ExpressionEdgeSpecMap}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_ = Object.create(null);

/**
 * @private
 * @type {boolean}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.defaultSchemaInitialized_ = false;

/**
 * @private
 * @param {number} expressionId
 * @param {!Wasm2Lang.Wasm.Tree.EdgeSpecList} edgeSpecs
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.registerEdgeSpecs_ = function (expressionId, edgeSpecs) {
  // prettier-ignore
  Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_[expressionId] = /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ (
    edgeSpecs.slice(0)
  );
};

/**
 * @private
 * @param {!Binaryen=} opt_binaryen  Injected binaryen instance. Falls back to
 *     Processor.getBinaryen() when omitted.
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.ensureDefaultSchema_ = function (opt_binaryen) {
  if (Wasm2Lang.Wasm.Tree.NodeSchema.defaultSchemaInitialized_) {
    return;
  }

  var /** @const {!Binaryen} */ binaryen = opt_binaryen || Wasm2Lang.Processor.getBinaryen();
  var edgeKind = Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind;
  var register = Wasm2Lang.Wasm.Tree.NodeSchema.registerEdgeSpecs_;

  register(binaryen.BlockId, [
    {edgePropertyName: 'children', edgeTraversalKind: edgeKind.LIST,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { binaryen.Block.setChildAt(p, i, c); }}
  ]);
  register(binaryen.IfId, [
    {edgePropertyName: 'condition', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.If.setCondition(p, c); }},
    {edgePropertyName: 'ifTrue', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.If.setIfTrue(p, c); }},
    {edgePropertyName: 'ifFalse', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.If.setIfFalse(p, c); }}
  ]);
  register(binaryen.LoopId, [
    {edgePropertyName: 'body', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Loop.setBody(p, c); }}
  ]);
  register(binaryen.BreakId, [
    {edgePropertyName: 'condition', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Break.setCondition(p, c); }},
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Break.setValue(p, c); }}
  ]);
  register(binaryen.SwitchId, [
    {edgePropertyName: 'condition', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Switch.setCondition(p, c); }},
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Switch.setValue(p, c); }}
  ]);
  register(binaryen.LocalSetId, [
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.LocalSet.setValue(p, c); }}
  ]);
  register(binaryen.GlobalSetId, [
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.GlobalSet.setValue(p, c); }}
  ]);
  register(binaryen.UnaryId, [
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Unary.setValue(p, c); }}
  ]);
  register(binaryen.BinaryId, [
    {edgePropertyName: 'left', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Binary.setLeft(p, c); }},
    {edgePropertyName: 'right', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Binary.setRight(p, c); }}
  ]);
  register(binaryen.CallId, [
    {edgePropertyName: 'operands', edgeTraversalKind: edgeKind.LIST,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { binaryen.Call.setOperandAt(p, i, c); }}
  ]);
  register(binaryen.CallIndirectId, [
    {edgePropertyName: 'target', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.CallIndirect.setTarget(p, c); }},
    {edgePropertyName: 'operands', edgeTraversalKind: edgeKind.LIST,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { binaryen.CallIndirect.setOperandAt(p, i, c); }}
  ]);
  register(binaryen.LoadId, [
    {edgePropertyName: 'ptr', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Load.setPtr(p, c); }}
  ]);
  register(binaryen.StoreId, [
    {edgePropertyName: 'ptr', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Store.setPtr(p, c); }},
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Store.setValue(p, c); }}
  ]);
  register(binaryen.ReturnId, [
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Return.setValue(p, c); }}
  ]);
  register(binaryen.DropId, [
    {edgePropertyName: 'value', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Drop.setValue(p, c); }}
  ]);
  register(binaryen.SelectId, [
    {edgePropertyName: 'condition', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Select.setCondition(p, c); }},
    {edgePropertyName: 'ifTrue', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Select.setIfTrue(p, c); }},
    {edgePropertyName: 'ifFalse', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.Select.setIfFalse(p, c); }}
  ]);
  register(binaryen.MemoryGrowId, [
    {edgePropertyName: 'delta', edgeTraversalKind: edgeKind.SINGLE,
      setter: /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) { void i; binaryen.MemoryGrow.setDelta(p, c); }}
  ]);

  // Leaf nodes: no expression-pointer children.
  register(binaryen.NopId, []);
  register(binaryen.UnreachableId, []);
  register(binaryen.ConstId, []);
  register(binaryen.LocalGetId, []);
  register(binaryen.GlobalGetId, []);
  register(binaryen.MemorySizeId, []);

  Wasm2Lang.Wasm.Tree.NodeSchema.defaultSchemaInitialized_ = true;
};

/**
 * @param {number} expressionId
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.supportsExpressionId = function (expressionId) {
  Wasm2Lang.Wasm.Tree.NodeSchema.ensureDefaultSchema_();
  return Object.prototype.hasOwnProperty.call(Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_, expressionId);
};

/**
 * @param {number} expressionId
 * @return {!Wasm2Lang.Wasm.Tree.EdgeSpecList}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.getEdgeSpecs = function (expressionId) {
  if (!Wasm2Lang.Wasm.Tree.NodeSchema.supportsExpressionId(expressionId)) {
    throw new Error(
      'Wasm2Lang NodeSchema: unsupported expression ID ' +
        expressionId +
        '. Register this type in NodeSchema.ensureDefaultSchema_ or file a bug.'
    );
  }
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ (
    Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_[expressionId]
  );
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.ExpressionInfo} expressionInfo
 * @return {!Wasm2Lang.Wasm.Tree.ChildEdgeList}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.iterChildren = function (expressionInfo) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = expressionInfo;
  var /** @const {!Object<string, *>} */ expressionMap = /** @type {!Object<string, *>} */ (expression);
  var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ specs = Wasm2Lang.Wasm.Tree.NodeSchema.getEdgeSpecs(expression.id);
  var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdgeList} */ children = [];

  for (var /** number */ i = 0, /** @const {number} */ edgeCount = specs.length; i !== edgeCount; ++i) {
    var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpec} */ edgeSpec = specs[i];
    var /** @const {function(number, number, number): void} */ setter =
        /** @type {function(number, number, number): void} */ (edgeSpec.setter);
    if (Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.LIST === edgeSpec.edgeTraversalKind) {
      // prettier-ignore
      var /** @const {!Array<number>} */ childList =
        /** @const {!Array<number>} */ (expressionMap[edgeSpec.edgePropertyName] || []);
      for (var /** number */ j = 0, /** @const {number} */ childCount = childList.length; j !== childCount; ++j) {
        var /** @const {number} */ listPtr = /** @type {number} */ (childList[j] || 0);
        if (0 === listPtr) {
          continue;
        }
        // prettier-ignore
        var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ listChildEdge =
          /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ (
            [edgeSpec.edgePropertyName, j, edgeSpec.edgeTraversalKind, listPtr, setter]
          );
        children[children.length] = listChildEdge;
      }
      continue;
    }

    var /** @const {number} */ childPtr = /** @type {number} */ (expressionMap[edgeSpec.edgePropertyName] || 0);
    if (0 === childPtr) {
      continue;
    }
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ childEdge =
      /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ (
        [edgeSpec.edgePropertyName, -1, edgeSpec.edgeTraversalKind, childPtr, setter]
      );
    children[children.length] = childEdge;
  }

  return children;
};
