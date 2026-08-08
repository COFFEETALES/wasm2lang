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
  for (var /** @type {number} */ i = 0, /** @const {number} */ lineCount = lines.length; i !== lineCount; ++i) {
    if ('' !== lines[i]) {
      parts.push(lines[i]);
    }
  }
};

/**
 * Typed-expression object produced by sub-walks and {@code emitLeave_}
 * callbacks: a rendered code string ({@code w2lExprStr}) plus its
 * {@code CAT_*} expression category ({@code w2lExprCat}).  The field names
 * are deliberately verbose and {@code w2l}-prefixed — and accessed only via
 * unquoted dot notation — so Closure can mangle them (same convention as
 * {@code SimplifiedLoopEmit_}).  Receivers typed {@code *} / {@code Object}
 * cast to this typedef at the access site so the dot access satisfies
 * strict-mode property checking.
 *
 * @protected
 * @typedef {{
 *   w2lExprStr: string,
 *   w2lExprCat: number,
 *   w2lExprTerminal: (boolean|undefined),
 *   w2lExprMayExitFunction: (boolean|undefined),
 *   w2lExprBranchTargets: (!Array<string>|undefined)
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.TypedExpr_;

/**
 * Reads the {@code w2lExprCat} category field from a typed-expression object,
 * returning {@code CAT_VOID} when the field is missing or non-numeric.
 * Centralizes the category-extraction guard used by return/sub-walk/child
 * helpers — load-bearing because a valid {@code FIXNUM} value of {@code 0}
 * would otherwise be misread as absent.
 *
 * @protected
 * @param {*} typedExpr
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.categoryOf_ = function (typedExpr) {
  var /** @const {*} */ c = /** @type {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ (typedExpr).w2lExprCat;
  return 'number' === typeof c ? /** @type {number} */ (c) : Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
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
  var /** @const {string} */ implicitExpr = /** @type {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ (bodyResult)
      .w2lExprStr;
  var /** @const {number} */ implicitCat = Wasm2Lang.Backend.AbstractCodegen.categoryOf_(bodyResult);
  return this.coerceAtBoundary_(binaryen, implicitExpr, implicitCat, resultType);
};

/**
 * Appends a function body traversal result to the output parts array.
 * If the result is a typed expression and the function has a return type,
 * emits an implicit return statement.  Otherwise appends non-empty lines.
 *
 * Returns {@code true} when the appended body already ends with a
 * {@code return} statement, so callers can skip emitting a trailing
 * default return (avoids unreachable-code warnings).
 *
 * @protected
 * @param {!Array<string>} parts
 * @param {*} bodyResult
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {string} padStr  Indentation string for the return statement.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.appendBodyResult_ = function (parts, bodyResult, binaryen, funcInfo, padStr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  // prettier-ignore
  var /** @const {?Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ typed =
    bodyResult && 'string' !== typeof bodyResult
      ? /** @type {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ (bodyResult)
      : null;

  if (typed && true === typed.w2lExprTerminal) {
    return A.appendAndProbeReturn_(parts, typed.w2lExprStr);
  }
  if (typed && 'string' === typeof typed.w2lExprStr) {
    if (binaryen.none !== funcInfo.results && 0 !== funcInfo.results) {
      var /** @const {*} */ prefix = /** @type {{w2lRootValueBlockPrefix: *}} */ (bodyResult).w2lRootValueBlockPrefix;
      if ('string' === typeof prefix && '' !== prefix) {
        A.appendNonEmptyLines_(parts, /** @type {string} */ (prefix));
      }
      parts.push(padStr + 'return ' + this.renderImplicitReturn_(binaryen, bodyResult, funcInfo.results) + ';');
      return true;
    }
    return A.appendAndProbeReturn_(parts, typed.w2lExprStr);
  }
  return A.appendAndProbeReturn_(parts, bodyResult);
};

/**
 * Appends {@code text}'s non-empty lines to {@code parts} and reports whether
 * the appended body ends in a {@code return} statement.  Every exit of
 * {@code appendBodyResult_} that is not the synthesized implicit return goes
 * through here, so the "did the body already return?" probe is written once.
 *
 * @private
 * @param {!Array<string>} parts
 * @param {*} text
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.appendAndProbeReturn_ = function (parts, text) {
  var /** @const {number} */ beforeLen = parts.length;
  Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, text);
  return parts.length > beforeLen && /^\s*return\b/.test(parts[parts.length - 1]);
};

/**
 * @private
 * @typedef {{
 *   hasExpression: boolean,
 *   expressionString: string,
 *   expressionCategory: number,
 *   isTerminal: boolean,
 *   mayExitFunction: boolean,
 *   branchTargets: !Array<string>
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_;

/** @const {!Array<string>} */
Wasm2Lang.Backend.AbstractCodegen.EMPTY_BRANCH_TARGETS_ = [];

/** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */
Wasm2Lang.Backend.AbstractCodegen.EMPTY_CHILD_RESULT_ = {
  hasExpression: false,
  expressionString: '0',
  expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID,
  isTerminal: false,
  mayExitFunction: false,
  branchTargets: Wasm2Lang.Backend.AbstractCodegen.EMPTY_BRANCH_TARGETS_
};

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
    return Wasm2Lang.Backend.AbstractCodegen.EMPTY_CHILD_RESULT_;
  }

  var /** @const {*} */ value = childResults[index];
  if ('string' === typeof value) {
    return {
      hasExpression: true,
      expressionString: value,
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID,
      isTerminal: false,
      mayExitFunction: false,
      branchTargets: Wasm2Lang.Backend.AbstractCodegen.EMPTY_BRANCH_TARGETS_
    };
  }
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ typedValue =
      /** @type {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ (value);
  if (value && 'string' === typeof typedValue.w2lExprStr) {
    return {
      hasExpression: true,
      expressionString: typedValue.w2lExprStr,
      expressionCategory: Wasm2Lang.Backend.AbstractCodegen.categoryOf_(value),
      isTerminal: true === typedValue.w2lExprTerminal,
      mayExitFunction: true === typedValue.w2lExprMayExitFunction,
      branchTargets: Array.isArray(typedValue.w2lExprBranchTargets)
        ? typedValue.w2lExprBranchTargets
        : Wasm2Lang.Backend.AbstractCodegen.EMPTY_BRANCH_TARGETS_
    };
  }

  return Wasm2Lang.Backend.AbstractCodegen.EMPTY_CHILD_RESULT_;
};

/** @protected @typedef {!Wasm2Lang.Wasm.Tree.ControlFlowSummary} */
Wasm2Lang.Backend.AbstractCodegen.ControlSummary_;

/**
 * Appends unique branch targets from {@code source} to {@code destination}.
 * Control summaries are tiny and short-lived, so a linear scan keeps the
 * representation compact and Closure-friendly without maps or sentinels.
 *
 * @protected
 * @param {!Array<string>} destination
 * @param {!Array<string>} source
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.appendUniqueBranchTargets_ = function (destination, source) {
  Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.appendUniqueBranchTargets(destination, source);
};

/**
 * Merges the possible non-local control transfers of child results.  This
 * summary is carried even by non-terminal expressions: a conditional branch
 * may bypass a later terminal child when a containing block is assembled.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number=} opt_count
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_}
 */
Wasm2Lang.Backend.AbstractCodegen.mergeChildControl_ = function (childResults, opt_count) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {number} */ count = void 0 === opt_count ? childResults.length : /** @type {number} */ (opt_count);
  var /** @type {boolean} */ mayExitFunction = false;
  var /** @const {!Array<string>} */ targets = [];
  for (var /** @type {number} */ i = 0; i !== count; ++i) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ child = A.getChildResultInfo_(childResults, i);
    mayExitFunction = mayExitFunction || child.mayExitFunction;
    A.appendUniqueBranchTargets_(targets, child.branchTargets);
  }
  return {isTerminal: false, mayExitFunction: mayExitFunction, branchTargets: targets};
};

/**
 * Returns the precomputed semantic summary attached by the shared codegen
 * traversal when enter returned SKIP_SUBTREE for a block or loop.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.ControlFlowSummary}
 */
Wasm2Lang.Backend.AbstractCodegen.getSkippedControlSummary_ = function (childResults) {
  var /** @const {!Wasm2Lang.Wasm.Tree.SkippedControlSummaryCarrier} */ carrier =
      /** @type {!Wasm2Lang.Wasm.Tree.SkippedControlSummaryCarrier} */ (childResults);
  return carrier.w2lSkippedControlSummary || null;
};

/**
 * Builds {@code {cr, cc}} child-result accessor closures for
 * {@code emitLeave_} dispatch tables.  {@code cr(i)} returns the expression
 * string, {@code cc(i)} returns the expression category.  Centralizes the
 * preamble that each backend's {@code emitLeave_} would otherwise declare
 * verbatim.
 *
 * @protected
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {{cr: function(number): string, cc: function(number): number}}
 */
Wasm2Lang.Backend.AbstractCodegen.makeChildAccessors_ = function (childResults) {
  var /** @const */ get = Wasm2Lang.Backend.AbstractCodegen.getChildResultInfo_;
  return {
    cr: /** @param {number} i @return {string} */ function (i) {
      return get(childResults, i).expressionString;
    },
    cc: /** @param {number} i @return {number} */ function (i) {
      return get(childResults, i).expressionCategory;
    }
  };
};

// ---------------------------------------------------------------------------
// Label-elided loop name detection.
//
// Loop normalization tags labels that need no source-level label with one of
// the w2l_u{for,dowhile,while}$ prefixes.  Backends omit the label and emit
// plain break/continue when the name matches.
// ---------------------------------------------------------------------------

/**
 * @private
 * @const {!RegExp}
 */
Wasm2Lang.Backend.AbstractCodegen.LABEL_ELIDED_RE_ = /^w2l_u(?:for|dowhile|while)\$/;

/**
 * Returns true if the given loop name carries a label-elided prefix,
 * meaning backends should omit the label and emit plain break/continue.
 *
 * @protected
 * @param {string} name
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isLabelElided = function (name) {
  return Wasm2Lang.Backend.AbstractCodegen.LABEL_ELIDED_RE_.test(name);
};

/**
 * Returns true when an unlabeled break/continue would reach the same target,
 * meaning the explicit label can be omitted from both the jump statement and
 * the loop declaration.
 *
 * For {@code 'break'}: the target must be the innermost loop or switch on the
 * breakable stack (labeled blocks are not targets of unlabeled break).
 * For {@code 'continue'}: the target must be the innermost loop (switches are
 * transparent to continue).
 *
 * @protected
 * @param {!Array<string>} breakableStack  Stack of loop names and {@code '*'}
 *     sentinels for switches.
 * @param {string} keyword  {@code 'break'} or {@code 'continue'}.
 * @param {string} resolvedName  Already-resolved target name.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isBreakLabelImplicit_ = function (breakableStack, keyword, resolvedName) {
  var /** @const {number} */ len = breakableStack.length;
  if (0 === len) return false;
  if ('continue' === keyword) {
    for (var /** @type {number} */ i = len - 1; 0 <= i; --i) {
      if ('*' !== breakableStack[i]) {
        return breakableStack[i] === resolvedName;
      }
    }
    return false;
  }
  return breakableStack[len - 1] === resolvedName;
};

/**
 * Tests whether {@code info} is a Break expression targeting {@code targetName}
 * with (or without) a condition.  Used by loop-kind detection and loop-body
 * sub-walkers to locate break-to-loop and break-to-exit children.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} info
 * @param {?string} targetName
 * @param {boolean} conditional  {@code true} → requires a non-zero condition;
 *     {@code false} → requires an unconditional break.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.isBreakTo_ = function (binaryen, info, targetName, conditional) {
  if (binaryen.BreakId !== info.id) return false;
  if (/** @type {?string} */ (info.name) !== targetName) return false;
  return conditional === (0 !== /** @type {number} */ (info.condition || 0));
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
 *   rootSwitchLoopName: string,
 *   breakableStack: !Array<string>,
 *   usedLabels: !Object<string, boolean>,
 *   lastExprIsTerminal: boolean,
 *   pendingLoopKind: string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_;

/**
 * State shape for the class-shaped backends (Java, C#): every
 * {@code LabeledEmitState_} field plus the module-level lookup tables the
 * shared class emitters read and the exit-label set C# writes.  This is the
 * exact shape {@code emitClassMethod_} builds; JavaCodegen.EmitState_ and
 * CsharpCodegen.EmitState_ are structural aliases of it.
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
 *   rootSwitchLoopName: string,
 *   breakableStack: !Array<string>,
 *   usedLabels: !Object<string, boolean>,
 *   usedExitLabels: !Object<string, boolean>,
 *   lastExprIsTerminal: boolean,
 *   pendingLoopKind: string,
 *   functionSignatures: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>,
 *   globalTypes: !Object<string, number>,
 *   functionTables: !Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>,
 *   importedNames: !Object<string, string>,
 *   stdlibNames: ?Object<string, string>,
 *   stdlibGlobals: ?Object<string, string>,
 *   exportNameMap: !Object<string, string>
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.ClassEmitState_;

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
 * Produces the flat-switch text and default-case flag for a br_table
 * dispatch block.  Default is the shared labeled emitter; C# overrides with
 * its goto-exit-label variant.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.labeledFlatSwitchResult_ = function (state, nodeCtx) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledFlatSwitch(this, state, nodeCtx);
};

/**
 * Default flat-switch emitter for labeled-break backends.  The class-shaped
 * backends install {@code emitClassFlatSwitch_} instead, which additionally
 * records the default-case terminality; setting it here would flip
 * {@code lastExprIsTerminal} for asm.js, which never writes it and whose
 * shared {@code emitForLoopBody_} reads it to decide a trailing
 * {@code break;}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitFlatSwitch_ = function (state, nodeCtx) {
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const {string} */ r = this.labeledFlatSwitchResult_(state, nodeCtx).emittedString;
  --state.breakableStack.length;
  return r;
};

/**
 * Flat-switch emitter for the class-shaped backends (installed as
 * {@code emitFlatSwitch_} by Java and C#): same push/produce/pop as the
 * default, plus recording whether the switch carries a default case so an
 * unreachable trailing statement can be suppressed.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitClassFlatSwitch_ = function (state, nodeCtx) {
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const */ fsResult = this.labeledFlatSwitchResult_(state, nodeCtx);
  --state.breakableStack.length;
  state.lastExprIsTerminal = fsResult.hasDefault;
  return fsResult.emittedString;
};

/**
 * Returns true when this backend must validate pre-normalized flat-switch
 * descriptors before replacing a block with custom switch emission.
 *
 * The asm.js release pipeline is sensitive to stale switch-dispatch metadata
 * rebuilt from binary-only normalized input. Other backends keep their
 * historical behavior unless they opt in explicitly.
 *
 * @protected
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.shouldValidateSwitchDispatchStructure_ = function () {
  return false;
};

/**
 * Whether a metadata-marked switch-dispatch block may take the flat-switch
 * path.  Backends that validate pre-normalized descriptors
 * ({@code shouldValidateSwitchDispatchStructure_}) accept only a block whose
 * dispatch structure still extracts cleanly.  Metadata rebuilt from a
 * pre-normalized binary can point at a block whose dispatch wrapper was
 * flattened or otherwise drifted; on reject the caller falls back to the
 * generic named-block path, which preserves semantics — forcing the
 * flat-switch path would emit {@code switch (|0) {}} from the empty fallback
 * descriptor returned by {@code extractStructure()}.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.acceptsFlatSwitchStructure_ = function (binaryen, nodeCtx) {
  if (!this.shouldValidateSwitchDispatchStructure_()) {
    return true;
  }
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} */ dispatchInfo =
      Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.extractStructure(binaryen, nodeCtx.expressionPointer);
  return Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.hasValidStructure(dispatchInfo);
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
  state.breakableStack[state.breakableStack.length] = '*';
  var /** @const {string} */ r = Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitLabeledRootSwitch(
      this,
      state,
      nodeCtx
    );
  --state.breakableStack.length;
  return r;
};

/**
 * IR-based fallback detection for block-loop fusion pattern A: a named block
 * whose first reachable child is a Loop and no code after it is reachable.
 * Used when metadata-based detection fails after binary round-trip.
 *
 * Uses {@code reachableBlockChildCount_} so both the .wast codegen path (where
 * dead siblings may still be present as typed-unreachable statements) and the
 * binary round-trip path (where binaryen has elided them to an explicit
 * unreachable instruction) agree on fusability.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr  The block expression.
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.detectBlockLoopFusionFromIR_ = function (binaryen, expr) {
  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || children.length < 1) return false;
  var /** @const {number} */ reachableCount = Wasm2Lang.Backend.AbstractCodegen.reachableBlockChildCount_(binaryen, expr);
  if (1 !== reachableCount) return false;
  var /** @const {!BinaryenExpressionInfo} */ firstInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      children[0]
    );
  return binaryen.LoopId === firstInfo.id;
};

/**
 * Returns true when a named block can be emitted as a directly labeled
 * statement instead of a labeled block wrapper.
 *
 * Applies only to single-child named blocks whose sole child is a void/
 * unreachable-typed if WITHOUT an else arm.  Loops are excluded because
 * they already emit their own label, and asm.js rejects double-labeled
 * statements like {@code outer: inner: for (;;) ...}.
 *
 * If-with-else is also excluded: V8's asm.js validator rejects a
 * {@code break label;} statement that targets a label placed on an
 * {@code if} statement when the {@code break} originates from the
 * {@code else} arm — emitted as "Invalid asm.js: Illegal break".  Wrapping
 * the if in {@code label: { if (...) {...} else {...} }} sidesteps that
 * validator quirk and remains semantically identical for all targets.
 * The directly-labeled form is still kept for the if-without-else shape
 * (where every break naturally lives in the then arm), which is the
 * common case in normalized output and where the savings are real.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.canDirectLabelNamedBlock_ = function (binaryen, expr) {
  if (binaryen.BlockId !== expr.id || !expr.name) return false;
  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (expr.children);
  if (!children || children.length < 1) return false;
  // Binaryen may append a synthetic typed-unreachable sibling after a
  // terminator in the binary round-trip; treat the block as single-child
  // when only one reachable child precedes that artifact.
  var /** @const {number} */ reachableCount = Wasm2Lang.Backend.AbstractCodegen.reachableBlockChildCount_(binaryen, expr);
  if (1 !== reachableCount) return false;
  var /** @const {!BinaryenExpressionInfo} */ childInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      children[0]
    );
  if (binaryen.IfId !== childInfo.id) return false;
  if (binaryen.none !== childInfo.type && 0 !== childInfo.type && binaryen.unreachable !== childInfo.type) return false;
  return 0 === /** @type {number} */ (childInfo.ifFalse || 0);
};

/**
 * IR-based fallback detection for loop simplification patterns.
 * Inspects the loop body structure to determine if it matches a while,
 * dowhile, or for pattern.  Used when metadata-based loop plans are
 * unavailable after binary round-trip.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {!BinaryenExpressionInfo} expr  The loop expression.
 * @param {string} enclosingFusedBlock  Name of the enclosing fused block
 *     (from IR-detected or metadata-detected block-loop fusion), or empty
 *     string if none.
 * @return {?string}  'while', 'dowhile', 'for', or null.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.detectLoopKindFromIR_ = function (binaryen, wasmModule, expr, enclosingFusedBlock) {
  var /** @const */ NS = Wasm2Lang.Wasm.Tree.NodeSchema;
  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
  if (!bodyPtr) return null;
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = NS.safeGetExpressionInfo(binaryen, bodyPtr);
  var /** @const {string} */ loopName = /** @type {string} */ (expr.name);

  // Direct conditional br_if body: do-while with empty body.
  if (binaryen.BreakId === bodyInfo.id) {
    if (/** @type {?string} */ (bodyInfo.name) === loopName && 0 !== /** @type {number} */ (bodyInfo.condition || 0)) {
      return 'dowhile';
    }
    return null;
  }

  // While-if variant: loop body is If with no else arm.
  if (binaryen.IfId === bodyInfo.id) {
    if (0 === /** @type {number} */ (bodyInfo.ifFalse || 0)) {
      var /** @const {number} */ ifTruePtr = /** @type {number} */ (bodyInfo.ifTrue || 0);
      if (ifTruePtr) {
        var /** @const {!BinaryenExpressionInfo} */ ifTrueInfo = NS.safeGetExpressionInfo(binaryen, ifTruePtr);
        if (binaryen.BlockId === ifTrueInfo.id) {
          var /** @const {!Array<number>|void} */ thenCh = /** @type {!Array<number>|void} */ (ifTrueInfo.children);
          if (thenCh && thenCh.length >= 1) {
            var /** @const {!BinaryenExpressionInfo} */ thenLast = NS.safeGetExpressionInfo(
                binaryen,
                thenCh[thenCh.length - 1]
              );
            if (Wasm2Lang.Backend.AbstractCodegen.isBreakTo_(binaryen, thenLast, loopName, false)) {
              return 'while';
            }
          }
        }
      }
    }
    return null;
  }

  // Body must be Block for remaining patterns.
  if (binaryen.BlockId !== bodyInfo.id) return null;
  var /** @const {!Array<number>|void} */ children = /** @type {!Array<number>|void} */ (bodyInfo.children);
  if (!children || 0 === children.length) return null;
  var /** @const {number} */ len = children.length;
  var /** @const {!BinaryenExpressionInfo} */ lastInfo = NS.safeGetExpressionInfo(binaryen, children[len - 1]);

  if (binaryen.BreakId === lastInfo.id) {
    var /** @const {?string} */ lastName = /** @type {?string} */ (lastInfo.name);
    var /** @const {number} */ lastCond = /** @type {number} */ (lastInfo.condition || 0);

    // Do-while variant B: last child is conditional br_if targeting loop.
    if (lastName === loopName && 0 !== lastCond && len > 1) {
      if (!Wasm2Lang.Wasm.Tree.CustomPasses.hasInteriorLoopBackBranch(binaryen, wasmModule, children, 0, len - 1, loopName)) {
        return 'dowhile';
      }
    }

    // Do-while variant A: second-to-last is conditional br_if to loop,
    // last is unconditional br to exit.
    if (lastName !== loopName && 0 === lastCond && len >= 2) {
      var /** @const {!BinaryenExpressionInfo} */ prevInfo = NS.safeGetExpressionInfo(binaryen, children[len - 2]);
      if (Wasm2Lang.Backend.AbstractCodegen.isBreakTo_(binaryen, prevInfo, loopName, true) && len > 2) {
        if (!Wasm2Lang.Wasm.Tree.CustomPasses.hasInteriorLoopBackBranch(binaryen, wasmModule, children, 0, len - 2, loopName)) {
          return 'dowhile';
        }
      }
    }

    // Self-continue: last child is unconditional br targeting loop.
    if (lastName === loopName && 0 === lastCond) {
      // While-block refinement: first child is br_if targeting enclosing fused block.
      if (len >= 2 && '' !== enclosingFusedBlock) {
        var /** @const {!BinaryenExpressionInfo} */ firstInfo = NS.safeGetExpressionInfo(binaryen, children[0]);
        if (
          binaryen.BreakId === firstInfo.id &&
          0 !== /** @type {number} */ (firstInfo.condition || 0) &&
          /** @type {?string} */ (firstInfo.name) !== loopName &&
          /** @type {?string} */ (firstInfo.name) === enclosingFusedBlock
        ) {
          return 'while';
        }
      }
      return 'for';
    }
  }

  return null;
};

/**
 * Default enter callback for labeled-break backends (asm.js, Java).
 * Records label kinds, handles block-loop fusion, and adjusts indent.
 * PHP overrides entirely (uses labelStack).
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitEnter_ = function (state, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;

  if (binaryen.BlockId === id) {
    var /** @const {?string} */ bName = /** @type {?string} */ (expr.name);
    if (bName) {
      state.labelKinds[bName] = 'block';
      var /** @const {string} */ fName = state.functionInfo.name;
      var /** @const {?Wasm2Lang.Wasm.Tree.BlockFusionPlan} */ fusionPlan = this.getBlockFusionPlan_(fName, bName);
      if (fusionPlan) {
        if ('a' === fusionPlan.fusionVariant) {
          // Variant 'a': block wraps a loop as its sole child.
          // After binary round-trip, metadata positions may drift, pointing
          // to a block that is NOT a simple block-loop wrapper.  Validate
          // the structure before accepting the fusion plan; on mismatch, fall
          // through to the generic named-block path.
          if (this.detectBlockLoopFusionFromIR_(binaryen, expr)) {
            state.pendingBlockFusion = bName;
            return null;
          }
        } else {
          state.fusedBlockToLoop[bName] = state.currentLoopName;
          return null;
        }
      } else if (this.detectBlockLoopFusionFromIR_(binaryen, expr)) {
        // Block-loop fusion is a pure backend optimization: a named block
        // whose only child is a loop collapses into the loop, with breaks
        // targeting the block rerouted to the loop label.  Apply even
        // without simplification metadata so baseline/nopre output gets
        // {@code label: for(;;)...} instead of {@code label: { for(;;)... }},
        // which asm.js rejects as a double label when both names are kept.
        state.pendingBlockFusion = bName;
        if (this.irFusedBlocks_) this.irFusedBlocks_[fName + '\0' + bName] = 'a';
        return null;
      } else if (this.isBlockRootSwitch_(fName, bName)) {
        return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
      } else if (this.isBlockSwitchDispatch_(fName, bName)) {
        if (this.acceptsFlatSwitchStructure_(binaryen, nodeCtx)) {
          ++state.indent;
          return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
        }
      }
      if (!this.canDirectLabelNamedBlock_(binaryen, expr)) {
        ++state.indent;
      }
    }
  } else if (binaryen.LoopId === id) {
    var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
    state.labelKinds[loopName] = 'loop';
    state.currentLoopName = loopName;
    state.breakableStack[state.breakableStack.length] = loopName;
    ++state.indent;
    var /** @const {string} */ enclosingFusedBlock = state.pendingBlockFusion;
    if ('' !== state.pendingBlockFusion) {
      state.fusedBlockToLoop[state.pendingBlockFusion] = loopName;
      state.pendingBlockFusion = '';
    }
    var /** @type {?string} */ loopKind = null;
    var /** @const {?Wasm2Lang.Wasm.Tree.LoopPlan} */ metaLoopPlan = this.getLoopPlan_(state.functionInfo.name, loopName);
    if (metaLoopPlan) loopKind = metaLoopPlan.simplifiedLoopKind;
    if (!loopKind && this.useSimplifications_) {
      loopKind = this.detectLoopKindFromIR_(binaryen, state.wasmModule, expr, enclosingFusedBlock);
    }
    if (loopKind) {
      state.pendingLoopKind = loopKind;
      return {decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE};
    }
  } else if (binaryen.IfId === id) {
    ++state.indent;
  }

  return null;
};

/**
 * Shared leave-callback indent adjustment for labeled-break backends.
 * Decrements state.indent for LoopId, IfId, and named blocks (excluding
 * fused blocks, direct-labeled blocks, and root-switch blocks).  PHP
 * overrides its leave callback entirely because it additionally pops
 * labelStack entries.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.adjustLeaveIndent_ = function (state, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  if (binaryen.IfId === id) {
    --state.indent;
  } else if (binaryen.LoopId === id) {
    if (!state.pendingLoopKind) {
      --state.indent;
    }
    // Simplified loops manage indent in emitLeave_ (emitSimplifiedLoopFromIR_).
  } else if (binaryen.BlockId === id && expr.name) {
    var /** @const {string} */ bn = /** @type {string} */ (expr.name);
    var /** @const {string} */ fn = state.functionInfo.name;
    var /** @const {string|undefined} */ fusedTarget = state.fusedBlockToLoop[bn];
    var /** @const {boolean} */ canDirectLabel = this.canDirectLabelNamedBlock_(binaryen, expr);
    // '*' is the switch-sentinel redirect used by flat-switch emission; it
    // suppresses labeled breaks but does not represent a block-loop fusion,
    // so the enter/leave indent bump around the dispatch outer must still
    // balance here.  Real block-loop fusion keeps its leave decrement inside
    // the simplified-loop emitter instead.
    var /** @const {boolean} */ isFused = !!fusedTarget && fusedTarget !== '*';
    var /** @const {boolean} */ isRootSwitch = this.isBlockRootSwitch_(fn, bn);
    if (!isFused && !isRootSwitch && !canDirectLabel) {
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
  for (var /** @type {number} */ bi = 0; bi < emitCount; ++bi) {
    var /** @const {string} */ childCode = A.getChildResultInfo_(childResults, bi).expressionString;
    if ('' !== childCode) {
      if (-1 === childCode.indexOf('\n')) {
        lines.push(pad(childInd) + childCode + ';\n');
      } else {
        lines.push(childCode);
      }
    }
  }
  return lines.join('');
};

/**
 * Computes the count of block children to actually emit, eliding any that
 * follow an `unreachable`-typed sibling.  Java rejects unreachable
 * statements outright; asm.js/PHP merely waste bytes on dead code.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} blockExpr
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.reachableBlockChildCount_ = function (binaryen, blockExpr) {
  var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (blockExpr.children || []);
  for (var /** @type {number} */ i = 0; i < children.length; ++i) {
    var /** @const {!BinaryenExpressionInfo} */ ci = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
        binaryen,
        children[i]
      );
    if (binaryen.unreachable === ci.type) {
      return i + 1;
    }
  }
  return children.length;
};

/**
 * Classifies a loop body's trailing unconditional back-edge. Returns 1 when
 * the back-edge is unavoidable, 0 when a branch to an enclosing tail block
 * can bypass it, and -1 when the loop has no recognized trailing back-edge.
 *
 * A tail back-edge nested in a named block is not unavoidable when any path
 * can branch to that block's end. This distinction is required for Clang's
 * common validation loops, where an error branch skips the tail back-edge and
 * deliberately falls through after the loop.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {number} loopPtr
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.classifyLoopBackEdge_ = function (binaryen, wasmModule, loopPtr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!BinaryenExpressionInfo} */ loopInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      loopPtr
    );
  if (binaryen.LoopId !== loopInfo.id || !loopInfo.name || !loopInfo.body) return -1;

  var /** @type {!BinaryenExpressionInfo} */ tailInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
      binaryen,
      /** @type {number} */ (loopInfo.body)
    );
  var /** @type {boolean} */ canBypass = false;
  while (binaryen.BlockId === tailInfo.id) {
    var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (tailInfo.children || []);
    var /** @const {number} */ count = A.reachableBlockChildCount_(binaryen, tailInfo);
    if (0 === count) return -1;
    var /** @const {string} */ blockName = /** @type {string} */ (tailInfo.name || '');
    if (blockName) {
      for (var /** @type {number} */ bi = 0; bi !== count; ++bi) {
        if (Wasm2Lang.Wasm.Tree.CustomPasses.hasReference(binaryen, wasmModule, children[bi], blockName)) {
          canBypass = true;
          break;
        }
      }
    }
    tailInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, children[count - 1]);
  }
  var /** @const {boolean} */ hasBackEdge =
      binaryen.BreakId === tailInfo.id &&
      tailInfo.name === loopInfo.name &&
      0 === /** @type {number} */ (tailInfo.condition || 0);
  return hasBackEdge ? (canBypass ? 0 : 1) : -1;
};

/**
 * Returns whether a rendered child is terminal, including the conservative
 * structural fallback for a raw loop whose terminal bit was lost across a
 * normalized binary round-trip.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {number} childIndex
 * @param {number} childPtr
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.childIsTerminal_ = function (binaryen, wasmModule, childResults, childIndex, childPtr) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {number} */ loopBackEdge = A.classifyLoopBackEdge_(binaryen, wasmModule, childPtr);
  // A bypassable tail back-edge proves that the loop can complete normally,
  // overriding stale terminal metadata reconstructed from normalized bytes.
  if (0 === loopBackEdge) return false;
  return A.getChildResultInfo_(childResults, childIndex).isTerminal || 1 === loopBackEdge;
};

/**
 * Extends the IR-only reachability bound with terminal information discovered
 * while rendering child expressions.  Binaryen may keep a parent statement
 * typed {@code none} when an eager operand returns or traps (for example the
 * value of a br_if); later block children are nevertheless unreachable.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {!BinaryenExpressionInfo} blockExpr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {number}
 */
Wasm2Lang.Backend.AbstractCodegen.effectiveReachableBlockChildCount_ = function (
  binaryen,
  wasmModule,
  blockExpr,
  childResults
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (blockExpr.children || []);
  for (var /** @type {number} */ i = 0; i !== children.length; ++i) {
    if (A.childIsTerminal_(binaryen, wasmModule, childResults, i, children[i])) {
      return i + 1;
    }
    // A missing traversal result cannot safely override Binaryen's static
    // unreachable type. Rendered loop/block results can: normalization may
    // retain a stale unreachable type even though a captured branch creates
    // normal fallthrough, and childIsTerminal_ has already classified that
    // control flow above.
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ child = A.getChildResultInfo_(childResults, i);
    var /** @const {!BinaryenExpressionInfo} */ childExpr = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
        binaryen,
        children[i]
      );
    if (!child.hasExpression && binaryen.unreachable === childExpr.type) return i + 1;
  }
  return children.length;
};

/**
 * Summarizes control transfers produced by a rendered wasm block.  Child
 * summaries retain branch targets until the block that owns a target consumes
 * it.  Consuming a block target creates a normal fallthrough path, while
 * targets for outer scopes remain terminal and continue upward.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wasmModule
 * @param {!BinaryenExpressionInfo} blockExpr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_}
 */
Wasm2Lang.Backend.AbstractCodegen.summarizeBlockControl_ = function (binaryen, wasmModule, blockExpr, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {?Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ skippedSummary = A.getSkippedControlSummary_(childResults);
  if (skippedSummary) return skippedSummary;
  if (0 === childResults.length && 0 !== /** @type {!Array<number>} */ (blockExpr.children || []).length) {
    throw new Error('Wasm2Lang codegen: skipped block has no precomputed control summary.');
  }
  var /** @const {number} */ count = A.effectiveReachableBlockChildCount_(binaryen, wasmModule, blockExpr, childResults);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ summary = A.mergeChildControl_(childResults, count);
  var /** @const {!Array<number>} */ children = /** @type {!Array<number>} */ (blockExpr.children || []);
  summary.isTerminal = 0 !== count && A.childIsTerminal_(binaryen, wasmModule, childResults, count - 1, children[count - 1]);

  var /** @const {?string} */ blockName = /** @type {?string} */ (blockExpr.name);
  if (blockName) {
    var /** @const {!Array<string>} */ remainingTargets = [];
    var /** @type {boolean} */ captured = false;
    for (var /** @type {number} */ i = 0; i !== summary.branchTargets.length; ++i) {
      if (summary.branchTargets[i] === blockName) {
        captured = true;
      } else {
        remainingTargets.push(summary.branchTargets[i]);
      }
    }
    summary.branchTargets = remainingTargets;
    if (captured) summary.isTerminal = false;
  }
  return summary;
};

/**
 * Summarizes a loop body while consuming self-branches as re-iterations.
 * Unlike a block target, a loop self-target does not create fallthrough, so a
 * terminal body remains terminal after the target is removed.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} loopExpr
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_}
 */
Wasm2Lang.Backend.AbstractCodegen.summarizeLoopControl_ = function (binaryen, loopExpr, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {?Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ skippedSummary = A.getSkippedControlSummary_(childResults);
  if (skippedSummary) return skippedSummary;
  if (0 === childResults.length && 0 !== /** @type {number} */ (loopExpr.body || 0)) {
    throw new Error('Wasm2Lang codegen: skipped loop has no precomputed control summary.');
  }
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ body = A.getChildResultInfo_(childResults, 0);
  var /** @const {!Array<string>} */ remainingTargets = [];
  var /** @const {string} */ loopName = /** @type {string} */ (loopExpr.name || '');
  for (var /** @type {number} */ i = 0; i !== body.branchTargets.length; ++i) {
    if (body.branchTargets[i] !== loopName) remainingTargets.push(body.branchTargets[i]);
  }
  return {
    isTerminal: body.isTerminal,
    mayExitFunction: body.mayExitFunction,
    branchTargets: remainingTargets
  };
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
 * @param {number=} opt_condCat  Expression category of the condition.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitConditionalStatement_ = function (ind, condPtr, condExpr, stmt, opt_condCat) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  if (0 !== condPtr) {
    return pad(ind) + 'if ' + this.formatCondition_(condExpr, opt_condCat) + ' {\n' + pad(ind + 1) + stmt + pad(ind) + '}\n';
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
 * @param {number=} opt_condCat  Expression category of the condition.
 * @return {{emittedString: string, isTerminal: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBreakStatement_ = function (
  state,
  indent,
  brName,
  brCondPtr,
  condExpr,
  opt_condCat
) {
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
        rsExitLines.push(pad(indent) + this.markAndRenderLabeledJump_(state, 'break', state.rootSwitchLoopName));
      }
      var /** @type {string} */ rsResult;
      if (0 !== brCondPtr) {
        rsResult =
          pad(indent) +
          'if ' +
          this.formatCondition_(condExpr, opt_condCat) +
          ' {\n' +
          rsExitLines.join('') +
          pad(indent) +
          '}\n';
      } else {
        rsResult = rsExitLines.join('');
      }
      return {emittedString: rsResult, isTerminal: true};
    }
    if (brName === state.rootSwitchRsName) {
      var /** @const {string} */ rsBreakStmt = this.markAndRenderLabeledJump_(state, 'break', state.rootSwitchLoopName);
      return {
        emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, rsBreakStmt, opt_condCat),
        isTerminal: 0 === brCondPtr
      };
    }
  }

  var /** @const {string} */ brKind = state.labelKinds[brName] || 'block';
  var /** @const {string} */ brActual = state.fusedBlockToLoop[brName] || brName;
  var /** @const {string} */ brKeyword = 'loop' === brKind ? 'continue' : 'break';
  var /** @type {string} */ brStmt;
  // When a break was redirected through fusedBlockToLoop, the target loop may
  // have a label-elided prefix (ly$, lf$, le$) because no direct br references
  // it.  Skip the elision check for redirected breaks — the label is required
  // when the loop is not the innermost breakable.  However, when the fused
  // block itself is the innermost breakable, an unlabeled break exits the
  // for/while/do-while construct that replaced the block+loop pair.
  var /** @const {boolean} */ isFusedRedirect = brActual !== brName;
  if (
    (!isFusedRedirect && A.isLabelElided(brActual)) ||
    A.isBreakLabelImplicit_(state.breakableStack, brKeyword, brActual) ||
    (isFusedRedirect && A.isBreakLabelImplicit_(state.breakableStack, brKeyword, brName))
  ) {
    brStmt = brKeyword + ';\n';
  } else {
    brStmt = this.renderRequiredLabeledJump_(state, brKeyword, brActual);
  }
  return {
    emittedString: this.emitConditionalStatement_(indent, brCondPtr, condExpr, brStmt, opt_condCat),
    isTerminal: 0 === brCondPtr
  };
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
 * @param {number=} opt_condCat  Expression category of the condition.
 * @return {{emittedString: string, hasDefault: boolean}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSwitchStatement_ = function (
  state,
  indent,
  condExpr,
  names,
  defaultName,
  opt_condCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ lines = [];
  var /** @type {string} */ switchCond = condExpr;
  if (Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32 === opt_condCat) {
    switchCond = this.renderNumericComparisonResult_(switchCond);
  }
  lines.push(pad(indent) + 'switch (' + this.coerceSwitchCondition_(switchCond) + ') {\n');
  var /** @type {number} */ si = 0;
  var /** @const {number} */ nameLen = names.length;
  while (si < nameLen) {
    var /** @const {string} */ target = names[si];
    while (si < nameLen && names[si] === target) {
      lines.push(pad(indent + 1) + 'case ' + si + ':\n');
      ++si;
    }
    lines.push(pad(indent + 2) + this.resolveBreakTarget_(state, target));
  }
  if ('' !== defaultName) {
    lines.push(pad(indent + 1) + 'default:\n');
    lines.push(pad(indent + 2) + this.resolveBreakTarget_(state, defaultName));
  }
  lines.push(pad(indent) + '}\n');
  return {emittedString: lines.join(''), hasDefault: '' !== defaultName};
};

/**
 * Appends the fallthrough-preventing exit statement for one flat-switch case
 * group.  Labeled-break backends emit {@code break <label>;} when the dispatch
 * requires a label; C# has no labeled break and overrides this to the plain
 * form, which exits its unlabeled switch and lands exactly where the labeled
 * variants land — before the epilogue, or after the construct when there is
 * none.
 *
 * This hook is the single behavioural difference between the C# and the
 * labeled-backend case-group emitters, which are otherwise identical.
 *
 * @protected
 * @param {!Array<string>} lines
 * @param {number} indent
 * @param {string} switchLabel
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.SwitchDispatchInfo} info
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitFlatSwitchCaseBreak_ = function (lines, indent, switchLabel, info) {
  Wasm2Lang.Wasm.Tree.CustomPasses.SwitchDispatchApplication.emitFlatSwitchBreak(lines, indent, switchLabel, info);
};

/**
 * Dispatches a BlockId node to the appropriate emitter: root-switch,
 * flat-switch, or labeled block.  All three backends share this dispatch;
 * each may override the individual emitters.
 *
 * @suppress {checkTypes}
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitBlockDispatch_ = function (state, nodeCtx, childResults) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  if (blockName) {
    var /** @const {string} */ fnName = state.functionInfo.name;
    if (this.isBlockRootSwitch_(fnName, blockName)) {
      return this.emitRootSwitch_(state, nodeCtx);
    }
    if (this.isBlockSwitchDispatch_(fnName, blockName)) {
      if (this.acceptsFlatSwitchStructure_(state.binaryen, nodeCtx)) {
        return this.emitFlatSwitch_(state, nodeCtx);
      }
    }
  }
  return this.emitLabeledBlock_(state, nodeCtx, childResults);
};

/**
 * Returns whether a named block wrapper can be omitted after rendered control
 * summaries prove that no live branch targets that block.  Labeled-break
 * backends can retain branches to outer labels without the intermediate
 * wrapper.  PHP overrides because its numeric {@code break N} depths depend on
 * every intervening wrapper remaining present.
 *
 * @protected
 * @param {string} blockName
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} childControl
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.canElideBlockWrapper_ = function (blockName, childControl) {
  return !Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.hasBranchTarget(childControl.branchTargets, blockName);
};

/**
 * Emits a BlockId node body for labeled-break backends (asm.js, Java).
 * Handles fused blocks, direct-labeled single statements, and child
 * assembly.  PHP overrides to use {@code do { } while (false)} wrapping
 * instead of labeled blocks.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLabeledBlock_ = function (state, nodeCtx, childResults) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  var /** @const {number} */ ind = state.indent;
  // Only check fusedBlockToLoop — the runtime fusion record.  The metadata-
  // based getBlockFusionPlan_ may return stale plans when DFS positions
  // drift after binary round-trip; fusedBlockToLoop is set only when the
  // block-loop fusion actually occurred in emitEnter_.
  var /** @const {boolean} */ isFused = !!blockName && !!state.fusedBlockToLoop[blockName];
  var /** @const {number} */ emitCount = A.effectiveReachableBlockChildCount_(
      state.binaryen,
      state.wasmModule,
      expr,
      childResults
    );
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ childControl = A.mergeChildControl_(
      childResults,
      emitCount
    );
  var /** @const {boolean} */ needsWrapper = !!blockName && !this.canElideBlockWrapper_(blockName, childControl);
  var /** @const {boolean} */ canDirectLabel = needsWrapper && this.canDirectLabelNamedBlock_(state.binaryen, expr);
  var /** @const {number} */ childInd = needsWrapper && !isFused && !canDirectLabel ? ind + 1 : ind;
  var /** @const {string} */ blockBody = A.assembleBlockChildren_(childResults, emitCount, childInd);
  if (isFused) {
    return blockBody;
  }
  if (blockName) {
    A.rejectValueTypedNamedBlock_(state.binaryen, expr.type, blockName, state.functionInfo.name);
    if (!needsWrapper) return blockBody;
    return this.renderNamedBlockWrapper_(state, blockName, blockBody, ind, canDirectLabel);
  }
  return blockBody;
};

/**
 * Refuses a named block that carries a value result type — no labeled-break
 * target language can use a labeled block as an expression.  Shared by the
 * labeled-break emitter above and the PHP do/while override.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} blockType
 * @param {string} blockName
 * @param {string} funcName
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.rejectValueTypedNamedBlock_ = function (binaryen, blockType, blockName, funcName) {
  if (binaryen.none !== blockType && 0 !== blockType && binaryen.unreachable !== blockType) {
    throw new Error(
      "Wasm2Lang codegen: named block '" +
        blockName +
        '\' in function "' +
        funcName +
        '" has a value result type. ' +
        'The target language cannot use labeled blocks as expressions. ' +
        'Use binaryen:min normalization to flatten value-typed blocks before codegen.'
    );
  }
};

/**
 * Renders the wrapper around a named block that could not be elided.  The
 * default is the labeled-break shape (asm.js, JavaScript, Java); C#
 * overrides with a plain brace block followed by a conditional goto exit
 * label.  Called only after the fused / value-typed / elidable cases have
 * been dispatched.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} blockName
 * @param {string} blockBody
 * @param {number} ind
 * @param {boolean} canDirectLabel
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderNamedBlockWrapper_ = function (
  state,
  blockName,
  blockBody,
  ind,
  canDirectLabel
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ labelHead = this.labelN_(state.labelMap, blockName) + ': ';
  if (canDirectLabel) {
    // Child statement was emitted at the same indent as this block, so
    // the leading pad is replaced by the label prefix.
    return pad(ind) + labelHead + blockBody.slice(pad(ind).length);
  }
  return pad(ind) + labelHead + '{\n' + blockBody + pad(ind) + '}\n';
};

/**
 * Recognizes the "unnamed value-typed block at function body root" shape and
 * repackages the children so that the last child becomes the function's
 * implicit return expression.  Without this, the tail value gets stringified
 * as a dangling expression statement and the function falls through to the
 * zero-value stabilizer in {@code emitFunction_}.
 *
 * Only applies at the true root of the function body (no parent expression).
 * Nested value-typed blocks would need a comma-expression / IIFE lowering
 * that isn't universally expressible across backends — binaryen:min is
 * expected to flatten them before codegen.
 *
 * Returns a {@code {w2lExprStr, w2lExprCat, w2lRootValueBlockPrefix}} shape when
 * applicable; {@code null} otherwise.  Callers fall back to the standard block
 * dispatch on {@code null}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?{w2lExprStr: string, w2lExprCat: number, w2lRootValueBlockPrefix: string}}
 */
Wasm2Lang.Backend.AbstractCodegen.tryEmitRootValueBlock_ = function (state, nodeCtx, childResults) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {?string} */ blockName = /** @type {?string} */ (expr.name);
  if (blockName) return null;
  if (null !== nodeCtx.parentExpression) return null;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ blockType = /** @type {number} */ (expr.type);
  if (binaryen.none === blockType || 0 === blockType || binaryen.unreachable === blockType) return null;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {number} */ emitCount = A.effectiveReachableBlockChildCount_(binaryen, state.wasmModule, expr, childResults);
  if (emitCount < 1) return null;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ tailInfo = A.getChildResultInfo_(
      childResults,
      emitCount - 1
    );
  if (A.CAT_VOID === tailInfo.expressionCategory) return null;
  return {
    w2lExprStr: tailInfo.expressionString,
    w2lExprCat: tailInfo.expressionCategory,
    // The prefix statements are the non-tail children, assembled exactly as a
    // block body would be.
    w2lRootValueBlockPrefix: A.assembleBlockChildren_(childResults, emitCount - 1, state.indent)
  };
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
 * Renders the raw (unsimplified) infinite-loop fallback emitted when loop
 * simplification did not apply.  Factors the shared scaffolding used by
 * asm.js/Java/PHP; each caller supplies the label prefix (empty for PHP,
 * {@code labelN_(...)+': '} for asm.js/Java) and decides whether to emit
 * the trailing {@code break;}.
 *
 * @protected
 * @param {number} indent
 * @param {string} labelPrefix
 * @param {string} bodyCode
 * @param {boolean} includeTrailingBreak
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitRawInfiniteLoop_ = function (
  indent,
  labelPrefix,
  bodyCode,
  includeTrailingBreak
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  return (
    A.pad_(indent) +
    labelPrefix +
    this.infiniteLoopKeyword_() +
    ' {\n' +
    bodyCode +
    (includeTrailingBreak ? A.pad_(indent + 1) + 'break;\n' : '') +
    A.pad_(indent) +
    '}\n'
  );
};

/**
 * Emits a simplified loop by inspecting the intact loop body IR directly.
 * Used when SKIP_SUBTREE was returned in enter — the leave callback has no
 * child results and must derive everything from the binaryen expression.
 *
 * The method inspects the body to determine which children are structural
 * (exit guard, self-continue) vs. real body, sub-walks only the real body
 * children and condition, and assembles the output.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitSimplifiedLoopFromIR_ = function (state, nodeCtx, loopKind) {
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {string} */ loopName = /** @type {string} */ (expr.name);

  // state.indent is still at inner level (adjustLeaveIndent_ skipped decrement).
  var /** @const {number} */ innerInd = state.indent;
  var /** @const {number} */ outerInd = innerInd - 1;

  var /** @const {number} */ bodyPtr = /** @type {number} */ (expr.body);
  var /** @const {!BinaryenExpressionInfo} */ bodyInfo = /** @type {!BinaryenExpressionInfo} */ (
      Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, bodyPtr)
    );

  // Register the body block label so inner breaks resolve correctly.
  // Only labelKinds and fusedBlockToLoop are needed — the body block must NOT
  // be pushed onto breakableStack because in the output the block is fused
  // into the loop.  Pushing it would make the loop non-innermost, causing
  // isBreakLabelImplicit_ to emit unnecessary labels on break/continue
  // statements that target the fused pair.
  if (binaryen.BlockId === bodyInfo.id && bodyInfo.name) {
    var /** @const {string} */ bodyBlockName = /** @type {string} */ (bodyInfo.name);
    state.labelKinds[bodyBlockName] = 'block';
    state.fusedBlockToLoop[bodyBlockName] = loopName;
  }

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_} */ bc = this.computeSimplifiedLoopBodyAndCondition_(
      state,
      loopKind,
      bodyInfo,
      loopName,
      innerInd
    );

  // Label: check if any break/continue references this loop by name.
  // Computed AFTER body walk so usedLabels is populated.
  var /** @type {string} */ label = '';
  if (state.usedLabels[loopName]) {
    label = this.labelN_(state.labelMap, loopName) + ': ';
  }

  var /** @const {string} */ result = this.assembleSimplifiedLoop_(
      loopKind,
      outerInd,
      label,
      bc.w2lLoopBody,
      bc.w2lLoopCondStr,
      bc.w2lLoopCondCat
    );

  // Clean up: decrement indent (adjustLeaveIndent_ skipped it).
  --state.indent;
  return result;
};

/**
 * Internal record for simplified-loop body + condition emission.  Uses verbose
 * {@code w2l}-prefixed keys with unquoted dot access so Closure can mangle the
 * property names (unlike the former {@code 'bodyCode'}/{@code 'condStr'}/
 * {@code 'condCat'} quoted keys that collided with the {@code body} extern).
 *
 * @protected
 * @typedef {{
 *   w2lLoopBody: string,
 *   w2lLoopCondStr: string,
 *   w2lLoopCondCat: number
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_;

/**
 * Shared body/condition computation for simplified-loop emission.
 *
 * Identical across asm.js/Java/PHP backends: runs the loop-kind dispatch to
 * produce the inner body code and (for `while`/`dowhile`) the continuation
 * condition.  Split out so the enclosing `emitSimplifiedLoopFromIR_` method
 * can be specialized per backend for body-block registration and label
 * handling without duplicating this ~70-line dispatch.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} innerInd
 * @return {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.computeSimplifiedLoopBodyAndCondition_ = function (
  state,
  loopKind,
  bodyInfo,
  loopName,
  innerInd
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ NS = Wasm2Lang.Wasm.Tree.NodeSchema;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {!BinaryenModule} */ wm = state.wasmModule;
  var /** @const {!BinaryenFunctionInfo} */ fi = state.functionInfo;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ vis =
    /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor);

  var /** @type {string} */ condStr = '';
  var /** @type {number} */ condCat = A.CAT_VOID;
  var /** @type {string} */ bodyCode = '';

  if ('while' === loopKind) {
    // Condition: for while-block variant, invert the exit guard condition.
    // For while-if variant, use the If condition directly.
    if (binaryen.IfId === bodyInfo.id) {
      bodyCode = this.emitWhileLoopBody_(state, binaryen, wm, fi, vis, bodyInfo, loopName, innerInd, 0);
      // while-if variant: If condition IS the continuation condition.
      var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ wrc = A.subWalkExpressionWithCategory_(
          state,
          /** @type {number} */ (bodyInfo.condition || 0)
        );
      condStr = wrc.w2lExprStr;
      condCat = wrc.w2lExprCat;
    } else {
      // while-block variant: only the FIRST exit guard becomes the while
      // condition.  Any consecutive br_if exits that follow stay in the body
      // as `if (cond) break outer` statements — emitted by the normal body
      // walk.  This preserves short-circuit evaluation semantics: WASM
      // br_if sequences stop at the first triggered exit, but combining
      // them with i32.and (which JS renders as bitwise `&`) would evaluate
      // every guard condition every iteration.  For read-only conditions
      // in JS that's merely wasteful, but any condition with side effects
      // (call, memory grow, trap-adjacent op) would diverge from WASM
      // semantics.
      var /** @const {!BinaryenExpressionInfo} */ guardInfo = /** @type {!BinaryenExpressionInfo} */ (
          NS.safeGetExpressionInfo(binaryen, /** @type {number} */ ((bodyInfo.children || [])[0]))
        );
      bodyCode = this.emitWhileLoopBody_(state, binaryen, wm, fi, vis, bodyInfo, loopName, innerInd, 1);
      var /** @const {number} */ combinedPtr = Wasm2Lang.Wasm.Tree.CustomPasses.invertCondition(
          binaryen,
          wm,
          /** @type {number} */ (guardInfo.condition || 0)
        );
      var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ ic = A.subWalkExpressionWithCategory_(
          state,
          combinedPtr
        );
      condStr = ic.w2lExprStr;
      condCat = ic.w2lExprCat;
    }
  } else if ('dowhile' === loopKind) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_} */ dwResult = this.emitDoWhileLoopBody_(
        state,
        binaryen,
        wm,
        fi,
        vis,
        bodyInfo,
        loopName,
        innerInd
      );
    bodyCode = dwResult.w2lLoopBody;
    condStr = dwResult.w2lLoopCondStr;
    condCat = dwResult.w2lLoopCondCat;
  } else {
    // for-loop: emit all body children except trailing self-continue (if present).
    bodyCode = this.emitForLoopBody_(state, binaryen, wm, fi, vis, bodyInfo, loopName, innerInd);
  }

  return /** @type {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_} */ ({
    w2lLoopBody: bodyCode,
    w2lLoopCondStr: condStr,
    w2lLoopCondCat: condCat
  });
};

/**
 * Assembles the final simplified-loop string from body + optional condition.
 * `label` is the label prefix (e.g. `"name: "`) or `""` for backends that use
 * numeric break/continue depths (PHP).
 *
 * @protected
 * @param {string} loopKind  'for', 'dowhile', or 'while'.
 * @param {number} outerInd
 * @param {string} label
 * @param {string} bodyCode
 * @param {string} condStr
 * @param {number} condCat
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.assembleSimplifiedLoop_ = function (
  loopKind,
  outerInd,
  label,
  bodyCode,
  condStr,
  condCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  if ('for' === loopKind) {
    return pad(outerInd) + label + this.infiniteLoopKeyword_() + ' {\n' + bodyCode + pad(outerInd) + '}\n';
  }
  if ('dowhile' === loopKind) {
    return (
      pad(outerInd) + label + 'do {\n' + bodyCode + pad(outerInd) + '} while ' + this.formatCondition_(condStr, condCat) + ';\n'
    );
  }
  return pad(outerInd) + label + 'while ' + this.formatCondition_(condStr, condCat) + ' {\n' + bodyCode + pad(outerInd) + '}\n';
};

/**
 * Sub-walks selected children of a while-loop body.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wm
 * @param {!BinaryenFunctionInfo} fi
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} ind
 * @param {number} guardCount  Number of leading exit guards to skip (0 for
 *     while-if variant, >= 1 for while-block variant).
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitWhileLoopBody_ = function (
  state,
  binaryen,
  wm,
  fi,
  vis,
  bodyInfo,
  loopName,
  ind,
  guardCount
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Array<string>} */ lines = [];
  if (binaryen.IfId === bodyInfo.id) {
    // while-if variant: body is the If's then-arm block, minus trailing br.
    var /** @const {number} */ thenPtr = /** @type {number} */ (bodyInfo.ifTrue || 0);
    var /** @const {!BinaryenExpressionInfo} */ thenInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, thenPtr)
      );
    var /** @const {!Array<number>} */ thenCh = /** @type {!Array<number>} */ ((thenInfo.children || []).slice(0));
    var /** @const {number} */ thenLen = thenCh.length;
    // Last child is unconditional br $loop — skip it.
    var /** @const {number} */ endIdx = thenLen > 0 ? thenLen - 1 : 0;
    A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, thenCh, 0, endIdx, ind);
    return lines.join('');
  }
  // while-block variant: skip first guardCount children (exit guards) and
  // last child (self-continue).
  var /** @const {!Array<number>} */ ch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
  var /** @const {number} */ len = ch.length;
  var /** @const {number} */ bodyStart = guardCount > 0 ? guardCount : 1;
  A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, ch, bodyStart, len - 1, ind);
  return lines.join('');
};

/**
 * Sub-walks selected children of a do-while loop body.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wm
 * @param {!BinaryenFunctionInfo} fi
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} ind
 * @return {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitDoWhileLoopBody_ = function (
  state,
  binaryen,
  wm,
  fi,
  vis,
  bodyInfo,
  loopName,
  ind
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;

  // Bare br_if variant: body is a direct br_if, empty body.
  if (binaryen.BreakId === bodyInfo.id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ bareCond = A.subWalkExpressionWithCategory_(
        state,
        /** @type {number} */ (bodyInfo.condition || 0)
      );
    return /** @type {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_} */ ({
      w2lLoopBody: '',
      w2lLoopCondStr: bareCond.w2lExprStr,
      w2lLoopCondCat: bareCond.w2lExprCat
    });
  }

  var /** @const {!Array<number>} */ ch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
  var /** @const {number} */ len = ch.length;

  // Determine variant: check if last child is conditional br_if targeting loop.
  var /** @type {number} */ bodyEnd = len;
  var /** @type {number} */ condChildIdx = -1;

  if (len > 0) {
    var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[len - 1])
      );
    if (Wasm2Lang.Backend.AbstractCodegen.isBreakTo_(binaryen, lastInfo, loopName, true)) {
      // Variant B: last child is conditional br_if self-continue.
      condChildIdx = len - 1;
      bodyEnd = len - 1;
    } else if (len > 1) {
      // Variant A: second-to-last is conditional br_if, last is unconditional br.
      var /** @const {!BinaryenExpressionInfo} */ penInfo = /** @type {!BinaryenExpressionInfo} */ (
          Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[len - 2])
        );
      if (Wasm2Lang.Backend.AbstractCodegen.isBreakTo_(binaryen, penInfo, loopName, true)) {
        condChildIdx = len - 2;
        bodyEnd = len - 2;
      }
    }
  }

  var /** @const {!Array<string>} */ lines = [];
  A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, ch, 0, bodyEnd, ind);

  var /** @type {string} */ condStr = '';
  var /** @type {number} */ condCat = A.CAT_VOID;
  if (-1 !== condChildIdx) {
    var /** @const {!BinaryenExpressionInfo} */ condBrInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[condChildIdx])
      );
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ cr = A.subWalkExpressionWithCategory_(
        state,
        /** @type {number} */ (condBrInfo.condition || 0)
      );
    condStr = cr.w2lExprStr;
    condCat = cr.w2lExprCat;
  }

  return /** @type {!Wasm2Lang.Backend.AbstractCodegen.SimplifiedLoopEmit_} */ ({
    w2lLoopBody: lines.join(''),
    w2lLoopCondStr: condStr,
    w2lLoopCondCat: condCat
  });
};

/**
 * Sub-walks the body of a for-loop, skipping the trailing self-continue.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {!Binaryen} binaryen
 * @param {!BinaryenModule} wm
 * @param {!BinaryenFunctionInfo} fi
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} vis
 * @param {!BinaryenExpressionInfo} bodyInfo
 * @param {string} loopName
 * @param {number} ind
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitForLoopBody_ = function (
  state,
  binaryen,
  wm,
  fi,
  vis,
  bodyInfo,
  loopName,
  ind
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {!Array<number>} */ ch = /** @type {!Array<number>} */ ((bodyInfo.children || []).slice(0));
  var /** @const {number} */ len = ch.length;

  // Check if last child is unconditional br targeting the loop — skip it.
  var /** @type {number} */ emitEnd = len;
  if (len > 0) {
    var /** @const {!BinaryenExpressionInfo} */ lastInfo = /** @type {!BinaryenExpressionInfo} */ (
        Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, ch[len - 1])
      );
    if (
      Wasm2Lang.Backend.AbstractCodegen.isBreakTo_(binaryen, lastInfo, loopName, false) &&
      0 === /** @type {number} */ (lastInfo.value || 0)
    ) {
      emitEnd = len - 1;
    }
  }

  var /** @const {!Array<string>} */ lines = [];
  A.appendSubWalkedLines_(lines, wm, binaryen, fi, vis, ch, 0, emitEnd, ind);

  // For-loops that had no trailing br stripped need a trailing break to exit.
  // Skip if the last emitted child is terminal (Java rejects unreachable statements).
  if (emitEnd === len && !state.lastExprIsTerminal) {
    lines.push(A.pad_(ind) + 'break;\n');
  }

  return lines.join('');
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
 * or a typed expression object {@code {w2lExprStr, w2lExprCat}}).
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
    var /** @const {*} */ s = /** @type {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ (result).w2lExprStr;
    if ('string' === typeof s) {
      return /** @type {string} */ (s);
    }
  }
  return '';
};

/**
 * Sub-walks an expression pointer and returns both string and category.
 *
 * @protected
 * @param {{wasmModule: !BinaryenModule, binaryen: !Binaryen, functionInfo: !BinaryenFunctionInfo, visitor: ?Wasm2Lang.Wasm.Tree.TraversalVisitor}} state
 * @param {number} conditionPtr
 * @return {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_}
 */
Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionWithCategory_ = function (state, conditionPtr) {
  var /** @const {*} */ raw = Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_(
      state.wasmModule,
      state.binaryen,
      state.functionInfo,
      /** @type {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ (state.visitor),
      conditionPtr
    );
  var /** @const {number} */ voidCat = Wasm2Lang.Backend.AbstractCodegen.CAT_VOID;
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ typedRaw =
      /** @type {!Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ (raw);
  if (raw && 'string' === typeof typedRaw.w2lExprStr) {
    return {w2lExprStr: typedRaw.w2lExprStr, w2lExprCat: Wasm2Lang.Backend.AbstractCodegen.categoryOf_(raw)};
  }
  return {w2lExprStr: 'string' === typeof raw ? /** @type {string} */ (raw) : '', w2lExprCat: voidCat};
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
  return Wasm2Lang.Backend.AbstractCodegen.subWalkExpressionWithCategory_(state, conditionPtr).w2lExprStr;
};

/**
 * Sub-walks a slice of child pointers and appends each rendered result to
 * {@code lines}.  Empty strings are skipped, single-line results are
 * wrapped as {@code pad(indent) + code + ';\n'}, and multi-line results
 * are appended verbatim.  Shared by the loop-body emitters (while-if,
 * while-block, do-while, for-loop) and by the switch dispatch action
 * emitter.
 *
 * @protected
 * @param {!Array<string>} lines
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @param {!Array<number>} ptrs
 * @param {number} startIdx
 * @param {number} endIdx
 * @param {number} indent
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.appendSubWalkedLines_ = function (
  lines,
  wasmModule,
  binaryen,
  funcInfo,
  visitor,
  ptrs,
  startIdx,
  endIdx,
  indent
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const {string} */ padStr = A.pad_(indent);
  for (var /** @type {number} */ i = startIdx; i < endIdx; ++i) {
    var /** @const {*} */ walked = A.subWalkExpression_(wasmModule, binaryen, funcInfo, visitor, ptrs[i]);
    var /** @const {string} */ code = A.subWalkString_(walked);
    if ('' !== code) {
      lines.push(-1 === code.indexOf('\n') ? padStr + code + ';\n' : code);
    }
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} */ singleResult = [walked];
    if (A.childIsTerminal_(binaryen, wasmModule, singleResult, 0, ptrs[i])) break;
  }
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
 * @param {number=} opt_condCat   Expression category of the condition.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitIfStatement_ = function (
  indent,
  conditionExpr,
  trueCode,
  ifFalsePtr,
  childCount,
  opt_falseCode,
  opt_condCat
) {
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ cond = this.formatCondition_(conditionExpr, opt_condCat);
  if (0 !== ifFalsePtr && 2 < childCount) {
    return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '} else {\n' + opt_falseCode + pad(indent) + '}\n';
  }
  return pad(indent) + 'if ' + cond + ' {\n' + trueCode + pad(indent) + '}\n';
};

/**
 * Returns whether a wasm {@code select} must be lowered through an eager
 * helper call instead of a target-language conditional expression.
 *
 * Wasm evaluates {@code ifTrue}, {@code ifFalse}, then {@code condition}, in
 * that order, and evaluates both value operands.  JavaScript/Java/PHP
 * conditionals evaluate the condition first and only one arm.  A conditional
 * is therefore valid only when skipping/reordering the value operands cannot
 * be observed.  Binaryen's effect summary keeps this decision conservative
 * without penalising the common local/constant-only select.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} selectExpr
 * @param {!BinaryenModule} wasmModule
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.selectNeedsEagerEvaluation_ = function (binaryen, selectExpr, wasmModule) {
  var /** @const {!BinaryenSideEffects} */ S = binaryen.SideEffects;
  var /** @const {number} */ trueEffects = binaryen.getSideEffects(/** @type {number} */ (selectExpr.ifTrue), wasmModule);
  var /** @const {number} */ falseEffects = binaryen.getSideEffects(/** @type {number} */ (selectExpr.ifFalse), wasmModule);
  var /** @const {number} */ conditionEffects = binaryen.getSideEffects(
      /** @type {number} */ (selectExpr.condition),
      wasmModule
    );
  var /** @const {number} */ armEffects = trueEffects | falseEffects;
  var /** @const {number} */ readOnlyMask = S.ReadsLocal | S.ReadsGlobal | S.ReadsMemory | S.ReadsTable | S.TrapsNeverHappen;
  var /** @const {number} */ observableMask = S.Any & ~readOnlyMask;

  // Either arm may be skipped by a conditional expression.  Calls, writes,
  // branches, atomics and implicit traps therefore require eager lowering.
  if (0 !== (armEffects & observableMask)) {
    return true;
  }

  // A condition-side mutation/call may change a value that wasm reads in an
  // arm before evaluating the condition.  Alias conservatively across all
  // local/global/memory/table reads.
  return 0 !== (conditionEffects & observableMask) && 0 !== (armEffects & readOnlyMask);
};

/**
 * Resolves the typed helper used for eager select evaluation.  Scalar
 * backends share this default; Java overrides it to accept {@code v128}.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} valueType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.getEagerSelectHelperName_ = function (binaryen, valueType) {
  var /** @const {string} */ typeName = Wasm2Lang.Backend.ValueType.typeName(binaryen, valueType);
  if ('i32' !== typeName && 'i64' !== typeName && 'f32' !== typeName && 'f64' !== typeName) {
    throw new Error('Wasm2Lang codegen: effectful ' + typeName + ' select is unsupported by this backend.');
  }
  return this.getRuntimeHelperPrefix_() + 'select_' + typeName;
};

/**
 * Returns true when evaluating an expression solely for its effects cannot
 * be elided.  Read-only local/global/memory/table traffic is discardable;
 * calls, writes, atomics and implicit traps are observable.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} expressionPointer
 * @param {!BinaryenModule} wasmModule
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.expressionNeedsDiscardEvaluation_ = function (binaryen, expressionPointer, wasmModule) {
  var /** @const {!BinaryenSideEffects} */ S = binaryen.SideEffects;
  var /** @const {number} */ readOnlyMask = S.ReadsLocal | S.ReadsGlobal | S.ReadsMemory | S.ReadsTable | S.TrapsNeverHappen;
  return 0 !== (binaryen.getSideEffects(expressionPointer, wasmModule) & (S.Any & ~readOnlyMask));
};

/**
 * Emits one value expression for effects only.  Reusing the eager-select
 * helper keeps the statement valid in asm.js and Java, whose grammars do not
 * accept every arbitrary value expression as a statement.
 *
 * @private
 * @param {!Binaryen} binaryen
 * @param {number} expressionPointer
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} childInfo
 * @param {number} indent
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderDiscardedValue_ = function (binaryen, expressionPointer, childInfo, indent) {
  var /** @const {number} */ valueType = binaryen.getExpressionType(expressionPointer);
  var /** @const {string} */ helperName = this.getEagerSelectHelperName_(binaryen, valueType);
  var /** @const {string} */ valueExpr = this.coerceAtBoundary_(
      binaryen,
      childInfo.expressionString,
      childInfo.expressionCategory,
      valueType
    );
  var /** @const {string} */ helperCall = this.renderHelperCall_(
      binaryen,
      helperName,
      [valueExpr, this.renderLocalInit_(binaryen, valueType), '1'],
      valueType
    );
  return Wasm2Lang.Backend.AbstractCodegen.pad_(indent) + helperCall + ';\n';
};

/**
 * Propagates a terminal child ({@code return}, unconditional branch,
 * {@code unreachable}, or a terminal composite) through a value expression.
 * Earlier operands are evaluated for observable effects in wasm order; later
 * operands are unreachable and omitted.  Select is special because Binaryen
 * stores its children as condition/true/false while wasm evaluates
 * true/false/condition.
 *
 * Control constructs that own lazy or statement children keep their normal
 * emitters.  For {@code if}, only a terminal condition propagates; terminal
 * arms remain inside the emitted target-language branches.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expression
 * @param {number} expressionId
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {!BinaryenModule} wasmModule
 * @param {number} indent
 * @return {?Wasm2Lang.Backend.AbstractCodegen.TypedExpr_}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.propagateTerminalChild_ = function (
  binaryen,
  expression,
  expressionId,
  childResults,
  wasmModule,
  indent
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  if (binaryen.BlockId === expressionId || binaryen.LoopId === expressionId) {
    return null;
  }
  var /** @const {!Array<!Array<number>>} */ ordered = Wasm2Lang.Wasm.Tree.ControlFlowSummaryAnalysis.evaluationOrder(
      binaryen,
      /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (expression)
    );

  var /** @type {number} */ terminalAt = -1;
  for (var /** @type {number} */ oi = 0, /** @const {number} */ orderedCount = ordered.length; oi !== orderedCount; ++oi) {
    if (A.childIsTerminal_(binaryen, wasmModule, childResults, ordered[oi][1], ordered[oi][0])) {
      terminalAt = oi;
      break;
    }
  }
  if (0 > terminalAt) {
    return null;
  }

  var /** @type {string} */ code = '';
  var /** @type {boolean} */ mayExitFunction = false;
  var /** @const {!Array<string>} */ branchTargets = [];
  for (var /** @type {number} */ pi = 0; pi < terminalAt; ++pi) {
    var /** @const {number} */ priorPtr = ordered[pi][0];
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ priorInfo = A.getChildResultInfo_(
        childResults,
        ordered[pi][1]
      );
    mayExitFunction = mayExitFunction || priorInfo.mayExitFunction;
    A.appendUniqueBranchTargets_(branchTargets, priorInfo.branchTargets);
    if (A.expressionNeedsDiscardEvaluation_(binaryen, priorPtr, wasmModule)) {
      code += this.renderDiscardedValue_(binaryen, priorPtr, priorInfo, indent);
    }
  }
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ terminalChild = A.getChildResultInfo_(
      childResults,
      ordered[terminalAt][1]
    );
  code += terminalChild.expressionString;
  mayExitFunction = mayExitFunction || terminalChild.mayExitFunction;
  A.appendUniqueBranchTargets_(branchTargets, terminalChild.branchTargets);
  return {
    w2lExprStr: code,
    w2lExprCat: A.CAT_VOID,
    w2lExprTerminal: true,
    w2lExprMayExitFunction: mayExitFunction,
    w2lExprBranchTargets: branchTargets
  };
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
  var /** @const {string} */ setValue = A.Precedence_.stripForAssignment(
      this.coerceToType_(binaryen, valueExpr, valueCat, localType)
    );
  if (isTee) {
    return {
      emittedString: '(' + this.localN_(localIndex) + ' = ' + setValue + ')',
      resultCat: A.catForCoercedType_(binaryen, localType)
    };
  }
  return {emittedString: pad(indent) + this.localN_(localIndex) + ' = ' + setValue + ';\n', resultCat: A.CAT_VOID};
};

/**
 * Wraps a result string and category into a TraversalDecisionInput suitable
 * for return from an emitLeave_ callback.
 *
 * @protected
 * @param {string} result
 * @param {number} resultCat
 * @param {boolean=} opt_terminal
 * @param {boolean=} opt_mayExitFunction
 * @param {!Array<string>=} opt_branchTargets
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.buildLeaveResult_ = function (
  result,
  resultCat,
  opt_terminal,
  opt_mayExitFunction,
  opt_branchTargets
) {
  var /** @const {!Array<string>} */ branchTargets =
      opt_branchTargets || Wasm2Lang.Backend.AbstractCodegen.EMPTY_BRANCH_TARGETS_;
  if (resultCat !== Wasm2Lang.Backend.AbstractCodegen.CAT_VOID || opt_terminal || opt_mayExitFunction || branchTargets.length) {
    return {
      decisionValue: {
        w2lExprStr: result,
        w2lExprCat: resultCat,
        w2lExprTerminal: !!opt_terminal,
        w2lExprMayExitFunction: !!opt_mayExitFunction,
        w2lExprBranchTargets: branchTargets
      }
    };
  }
  return {decisionValue: result};
};

/**
 * Renders a bulk-memory operation (memory.fill / memory.copy) as a statement.
 * All three backends (asm.js, Java, PHP64) emit the same helper-call shape;
 * the only variation is the optional buffer argument prefix (empty for asm.js,
 * {@code 'this.buffer'} for Java, captured {@code $buffer} for PHP).  The
 * helper is marked on the backend so a conditional definition is emitted later.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} id  Must be {@code binaryen.MemoryFillId} or {@code MemoryCopyId}.
 * @param {number} indent
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {string} bufferArg  Buffer argument expression or empty string.
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderMemoryBulkOp_ = function (binaryen, id, indent, childResults, bufferArg) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ getInfo = A.getChildResultInfo_;
  var /** @const {string} */ helperName =
      this.getRuntimeHelperPrefix_() + (binaryen.MemoryFillId === id ? 'memory_fill' : 'memory_copy');
  this.markHelper_(helperName);
  var /** @const {!Array<string>} */ args = [];
  if ('' !== bufferArg) args.push(bufferArg);
  for (var /** @type {number} */ ai = 0; ai < 3; ++ai) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ a = getInfo(childResults, ai);
    args.push(this.coerceToType_(binaryen, a.expressionString, a.expressionCategory, binaryen.i32));
  }
  return A.pad_(indent) + this.n_(helperName) + '(' + args.join(', ') + ');\n';
};

/**
 * Handles expression IDs whose emitLeave_ logic is identical across all
 * backends: ConstId, BinaryId, UnaryId, LocalSetId, ReturnId, NopId,
 * UnreachableId.  Returns null for IDs that require backend-specific handling.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {!BinaryenExpressionInfo} expr
 * @param {number} id
 * @param {number} indent
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {!BinaryenModule} wasmModule
 * @param {!BinaryenFunctionInfo} functionInfo
 * @return {?{
 *   emittedString: string,
 *   resultCat: number,
 *   isTerminal: (boolean|undefined),
 *   mayExitFunction: (boolean|undefined)
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitLeaveCommonCase_ = function (
  binaryen,
  expr,
  id,
  indent,
  childResults,
  wasmModule,
  functionInfo
) {
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ getInfo = A.getChildResultInfo_;

  if (binaryen.ConstId === id) {
    var /** @const {number} */ constType = expr.type;
    if (Wasm2Lang.Backend.ValueType.isI64(binaryen, constType)) {
      return {
        emittedString: this.renderI64Const_(binaryen, expr.value),
        resultCat: A.CAT_I64
      };
    }
    return {
      emittedString: this.renderConst_(binaryen, /** @type {number} */ (expr.value), constType),
      resultCat: A.catForConstType_(binaryen, constType)
    };
  }
  if (binaryen.BinaryId === id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ binL = getInfo(childResults, 0);
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ binR = getInfo(childResults, 1);
    return this.emitBinaryId_(
      binaryen,
      /** @type {number} */ (expr.op),
      binL.expressionString,
      binR.expressionString,
      binL.expressionCategory,
      binR.expressionCategory
    );
  }
  if (binaryen.UnaryId === id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ unOp = getInfo(childResults, 0);
    return this.emitUnaryId_(binaryen, /** @type {number} */ (expr.op), unOp.expressionString, unOp.expressionCategory);
  }
  if (binaryen.LocalGetId === id) {
    var /** @const {number} */ lgIdx = /** @type {number} */ (expr.index);
    var /** @const {number} */ lgType = Wasm2Lang.Backend.ValueType.getLocalType(binaryen, functionInfo, lgIdx);
    return {
      emittedString: this.localN_(lgIdx),
      resultCat: this.catForValueTypeRead_(binaryen, lgType)
    };
  }
  if (binaryen.LocalSetId === id) {
    if (!expr.isTee && this.localInitOverridesActive_) {
      var /** @const {string} */ liIdx = String(expr.index);
      if (liIdx in this.localInitOverridesActive_.map && !(liIdx in this.localInitOverridesActive_.consumed)) {
        this.localInitOverridesActive_.consumed[liIdx] = true;
        return {emittedString: '', resultCat: A.CAT_VOID};
      }
    }
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ lsOp = getInfo(childResults, 0);
    return this.emitLocalSet_(
      binaryen,
      functionInfo,
      indent,
      !!expr.isTee,
      /** @type {number} */ (expr.index),
      lsOp.expressionString,
      lsOp.expressionCategory
    );
  }
  if (binaryen.ReturnId === id) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ retOp = getInfo(childResults, 0);
    var /** @type {string} */ retStr;
    if (retOp.hasExpression) {
      retStr =
        A.pad_(indent) +
        'return ' +
        this.coerceAtBoundary_(binaryen, retOp.expressionString, retOp.expressionCategory, functionInfo.results) +
        ';\n';
    } else {
      retStr = A.pad_(indent) + 'return;\n';
    }
    return {
      emittedString: retStr,
      resultCat: A.CAT_VOID,
      isTerminal: true,
      mayExitFunction: true
    };
  }
  if (binaryen.NopId === id) {
    return {emittedString: '', resultCat: A.CAT_VOID};
  }
  if (binaryen.UnreachableId === id) {
    return {
      emittedString: this.renderUnreachableStatement_(
        indent,
        this.allocateTrapSite_(Wasm2Lang.Backend.TrapKind.UNREACHABLE, functionInfo)
      ),
      resultCat: A.CAT_VOID,
      isTerminal: true,
      mayExitFunction: true
    };
  }
  if (binaryen.DropId === id) {
    var /** @const {number} */ dropValuePtr = /** @type {number} */ (expr.value);
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ChildResultInfo_} */ dropOp = getInfo(childResults, 0);
    if (!this.shouldEmitDropChild_(binaryen, dropValuePtr)) {
      if (A.expressionNeedsDiscardEvaluation_(binaryen, dropValuePtr, wasmModule)) {
        return {
          emittedString: this.renderDiscardedValue_(binaryen, dropValuePtr, dropOp, indent),
          resultCat: A.CAT_VOID
        };
      }
      return {emittedString: '', resultCat: A.CAT_VOID};
    }
    return {emittedString: A.pad_(indent) + dropOp.expressionString + ';\n', resultCat: A.CAT_VOID};
  }
  return null;
};

/**
 * Returns {@code true} when a {@code drop} should emit its child expression
 * as a statement.  Default implementation always emits — mirroring asm.js
 * and PHP, where any expression is a valid statement.  Java overrides to
 * restrict emission to call children, since pure expressions are not valid
 * statements in Java.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} dropValuePtr
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.shouldEmitDropChild_ = function (binaryen, dropValuePtr) {
  return true;
};

/**
 * Renders the statement emitted for a wasm {@code unreachable} opcode.
 * Default implementation returns an empty string (no-op); every concrete
 * backend overrides to abort, matching the WASM semantics.  Zig-produced code
 * treats {@code unreachable} as a real termination marker (panics, exhaustive
 * switch arms), so silently falling through corrupts state and can produce
 * infinite loops.
 *
 * {@code siteId} is the {@code --trap-sites} identifier for this occurrence,
 * or {@code -1} when instrumentation is off — in which case the override must
 * emit exactly the text it emitted before the flag existed.
 *
 * Note that a site id is allocated even for the dead {@code unreachable}
 * placeholders binaryen injects after unconditional control flow, which the
 * parent block's {@code effectiveReachableBlockChildCount_} then trims (on a
 * real module that is the overwhelming majority — 235 of 244 dead ids;
 * {@code propagateTerminalChild_} and unused helper bodies account for the
 * rest).  Allocation therefore stays a superset of what ships, deliberately:
 * ids are minted by the emission itself, so they cannot be predicted before
 * it.  {@code selectLiveTrapSites_} drops the dead rows afterwards, once the
 * assembled source says which ids actually survived — the ids themselves are
 * never renumbered, so a trimmed id simply never reaches the host and the
 * surviving ones keep meaning what the emitted code says they mean.
 *
 * @protected
 * @param {number} indent
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderUnreachableStatement_ = function (indent, siteId) {
  return '';
};

/**
 * Renders a throw-shaped trap statement for the backends whose abort is a
 * {@code throw} (Java, C#, PHP) — the throw is the abort, no host hook can
 * skip it, and under {@code --trap-sites} it carries the kind and site id in
 * the stable {@code w2l trap kind=<n> site=<n>} message shape that
 * {@code selectLiveTrapSites_} greps for.  Only the exception-constructor
 * spelling ({@code trapThrowOpen_}) differs per backend; the flag-off branch
 * returns the exact historical string, which is what keeps a no-flag build
 * byte-identical.
 *
 * @protected
 * @param {number} indent
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {number} siteId
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderThrowTrapStatement_ = function (indent, kind, siteId) {
  var /** @const {string} */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_(indent);
  if (!this.trapSitesEnabled_) {
    return pad + this.trapThrowOpen_ + ');\n';
  }
  return pad + this.trapThrowOpen_ + '"' + Wasm2Lang.Backend.AbstractCodegen.trapMessage_(kind, siteId) + '");\n';
};

/**
 * Renders a trap throw for a shared runtime helper body — no indent and no
 * trailing newline, because helper templates place it inline after an `if`.
 * Same contract as {@code renderThrowTrapStatement_}, with the helper's own
 * exception spelling ({@code helperTrapThrowOpen_}) and a site id allocated
 * against the helper name.  Only the throw backends (Java, C#, PHP) reach
 * it; asm.js and JavaScript route helper traps through
 * {@code renderHelperTrapCall_} instead.
 *
 * @protected
 * @param {number} kind  A {@code Wasm2Lang.Backend.TrapKind} value.
 * @param {string} helperName
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderHelperTrapThrow_ = function (kind, helperName) {
  if (!this.trapSitesEnabled_) {
    return this.helperTrapThrowOpen_ + ');';
  }
  var /** @const {number} */ siteId = this.allocateHelperTrapSite_(kind, helperName);
  return this.helperTrapThrowOpen_ + '"' + Wasm2Lang.Backend.AbstractCodegen.trapMessage_(kind, siteId) + '");';
};

// ---------------------------------------------------------------------------
// Shared class-backend leave emitter.
//
// Java and C# render the same expression cases in two alphabets; the shared
// emitLeave_ body lives here (installed by both backends as emitLeave_) and
// every real divergence goes through one of the hooks below.  The SIMD lane
// cases and Java's v128 store-copy optimization are genuinely different per
// backend and stay in emitClassLeaveBackendCase_; everything else is one
// spelling.  Hook defaults follow the classTypeName_ convention: unreachable
// for non-class backends, present so this file type-checks.
// ---------------------------------------------------------------------------

/**
 * Renders a ternary condition from a child expression string and category:
 * an already-boolean i32 needs only precedence wrapping, anything else
 * compares against zero.
 *
 * @protected
 * @param {string} condStr
 * @param {number} condCat
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.renderClassTernaryCondition_ = function (condStr, condCat) {
  var /** @const */ Ps = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
  if (Wasm2Lang.Backend.AbstractCodegen.CAT_BOOL_I32 === condCat) {
    return Ps.wrap_(condStr, Ps.PREC_CONDITIONAL_, false);
  }
  return Ps.renderInfix(condStr, '!=', '0', Ps.PREC_EQUALITY_);
};

/**
 * Renders a direct-cast import call ({@code castNames_} entry) — the
 * language-level cast ladder each class backend spells its own way.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} castBaseName
 * @param {number} callType
 * @param {string} valStr
 * @param {number} valCat
 * @return {{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderClassCastImport_ = function (
  binaryen,
  castBaseName,
  callType,
  valStr,
  valCat
) {
  return {emittedString: '', resultCat: Wasm2Lang.Backend.AbstractCodegen.CAT_VOID};
};

/**
 * Text appended after a raw (unsimplified) infinite loop.  Default none;
 * C# appends the conditional goto exit label.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} state
 * @param {string} loopName
 * @param {number} ind
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.classRawLoopSuffix_ = function (state, loopName, ind) {
  return '';
};

/**
 * Renders a call to an imported function.  Each class backend chooses its
 * own invocation vehicle (Java functional interfaces, C# delegate casts);
 * the default is unreachable and exists so the shared leave emitter
 * type-checks (same note as classTypeName_).
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {string} importBaseName
 * @param {!Array<string>} callArgs
 * @param {number} callType
 * @param {!Array<number>=} opt_paramTypes
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderImportCallExpr_ = function (
  binaryen,
  importBaseName,
  callArgs,
  callType,
  opt_paramTypes
) {
  return '';
};

/**
 * Typed delegate onto the backend's {@code renderLoad_}.  Every backend
 * defines one, but no shared declaration can exist: the JS-family signature
 * carries a required trailing {@code align} parameter the class backends do
 * not take, so a base stub would make one family or the other an invalid
 * override.  Hence the narrow suppression here — the cast pins the return
 * type, and the shared leave emitter stays fully checked.
 *
 * @protected
 * @suppress {strictMissingProperties, missingProperties, reportUnknownTypes}
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {boolean} isSigned
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.classRenderLoad_ = function (binaryen, ptrExpr, wasmType, bytes, isSigned) {
  return /** @type {string} */ (this.renderLoad_(binaryen, ptrExpr, wasmType, bytes, isSigned));
};

/**
 * Typed delegate onto the backend's {@code renderStore_} — same rationale
 * and same narrow suppression as {@code classRenderLoad_} above.
 *
 * @protected
 * @suppress {strictMissingProperties, missingProperties, reportUnknownTypes}
 * @param {!Binaryen} binaryen
 * @param {string} ptrExpr
 * @param {string} valueExpr
 * @param {number} wasmType
 * @param {number} bytes
 * @param {number} valueCat
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.classRenderStore_ = function (
  binaryen,
  ptrExpr,
  valueExpr,
  wasmType,
  bytes,
  valueCat
) {
  return /** @type {string} */ (this.renderStore_(binaryen, ptrExpr, valueExpr, wasmType, bytes, valueCat));
};

/**
 * Backend-specific leave cases consulted before the shared switch: the SIMD
 * lane operations (both backends, each in its own intrinsics vocabulary) and
 * Java's v128 store-copy optimization.  Returns null to fall through to the
 * shared cases; an id neither handles ends at {@code refuseExpressionId_}.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ClassEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @param {function(number): string} cr
 * @param {function(number): number} cc
 * @param {number} ind
 * @return {?{emittedString: string, resultCat: number}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitClassLeaveBackendCase_ = function (state, nodeCtx, childResults, cr, cc, ind) {
  return null;
};

/**
 * Post-processes the built leave result.  Default no-op; Java attaches the
 * v128 load-pointer metadata a containing store's copy optimization reads.
 *
 * @protected
 * @param {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} leaveResult
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ClassEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {function(number): string} cr
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.augmentClassLeaveResult_ = function (leaveResult, state, nodeCtx, cr) {};

/**
 * Java and C# only allow method calls, assignments, etc. as expression
 * statements.  Restrict drop emission to call children (the side-effectful
 * case); pure expressions are dropped silently.  Installed by both backends
 * as {@code shouldEmitDropChild_}.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} dropValuePtr
 * @return {boolean}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.classShouldEmitDropChild_ = function (binaryen, dropValuePtr) {
  if (!dropValuePtr) return false;
  var /** @const {number} */ childId = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(binaryen, dropValuePtr).id;
  return binaryen.CallId === childId || binaryen.CallIndirectId === childId;
};

/**
 * The shared emitLeave_ body for the class-shaped backends.  Installed as
 * {@code emitLeave_} by Java and C#.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ClassEmitState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} childResults
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitClassLeave_ = function (state, nodeCtx, childResults) {
  var /** @const {!BinaryenExpressionInfo} */ expr = nodeCtx.expression;
  var /** @const {number} */ id = expr.id;
  var /** @const {!Binaryen} */ binaryen = state.binaryen;
  var /** @const {number} */ ind = state.indent;
  var /** @type {string} */ result = '';
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const */ A = Wasm2Lang.Backend.AbstractCodegen;
  var /** @const */ C = Wasm2Lang.Backend.I32Coercion;
  var /** @type {number} */ resultCat = A.CAT_VOID;
  var /** @type {boolean} */ resultTerminalOverride = false;
  var /** @type {boolean} */ resultTerminalOverrideIsAuthoritative = false;

  // Reset terminal flag for all non-Block expressions (Block propagates from
  // its last child).  Terminal handlers (Return, unconditional Break, Switch
  // with default) override to true so callers (e.g. SwitchId default-case
  // detection) can suppress an unreachable trailing statement.
  if (binaryen.BlockId !== id) {
    state.lastExprIsTerminal = false;
  }

  var /** @const */ acc = A.makeChildAccessors_(childResults);
  var /** @const {function(number): string} */ cr = acc.cr;
  var /** @const {function(number): number} */ cc = acc.cc;

  var /** @const {?Wasm2Lang.Backend.AbstractCodegen.TypedExpr_} */ terminal = this.propagateTerminalChild_(
      binaryen,
      expr,
      id,
      childResults,
      state.wasmModule,
      ind
    );
  if (terminal) {
    state.lastExprIsTerminal = true;
    return {decisionValue: terminal};
  }

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ childControl = A.mergeChildControl_(childResults);
  var /** @type {boolean} */ resultMayExitFunction = childControl.mayExitFunction;
  var /** @type {!Array<string>} */ resultBranchTargets = childControl.branchTargets;

  var /** @const */ common = this.emitLeaveCommonCase_(
      binaryen,
      expr,
      id,
      ind,
      childResults,
      state.wasmModule,
      state.functionInfo
    );
  if (common) {
    if (common.isTerminal) state.lastExprIsTerminal = true;
    return A.buildLeaveResult_(
      common.emittedString,
      common.resultCat,
      !!common.isTerminal,
      resultMayExitFunction || !!common.mayExitFunction,
      resultBranchTargets
    );
  }

  var /** @const {?{emittedString: string, resultCat: number}} */ backendCase = this.emitClassLeaveBackendCase_(
      state,
      nodeCtx,
      childResults,
      cr,
      cc,
      ind
    );
  if (backendCase) {
    result = backendCase.emittedString;
    resultCat = backendCase.resultCat;
  } else {
    switch (id) {
      case binaryen.GlobalGetId: {
        var /** @const {string} */ globalGetName = /** @type {string} */ (expr.name);
        var /** @const {number} */ globalGetType = state.globalTypes[globalGetName] || binaryen.i32;
        var /** @const {string} */ stdlibGlobal = state.stdlibGlobals ? state.stdlibGlobals[globalGetName] || '' : '';
        if ('' !== stdlibGlobal) {
          result = stdlibGlobal;
        } else {
          var /** @const {string} */ globalGetKey = '$g_' + this.safeName_(globalGetName);
          this.markBinding_(globalGetKey);
          result = 'this.' + this.n_(globalGetKey);
        }
        resultCat = A.catForCoercedType_(binaryen, globalGetType);
        break;
      }

      case binaryen.LoadId: {
        var /** @const {string} */ loadPtr = Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(
            cr(0),
            /** @type {number} */ (expr.offset)
          );
        var /** @const {number} */ loadType = expr.type;
        result = this.classRenderLoad_(binaryen, loadPtr, loadType, /** @type {number} */ (expr.bytes), !!expr.isSigned);
        resultCat = A.catForCoercedType_(binaryen, loadType);
        break;
      }
      case binaryen.StoreId: {
        var /** @const {number} */ storeType = /** @type {number} */ (expr.valueType) || binaryen.i32;
        var /** @const {string} */ storePtr = Wasm2Lang.Backend.AbstractCodegen.renderPtrWithOffset_(
            cr(0),
            /** @type {number} */ (expr.offset)
          );
        result =
          pad(ind) +
          this.classRenderStore_(binaryen, storePtr, cr(1), storeType, /** @type {number} */ (expr.bytes), cc(1)) +
          '\n';
        break;
      }
      case binaryen.GlobalSetId: {
        var /** @const {string} */ globalName = /** @type {string} */ (expr.name);
        var /** @const {number} */ globalType = state.globalTypes[globalName] || binaryen.i32;
        var /** @const {string} */ globalSetKey = '$g_' + this.safeName_(globalName);
        this.markBinding_(globalSetKey);
        result =
          pad(ind) +
          'this.' +
          this.n_(globalSetKey) +
          ' = ' +
          A.Precedence_.stripForAssignment(this.coerceToType_(binaryen, cr(0), cc(0), globalType)) +
          ';\n';
        break;
      }
      case binaryen.CallId: {
        var /** @const {string} */ callTarget = /** @type {string} */ (expr.target);
        var /** @const {number} */ callType = expr.type;

        // Direct-cast imports: emit native language-level type cast instead of a call.
        // No helpers, no range checks — just the raw target-language cast.
        var /** @const {string|undefined} */ castBaseName = this.castNames_ ? this.castNames_[callTarget] : void 0;
        if (void 0 !== castBaseName) {
          var /** @const */ castResult = this.renderClassCastImport_(binaryen, castBaseName, callType, cr(0), cc(0));
          result = castResult.emittedString;
          resultCat = castResult.resultCat;
          break;
        }

        var /** @const {string} */ stdlibName = state.stdlibNames ? state.stdlibNames[callTarget] || '' : '';
        var /** @const {string} */ importBase = stdlibName ? '' : state.importedNames[callTarget] || '';
        var /** @const {!Array<string>} */ callArgs = this.buildCoercedCallArgs_(
            binaryen,
            expr,
            childResults,
            state.functionSignatures
          );
        var /** @type {string} */ callExpr;
        if ('' !== stdlibName) {
          callExpr = stdlibName + '(' + callArgs.join(', ') + ')';
        } else if ('' !== importBase) {
          this.markBinding_('$if_' + this.safeName_(importBase));
          var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_} */ impSig = state.functionSignatures[
              callTarget
            ] || {sigParams: [], sigRetType: callType};
          callExpr = this.renderImportCallExpr_(binaryen, importBase, callArgs, callType, impSig.sigParams);
        } else {
          var /** @const {boolean} */ callIsExported = callTarget in state.exportNameMap;
          var /** @const {string} */ resolvedName = callIsExported ? state.exportNameMap[callTarget] : callTarget;
          var /** @const {string} */ callMethodName = callIsExported
              ? this.safeName_(resolvedName)
              : this.n_(this.safeName_(resolvedName));
          callExpr = callMethodName + '(' + callArgs.join(', ') + ')';
        }
        if (binaryen.none === callType || 0 === callType) {
          result = pad(ind) + callExpr + ';\n';
        } else {
          result = callExpr;
          resultCat = A.catForCoercedType_(binaryen, callType);
        }
        break;
      }
      case binaryen.CallIndirectId: {
        var /** @const {!Array<number>} */ ciParamTypes = binaryen.expandType(/** @type {number} */ (expr.params));
        var /** @const {number} */ ciRetType = expr.type;
        var /** @const {string} */ ciSigKey = A.buildSignatureKey_(binaryen, ciParamTypes, ciRetType);
        var /** @const {!Array<string>} */ ciArgs = this.buildCoercedCallIndirectArgs_(binaryen, expr, childResults);
        var /** @const {string} */ ciTableName = this.n_('$ftable_' + ciSigKey);
        var /** @const {string} */ ciIndexExpr = this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32);
        var /** @type {string} */ ciCallExpr;
        if (this.callIndirectNeedsOrderedEvaluation_(binaryen, expr, state.wasmModule)) {
          ciArgs.push(ciIndexExpr);
          ciCallExpr = 'this.' + this.n_(this.getOrderedCallIndirectWrapperName_(ciSigKey)) + '(' + ciArgs.join(', ') + ')';
        } else {
          ciCallExpr = 'this.' + ciTableName + '[' + ciIndexExpr + this.tableInvokeOpen_ + ciArgs.join(', ') + ')';
        }
        if (binaryen.none === ciRetType || 0 === ciRetType) {
          result = pad(ind) + ciCallExpr + ';\n';
        } else {
          result = ciCallExpr;
          resultCat = A.catForCoercedType_(binaryen, ciRetType);
        }
        break;
      }
      case binaryen.SelectId: {
        var /** @const {number} */ selectType = expr.type;
        if (this.selectNeedsEagerEvaluation_(binaryen, expr, state.wasmModule)) {
          var /** @const {string} */ selectHelper = this.getEagerSelectHelperName_(binaryen, selectType);
          this.markHelper_(selectHelper);
          result =
            this.n_(selectHelper) +
            '(' +
            this.coerceToType_(binaryen, cr(1), cc(1), selectType) +
            ', ' +
            this.coerceToType_(binaryen, cr(2), cc(2), selectType) +
            ', ' +
            this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) +
            ')';
        } else {
          var /** @const {string} */ selCondStr = A.renderClassTernaryCondition_(cr(0), cc(0));
          // Coerce BOTH arms to the select's value type.  Java: its
          // conditional-expression typing would otherwise widen the arms.
          // C#: a bare relational arm is a bool, and a ternary mixing bool
          // and int does not compile (CS0029/CS0173) — the select's declared
          // result category is integer, so the coercion materializes the
          // {@code ? 1 : 0}.
          var /** @const {string} */ selTrueStr = this.coerceToType_(binaryen, cr(1), cc(1), selectType);
          var /** @const {string} */ selFalseStr = this.coerceToType_(binaryen, cr(2), cc(2), selectType);
          result = '(' + selCondStr + ' ? ' + selTrueStr + ' : ' + selFalseStr + ')';
        }
        resultCat = A.catForCoercedType_(binaryen, selectType);
        break;
      }
      case binaryen.MemorySizeId:
        result = 'this.' + this.n_('buffer') + this.classMemorySizeSuffix_;
        resultCat = C.SIGNED;
        break;

      case binaryen.MemoryGrowId:
        this.markHelper_('$w2l_memory_grow');
        result = 'this.' + this.n_('$w2l_memory_grow') + '(' + this.coerceToType_(binaryen, cr(0), cc(0), binaryen.i32) + ')';
        resultCat = C.SIGNED;
        break;

      case binaryen.MemoryFillId:
      case binaryen.MemoryCopyId:
        result = this.renderMemoryBulkOp_(binaryen, id, ind, childResults, 'this.' + this.n_('buffer'));
        break;

      case binaryen.BlockId: {
        var /** @const {?{w2lExprStr: string, w2lExprCat: number, w2lRootValueBlockPrefix: string}} */ rootValueShape =
            A.tryEmitRootValueBlock_(state, nodeCtx, childResults);
        if (rootValueShape) {
          return /** @type {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ ({decisionValue: rootValueShape});
        }
        result = this.emitBlockDispatch_(state, nodeCtx, childResults);
        var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ blockControl = A.summarizeBlockControl_(
            binaryen,
            state.wasmModule,
            expr,
            childResults
          );
        resultTerminalOverride = blockControl.isTerminal;
        resultTerminalOverrideIsAuthoritative = true;
        resultMayExitFunction = blockControl.mayExitFunction;
        resultBranchTargets = blockControl.branchTargets;
        break;
      }
      case binaryen.LoopId: {
        var /** @const {string} */ loopName = /** @type {string} */ (expr.name);
        var /** @type {?string} */ loopKind = null;
        if ('' !== state.pendingLoopKind) {
          loopKind = state.pendingLoopKind;
          state.pendingLoopKind = '';
        }
        if (loopKind) {
          result = this.emitSimplifiedLoopFromIR_(state, nodeCtx, loopKind);
        } else {
          // Raw loop fallback (unsimplified): the body's static wasm type
          // determines whether the for(;;) needs an explicit trailing
          // {@code break;}.  Body type {@code none} means the body can fall
          // through (either by reaching its end naturally, or by exiting a
          // named child block via label-break).  The language requires the
          // trailing break to escape the for(;;) on that fall-through path.
          // Body type {@code unreachable} means every path inside the body
          // either continues the loop ({@code br $label}) or breaks to an
          // outer scope, so the trailing break would itself be unreachable.
          var /** @const {!BinaryenExpressionInfo} */ loopBodyInfo = Wasm2Lang.Wasm.Tree.NodeSchema.safeGetExpressionInfo(
              binaryen,
              /** @type {number} */ (expr.body)
            );
          var /** @const {boolean} */ needsTrailingBreak =
              binaryen.unreachable !== loopBodyInfo.type && !A.getChildResultInfo_(childResults, 0).isTerminal;
          var /** @const {string} */ rawLabel = state.usedLabels[loopName] ? this.labelN_(state.labelMap, loopName) + ': ' : '';
          result =
            this.emitRawInfiniteLoop_(ind, rawLabel, cr(0), needsTrailingBreak) +
            this.classRawLoopSuffix_(state, loopName, ind);
        }
        --state.breakableStack.length;
        var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ControlSummary_} */ loopControl = A.summarizeLoopControl_(
            binaryen,
            expr,
            childResults
          );
        resultTerminalOverride = loopControl.isTerminal;
        resultTerminalOverrideIsAuthoritative = true;
        resultMayExitFunction = loopControl.mayExitFunction;
        resultBranchTargets = loopControl.branchTargets;
        break;
      }
      case binaryen.IfId: {
        var /** @const {number} */ ifType = expr.type;
        if (binaryen.none !== ifType && binaryen.unreachable !== ifType && 0 !== ifType) {
          var /** @const {string} */ ifCondStr = A.renderClassTernaryCondition_(cr(0), cc(0));
          // Both arms coerced for the same reason as the lazy select above —
          // a bool-categorized arm in a C# value ternary is a compile error,
          // and Java would widen unmatched arms.
          var /** @const {string} */ ifTrueStr = this.coerceToType_(binaryen, cr(1), cc(1), ifType);
          var /** @const {string} */ ifFalseStr = this.coerceToType_(binaryen, cr(2), cc(2), ifType);
          result = '(' + ifCondStr + ' ? ' + ifTrueStr + ' : ' + ifFalseStr + ')';
          resultCat = A.catForCoercedType_(binaryen, ifType);
        } else {
          result = this.emitIfStatement_(
            ind,
            cr(0),
            cr(1),
            /** @type {number} */ (expr.ifFalse),
            childResults.length,
            cr(2),
            cc(0)
          );
        }
        break;
      }
      case binaryen.BreakId: {
        var /** @const {string} */ brName = /** @type {string} */ (expr.name);
        var /** @const */ brResult = this.emitBreakStatement_(
            state,
            ind,
            brName,
            /** @type {number} */ (expr.condition),
            cr(0),
            cc(0)
          );
        result = brResult.emittedString;
        if (brResult.isTerminal) {
          state.lastExprIsTerminal = true;
        }
        A.appendUniqueBranchTargets_(resultBranchTargets, [brName]);
        break;
      }
      case binaryen.SwitchId: {
        var /** @const {!Array<string>} */ swNames = /** @type {!Array<string>} */ (expr.names || []);
        var /** @const {string} */ swDefault = /** @type {string} */ (expr.defaultName || '');
        var /** @const */ swResult = this.emitSwitchStatement_(state, ind, cr(0), swNames, swDefault, cc(0));
        result = swResult.emittedString;
        state.lastExprIsTerminal = swResult.hasDefault;
        A.appendUniqueBranchTargets_(resultBranchTargets, swNames);
        if ('' !== swDefault) A.appendUniqueBranchTargets_(resultBranchTargets, [swDefault]);
        break;
      }
      default:
        this.refuseExpressionId_(id);
    }
  }

  var /** @const {boolean} */ resultIsTerminal = resultTerminalOverrideIsAuthoritative
      ? resultTerminalOverride
      : binaryen.unreachable === expr.type;
  if (resultIsTerminal) state.lastExprIsTerminal = true;
  var /** @const {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ leaveResult = A.buildLeaveResult_(
      result,
      resultCat,
      resultIsTerminal,
      resultMayExitFunction,
      resultBranchTargets
    );
  this.augmentClassLeaveResult_(leaveResult, state, nodeCtx, cr);
  return leaveResult;
};
