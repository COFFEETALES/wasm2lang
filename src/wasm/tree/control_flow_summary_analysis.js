'use strict';

/**
 * Post-order control-flow analysis for code generation.
 *
 * The analysis is intentionally transient: its result is owned by the
 * codegen instance for the lifetime of one Binaryen module and never enters
 * PassMetadata or the serialized w2l_codegen_meta section.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis = function () {
  /** @const {string} */ this.passName = 'control-flow-summary';
  /** @const {string} */ this.phase = Wasm2Lang.Wasm.Tree.PassRunner.Phase.ANALYZE;

  /** @private @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummaryIndex} */
  this.index_ = /** @type {!Wasm2Lang.Wasm.Tree.ControlFlowSummaryIndex} */ (Object.create(null));

  /** @private @type {?Wasm2Lang.Wasm.Tree.FunctionControlFlowSummaryIndex} */
  this.currentFunctionIndex_ = null;
};

/**
 * @param {!Array<string>} destination
 * @param {!Array<string>} source
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.appendUniqueBranchTargets = function (destination, source) {
  for (var /** @type {number} */ si = 0; si !== source.length; ++si) {
    var /** @const {string} */ candidate = source[si];
    var /** @type {boolean} */ found = false;
    for (var /** @type {number} */ di = 0; di !== destination.length; ++di) {
      if (destination[di] === candidate) {
        found = true;
        break;
      }
    }
    if (!found) destination.push(candidate);
  }
};

/**
 * @param {!Array<string>} targets
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.hasBranchTarget = function (targets, name) {
  for (var /** @type {number} */ i = 0; i !== targets.length; ++i) {
    if (targets[i] === name) return true;
  }
  return false;
};

/**
 * @private
 * @return {!Wasm2Lang.Wasm.Tree.ControlFlowSummary}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.emptySummary_ = function () {
  return {isTerminal: false, mayExitFunction: false, branchTargets: []};
};

/**
 * Merges possible non-local transfers without changing the destination's
 * terminal flag. Terminality belongs to the enclosing expression's control
 * rule, not to a blind union of child outcomes.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} destination
 * @param {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} source
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.mergeInto_ = function (destination, source) {
  destination.mayExitFunction = destination.mayExitFunction || source.mayExitFunction;
  Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.appendUniqueBranchTargets(destination.branchTargets, source.branchTargets);
};

/**
 * Returns immediate operands in wasm evaluation order. Each entry contains
 * the Binaryen expression pointer and its compact index in the kernel's
 * childResults array. Terminal propagation and pre-emission analysis share
 * this mapping so NodeSchema's mutation-friendly edge order cannot make the
 * two semantic models drift apart.
 *
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Wasm.Tree.ExpressionInfo} expression
 * @return {!Array<!Array<number>>}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.evaluationOrder = function (binaryen, expression) {
  var /** @const {!Array<!Array<number>>} */ ordered = [];
  var /** @const {number} */ id = expression.id;

  if (binaryen.SelectId === id) {
    ordered.push([/** @type {number} */ (expression.ifTrue), 1]);
    ordered.push([/** @type {number} */ (expression.ifFalse), 2]);
    ordered.push([/** @type {number} */ (expression.condition), 0]);
    return ordered;
  }
  if (binaryen.IfId === id) {
    ordered.push([/** @type {number} */ (expression.condition), 0]);
    return ordered;
  }
  if (binaryen.BreakId === id || binaryen.SwitchId === id) {
    var /** @const {number} */ branchCondition = /** @type {number} */ (expression.condition || 0);
    var /** @const {number} */ branchValue = /** @type {number} */ (expression.value || 0);
    if (0 !== branchValue) ordered.push([branchValue, 0 !== branchCondition ? 1 : 0]);
    if (0 !== branchCondition) ordered.push([branchCondition, 0]);
    return ordered;
  }
  if (binaryen.CallIndirectId === id) {
    var /** @const {!Array<number>} */ operands = /** @type {!Array<number>} */ (expression.operands || []);
    for (var /** @type {number} */ oi = 0; oi !== operands.length; ++oi) {
      ordered.push([operands[oi], oi + 1]);
    }
    ordered.push([/** @type {number} */ (expression.target), 0]);
    return ordered;
  }

  var /** @const {!Array<number>} */ edges = Wasm2Lang.Wasm.Tree.NodeSchema.iterChildren(expression);
  for (var /** @type {number} */ ei = 0; ei !== edges.length; ++ei) {
    ordered.push([edges[ei], ei]);
  }
  return ordered;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} index
 * @return {!Wasm2Lang.Wasm.Tree.ControlFlowSummary}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.childSummary_ = function (childResults, index) {
  if (index < childResults.length) {
    var /** @const {*} */ raw = childResults[index];
    if (raw && 'object' === typeof raw) {
      return /** @type {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ (raw);
    }
  }
  return Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.emptySummary_();
};

/**
 * Combines eagerly evaluated children in wasm evaluation order and stops at
 * the first terminal child. Operand entries come from evaluationOrder; only
 * their child-result indexes are needed here.
 *
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {!Array<!Array<number>>} orderedOperands
 * @return {!Wasm2Lang.Wasm.Tree.ControlFlowSummary}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.summarizeEager_ = function (childResults, orderedOperands) {
  var /** @const */ C = Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis;
  var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ summary = C.emptySummary_();
  for (var /** @type {number} */ i = 0; i !== orderedOperands.length; ++i) {
    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ child = C.childSummary_(childResults, orderedOperands[i][1]);
    C.mergeInto_(summary, child);
    if (child.isTerminal) {
      summary.isTerminal = true;
      break;
    }
  }
  return summary;
};

/**
 * @private
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Wasm.Tree.ExpressionInfo} expression
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {!Wasm2Lang.Wasm.Tree.ControlFlowSummary}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.summarizeNode_ = function (binaryen, expression, childResults) {
  var /** @const */ C = Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis;
  var /** @const {number} */ id = expression.id;

  if (binaryen.BlockId === id) {
    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ blockSummary = C.summarizeEager_(
        childResults,
        C.evaluationOrder(binaryen, expression)
      );
    var /** @const {string} */ blockName = /** @type {string} */ (expression.name || '');
    if ('' !== blockName) {
      var /** @const {!Array<string>} */ remainingBlockTargets = [];
      var /** @type {boolean} */ blockCaptured = false;
      for (var /** @type {number} */ bt = 0; bt !== blockSummary.branchTargets.length; ++bt) {
        if (blockSummary.branchTargets[bt] === blockName) {
          blockCaptured = true;
        } else {
          remainingBlockTargets.push(blockSummary.branchTargets[bt]);
        }
      }
      blockSummary.branchTargets = remainingBlockTargets;
      if (blockCaptured) blockSummary.isTerminal = false;
    }
    return blockSummary;
  }

  if (binaryen.LoopId === id) {
    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ loopBody = C.childSummary_(childResults, 0);
    var /** @const {string} */ loopName = /** @type {string} */ (expression.name || '');
    var /** @const {!Array<string>} */ remainingLoopTargets = [];
    for (var /** @type {number} */ li = 0; li !== loopBody.branchTargets.length; ++li) {
      if (loopBody.branchTargets[li] !== loopName) {
        remainingLoopTargets.push(loopBody.branchTargets[li]);
      }
    }
    return {
      isTerminal: loopBody.isTerminal,
      mayExitFunction: loopBody.mayExitFunction,
      branchTargets: remainingLoopTargets
    };
  }

  if (binaryen.IfId === id) {
    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ condition = C.childSummary_(childResults, 0);
    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ ifSummary = {
        isTerminal: condition.isTerminal,
        mayExitFunction: condition.mayExitFunction,
        branchTargets: condition.branchTargets.slice(0)
      };
    if (condition.isTerminal) return ifSummary;

    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ ifTrue = C.childSummary_(childResults, 1);
    C.mergeInto_(ifSummary, ifTrue);
    if (0 === /** @type {number} */ (expression.ifFalse || 0)) {
      ifSummary.isTerminal = false;
      return ifSummary;
    }
    var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ ifFalse = C.childSummary_(childResults, 2);
    C.mergeInto_(ifSummary, ifFalse);
    ifSummary.isTerminal = ifTrue.isTerminal && ifFalse.isTerminal;
    return ifSummary;
  }

  var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ summary = C.summarizeEager_(
      childResults,
      C.evaluationOrder(binaryen, expression)
    );
  if (summary.isTerminal) return summary;

  if (binaryen.ReturnId === id) {
    summary.isTerminal = true;
    summary.mayExitFunction = true;
  } else if (binaryen.BreakId === id) {
    C.appendUniqueBranchTargets(summary.branchTargets, [/** @type {string} */ (expression.name || '')]);
    summary.isTerminal = 0 === /** @type {number} */ (expression.condition || 0);
  } else if (binaryen.SwitchId === id) {
    C.appendUniqueBranchTargets(summary.branchTargets, /** @type {!Array<string>} */ (expression.names || []));
    var /** @const {string} */ defaultName = /** @type {string} */ (expression.defaultName || '');
    if ('' !== defaultName) C.appendUniqueBranchTargets(summary.branchTargets, [defaultName]);
    summary.isTerminal = true;
  } else if (binaryen.UnreachableId === id) {
    summary.isTerminal = true;
    summary.mayExitFunction = true;
  } else {
    summary.isTerminal = binaryen.unreachable === expression.type;
  }
  return summary;
};

/**
 * @param {!BinaryenFunctionInfo} functionInfo
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.prototype.onFunctionEnter = function (functionInfo, funcMetadata) {
  var /** @const {!Wasm2Lang.Wasm.Tree.FunctionControlFlowSummaryIndex} */ functionIndex =
      /** @type {!Wasm2Lang.Wasm.Tree.FunctionControlFlowSummaryIndex} */ (Object.create(null));
  this.index_[functionInfo.name] = functionIndex;
  this.currentFunctionIndex_ = functionIndex;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.prototype.createVisitor = function (funcMetadata) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis} */ self = this;
  return {
    leave: /**
     * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
     * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
     * @return {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
     */ function (nodeCtx, childResults) {
      var /** @const {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ summary =
          Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.summarizeNode_(nodeCtx.binaryen, nodeCtx.expression, childResults);
      if (!self.currentFunctionIndex_) {
        throw new Error('Wasm2Lang ControlFlowSummaryAnalysis: missing function index.');
      }
      if (nodeCtx.binaryen.BlockId === nodeCtx.expression.id || nodeCtx.binaryen.LoopId === nodeCtx.expression.id) {
        self.currentFunctionIndex_[String(nodeCtx.expressionPointer)] = summary;
      }
      return {decisionValue: summary};
    }
  };
};

/**
 * Returns the transient function/pointer index populated by the most recent
 * PassRunner invocation.
 *
 * @return {!Wasm2Lang.Wasm.Tree.ControlFlowSummaryIndex}
 */
Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.prototype.getIndex = function () {
  return this.index_;
};
