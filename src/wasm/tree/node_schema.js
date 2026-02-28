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
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.ensureDefaultSchema_ = function () {
  if (Wasm2Lang.Wasm.Tree.NodeSchema.defaultSchemaInitialized_) {
    return;
  }

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var edgeKind = Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind;
  var register = Wasm2Lang.Wasm.Tree.NodeSchema.registerEdgeSpecs_;

  register(binaryen.BlockId, [{key: 'children', kind: edgeKind.LIST}]);
  register(binaryen.IfId, [
    {key: 'condition', kind: edgeKind.SINGLE},
    {key: 'ifTrue', kind: edgeKind.SINGLE},
    {key: 'ifFalse', kind: edgeKind.SINGLE}
  ]);
  register(binaryen.LoopId, [{key: 'body', kind: edgeKind.SINGLE}]);
  register(binaryen.BreakId, [
    {key: 'condition', kind: edgeKind.SINGLE},
    {key: 'value', kind: edgeKind.SINGLE}
  ]);
  register(binaryen.SwitchId, [
    {key: 'condition', kind: edgeKind.SINGLE},
    {key: 'value', kind: edgeKind.SINGLE}
  ]);
  register(binaryen.LocalSetId, [{key: 'value', kind: edgeKind.SINGLE}]);
  register(binaryen.GlobalSetId, [{key: 'value', kind: edgeKind.SINGLE}]);
  register(binaryen.UnaryId, [{key: 'value', kind: edgeKind.SINGLE}]);
  register(binaryen.BinaryId, [
    {key: 'left', kind: edgeKind.SINGLE},
    {key: 'right', kind: edgeKind.SINGLE}
  ]);
  register(binaryen.CallId, [{key: 'operands', kind: edgeKind.LIST}]);
  register(binaryen.CallIndirectId, [
    {key: 'target', kind: edgeKind.SINGLE},
    {key: 'operands', kind: edgeKind.LIST}
  ]);
  register(binaryen.LoadId, [{key: 'ptr', kind: edgeKind.SINGLE}]);
  register(binaryen.StoreId, [
    {key: 'ptr', kind: edgeKind.SINGLE},
    {key: 'value', kind: edgeKind.SINGLE}
  ]);
  register(binaryen.ReturnId, [{key: 'value', kind: edgeKind.SINGLE}]);
  register(binaryen.DropId, [{key: 'value', kind: edgeKind.SINGLE}]);
  register(binaryen.SelectId, [
    {key: 'condition', kind: edgeKind.SINGLE},
    {key: 'ifTrue', kind: edgeKind.SINGLE},
    {key: 'ifFalse', kind: edgeKind.SINGLE}
  ]);
  register(binaryen.MemoryGrowId, [{key: 'delta', kind: edgeKind.SINGLE}]);

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
 * @return {!Wasm2Lang.Wasm.Tree.EdgeSpecList}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.getEdgeSpecs = function (expressionId) {
  Wasm2Lang.Wasm.Tree.NodeSchema.ensureDefaultSchema_();
  if (!Object.prototype.hasOwnProperty.call(Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_, expressionId)) {
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
  var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ specs = Wasm2Lang.Wasm.Tree.NodeSchema.getEdgeSpecs(
      Number(expression['id'] || 0)
    );
  var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdgeList} */ children = [];

  for (var /** number */ i = 0, /** @const {number} */ edgeCount = specs.length; i !== edgeCount; ++i) {
    var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpec} */ edgeSpec = specs[i];
    if (Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.LIST === edgeSpec.kind) {
      // prettier-ignore
      var /** @const {!Array<number>} */ childList =
        /** @const {!Array<number>} */ (expression[edgeSpec.key] || []);
      for (var /** number */ j = 0, /** @const {number} */ childCount = childList.length; j !== childCount; ++j) {
        var /** @const {number} */ listPtr = Number(childList[j] || 0);
        if (0 === listPtr) {
          continue;
        }
        // prettier-ignore
        var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ listChildEdge =
          /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ (
            [edgeSpec.key, j, edgeSpec.kind, listPtr]
          );
        children[children.length] = listChildEdge;
      }
      continue;
    }

    var /** @const {number} */ childPtr = Number(expression[edgeSpec.key] || 0);
    if (0 === childPtr) {
      continue;
    }
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ childEdge =
      /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ (
        [edgeSpec.key, -1, edgeSpec.kind, childPtr]
      );
    children[children.length] = childEdge;
  }

  return children;
};
