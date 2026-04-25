'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.TraversalKernel = {};

/**
 * @enum {string}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.Action = {
  CONTINUE: 'continue',
  SKIP_SUBTREE: 'skip-subtree',
  REPLACE_NODE: 'replace-node'
};

/**
 * Shared frozen empty child-result list, reused for every leaf node to avoid
 * allocating a fresh empty array per ConstId, LocalGetId, NopId, etc.
 *
 * @private
 * @const {!Wasm2Lang.Wasm.Tree.TraversalChildResultList}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.EMPTY_CHILD_RESULTS_ = /** @type {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} */ ([]);

/**
 * @suppress {accessControls}
 * @param {number} exprPtr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalContext} context
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @return {*}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression = function (exprPtr, context, visitor) {
  if (0 === exprPtr) {
    return 0;
  }

  var /** @const {!Binaryen} */ binaryen = context.binaryen;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitorObject =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (
      visitor || Object.create(null)
    );
  var /** @const {!BinaryenModule} */ module = context.treeModule;
  var /** @const {?BinaryenFunctionInfo} */ functionInfo = context.functionInfo || null;
  // prettier-ignore
  var /** @type {(!Wasm2Lang.Wasm.Tree.ExpressionAncestorList|void)} */ contextAncestors =
    /** @type {(!Wasm2Lang.Wasm.Tree.ExpressionAncestorList|void)} */ (context.ancestors);
  if (!contextAncestors) {
    contextAncestors = [];
  }
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionAncestorList} */ ancestors =
    /** @const {!Wasm2Lang.Wasm.Tree.ExpressionAncestorList} */ (contextAncestors);
  var /** @const {*} */ metadataValue = context.treeMetadata;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ metadata =
    /** @const {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (
      'object' === typeof metadataValue && metadataValue ?
        metadataValue :
        Object.create(null)
    );

  // Cache callback references once — avoids repeated property lookups per node.
  // prettier-ignore
  var /** @const {(!Wasm2Lang.Wasm.Tree.TraversalEnterCallback|void)} */ enterCallback =
    /** @const {(!Wasm2Lang.Wasm.Tree.TraversalEnterCallback|void)} */ (visitorObject.enter);
  // prettier-ignore
  var /** @const {(!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback|void)} */ leaveCallback =
    /** @const {(!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback|void)} */ (visitorObject.leave);
  var /** @const {boolean} */ hasEnter = 'function' === typeof enterCallback;
  var /** @const {boolean} */ hasLeave = 'function' === typeof leaveCallback;

  // Reusable mutable nodeContext — updated in-place per node to avoid
  // allocating a fresh object for every expression in the tree.
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} */ nodeCtxBuf = {
      binaryen: binaryen,
      treeModule: module,
      functionInfo: functionInfo,
      treeMetadata: metadata,
      parentExpression: null,
      edge: null,
      ancestors: ancestors,
      expression: /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ ({}),
      expressionPointer: 0
    };

  // Action constants hoisted for the inner loop.
  var /** @const {string} */ SKIP_SUBTREE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE;
  var /** @const {string} */ REPLACE_NODE = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE;

  // Edge specs map and edge-kind constant, cached once per walk to bypass
  // per-node ensureDefaultSchema_ checks and iterChildren allocations.
  Wasm2Lang.Wasm.Tree.NodeSchema.ensureDefaultSchema_(binaryen);
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionEdgeSpecMap} */ specsMap = Wasm2Lang.Wasm.Tree.NodeSchema.expressionEdgeSpecs_;
  var /** @const {number} */ LIST = Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.LIST;

  var /** @const */ safeGetInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo;
  var /** @const */ augmentInfo = Wasm2Lang.Wasm.Tree.NodeSchema.augmentExpressionInfo_;

  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} */ EMPTY_CR =
      Wasm2Lang.Wasm.Tree.TraversalKernel.EMPTY_CHILD_RESULTS_;

  /**
   * @param {?Wasm2Lang.Wasm.Tree.ExpressionInfo} parentExpression
   * @param {number} currentExprPtr
   * @return {*}
   */
  var walkInner = function (parentExpression, currentExprPtr) {
    if (0 === currentExprPtr) {
      return 0;
    }

    var /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = safeGetInfo(binaryen, currentExprPtr);
    // Inline the augment guard — only MemoryFillId/MemoryCopyId need patching;
    // skip the function call for the 99%+ of nodes that don't.
    var /** @const {number} */ exprId = expression.id;
    if (binaryen.MemoryFillId === exprId || binaryen.MemoryCopyId === exprId) {
      augmentInfo(binaryen, currentExprPtr, expression);
    }

    // Update reusable nodeContext in-place.
    nodeCtxBuf.parentExpression = parentExpression;
    nodeCtxBuf.expression = expression;
    nodeCtxBuf.expressionPointer = currentExprPtr;

    // -- Enter callback (inlined decision handling). --
    var /** @type {boolean} */ skipChildren = false;
    if (hasEnter) {
      var /** @type {*} */ enterRaw = /** @type {!Wasm2Lang.Wasm.Tree.TraversalEnterCallback} */ (enterCallback)(nodeCtxBuf);
      if (enterRaw && 'object' === typeof enterRaw) {
        // prettier-ignore
        var /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ enterDec =
            /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ (enterRaw);
        var /** @const {*} */ enterAction = enterDec.decisionAction;
        if (
          REPLACE_NODE === enterAction &&
          'number' === typeof enterDec.expressionPointer &&
          0 !== enterDec.expressionPointer
        ) {
          // prettier-ignore
          currentExprPtr = /** @type {number} */ (enterDec.expressionPointer);
          expression = safeGetInfo(binaryen, currentExprPtr);
          if (binaryen.MemoryFillId === expression.id || binaryen.MemoryCopyId === expression.id) {
            augmentInfo(binaryen, currentExprPtr, expression);
          }
          nodeCtxBuf.expression = expression;
          nodeCtxBuf.expressionPointer = currentExprPtr;
        } else if (SKIP_SUBTREE === enterAction) {
          skipChildren = true;
        }
      }
    }

    // -- Walk children. --
    var /** @type {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} */ childResults = EMPTY_CR;

    if (!skipChildren) {
      var /** @const {*} */ rawSpecs = specsMap[expression.id];
      if (void 0 === rawSpecs) {
        throw new Error(
          'Wasm2Lang TraversalKernel: unsupported expression ID ' +
            expression.id +
            '. Register this type in NodeSchema.ensureDefaultSchema_ or file a bug.'
        );
      }
      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ specs =
          /** @type {!Wasm2Lang.Wasm.Tree.EdgeSpecList} */ (rawSpecs);
      var /** @const {number} */ specCount = specs.length;

      if (0 !== specCount) {
        ancestors[ancestors.length] = expression;
        childResults = [];
        var /** @const {!Object<string, *>} */ expressionMap = /** @type {!Object<string, *>} */ (expression);

        for (var /** @type {number} */ si = 0; si !== specCount; ++si) {
          var /** @const {!Wasm2Lang.Wasm.Tree.EdgeSpec} */ spec = specs[si];
          var /** @const {function(number, number, number): void} */ setter =
              /** @type {function(number, number, number): void} */ (spec.setter);

          if (LIST === spec.edgeTraversalKind) {
            // prettier-ignore
            var /** @const {!Array<number>} */ childList =
                /** @type {!Array<number>} */ (expressionMap[spec.edgePropertyName] || []);
            for (var /** @type {number} */ j = 0, /** @const {number} */ childCount = childList.length; j !== childCount; ++j) {
              var /** @const {number} */ listPtr = /** @type {number} */ (childList[j] || 0);
              if (0 === listPtr) {
                continue;
              }
              var /** @type {*} */ listChildResult = walkInner(expression, listPtr);
              // prettier-ignore
              var /** @const {number} */ effectiveListPtr = /** @type {number} */ (
                  'number' === typeof listChildResult ? listChildResult : listPtr
                );
              if (effectiveListPtr !== listPtr && 0 !== effectiveListPtr) {
                setter(currentExprPtr, j, effectiveListPtr);
              }
              childResults[childResults.length] = listChildResult;
            }
          } else {
            var /** @const {number} */ childPtr = /** @type {number} */ (expressionMap[spec.edgePropertyName] || 0);
            if (0 === childPtr) {
              continue;
            }
            var /** @type {*} */ singleChildResult = walkInner(expression, childPtr);
            // prettier-ignore
            var /** @const {number} */ effectiveChildPtr = /** @type {number} */ (
                'number' === typeof singleChildResult ? singleChildResult : childPtr
              );
            if (effectiveChildPtr !== childPtr && 0 !== effectiveChildPtr) {
              setter(currentExprPtr, -1, effectiveChildPtr);
            }
            childResults[childResults.length] = singleChildResult;
          }
        }

        --ancestors.length;
      }
    }

    // Restore nodeContext after children — recursive walkInner calls
    // will have mutated it, so reset the fields for the leave callback.
    nodeCtxBuf.parentExpression = parentExpression;
    nodeCtxBuf.expression = expression;
    nodeCtxBuf.expressionPointer = currentExprPtr;

    // -- Leave callback (inlined decision handling). --
    if (hasLeave) {
      var /** @type {*} */ leaveRaw = /** @type {!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback} */ (leaveCallback)(
          nodeCtxBuf,
          childResults
        );

      if (leaveRaw && 'object' === typeof leaveRaw) {
        // prettier-ignore
        var /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ leaveDec =
            /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ (leaveRaw);
        if (
          REPLACE_NODE === leaveDec.decisionAction &&
          'number' === typeof leaveDec.expressionPointer &&
          0 !== leaveDec.expressionPointer
        ) {
          // prettier-ignore
          currentExprPtr = /** @type {number} */ (leaveDec.expressionPointer);
        }
        if (void 0 !== leaveDec.decisionValue) {
          return leaveDec.decisionValue;
        }
      }
    }

    return currentExprPtr;
  };

  return walkInner(null, exprPtr);
};

/**
 * Applies a child-pointer replacement directly into the parent expression in
 * the wasm IR.  The setter function is carried on the ChildEdge tuple (index
 * [4]) from the NodeSchema EdgeSpec, so no parallel dispatch table is needed.
 *
 * Setter signature: (parentPtr, listIndex, newChildPtr).  For SINGLE edges
 * the listIndex parameter is ignored inside the setter.
 *
 * @private
 * @param {number} parentExprPtr
 * @param {!Wasm2Lang.Wasm.Tree.ChildEdge} edge
 * @param {number} newChildPtr
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.applyChildReplacement_ = function (parentExprPtr, edge, newChildPtr) {
  var /** @const {number} */ edgeIndex = /** @type {number} */ (edge[1]);
  var /** @const {function(number, number, number): void} */ setter = /** @type {function(number, number, number): void} */ (
      edge[4]
    );
  setter(parentExprPtr, edgeIndex, newChildPtr);
};

/**
 * Lightweight visit-each helper that drives {@link walkExpression} with a
 * minimal context for analysis-only walks (anchor scanning, label-ref
 * rewriting, name→ptr indexing, etc.) — the third major traversal use-case
 * alongside pass execution and code emission.  The callback may return
 * {@code 'skip-subtree'} to prune; any other return value is treated as
 * "continue".  Mutations on visited nodes (e.g. {@code binaryen.Break.setName})
 * are allowed.  Returns {@code true} if the visit completed normally,
 * {@code false} if {@code abortSentinel} was returned at any point.
 *
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {number} rootPtr  Function body root, or any sub-expression.
 * @param {function(!Wasm2Lang.Wasm.Tree.TraversalNodeContext): (string|undefined)} fn
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.forEachExpression = function (binaryen, wasmModule, rootPtr, fn) {
  if (!rootPtr) return;
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
      binaryen: binaryen,
      treeModule: wasmModule,
      functionInfo: /** @type {!BinaryenFunctionInfo} */ (
        /** @type {!BinaryenFunctionInfo} */ ({
          base: '',
          name: '',
          body: 0,
          type: 0,
          params: 0,
          results: 0,
          vars: [],
          module: ''
        })
      ),
      treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
      ancestors: []
    };
  var /** @const {string} */ SKIP = Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE;
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor = {
      enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
                @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function (nodeCtx) {
        var /** @const {(string|undefined)} */ result = fn(nodeCtx);
        if ('skip-subtree' === result) {
          return /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ ({decisionAction: SKIP});
        }
        return null;
      }
    };
  Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(rootPtr, ctx, visitor);
};
