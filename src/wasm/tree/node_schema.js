'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.NodeSchema = {};

/**
 * @enum {number}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind = {
  SINGLE: 0,
  LIST: 1
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
    edgeSpecs
  );
};

/**
 * @private
 * @param {string} edgePropertyName
 * @param {number} edgeTraversalKind
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

  // SIMD expression IDs.
  register(binaryen.SIMDExtractId, [single('vec', binaryen.SIMDExtract, 'setVec')]);
  register(binaryen.SIMDReplaceId, [
    single('vec', binaryen.SIMDReplace, 'setVec'),
    single('value', binaryen.SIMDReplace, 'setValue')
  ]);
  register(binaryen.SIMDShuffleId, [
    single('left', binaryen.SIMDShuffle, 'setLeft'),
    single('right', binaryen.SIMDShuffle, 'setRight')
  ]);
  register(binaryen.SIMDTernaryId, [
    single('a', binaryen.SIMDTernary, 'setA'),
    single('b', binaryen.SIMDTernary, 'setB'),
    single('c', binaryen.SIMDTernary, 'setC')
  ]);
  register(binaryen.SIMDShiftId, [
    single('vec', binaryen.SIMDShift, 'setVec'),
    single('shift', binaryen.SIMDShift, 'setShift')
  ]);
  register(binaryen.SIMDLoadId, [single('ptr', binaryen.SIMDLoad, 'setPtr')]);
  register(binaryen.SIMDLoadStoreLaneId, [
    single('ptr', binaryen.SIMDLoadStoreLane, 'setPtr'),
    single('vec', binaryen.SIMDLoadStoreLane, 'setVec')
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
  return expressionId in Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_;
};

/**
 * @param {number} expressionId
 * @return {!Wasm2Lang.Wasm.Tree.EdgeSpecList}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.getEdgeSpecs = function (expressionId) {
  Wasm2Lang.Wasm.Tree.NodeSchema.ensureDefaultSchema_();
  var /** @const {*} */ specs = Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_[expressionId];
  if (void 0 === specs) {
    // Treat unregistered expression IDs as childless leaves so that
    // tree traversal can skip over nodes introduced by LTO / binaryen
    // optimizations that the JS bindings do not fully describe.
    return [];
  }
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ (specs);
};

/**
 * Lazily-built set of binaryen expression IDs that are safe to pass to
 * {@code binaryen.getExpressionInfo()} — i.e. IDs whose property-accessor
 * class is registered in binaryen's internal PA table.  IDs NOT in this set
 * would cause getExpressionInfo to crash with "Cannot convert undefined or
 * null to object".
 *
 * @private
 * @type {?Object<number, boolean>}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.safeExpressionIds_ = null;

/**
 * @private
 * @param {!Binaryen} binaryen
 * @return {!Object<number, boolean>}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.ensureSafeExpressionIds_ = function (binaryen) {
  var /** @type {?Object<number, boolean>} */ s = Wasm2Lang.Wasm.Tree.NodeSchema.safeExpressionIds_;
  if (s) return s;
  s = /** @type {!Object<number, boolean>} */ (Object.create(null));
  // All expression IDs that have a property-accessor class in binaryen's PA
  // table and can therefore be passed to getExpressionInfo safely.
  s[binaryen.BlockId] = true;
  s[binaryen.IfId] = true;
  s[binaryen.LoopId] = true;
  s[binaryen.BreakId] = true;
  s[binaryen.SwitchId] = true;
  s[binaryen.LocalSetId] = true;
  s[binaryen.LocalGetId] = true;
  s[binaryen.GlobalSetId] = true;
  s[binaryen.GlobalGetId] = true;
  s[binaryen.UnaryId] = true;
  s[binaryen.BinaryId] = true;
  s[binaryen.CallId] = true;
  s[binaryen.CallIndirectId] = true;
  s[binaryen.LoadId] = true;
  s[binaryen.StoreId] = true;
  s[binaryen.ReturnId] = true;
  s[binaryen.DropId] = true;
  s[binaryen.SelectId] = true;
  s[binaryen.ConstId] = true;
  s[binaryen.MemorySizeId] = true;
  s[binaryen.MemoryGrowId] = true;
  s[binaryen.MemoryFillId] = true;
  s[binaryen.MemoryCopyId] = true;
  s[binaryen.SIMDExtractId] = true;
  s[binaryen.SIMDReplaceId] = true;
  s[binaryen.SIMDShuffleId] = true;
  s[binaryen.SIMDTernaryId] = true;
  s[binaryen.SIMDShiftId] = true;
  s[binaryen.SIMDLoadId] = true;
  s[binaryen.SIMDLoadStoreLaneId] = true;
  Wasm2Lang.Wasm.Tree.NodeSchema.safeExpressionIds_ = s;
  return s;
};

/**
 * Safe wrapper around {@code binaryen.getExpressionInfo()} that handles
 * expression types missing from the binaryen JS API's internal
 * expression-class registry.  Falls back to a minimal {id, type} object
 * for any expression ID not in the known-safe whitelist (e.g. NopId,
 * UnreachableId, or expression types introduced by LTO / binaryen
 * optimizations that the JS bindings do not cover).
 *
 * Uses a whitelist pre-check instead of try-catch because Closure Compiler
 * ADVANCED mode eliminates catch blocks when the callee's extern type
 * implies no throw.
 *
 * @param {!Binaryen} binaryen
 * @param {number} exprPtr
 * @return {!Wasm2Lang.Wasm.Tree.ExpressionInfo}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo = function (binaryen, exprPtr) {
  var /** @const {number} */ id = binaryen.getExpressionId(exprPtr);
  if (true !== Wasm2Lang.Wasm.Tree.NodeSchema.ensureSafeExpressionIds_(binaryen)[id]) {
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
  if (binaryen.MemoryFillId === id) {
    /** @type {!Object<string, *>} */ (info)['dest'] = binaryen.MemoryFill.getDest(exprPtr);
    /** @type {!Object<string, *>} */ (info)['value'] = binaryen.MemoryFill.getValue(exprPtr);
    /** @type {!Object<string, *>} */ (info)['size'] = binaryen.MemoryFill.getSize(exprPtr);
  } else if (binaryen.MemoryCopyId === id) {
    /** @type {!Object<string, *>} */ (info)['dest'] = binaryen.MemoryCopy.getDest(exprPtr);
    /** @type {!Object<string, *>} */ (info)['source'] = binaryen.MemoryCopy.getSource(exprPtr);
    /** @type {!Object<string, *>} */ (info)['size'] = binaryen.MemoryCopy.getSize(exprPtr);
  }
};

/**
 * Shared empty child-edge list returned for leaf nodes — avoids allocating
 * a fresh empty array for every ConstId, LocalGetId, NopId, etc.
 *
 * @private
 * @const {!Wasm2Lang.Wasm.Tree.ChildEdgeList}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.EMPTY_CHILDREN_ = /** @type {!Wasm2Lang.Wasm.Tree.ChildEdgeList} */ ([]);

/**
 * @param {!Wasm2Lang.Wasm.Tree.ExpressionInfo} expressionInfo
 * @return {!Wasm2Lang.Wasm.Tree.ChildEdgeList}
 */
Wasm2Lang.Wasm.Tree.NodeSchema.iterChildren = function (expressionInfo) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = expressionInfo;
  var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ specs = Wasm2Lang.Wasm.Tree.NodeSchema.getEdgeSpecs(expression.id);
  var /** @const {number} */ edgeCount = specs.length;
  // Fast path for leaf nodes (Const, LocalGet, GlobalGet, Nop, etc.).
  if (0 === edgeCount) {
    return Wasm2Lang.Wasm.Tree.NodeSchema.EMPTY_CHILDREN_;
  }

  var /** @const {!Object<string, *>} */ expressionMap = /** @type {!Object<string, *>} */ (expression);
  var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdgeList} */ children = [];

  for (var /** @type {number} */ i = 0; i !== edgeCount; ++i) {
    var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpec} */ edgeSpec = specs[i];
    var /** @const {function(number, number, number): void} */ setter = /** @type {function(number, number, number): void} */ (
        edgeSpec.setter
      );
    if (Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.LIST === edgeSpec.edgeTraversalKind) {
      // prettier-ignore
      var /** @const {!Array<number>} */ childList =
        /** @const {!Array<number>} */ (expressionMap[edgeSpec.edgePropertyName] || []);
      for (var /** @type {number} */ j = 0, /** @const {number} */ childCount = childList.length; j !== childCount; ++j) {
        var /** @const {number} */ listPtr = /** @type {number} */ (childList[j] || 0);
        if (0 === listPtr) {
          continue;
        }
        // prettier-ignore
        children[children.length] =
          /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ (
            [edgeSpec.edgePropertyName, j, edgeSpec.edgeTraversalKind, listPtr, setter]
          );
      }
      continue;
    }

    var /** @const {number} */ childPtr = /** @type {number} */ (expressionMap[edgeSpec.edgePropertyName] || 0);
    if (0 === childPtr) {
      continue;
    }
    // prettier-ignore
    children[children.length] =
      /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ (
        [edgeSpec.edgePropertyName, -1, edgeSpec.edgeTraversalKind, childPtr, setter]
      );
  }

  return children;
};
