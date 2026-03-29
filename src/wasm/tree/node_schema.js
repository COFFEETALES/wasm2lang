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
 * @param {string} edgePropertyName
 * @param {!Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind} edgeTraversalKind
 * @param {function(number, number, number): void} setter
 * @return {!Wasm2Lang.Wasm.Tree.EdgeSpec}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.createEdgeSpec_ = function (edgePropertyName, edgeTraversalKind, setter) {
  return {
    edgePropertyName: edgePropertyName,
    edgeTraversalKind: edgeTraversalKind,
    setter: setter
  };
};

/**
 * @private
 * @param {string} edgePropertyName
 * @param {!Object<string, !Function>} setterOwner
 * @param {string} setterName
 * @return {!Wasm2Lang.Wasm.Tree.EdgeSpec}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.createSingleEdgeSpec_ = function (edgePropertyName, setterOwner, setterName) {
  return Wasm2Lang.Wasm.Tree.NodeSchema.createEdgeSpec_(
    edgePropertyName,
    Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.SINGLE,
    /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) {
      void i;
      setterOwner[setterName](p, c);
    }
  );
};

/**
 * @private
 * @param {string} edgePropertyName
 * @param {!Object<string, !Function>} setterOwner
 * @param {string} setterName
 * @return {!Wasm2Lang.Wasm.Tree.EdgeSpec}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.createListEdgeSpec_ = function (edgePropertyName, setterOwner, setterName) {
  return Wasm2Lang.Wasm.Tree.NodeSchema.createEdgeSpec_(
    edgePropertyName,
    Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.LIST,
    /** @param {number} p @param {number} i @param {number} c */ function (p, i, c) {
      setterOwner[setterName](p, i, c);
    }
  );
};

/**
 * @private
 * @param {number} expressionId
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.registerLeafExpression_ = function (expressionId) {
  Wasm2Lang.Wasm.Tree.NodeSchema.registerEdgeSpecs_(expressionId, []);
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
  var register = Wasm2Lang.Wasm.Tree.NodeSchema.registerEdgeSpecs_;
  var single = Wasm2Lang.Wasm.Tree.NodeSchema.createSingleEdgeSpec_;
  var list = Wasm2Lang.Wasm.Tree.NodeSchema.createListEdgeSpec_;
  var registerLeaf = Wasm2Lang.Wasm.Tree.NodeSchema.registerLeafExpression_;

  register(binaryen.BlockId, [list('children', binaryen.Block, 'setChildAt')]);
  register(binaryen.IfId, [
    single('condition', binaryen.If, 'setCondition'),
    single('ifTrue', binaryen.If, 'setIfTrue'),
    single('ifFalse', binaryen.If, 'setIfFalse')
  ]);
  register(binaryen.LoopId, [single('body', binaryen.Loop, 'setBody')]);
  register(binaryen.BreakId, [
    single('condition', binaryen.Break, 'setCondition'),
    single('value', binaryen.Break, 'setValue')
  ]);
  register(binaryen.SwitchId, [
    single('condition', binaryen.Switch, 'setCondition'),
    single('value', binaryen.Switch, 'setValue')
  ]);
  register(binaryen.LocalSetId, [single('value', binaryen.LocalSet, 'setValue')]);
  register(binaryen.GlobalSetId, [single('value', binaryen.GlobalSet, 'setValue')]);
  register(binaryen.UnaryId, [single('value', binaryen.Unary, 'setValue')]);
  register(binaryen.BinaryId, [single('left', binaryen.Binary, 'setLeft'), single('right', binaryen.Binary, 'setRight')]);
  register(binaryen.CallId, [list('operands', binaryen.Call, 'setOperandAt')]);
  register(binaryen.CallIndirectId, [
    single('target', binaryen.CallIndirect, 'setTarget'),
    list('operands', binaryen.CallIndirect, 'setOperandAt')
  ]);
  register(binaryen.LoadId, [single('ptr', binaryen.Load, 'setPtr')]);
  register(binaryen.StoreId, [single('ptr', binaryen.Store, 'setPtr'), single('value', binaryen.Store, 'setValue')]);
  register(binaryen.ReturnId, [single('value', binaryen.Return, 'setValue')]);
  register(binaryen.DropId, [single('value', binaryen.Drop, 'setValue')]);
  register(binaryen.SelectId, [
    single('condition', binaryen.Select, 'setCondition'),
    single('ifTrue', binaryen.Select, 'setIfTrue'),
    single('ifFalse', binaryen.Select, 'setIfFalse')
  ]);
  register(binaryen.MemoryGrowId, [single('delta', binaryen.MemoryGrow, 'setDelta')]);
  register(binaryen.MemoryFillId, [
    single('dest', binaryen.MemoryFill, 'setDest'),
    single('value', binaryen.MemoryFill, 'setValue'),
    single('size', binaryen.MemoryFill, 'setSize')
  ]);
  register(binaryen.MemoryCopyId, [
    single('dest', binaryen.MemoryCopy, 'setDest'),
    single('source', binaryen.MemoryCopy, 'setSource'),
    single('size', binaryen.MemoryCopy, 'setSize')
  ]);

  // Leaf nodes: no expression-pointer children.
  registerLeaf(binaryen.NopId);
  registerLeaf(binaryen.UnreachableId);
  registerLeaf(binaryen.ConstId);
  registerLeaf(binaryen.LocalGetId);
  registerLeaf(binaryen.GlobalGetId);
  registerLeaf(binaryen.MemorySizeId);

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
 * Safe wrapper around {@code binaryen.getExpressionInfo()} that handles
 * expression types missing from the binaryen 125 JS API's internal
 * expression-class registry (NopId, UnreachableId).
 *
 * @param {!Binaryen} binaryen
 * @param {number} exprPtr
 * @return {!Wasm2Lang.Wasm.Tree.ExpressionInfo}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo = function (binaryen, exprPtr) {
  var /** @const {number} */ id = binaryen.getExpressionId(exprPtr);
  if (id === binaryen.NopId || id === binaryen.UnreachableId) {
    // prettier-ignore
    return /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (
      { id: id, type: binaryen.getExpressionType(exprPtr) }
    );
  }
  return binaryen.getExpressionInfo(exprPtr);
};

/**
 * Patches expression info objects for expression IDs where
 * {@code binaryen.getExpressionInfo()} does not populate child pointer
 * properties.  Must be called before {@code iterChildren}.
 *
 * @param {!Binaryen} binaryen
 * @param {number} exprPtr
 * @param {!Wasm2Lang.Wasm.Tree.ExpressionInfo} info
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.augmentExpressionInfo_ = function (binaryen, exprPtr, info) {
  var /** @const {number} */ id = info.id;
  if (id === binaryen.MemoryFillId) {
    /** @type {!Object<string, *>} */ (info)['dest'] = binaryen.MemoryFill.getDest(exprPtr);
    /** @type {!Object<string, *>} */ (info)['value'] = binaryen.MemoryFill.getValue(exprPtr);
    /** @type {!Object<string, *>} */ (info)['size'] = binaryen.MemoryFill.getSize(exprPtr);
  } else if (id === binaryen.MemoryCopyId) {
    /** @type {!Object<string, *>} */ (info)['dest'] = binaryen.MemoryCopy.getDest(exprPtr);
    /** @type {!Object<string, *>} */ (info)['source'] = binaryen.MemoryCopy.getSource(exprPtr);
    /** @type {!Object<string, *>} */ (info)['size'] = binaryen.MemoryCopy.getSize(exprPtr);
  }
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
    var /** @const {function(number, number, number): void} */ setter = /** @type {function(number, number, number): void} */ (
        edgeSpec.setter
      );
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
