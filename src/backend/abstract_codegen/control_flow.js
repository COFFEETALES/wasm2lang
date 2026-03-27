'use strict';

// ---------------------------------------------------------------------------
// Child-result normalization, label prefix constants, labeled emit state
// typedefs, labeled enter/leave helpers, block/switch/break/if/local.set
// helpers, and sub-walk utilities.
// ---------------------------------------------------------------------------

/**
 * Appends every non-empty line from {@code text} to {@code parts}.
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {*} text
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_ = function (parts, text) {
  if ('string' !== typeof text || '' === text) {
    return;
  }

  var /** @const {!Array<string>} */ lines = text.split('\n');
  for (var /** number */ i = 0, /** @const {number} */ lineCount = lines.length; i !== lineCount; ++i) {
    if ('' !== lines[i]) {
      parts[parts.length] = lines[i];
    }
  }
};

/**
 * Renders the coerced return expression for an implicit return statement.
 * The default implementation extracts the expression category and delegates
 * to {@code coerceToType_}.  Asm.js overrides to use
 * {@code renderCoercionByType_} which always applies the type annotation
 * regardless of category (required by the asm.js validator).
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {*} bodyResult  The traversal result (typed expression object).
 * @param {number} resultType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderImplicitReturn_ = function (binaryen, bodyResult, resultType) {
  var /** @const {string} */ implicitExpr = /** @type {string} */ (bodyResult['s']);
  var /** @const {number} */ implicitCat =
      'number' === typeof bodyResult['c']
        ? /** @type {number} */ (bodyResult['c'])
        : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  return this.coerceToType_(binaryen, implicitExpr, implicitCat, resultType);
};

/**
 * Appends a function body traversal result to the output parts array.
 * If the result is a typed expression and the function has a return type,
 * emits an implicit return statement.  Otherwise appends non-empty lines.
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {*} bodyResult
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {string} padStr  Indentation string for the return statement.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.appendBodyResult_ = function (parts, bodyResult, binaryen, funcInfo, padStr) {
  if (
    bodyResult &&
    'string' !== typeof bodyResult &&
    'string' === typeof bodyResult['s'] &&
    funcInfo.results !== binaryen.none &&
    0 !== funcInfo.results
  ) {
    parts[parts.length] = padStr + 'return ' + this.renderImplicitReturn_(binaryen, bodyResult, funcInfo.results) + ';';
  } else {
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }
};

/**
 * @private
 * @typedef {{
 *   hasExpression: boolean,
 *   expressionString: string,
 *   expressionCategory: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_;

/**
 * Normalizes one traversal child result into the string/category shape used
 * by string-emitting backends.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} index
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_}
 */
Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_ = function (childResults, index) {
  if (index >= childResults.length) {
    return {
      hasExpression: false,
      expressionString: '0',
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }

  var /** @const {*} */ value = childResults[index].childTraversalResult;
  if ('string' === typeof value) {
    return {
      hasExpression: true,
      expressionString: value,
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }
  if (value && 'string' === typeof value['s']) {
    return {
      hasExpression: true,
      expressionString: /** @type {string} */ (value['s']),
      expressionCategory:
        'number' === typeof value['c'] ? /** @type {number} */ (value['c']) : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
    };
  }

  return {
    hasExpression: false,
    expressionString: '0',
    expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID
  };
};

// ---------------------------------------------------------------------------
// Label prefix constants.
// ---------------------------------------------------------------------------

/**
 * Marker prefix that the switch-dispatch-detection pass prepends to the outer
 * block of a br_table dispatch.  After the label-prefixing pass this becomes
 * {@code 'sw$'}.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.SW_DISPATCH_PREFIX_ = 'sw$';

/**
 * Prefix for blocks fused with their sole-child/sole-parent loop by the
 * BlockLoopFusionPass.  Backend emitters that see this prefix suppress the
 * block wrapper and redirect breaks targeting the block to the associated loop.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_ = 'lb$';

/**
 * Prefix for loops whose trailing self-continue was removed by the
 * LoopSimplificationPass.  Backend emitters emit `for(;;)` with no
 * trailing break.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LC_CONTINUE_PREFIX_ = 'lc$';

/**
 * Prefix for loops converted to do-while by the LoopSimplificationPass.
 * The body block's last child is the bare condition expression.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LD_DOWHILE_PREFIX_ = 'ld$';

/**
 * Prefix for label-elided for(;;) loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LF_FORLOOP_PREFIX_ = 'lf$';

/**
 * Prefix for label-elided do-while loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LE_DOWHILE_PREFIX_ = 'le$';

/**
 * Prefix for labeled while loops (condition hoisted from loop body).
 * The body block's last child is the inverted condition expression.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LW_WHILE_PREFIX_ = 'lw$';

/**
 * Prefix for label-elided while loops (no label needed in output).
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.LY_WHILE_PREFIX_ = 'ly$';

/**
 * Prefix for the outermost block of a root-switch-loop pattern detected by
 * the RootSwitchDetectionPass.  Backend emitters that see this prefix
 * collapse the outer block wrappers into a single loop+switch with exit
 * paths inlined into the switch cases.
 *
 * @protected
 * @const {string}
 */
Wasm2Lang.Backend.AbstractCodegen.RS_ROOT_SWITCH_PREFIX_ = 'rs$';

/**
 * Returns true when {@code name} starts with {@code prefix}.
 *
 * Replaces the repeated {@code 0 === name.indexOf(prefix)} idiom across all
 * backend and pass code, improving readability without changing semantics.
 *
 * @protected
 * @param {string} name
 * @param {string} prefix
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.hasPrefix_ = function (name, prefix) {
  return 0 === name.indexOf(prefix);
};

/**
 * Returns true if the given loop name carries a label-elided prefix,
 * meaning backends should omit the label and emit plain break/continue.
 * Delegates to LoopSimplificationApplication.
 *
 * @protected
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isLabelElided = function (name) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.LoopSimplificationApplication.isLabelElided(name);
};

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchCaseGroup} */
Wasm2Lang.Backend.AbstractCodegen.SwitchCaseGroup_;

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */
Wasm2Lang.Backend.AbstractCodegen.SwitchDispatchInfo_;

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.RootSwitchInfo} */
Wasm2Lang.Backend.AbstractCodegen.RootSwitchInfo_;

/**
 * Shared state shape for labeled-break backends (asm.js, Java).
 * Both AsmjsCodegen.EmitState_ and JavaCodegen.EmitState_ are structural
 * subtypes of this (they carry all these fields plus backend-specific ones).
 *
 * @protected
 * @typedef {{
 *   binaryen: !Binaryen,
 *   indent: number,
 *   wasmModule: !BinaryenModule,
 *   functionInfo: !BinaryenFunctionInfo,
 *   visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor,
 *   labelMap: !Object<string, number>,
 *   labelKinds: !Object<string, string>,
 *   fusedBlockToLoop: !Object<string, string>,
 *   pendingBlockFusion: string,
 *   currentLoopName: string,
 *   rootSwitchExitMap: ?Object<string, !Array<number>>,
 *   rootSwitchRsName: string,
 *   rootSwitchLoopName: string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_;

/**
 * Coerces the flat-switch condition expression before emission.
 * Default returns the expression unchanged; asm.js overrides to apply
 * signed coercion ({@code |0}).
 *
 * @protected
 * @param {string} condStr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.coerceSwitchCondition_ = function (condStr) {
  return condStr;
};

/**
 * Shared enter callback for labeled-break backends (asm.js, Java).
 * Records label kinds, handles block-loop fusion, and adjusts indent.
 * PHP overrides its own {@code emitEnter_} entirely (uses labelStack).
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLabeledEnter_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ hp = A.hasPrefix_;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr['name']);
    if (bName) {
      state.labelKinds[bName] = 'block';
      var /** @const {string} */ fName = state.functionInfo.name;
      var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ fusionPlan = this.getBlockFusionPlan_(fName, bName);
      if (fusionPlan) {
        if ('a' === fusionPlan.fusionVariant) {
          state.pendingBlockFusion = bName;
        } else {
          state.fusedBlockToLoop[bName] = state.currentLoopName;
        }
      } else if (this.isBlockRootSwitch_(fName, bName)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (this.isBlockSwitchDispatch_(fName, bName)) {
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.LB_FUSION_PREFIX_)) {
        // Prefix fallback for when plans are not available.
        var /** @const {!Array<number>|void} */ ch = /** @type {!Array<number>|void} */ (expr['children']);
        if (ch && 1 === ch.length && binaryen.getExpressionInfo(ch[0]).id === binaryen.LoopId) {
          state.pendingBlockFusion = bName;
        } else {
          state.fusedBlockToLoop[bName] = state.currentLoopName;
        }
      } else if (hp(bName, A.RS_ROOT_SWITCH_PREFIX_)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (hp(bName, A.SW_DISPATCH_PREFIX_)) {
        ++state.indent;
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else {
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr['name']);
    state.labelKinds[loopName] = 'loop';
    state.currentLoopName = loopName;
    ++state.indent;
    if ('' !== state.pendingBlockFusion) {
      state.fusedBlockToLoop[state.pendingBlockFusion] = loopName;
      state.pendingBlockFusion = '';
    }
  } else if (binaryen.IfId === id) {
    ++state.indent;
  }

  return null;
};

/**
 * Default flat-switch emitter for labeled-break backends.
 * Java overrides to also set {@code lastExprIsTerminal}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledFlatSwitch(this, state, nodeCtx).emittedString;
};

/**
 * Default root-switch emitter for labeled-break backends.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitRootSwitch_ = function (state, nodeCtx) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledRootSwitch(this, state, nodeCtx);
};

/**
 * Default enter callback for labeled-break backends.
 * PHP overrides entirely (uses labelStack).
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  return this.emitLabeledEnter_(state, nodeCtx);
};

/**
 * Shared leave-callback indent adjustment for labeled-break backends.
 * Decrements state.indent for LoopId, IfId, and named blocks (excluding
 * fused blocks and root-switch blocks).  PHP overrides its leave callback
 * entirely because it additionally pops labelStack entries.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.adjustLeaveIndent_ = function (state, nodeCtx) {
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {number} */ id = /** @type {number} */ (expr['id']);
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  if (binaryen.LoopId === id || binaryen.IfId === id) {
    --state.indent;
  } else if (binaryen.BlockId === id && expr['name']) {
    var /** @const {string} */ bn = /** @type {string} */ (expr['name']);
    var /** @const {string} */ fn = state.functionInfo.name;
    var /** @const {boolean} */ isFused =
        !!this.getBlockFusionPlan_(fn, bn) || 0 === bn.indexOf(Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_);
    var /** @const {boolean} */ isRootSwitch =
        this.isBlockRootSwitch_(fn, bn) || 0 === bn.indexOf(Wasm2Lang.Backend.AbstractCodegen.RS_ROOT_SWITCH_PREFIX_);
    if (!isFused && !isRootSwitch) {
      --state.indent;
    }
  }
};

/**
 * Assembles child result strings into the body of a block node.
 * Shared across all three backends — the loop and semicolon-appending
 * logic is identical; only the final block wrapping differs per backend.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} emitCount  Number of children to assemble (may exclude
 *     trailing condition expression for do-while/while bodies).
 * @param {number} childInd   Indentation level for expression-statement lines.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.assembleBlockChildren_ = function (childResults, emitCount, childInd) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Array<string>} */ lines = [];
  for (var /** number */ bi = 0; bi < emitCount; ++bi) {
    var /** @const {string} */ childCode = A.getChildResultInfo_(childResults, bi).expressionString;
    if ('' !== childCode) {
      if (-1 === childCode.indexOf('\n')) {
        lines[lines.length] = pad(childInd) + childCode + ';\n';
      } else {
        lines[lines.length] = childCode;
      }
    }
  }
  return lines.join('');
};

/**
 * Wraps a single break/continue statement in a conditional if the break
 * expression has a condition pointer.  Shared across all three backends
 * for the common BreakId conditional-wrapping pattern.
 *
 * @protected
 * @param {number} ind   Current indentation level.
 * @param {number} condPtr  Condition pointer (0 = unconditional).
 * @param {string} condExpr  Rendered condition expression (from child result).
 * @param {string} stmt  The break/continue statement string (including trailing newline).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitConditionalStatement_ = function (ind, condPtr, condExpr, stmt) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  if (0 !== condPtr) {
    return pad(ind) + 'if ' + this.formatCondition_(condExpr) + ' {\n' + pad(ind + 1) + stmt + pad(ind) + '}\n';
  }
  return pad(ind) + stmt;
};

/**
 * Emits a BreakId with root-switch exit interception for labeled-break backends.
 * Returns the rendered result string and whether the break is terminal (needed
 * by Java to suppress unreachable trailing break statements).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {number} indent
 * @param {string} brName
 * @param {number} brCondPtr
 * @param {string} condExpr
 * @return {{emittedString: string, isTerminal: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBreakStatement_ = function (state, indent, brName, brCondPtr, condExpr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (state.rootSwitchExitMap) {
    if (brName in state.rootSwitchExitMap) {
      var /** @const {!Array<string>} */ rsExitLines = [];
      // prettier-ignore
      var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ rsVis =
        /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);
      var /** @const */ SDA = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication;
      var /** @const {boolean} */ rsIsTerminal = SDA.emitRootSwitchExitCode(
          rsExitLines,
          state.wasmModule,
          binaryen,
          state.functionInfo,
          rsVis,
          state.rootSwitchExitMap[brName],
          indent
        );
      if (!rsIsTerminal) {
        rsExitLines[rsExitLines.length] =
          pad(indent) + this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
      }
      var /** @type {string} */ rsResult;
      if (0 !== brCondPtr) {
        rsResult = pad(indent) + 'if ' + this.formatCondition_(condExpr) + ' {\n' + rsExitLines.join('') + pad(indent) + '}\n';
      } else {
        rsResult = rsExitLines.join('');
      }
      return {emittedString: rsResult, isTerminal: true};
    }
    if (brName === state.rootSwitchRsName) {
      var /** @const {string} */ rsBreakStmt = this.renderLabeledJump_(state.labelMap, 'break', state.rootSwitchLoopName);
      return {
        emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, rsBreakStmt),
        isTerminal: 0 === brCondPtr
      };
    }
  }

  var /** @const {string} */ brStmt = this.resolveBreakTarget_(
      state.labelKinds,
      state.fusedBlockToLoop,
      state.labelMap,
      brName
    );
  return {emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, brStmt), isTerminal: 0 === brCondPtr};
};

/**
 * Emits a raw SwitchId (br_table not detected as flat-switch dispatch) for
 * labeled-break backends.  Returns the rendered switch and whether a default
 * case is present (needed by Java to track terminal state).
 *
 * @suppress {accessControls}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {number} indent
 * @param {string} condExpr
 * @param {!Array<string>} names
 * @param {string} defaultName
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSwitchStatement_ = function (state, indent, condExpr, names, defaultName) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ lines = [];
  lines[lines.length] = pad(indent) + 'switch (' + this.coerceSwitchCondition_(condExpr) + ') {\n';
  var /** @type {number} */ si = 0;
  var /** @const {number} */ nameLen = names.length;
  while (si < nameLen) {
    var /** @const {string} */ target = names[si];
    while (si < nameLen && names[si] === target) {
      lines[lines.length] = pad(indent + 1) + 'case ' + si + ':\n';
      ++si;
    }
    lines[lines.length] =
      pad(indent + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, target);
  }
  if ('' !== defaultName) {
    lines[lines.length] = pad(indent + 1) + 'default:\n';
    lines[lines.length] =
      pad(indent + 2) + this.resolveBreakTarget_(state.labelKinds, state.fusedBlockToLoop, state.labelMap, defaultName);
  }
  lines[lines.length] = pad(indent) + '}\n';
  return {emittedString: lines.join(''), hasDefault: '' !== defaultName};
};

/**
 * Emits a BlockId node body for labeled-break backends (asm.js, Java).
 * Handles fused blocks, do-while/while body detection, and child assembly.
 * Callers handle prefix dispatch (root-switch, flat-switch) before calling.
 * PHP handles BlockId directly because it uses different block wrapping.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLabeledBlock_ = function (state, nodeCtx, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  var /** @const {!Object<string, *>} */ expr = /** @type {!Object<string, *>} */ (nodeCtx.expression);
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr['name']);
  var /** @const {number} */ ind = state.indent;
  var /** @const {boolean} */ isFused =
      !!blockName &&
      (!!this.getBlockFusionPlan_(state.functionInfo.name, blockName) || A.hasPrefix_(blockName, A.LB_FUSION_PREFIX_));
  var /** @const {number} */ childInd = blockName && !isFused ? ind + 1 : ind;
  var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, childResults.length, childInd);
  if (isFused) {
    return blockBody;
  }
  if (blockName) {
    return pad(ind) + this.labelN_(state.labelMap, blockName) + ': {\n' + blockBody + pad(ind) + '}\n';
  }
  return blockBody;
};

/**
 * Returns the infinite-loop header keyword.  Default is {@code 'for (;;)'}
 * for asm.js and Java; PHP overrides to {@code 'while (true)'}.
 *
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.infiniteLoopKeyword_ = function () {
  return 'for (;;)';
};

/**
 * Emits a simplified loop (for/dowhile/while) from a LoopPlan.
 * All three backends share this structure; the only variation is the label
 * prefix (labeled-break backends use {@code labelN_ + ': '}, PHP omits it)
 * and the raw-loop fallback (handled by each backend after this returns null).
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {!Wasm2Lang.Wasm.Tree.LoopPlan} loopPlan
 * @param {number} ind   Current indentation level.
 * @param {string} label  Label prefix string (e.g. {@code 'L0: '}) or empty for unlabeled.
 * @param {string} bodyCode  The rendered body from the child result.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSimplifiedLoop_ = function (state, loopPlan, ind, label, bodyCode) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ pad = A.pad_;
  if ('for' === loopPlan.simplifiedLoopKind) {
    return pad(ind) + label + this.infiniteLoopKeyword_() + ' {\n' + bodyCode + pad(ind) + '}\n';
  }
  var /** @const {string} */ cond = A.subWalkExpressionString_(state, loopPlan.conditionPtr);
  if ('dowhile' === loopPlan.simplifiedLoopKind) {
    return pad(ind) + label + 'do {\n' + bodyCode + pad(ind) + '} while ' + this.formatCondition_(cond) + ';\n';
  }
  return pad(ind) + label + 'while ' + this.formatCondition_(cond) + ' {\n' + bodyCode + pad(ind) + '}\n';
};

/**
 * Sub-walks a single expression pointer through the given visitor, reusing the
 * same enter/leave callbacks as the main code-gen traversal.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {number} exprPtr
 * @return {*}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_ = function (wasmModule, binaryen, funcInfo, visitor, exprPtr) {
  if (0 === exprPtr) {
    return '';
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
      binaryen: binaryen,
      treeModule: wasmModule,
      functionInfo: funcInfo,
      treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
      ancestors: []
    };
  return Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(exprPtr, ctx, visitor);
};

/**
 * Extracts the code string from a sub-walk result (which may be a plain string
 * or a typed expression object {@code {s, c}}).
 *
 * @protected
 * @param {*} result
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkString_ = function (result) {
  if ('string' === typeof result) {
    return result;
  }
  if (result && 'object' === typeof result) {
    var /** @const {*} */ s = result['s'];
    if ('string' === typeof s) {
      return /** @type {string} */ (s);
    }
  }
  return '';
};

/**
 * Sub-walks an expression pointer and returns its string form.
 * Convenience wrapper combining subWalkExpression_ and subWalkString_.
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {number} conditionPtr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionString_ = function (state, conditionPtr) {
  return Wasm2Lang.Backend.AbstractCodegen.subWalkString_(
    Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_(
      state.wasmModule,
      state.binaryen,
      state.functionInfo,
      /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor),
      conditionPtr
    )
  );
};

/**
 * Emits an if/if-else statement.  All backends share the same structure;
 * only the condition formatting differs (dispatched via formatCondition_).
 *
 * @protected
 * @param {number} indent
 * @param {string} conditionExpr  Raw condition child result string.
 * @param {string} trueCode       True-branch child result string.
 * @param {number} ifFalsePtr     Binaryen pointer to else branch (0 if none).
 * @param {number} childCount     Number of child results.
 * @param {string=} opt_falseCode False-branch child result string.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitIfStatement_ = function (
  indent,
  conditionExpr,
  trueCode,
  ifFalsePtr,
  childCount,
  opt_falseCode
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ cond = this.formatCondition_(conditionExpr);
  if (0 !== ifFalsePtr && 2 < childCount) {
    return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '} else {\n' + opt_falseCode + pad(indent) + '}\n';
  }
  return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '}\n';
};

/**
 * Emits a local.set or local.tee expression.  Shared across all backends —
 * name formatting dispatches through localN_; coercion through coerceToType_.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} functionInfo
 * @param {number} indent
 * @param {boolean} isTee
 * @param {number} localIndex
 * @param {string} valueExpr
 * @param {number} valueCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLocalSet_ = function (
  binaryen,
  functionInfo,
  indent,
  isTee,
  localIndex,
  valueExpr,
  valueCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {number} */ localType = Wasm2Lang.Backend.ValueType.getLocalType(binaryen, functionInfo, localIndex);
  var /** @const {string} */ setValue = this.coerceToType_(binaryen, valueExpr, valueCat, localType);
  if (isTee) {
    return {
      emittedString: '(' + this.localN_(localIndex) + ' = ' + setValue + ')',
      resultCat: A.catForCoercedType_(binaryen, localType)
    };
  }
  return {emittedString: pad(indent) + this.localN_(localIndex) + ' = ' + setValue + ';\n', resultCat: A.CAT_VOID};
};
