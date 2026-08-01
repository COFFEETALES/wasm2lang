'use strict';

// ---------------------------------------------------------------------------
// walkFunctionBody_, idName_, traversal state, traversal enter callback,
// and default emitCode implementation.
// ---------------------------------------------------------------------------

/**
 * Creates a code-gen visitor, walks the function body, and appends the
 * result to the output parts array.  Shared by all backends — the per-
 * backend behavior is dispatched through emitEnter_, adjustLeaveIndent_,
 * and emitLeave_ virtual methods.
 *
 * @suppress {checkTypes, reportUnknownTypes}
 * @protected
 * @param {!Array<string>} parts
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} emitState
 * @param {string} padStr
 * @return {boolean} Whether the appended body ends with a return statement.
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.walkAndAppendBody_ = function (
  parts,
  wasmModule,
  binaryen,
  funcInfo,
  emitState,
  padStr
) {
  this.prepareControlFlowSummary_(wasmModule, binaryen);

  var /** @const {!Wasm2Lang.Backend.AbstractCodegen} */ self = this;
  var /** @const {!Object<string, boolean>} */ skippedPointers = Object.create(null);
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
      enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) {
        var /** @const {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ decision = self.emitEnter_(emitState, nc);
        if (
          decision &&
          Wasm2Lang.Wasm.Tree.TraversalKernel.Action.SKIP_SUBTREE === decision.decisionAction
        ) {
          skippedPointers[String(nc.expressionPointer)] = true;
        }
        return decision;
      },
      leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
        var /** @type {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} */ effectiveChildResults = cr || [];
        var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = nc.expression;
        var /** @const {string} */ pointerKey = String(nc.expressionPointer);
        var /** @const {boolean} */ wasSkipped = !!skippedPointers[pointerKey];
        if (wasSkipped) delete skippedPointers[pointerKey];
        if (wasSkipped && (binaryen.BlockId === expression.id || binaryen.LoopId === expression.id)) {
          if (0 !== effectiveChildResults.length) {
            throw new Error('Wasm2Lang codegen: SKIP_SUBTREE unexpectedly produced child results.');
          }
          var /** @const {?Wasm2Lang.Wasm.Tree.ControlFlowSummary} */ skippedSummary =
              self.getControlFlowSummary_(funcInfo.name, nc.expressionPointer);
          if (!skippedSummary) {
            throw new Error(
              'Wasm2Lang codegen: missing control summary for skipped expression ' +
                nc.expressionPointer +
                ' in function "' +
                funcInfo.name +
                '".'
            );
          }
          effectiveChildResults = [];
          /** @type {!Wasm2Lang.Wasm.Tree.SkippedControlSummaryCarrier} */ (effectiveChildResults).w2lSkippedControlSummary =
            skippedSummary;
        }
        self.adjustLeaveIndent_(emitState, nc);
        return self.emitLeave_(emitState, nc, effectiveChildResults);
      }
    });
  emitState.visitor = visitor;
  var /** @const {?Object<string, *>} */ liOverrides = this.getLocalInitOverrides_(funcInfo.name);
  this.localInitOverridesActive_ = liOverrides ? {map: liOverrides, consumed: Object.create(null)} : null;
  var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
  return this.appendBodyResult_(parts, bodyResult, binaryen, funcInfo, padStr);
};

/**
 * Target-language type name for a wasm value type, used by the shared
 * class-method emitter below.  Only the class-shaped backends (Java, C#)
 * consult it; the default is unreachable for the others and exists so the
 * shared emitter type-checks against the base prototype.
 *
 * @protected
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.classTypeName_ = function (binaryen, wasmType) {
  return Wasm2Lang.Backend.ValueType.typeName(binaryen, wasmType);
};

/**
 * Emits one method body for a class-shaped backend (Java, C#).  Both declare
 * a method inside a class, coerce nothing at the parameter boundary, declare
 * each local with its target type, and walk the body with the shared visitor;
 * the only divergences are the type-name spelling ({@code classTypeName_}) and
 * the visibility keyword an exported method carries
 * ({@code exportedMethodVisibility_}).
 *
 * The emit state carries {@code usedExitLabels} unconditionally.  Only C#
 * reads it — Java has labeled {@code break}/{@code continue} and never needs
 * a goto exit label — but building one shape for both keeps this emitter free
 * of a per-backend branch, and an unread empty map costs one allocation per
 * function.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @param {!Object<string, string>} exportNameMap
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_>} functionTables
 * @param {?Object<string, string>=} opt_stdlibNames
 * @param {?Object<string, string>=} opt_stdlibGlobals
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitClassMethod_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes,
  exportNameMap,
  functionTables,
  opt_stdlibNames,
  opt_stdlibGlobals
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {boolean} */ isExported = funcInfo.name in exportNameMap;
  var /** @const {string} */ fnName = isExported
      ? this.safeName_(exportNameMap[funcInfo.name])
      : this.n_(this.safeName_(funcInfo.name));
  var /** @const {string} */ visibility = isExported ? this.exportedMethodVisibility_ : 'private ';
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;
  var /** @const {string} */ returnType = this.classTypeName_(binaryen, funcInfo.results);

  // Method header (indent 1 = inside class).
  var /** @const {!Array<string>} */ paramDecls = [];
  for (var /** @type {number} */ pi = 0; pi !== numParams; ++pi) {
    paramDecls.push(this.classTypeName_(binaryen, paramTypes[pi]) + ' ' + this.localN_(pi));
  }
  parts.push(pad1 + visibility + returnType + ' ' + fnName + '(' + paramDecls.join(', ') + ') {');

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {!Array<string>} */ initStrs = this.buildLocalInitStrings_(binaryen, funcInfo.name, varTypes, numParams);
    for (var /** @type {number} */ vi = 0; vi !== numVars; ++vi) {
      parts.push(
        pad2 + this.classTypeName_(binaryen, varTypes[vi]) + ' ' + this.localN_(numParams + vi) + ' = ' + initStrs[vi] + ';'
      );
    }
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    this.walkAndAppendBody_(
      parts,
      wasmModule,
      binaryen,
      funcInfo,
      /** @type {!Wasm2Lang.Backend.AbstractCodegen.LabeledEmitState_} */ ({
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        functionTables: functionTables,
        labelKinds: /** @type {!Object<string, string>} */ (Object.create(null)),
        labelMap: /** @type {!Object<string, number>} */ (Object.create(null)),
        importedNames: importedNames,
        stdlibNames: opt_stdlibNames || null,
        stdlibGlobals: opt_stdlibGlobals || null,
        exportNameMap: exportNameMap,
        indent: 2,
        lastExprIsTerminal: false,
        wasmModule: wasmModule,
        visitor: null,
        fusedBlockToLoop: /** @type {!Object<string, string>} */ (Object.create(null)),
        pendingBlockFusion: '',
        currentLoopName: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: '',
        breakableStack: [],
        usedLabels: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        usedExitLabels: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        pendingLoopKind: ''
      }),
      pad2
    );
  }

  parts.push(pad1 + '}');
  return parts.join('\n');
};

/**
 * Lazily-built reverse map from Binaryen expression-ID numbers to readable
 * names.  Populated once on first call to {@code idName_}.
 *
 * @private
 * @type {?Object<number, string>}
 */
Wasm2Lang.Backend.AbstractCodegen.idNames_ = null;

/**
 * Walks a single function body with the provided visitor.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Wasm2Lang.Wasm.Tree.TraversalVisitor} visitor
 * @return {*}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.walkFunctionBody_ = function (wasmModule, binaryen, funcInfo, visitor) {
  var /** @const {number} */ bodyPtr = funcInfo.body;
  if (0 === bodyPtr) {
    return '';
  }

  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalContext} */ ctx = {
      binaryen: binaryen,
      treeModule: wasmModule,
      functionInfo: funcInfo,
      treeMetadata: /** @type {!Wasm2Lang.Wasm.Tree.PassMetadata} */ (Object.create(null)),
      ancestors: []
    };

  return Wasm2Lang.Wasm.Tree.TraversalKernel.walkExpression(bodyPtr, ctx, visitor);
};

/**
 * Maps a Binaryen expression ID to a short readable name for the skeleton
 * output.  Uses a lazily-cached lookup object instead of a long equality
 * chain.  Shared with other backends (e.g. AsmjsCodegen).
 *
 * @param {!Binaryen} binaryen
 * @param {number} id
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.idName_ = function (binaryen, id) {
  var /** @type {?Object<number, string>} */ names = Wasm2Lang.Backend.AbstractCodegen.idNames_;

  if (!names) {
    names = Object.create(null);
    names[binaryen.BlockId] = 'block';
    names[binaryen.IfId] = 'if';
    names[binaryen.LoopId] = 'loop';
    names[binaryen.BreakId] = 'br';
    names[binaryen.SwitchId] = 'br_table';
    names[binaryen.LocalGetId] = 'local.get';
    names[binaryen.LocalSetId] = 'local.set';
    names[binaryen.GlobalGetId] = 'global.get';
    names[binaryen.GlobalSetId] = 'global.set';
    names[binaryen.ConstId] = 'const';
    names[binaryen.UnaryId] = 'unary';
    names[binaryen.BinaryId] = 'binary';
    names[binaryen.SelectId] = 'select';
    names[binaryen.DropId] = 'drop';
    names[binaryen.ReturnId] = 'return';
    names[binaryen.CallId] = 'call';
    names[binaryen.CallIndirectId] = 'call_indirect';
    names[binaryen.LoadId] = 'load';
    names[binaryen.StoreId] = 'store';
    names[binaryen.NopId] = 'nop';
    names[binaryen.UnreachableId] = 'unreachable';
    names[binaryen.MemorySizeId] = 'memory.size';
    names[binaryen.MemoryGrowId] = 'memory.grow';
    names[binaryen.MemoryFillId] = 'memory.fill';
    names[binaryen.MemoryCopyId] = 'memory.copy';
    Wasm2Lang.Backend.AbstractCodegen.idNames_ = names;
  }

  var /** @const {*} */ name = names[id];
  return 'string' === typeof name ? name : 'expr(' + id + ')';
};

/**
 * Mutable state threaded through the abstract codegen traversal enter callback.
 *
 * @private
 * @typedef {{
 *   nodeCount: number,
 *   seenIds: !Object<string, boolean>,
 *   seenIdNames: !Array<string>,
 *   binaryen: !Binaryen
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.TraversalState_;

/**
 * Visitor enter callback for the abstract codegen traversal.  Counts nodes and
 * records each distinct expression-id encountered.
 *
 * Designed to be partially applied via {@code .bind(null, state)} so the
 * resulting function matches the {@code TraversalEnterCallback} signature.
 *
 * @private
 * @param {!Wasm2Lang.Backend.AbstractCodegen.TraversalState_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.traversalEnter_ = function (state, nodeCtx) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (
      nodeCtx.expression
    );
  var /** @const {number} */ id = expression.id;
  var /** @const {string} */ idKey = String(id);
  ++state.nodeCount;

  if (!state.seenIds[idKey]) {
    state.seenIds[idKey] = true;
    state.seenIdNames[state.seenIdNames.length] = this.idName_(state.binaryen, id);
  }

  return null;
};

/**
 * Traversal-driven backend emission.  Walks every non-imported function body
 * with the TraversalKernel and emits a skeleton string — one comment line per
 * function with the traversal node count.  Replace the visitor body with real
 * string-building logic to produce target language code.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string|!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {!Array<!BinaryenFunctionInfo>} */ functions = this.collectDefinedFunctions_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.TraversalState_} */ traversalState = {
      nodeCount: 0,
      seenIds: /** @type {!Object<string, boolean>} */ (Object.create(null)),
      seenIdNames: [],
      binaryen: binaryen
    };

  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
    /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
      enter: this.traversalEnter_.bind(this, traversalState)
    });

  for (var /** @type {number} */ f = 0, /** @const {number} */ funcCount = functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = functions[f];
    traversalState.nodeCount = 0;
    this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);

    outputParts.push('// ' + funcInfo.name + ' [nodes:' + traversalState.nodeCount + ']');
  }

  outputParts.push(
    '// [ids seen: ' + (0 !== traversalState.seenIdNames.length ? traversalState.seenIdNames.join(', ') : '(none)') + ']'
  );

  return outputParts.join('\n');
};
