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
 * @private
 * @param {*} decision
 * @return {!Wasm2Lang.Wasm.Tree.TraversalDecision}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.normalizeDecision_ = function (decision) {
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecision} */ normalized = {
      decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.CONTINUE
    };

  if (!decision || 'object' !== typeof decision) {
    return normalized;
  }

  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ decisionInput =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ (decision);

  if ('string' === typeof decisionInput.decisionAction) {
    normalized.decisionAction = decisionInput.decisionAction;
  }
  if (void 0 !== decisionInput.expressionPointer) {
    normalized.expressionPointer = decisionInput.expressionPointer;
  }
  if (void 0 !== decisionInput.decisionValue) {
    normalized.decisionValue = decisionInput.decisionValue;
  }

  return normalized;
};

/**
 * @param {number} exprPtr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalContext} context
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @return {*}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression = function (exprPtr, context, visitor) {
  if (0 === exprPtr) {
    return 0;
  }

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitorObject =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (
      visitor || Object.create(null)
    );
  var /** @const {!BinaryenModule} */ module = context.treeModule;
  var /** @const {?BinaryenFunctionInfo} */ functionInfo = context.functionInfo || null;
  // prettier-ignore
  var /** @type {(!Wasm2Lang.Wasm.Tree.ExpressionAncestorList|undefined)} */ contextAncestors =
    /** @type {(!Wasm2Lang.Wasm.Tree.ExpressionAncestorList|undefined)} */ (context.ancestors);
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

  /**
   * @param {?Wasm2Lang.Wasm.Tree.ExpressionInfo} parentExpression
   * @param {?Wasm2Lang.Wasm.Tree.ChildEdge} edge
   * @param {number} currentExprPtr
   * @return {*}
   */
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalWalkInnerFn} */ walkInner = function (parentExpression, edge, currentExprPtr) {
      if (0 === currentExprPtr) {
        return 0;
      }

      var /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = binaryen.getExpressionInfo(currentExprPtr);
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} */ nodeContext = {
          treeModule: module,
          functionInfo: functionInfo,
          treeMetadata: metadata,
          parentExpression: parentExpression,
          edge: edge,
          ancestors: ancestors.slice(0),
          expression: expression,
          expressionPointer: currentExprPtr
        };

      // prettier-ignore
      var /** @const {(!Wasm2Lang.Wasm.Tree.TraversalEnterCallback|undefined)} */ enterCallback =
      /** @const {(!Wasm2Lang.Wasm.Tree.TraversalEnterCallback|undefined)} */ (visitorObject.enter);
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecision} */ enterDecision =
          Wasm2Lang.Wasm.Tree.TraversalKernel.normalizeDecision_(
            'function' === typeof enterCallback ? enterCallback(nodeContext) : null
          );

      if (
        Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE === enterDecision.decisionAction &&
        'number' === typeof enterDecision.expressionPointer &&
        0 !== enterDecision.expressionPointer
      ) {
        // prettier-ignore
        currentExprPtr = /** @const {number} */ (enterDecision.expressionPointer);
        expression = binaryen.getExpressionInfo(currentExprPtr);
        nodeContext.expression = expression;
        nodeContext.expressionPointer = currentExprPtr;
      }

      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} */ childResults = [];

      if (Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE !== enterDecision.decisionAction) {
        ancestors[ancestors.length] = expression;

        var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdgeList} */ childEdges =
            Wasm2Lang.Wasm.Tree.NodeSchema.iterChildren(expression);

        for (var /** number */ i = 0, /** @const {number} */ childCount = childEdges.length; i !== childCount; ++i) {
          var /** @const {!Wasm2Lang.Wasm.Tree.ChildEdge} */ childEdge = childEdges[i];
          var /** @const {number} */ childExprPtr = /** @type {number} */ (childEdge[3]);
          var /** @type {*} */ childWalkResult = walkInner(expression, childEdge, childExprPtr);
          // prettier-ignore
          var /** @const {number} */ effectiveChildPtr = /** @type {number} */ (
            'number' === typeof childWalkResult ? childWalkResult : childExprPtr
          );
          if (effectiveChildPtr !== childExprPtr && 0 !== effectiveChildPtr) {
            Wasm2Lang.Wasm.Tree.TraversalKernel.applyChildReplacement_(
              binaryen,
              currentExprPtr,
              expression.id,
              childEdge,
              effectiveChildPtr
            );
          }
          var /** @const {!Wasm2Lang.Wasm.Tree.TraversalChildResult} */ childResult = {
              child: childEdge,
              result: childWalkResult
            };
          childResults[childResults.length] = childResult;
        }

        --ancestors.length;
      }

      // prettier-ignore
      var /** @const {(!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback|undefined)} */ leaveCallback =
      /** @const {(!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback|undefined)} */ (visitorObject.leave);
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalDecision} */ leaveDecision =
          Wasm2Lang.Wasm.Tree.TraversalKernel.normalizeDecision_(
            'function' === typeof leaveCallback ? leaveCallback(nodeContext, childResults) : null
          );

      if (
        Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE === leaveDecision.decisionAction &&
        'number' === typeof leaveDecision.expressionPointer &&
        0 !== leaveDecision.expressionPointer
      ) {
        // prettier-ignore
        currentExprPtr = /** @const {number} */ (leaveDecision.expressionPointer);
      }

      if (void 0 !== leaveDecision.decisionValue) {
        return leaveDecision.decisionValue;
      }

      return currentExprPtr;
    };

  return walkInner(null, null, exprPtr);
};

/**
 * Setter table for LIST-kind edges.
 * Maps expressionId → fn(parentPtr, listIndex, newChildPtr).
 * @private
 * @type {?Object<number, function(number, number, number): void>}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.listSetters_ = null;

/**
 * Setter table for SINGLE-kind edges.
 * Maps expressionId → { edgeKey → fn(parentPtr, newChildPtr) }.
 * @private
 * @type {?Object<number, !Object<string, function(number, number): void>>}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.singleSetters_ = null;

/**
 * Lazily builds the setter dispatch tables from binaryen's runtime IDs.
 * @private
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.ensureSetterTables_ = function () {
  if (Wasm2Lang.Wasm.Tree.TraversalKernel.listSetters_) {
    return;
  }

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();

  // ---- LIST edge setters: expressionId → fn(parent, index, child) ----------
  var /** @const {!Object<number, function(number, number, number): void>} */ listSetters = Object.create(null);
  listSetters[binaryen.BlockId] = function (/** number */ p, /** number */ i, /** number */ c) {
    binaryen.Block.setChildAt(p, i, c);
  };
  listSetters[binaryen.CallId] = function (/** number */ p, /** number */ i, /** number */ c) {
    binaryen.Call.setOperandAt(p, i, c);
  };
  listSetters[binaryen.CallIndirectId] = function (/** number */ p, /** number */ i, /** number */ c) {
    binaryen.CallIndirect.setOperandAt(p, i, c);
  };

  // ---- SINGLE edge setters: expressionId → { edgeKey → fn(parent, child) } -
  var /** @const {!Object<number, !Object<string, function(number, number): void>>} */ singleSetters = Object.create(null);

  singleSetters[binaryen.IfId] = {
    'condition': function (/** number */ p, /** number */ c) {
      binaryen.If.setCondition(p, c);
    },
    'ifTrue': function (/** number */ p, /** number */ c) {
      binaryen.If.setIfTrue(p, c);
    },
    'ifFalse': function (/** number */ p, /** number */ c) {
      binaryen.If.setIfFalse(p, c);
    }
  };
  singleSetters[binaryen.LoopId] = {
    'body': function (/** number */ p, /** number */ c) {
      binaryen.Loop.setBody(p, c);
    }
  };
  singleSetters[binaryen.BreakId] = {
    'condition': function (/** number */ p, /** number */ c) {
      binaryen.Break.setCondition(p, c);
    },
    'value': function (/** number */ p, /** number */ c) {
      binaryen.Break.setValue(p, c);
    }
  };
  singleSetters[binaryen.SwitchId] = {
    'condition': function (/** number */ p, /** number */ c) {
      binaryen.Switch.setCondition(p, c);
    },
    'value': function (/** number */ p, /** number */ c) {
      binaryen.Switch.setValue(p, c);
    }
  };
  singleSetters[binaryen.LocalSetId] = {
    'value': function (/** number */ p, /** number */ c) {
      binaryen.LocalSet.setValue(p, c);
    }
  };
  singleSetters[binaryen.GlobalSetId] = {
    'value': function (/** number */ p, /** number */ c) {
      binaryen.GlobalSet.setValue(p, c);
    }
  };
  singleSetters[binaryen.UnaryId] = {
    'value': function (/** number */ p, /** number */ c) {
      binaryen.Unary.setValue(p, c);
    }
  };
  singleSetters[binaryen.BinaryId] = {
    'left': function (/** number */ p, /** number */ c) {
      binaryen.Binary.setLeft(p, c);
    },
    'right': function (/** number */ p, /** number */ c) {
      binaryen.Binary.setRight(p, c);
    }
  };
  singleSetters[binaryen.CallIndirectId] = {
    'target': function (/** number */ p, /** number */ c) {
      binaryen.CallIndirect.setTarget(p, c);
    }
  };
  singleSetters[binaryen.ReturnId] = {
    'value': function (/** number */ p, /** number */ c) {
      binaryen.Return.setValue(p, c);
    }
  };
  singleSetters[binaryen.DropId] = {
    'value': function (/** number */ p, /** number */ c) {
      binaryen.Drop.setValue(p, c);
    }
  };
  singleSetters[binaryen.SelectId] = {
    'condition': function (/** number */ p, /** number */ c) {
      binaryen.Select.setCondition(p, c);
    },
    'ifTrue': function (/** number */ p, /** number */ c) {
      binaryen.Select.setIfTrue(p, c);
    },
    'ifFalse': function (/** number */ p, /** number */ c) {
      binaryen.Select.setIfFalse(p, c);
    }
  };
  singleSetters[binaryen.LoadId] = {
    'ptr': function (/** number */ p, /** number */ c) {
      binaryen.Load.setPtr(p, c);
    }
  };
  singleSetters[binaryen.StoreId] = {
    'ptr': function (/** number */ p, /** number */ c) {
      binaryen.Store.setPtr(p, c);
    },
    'value': function (/** number */ p, /** number */ c) {
      binaryen.Store.setValue(p, c);
    }
  };
  singleSetters[binaryen.MemoryGrowId] = {
    'delta': function (/** number */ p, /** number */ c) {
      binaryen.MemoryGrow.setDelta(p, c);
    }
  };

  Wasm2Lang.Wasm.Tree.TraversalKernel.listSetters_ = listSetters;
  Wasm2Lang.Wasm.Tree.TraversalKernel.singleSetters_ = singleSetters;
};

/**
 * Applies a child-pointer replacement directly into the parent expression in
 * the wasm IR using binaryen's per-kind setter APIs.  Called by walkExpression
 * after a child walk returns a pointer that differs from the original.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} parentExprPtr
 * @param {number} parentExprId
 * @param {!Wasm2Lang.Wasm.Tree.ChildEdge} edge
 * @param {number} newChildPtr
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.TraversalKernel.applyChildReplacement_ = function (
  binaryen,
  parentExprPtr,
  parentExprId,
  edge,
  newChildPtr
) {
  Wasm2Lang.Wasm.Tree.TraversalKernel.ensureSetterTables_();

  var /** @const {string} */ edgeKey = /** @type {string} */ (edge[0]);
  var /** @const {number} */ edgeIndex = /** @type {number} */ (edge[1]);
  var /** @const {string} */ edgeKind = /** @type {string} */ (edge[2]);

  if (Wasm2Lang.Wasm.Tree.NodeSchema.EdgeKind.LIST === edgeKind) {
    var /** @const {(function(number, number, number): void|undefined)} */ listSetter =
        Wasm2Lang.Wasm.Tree.TraversalKernel.listSetters_[parentExprId];
    if (listSetter) {
      listSetter(parentExprPtr, edgeIndex, newChildPtr);
    }
    return;
  }

  var /** @const {(!Object<string, function(number, number): void>|undefined)} */ singleMap =
      Wasm2Lang.Wasm.Tree.TraversalKernel.singleSetters_[parentExprId];
  if (singleMap) {
    var /** @const {(function(number, number): void|undefined)} */ setter = singleMap[edgeKey];
    if (setter) {
      setter(parentExprPtr, newChildPtr);
    }
  }
};
