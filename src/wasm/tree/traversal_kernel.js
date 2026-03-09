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

  var /** @const {!Binaryen} */ binaryen = context.binaryen;
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
          binaryen: binaryen,
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
              currentExprPtr,
              childEdge,
              effectiveChildPtr
            );
          }
          var /** @const {!Wasm2Lang.Wasm.Tree.TraversalChildResult} */ childResult = {
              child: childEdge,
              childTraversalResult: childWalkResult
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
Wasm2Lang.Wasm.Tree.TraversalKernel.applyChildReplacement_ = function (
  parentExprPtr,
  edge,
  newChildPtr
) {
  var /** @const {number} */ edgeIndex = /** @type {number} */ (edge[1]);
  var /** @const {function(number, number, number): void} */ setter =
      /** @type {function(number, number, number): void} */ (edge[4]);
  setter(parentExprPtr, edgeIndex, newChildPtr);
};
