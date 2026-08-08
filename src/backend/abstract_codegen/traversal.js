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

// ---------------------------------------------------------------------------
// Shared class-shell emitter.
//
// Java and C# emit the same module shell — class declaration, function-table
// signature types, buffer field, constructor with deferred import/table
// splices, method bodies, helpers, exported-global accessors — in two
// alphabets.  emitClassCode_ holds the one shared orchestration; every
// single-token divergence reads a constructor-set spelling field (see the
// spelling table in abstract_codegen.js) and every structural divergence
// goes through one of the method hooks below, whose defaults are unreachable
// for the non-class backends and exist so the shared emitter type-checks
// (same note as classTypeName_ above).
// ---------------------------------------------------------------------------

/**
 * One function-table signature type declaration ({@code @FunctionalInterface}
 * line in Java, {@code delegate} line in C#).
 *
 * @protected
 * @param {string} pad1
 * @param {string} sigTypeName
 * @param {string} returnTypeName
 * @param {string} joinedParamDecls
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderFtSigDecl_ = function (pad1, sigTypeName, returnTypeName, joinedParamDecls) {
  return '';
};

/**
 * The constructor's opening line, through the {@code '{'} — the visibility,
 * the foreign-import map type, and the buffer parameter type all live here.
 *
 * @protected
 * @param {string} pad1
 * @param {string} className
 * @param {string} bufferParamName
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderClassCtorOpen_ = function (pad1, className, bufferParamName) {
  return '';
};

/**
 * Resolves the asm.js-style stdlib imports onto target-language spellings.
 * Each backend keeps its own constant table and target method names.
 *
 * @protected
 * @param {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} moduleInfo
 * @return {{w2lStdlibNames: !Object<string, string>, w2lStdlibGlobals: !Object<string, string>}}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.resolveClassStdlib_ = function (moduleInfo) {
  return {
    w2lStdlibNames: /** @type {!Object<string, string>} */ (Object.create(null)),
    w2lStdlibGlobals: /** @type {!Object<string, string>} */ (Object.create(null))
  };
};

/**
 * A foreign-import lookup expression ({@code foreign.get("x")} /
 * {@code foreign["x"]}).
 *
 * @protected
 * @param {string} importBaseName
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.renderForeignLookup_ = function (importBaseName) {
  return '';
};

/**
 * Backend-specific post-processing of the assembled class parts, called after
 * the closing brace is pushed and before the parts are joined.  Default
 * no-op; Java splices its Vector API import here.
 *
 * @protected
 * @param {!Array<string>} outputParts
 * @param {!Object<string, boolean>} usedBindings
 * @return {void}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.finalizeClassParts_ = function (outputParts, usedBindings) {};

/**
 * Emits the full module shell for a class-shaped backend.  Installed as
 * {@code emitCode} by Java and C#.
 *
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.emitClassCode_ = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);

  // Class declaration — capitalise first letter, prefix with Wasm so the
  // class name cannot collide with target-runtime type names (java.lang.Module
  // and other JDK classes, the BCL) or the buffer symbol.
  var /** @const {string} */ className = 'Wasm' + moduleName.charAt(0).toUpperCase() + moduleName.substring(1);
  outputParts.push(this.classDeclPrefix_ + className + ' {');

  // Function table signature types.
  var /** @const {!Array<string>} */ ftKeys = Object.keys(moduleInfo.functionTables);
  for (var /** @type {number} */ fti = 0, /** @const {number} */ ftLen = ftKeys.length; fti !== ftLen; ++fti) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescI =
        moduleInfo.functionTables[ftKeys[fti]];
    var /** @const {string} */ sigTypeName = this.n_('$ftsig_' + ftDescI.signatureKey);
    var /** @const {string} */ sigRetType = this.classTypeName_(binaryen, ftDescI.signatureReturnType);
    var /** @const {!Array<string>} */ sigParams = [];
    for (var /** @type {number} */ ip = 0, /** @const {number} */ ipLen = ftDescI.signatureParams.length; ip !== ipLen; ++ip) {
      sigParams.push(this.classTypeName_(binaryen, ftDescI.signatureParams[ip]) + ' ' + this.localN_(ip));
    }
    outputParts.push(this.renderFtSigDecl_(pad1, sigTypeName, sigRetType, sigParams.join(', ')));
  }

  // Buffer field.
  outputParts.push(pad1 + this.bufferTypeName_ + this.n_('buffer') + ';');

  // Resolve stdlib imports.
  var /** @const */ stdlibBindings = this.resolveClassStdlib_(moduleInfo);
  var /** @const {!Object<string, string>} */ stdlibNames = stdlibBindings.w2lStdlibNames;
  var /** @const {!Object<string, string>} */ stdlibGlobals = stdlibBindings.w2lStdlibGlobals;

  // Import fields and global fields are emitted conditionally after function
  // body traversal (see usedBindings_ below).  Reserve an insertion index.
  var /** @const {number} */ fieldInsertIndex = outputParts.length;

  // Function table array fields.
  for (var /** @type {number} */ ftf = 0; ftf !== ftLen; ++ftf) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescF =
        moduleInfo.functionTables[ftKeys[ftf]];
    outputParts.push(
      pad1 + this.n_('$ftsig_' + ftDescF.signatureKey) + '[] ' + this.n_('$ftable_' + ftDescF.signatureKey) + ';'
    );
  }

  // Constructor accepting foreign imports and buffer.
  // Import assignments are deferred until after function body emission.
  var /** @const {string} */ bufferParamName = this.n_('buffer');
  outputParts.push(this.renderClassCtorOpen_(pad1, className, bufferParamName));
  outputParts.push(pad2 + 'this.' + bufferParamName + ' = ' + bufferParamName + ';');
  var /** @const {number} */ importAssignInsertIndex = outputParts.length;
  // Reserve a slot for function table array initialisation — method
  // references / method groups resolve against methods defined later in the
  // class, but the export-name map is not yet built at this point, so actual
  // init is spliced in after the function bodies have been emitted.
  var /** @const {number} */ ftInitInsertIndex = outputParts.length;
  outputParts.push(pad1 + '}');

  // Build internalName → exportName map so exported methods use their
  // public export name and non-exported methods stay private.
  var /** @const {!Object<string, string>} */ exportNameMap = /** @type {!Object<string, string>} */ (Object.create(null));
  for (var /** @type {number} */ ei = 0, /** @const {number} */ eLen = moduleInfo.expFuncs.length; ei !== eLen; ++ei) {
    exportNameMap[moduleInfo.expFuncs[ei].internalName] = moduleInfo.expFuncs[ei].exportName;
  }

  // Function bodies (emitted first to discover which helpers and bindings are needed).
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  // Pinned here as well as in precomputeMangledNames_ because the discovery
  // emit runs before precompute; both must see the same representation or the
  // roster and the emitted helpers disagree.
  this.resetTrapSites_(options, moduleInfo.functions, exportNameMap);
  this.castNames_ = moduleInfo.castNames;
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** @type {number} */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts.push(
      this.emitClassMethod_(
        wasmModule,
        binaryen,
        funcInfo,
        moduleInfo.importedNames,
        moduleInfo.functionSignatures,
        moduleInfo.globalTypes,
        exportNameMap,
        moduleInfo.functionTables,
        stdlibNames,
        stdlibGlobals
      )
    );
  }

  // Ordered call_indirect dispatchers receive wasm operands first and the
  // table index last.  Both target languages evaluate arguments left to
  // right, so the wrapper preserves wasm's operand-before-index order while
  // pure/read-only sites retain the direct table-call fast path.
  var /** @const {!Array<string>} */ orderedCallWrapperParts = [];
  for (var /** @type {number} */ ocw = 0; ocw !== ftLen; ++ocw) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ocwDesc =
        moduleInfo.functionTables[ftKeys[ocw]];
    if (!ocwDesc.orderedCallNeeded) continue;
    var /** @const {number} */ ocwParamCount = ocwDesc.signatureParams.length;
    var /** @const {!Array<string>} */ ocwParams = [];
    var /** @const {!Array<string>} */ ocwCallArgs = [];
    for (var /** @type {number} */ ocp = 0; ocp !== ocwParamCount; ++ocp) {
      var /** @const {string} */ ocpName = this.localN_(ocp);
      ocwParams.push(this.classTypeName_(binaryen, ocwDesc.signatureParams[ocp]) + ' ' + ocpName);
      ocwCallArgs.push(ocpName);
    }
    var /** @const {string} */ ocwIndex = this.localN_(ocwParamCount);
    ocwParams.push('int ' + ocwIndex);
    var /** @const {string} */ ocwReturnType = this.classTypeName_(binaryen, ocwDesc.signatureReturnType);
    var /** @const {boolean} */ ocwHasReturn =
        binaryen.none !== ocwDesc.signatureReturnType && 0 !== ocwDesc.signatureReturnType;
    var /** @const {string} */ ocwCall =
        'this.' +
        this.n_('$ftable_' + ocwDesc.signatureKey) +
        '[' +
        ocwIndex +
        this.tableInvokeOpen_ +
        ocwCallArgs.join(', ') +
        ')';
    orderedCallWrapperParts.push(
      pad1 +
        ocwReturnType +
        ' ' +
        this.n_(this.getOrderedCallIndirectWrapperName_(ocwDesc.signatureKey)) +
        '(' +
        ocwParams.join(', ') +
        ') {\n' +
        pad2 +
        (ocwHasReturn ? 'return ' : '') +
        ocwCall +
        ';\n' +
        pad1 +
        '}'
    );
  }

  // Helper methods (only those referenced by function bodies).
  var /** @const {!Array<string>} */ helperLines = this.emitHelpers_(0, 0, 0, 0);
  // Captured rather than discarded so it can be published below: the helper
  // set is complete here, because bodies are emitted before this point and
  // markHelper_ expands dependencies transitively at mark time.
  var /** @const {!Object<string, boolean>} */ usedHelpers = /** @type {!Object<string, boolean>} */ (this.usedHelpers_);
  this.usedHelpers_ = null;
  this.castNames_ = null;
  var /** @const {!Object<string, boolean>} */ usedBindings = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedBindings_ = null;

  // Force-mark exported globals as used so their field bindings are emitted.
  this.markExportedGlobalsUsed_(usedBindings, moduleInfo.expGlobals);

  for (var /** @type {number} */ hi = 0, /** @const {number} */ helperCount = helperLines.length; hi !== helperCount; ++hi) {
    outputParts.push(helperLines[hi]);
  }

  // Splice conditional import fields, global fields, and constructor
  // import assignments now that usedBindings_ is available.
  var /** @const {!Array<string>} */ fieldLines = [];
  var /** @const {!Array<string>} */ assignLines = [];
  var /** @const {number} */ impCount = moduleInfo.impFuncs.length;
  for (var /** @type {number} */ ji = 0; ji !== impCount; ++ji) {
    if (moduleInfo.impFuncs[ji].wasmFuncName in stdlibNames) {
      continue;
    }
    var /** @const {string} */ impKey = '$if_' + this.safeName_(moduleInfo.impFuncs[ji].importBaseName);
    if (!usedBindings[impKey]) {
      continue;
    }
    fieldLines.push(pad1 + this.importFieldTypeName_ + this.n_(impKey) + ';');
    assignLines.push(
      pad2 + 'this.' + this.n_(impKey) + ' = ' + this.renderForeignLookup_(moduleInfo.impFuncs[ji].importBaseName) + ';'
    );
  }
  for (var /** @type {number} */ jgf = 0, /** @const {number} */ jgfLen = moduleInfo.globals.length; jgf !== jgfLen; ++jgf) {
    var /** @const {string} */ globalKey = '$g_' + this.safeName_(moduleInfo.globals[jgf].globalName);
    if (!usedBindings[globalKey]) {
      continue;
    }
    var /** @const {string} */ globalType = this.classTypeName_(binaryen, moduleInfo.globals[jgf].globalType);
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_} */ globalInfo = moduleInfo.globals[jgf];
    var /** @const {string} */ globalInit = Wasm2Lang.Backend.ValueType.isI64(binaryen, globalInfo.globalType)
        ? this.renderI64Const_(binaryen, globalInfo.globalInitValue)
        : this.renderConst_(binaryen, /** @type {number} */ (globalInfo.globalInitValue), globalInfo.globalType);
    fieldLines.push(pad1 + globalType + ' ' + this.n_(globalKey) + ' = ' + globalInit + ';');
  }
  for (var /** @type {number} */ jfs = fieldLines.length - 1; jfs >= 0; --jfs) {
    outputParts.splice(fieldInsertIndex, 0, fieldLines[jfs]);
  }
  // Adjust importAssignInsertIndex by the number of field lines inserted before it.
  var /** @const {number} */ adjustedAssignIndex = importAssignInsertIndex + fieldLines.length;
  for (var /** @type {number} */ jas = assignLines.length - 1; jas >= 0; --jas) {
    outputParts.splice(adjustedAssignIndex, 0, assignLines[jas]);
  }

  // Function table array initialisation — splice into the constructor now
  // that the export-name map exists and method references / method groups
  // can be resolved.
  var /** @const {!Array<string>} */ ftInitLines = [];
  for (var /** @type {number} */ fta = 0; fta !== ftLen; ++fta) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.FunctionTableDescriptor_} */ ftDescA =
        moduleInfo.functionTables[ftKeys[fta]];
    var /** @const {string} */ ftaSigKey = ftDescA.signatureKey;
    var /** @const {string} */ ftaSigTypeName = this.n_('$ftsig_' + ftaSigKey);
    var /** @const {string} */ ftaArrayName = this.n_('$ftable_' + ftaSigKey);
    var /** @const {boolean} */ ftaHasReturn =
        binaryen.none !== ftDescA.signatureReturnType && 0 !== ftDescA.signatureReturnType;
    // Build stub lambda for null entries.
    var /** @const {!Array<string>} */ lambdaParams = [];
    for (var /** @type {number} */ lp = 0, /** @const {number} */ lpLen = ftDescA.signatureParams.length; lp !== lpLen; ++lp) {
      lambdaParams.push(this.localN_(lp));
    }
    var /** @type {string} */ stubLambda;
    if (ftaHasReturn) {
      stubLambda =
        '(' +
        lambdaParams.join(', ') +
        ')' +
        this.classLambdaArrow_ +
        this.renderLocalInit_(binaryen, ftDescA.signatureReturnType);
    } else {
      stubLambda = '(' + lambdaParams.join(', ') + ')' + this.classLambdaArrow_ + '{}';
    }
    // Build array entries.
    var /** @const {!Array<string>} */ entryExprs = [];
    for (var /** @type {number} */ te = 0, /** @const {number} */ teLen = ftDescA.tableEntries.length; te !== teLen; ++te) {
      var /** @const {string|null} */ funcName = ftDescA.tableEntries[te].boundName;
      if (null === funcName) {
        entryExprs.push(stubLambda);
      } else {
        var /** @const {boolean} */ fnIsExported = funcName in exportNameMap;
        var /** @const {string} */ resolvedName = fnIsExported ? exportNameMap[funcName] : funcName;
        var /** @const {string} */ methodRefName = fnIsExported
            ? this.safeName_(resolvedName)
            : this.n_(this.safeName_(resolvedName));
        entryExprs.push(this.tableEntryRefPrefix_ + methodRefName);
      }
    }
    ftInitLines.push(pad2 + 'this.' + ftaArrayName + ' = new ' + ftaSigTypeName + '[] { ' + entryExprs.join(', ') + ' };');
  }
  // Splice init lines into the constructor (just before the closing brace).
  for (var /** @type {number} */ fts = ftInitLines.length - 1; fts >= 0; --fts) {
    outputParts.splice(ftInitInsertIndex + fieldLines.length + assignLines.length, 0, ftInitLines[fts]);
  }

  // Append function bodies.
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fpLen = functionParts.length; fi !== fpLen; ++fi) {
    outputParts.push(functionParts[fi]);
  }
  for (var /** @type {number} */ owp = 0; owp !== orderedCallWrapperParts.length; ++owp) {
    outputParts.push(orderedCallWrapperParts[owp]);
  }

  // Exported global accessor methods.
  for (var /** @type {number} */ jeg = 0, /** @const {number} */ jegLen = moduleInfo.expGlobals.length; jeg !== jegLen; ++jeg) {
    var /** @const {string} */ jegType = this.classTypeName_(binaryen, moduleInfo.expGlobals[jeg].globalType);
    var /** @const {string} */ jegField = this.n_('$g_' + this.safeName_(moduleInfo.expGlobals[jeg].internalName));
    var /** @const {string} */ jegGetterName = this.safeName_(moduleInfo.expGlobals[jeg].exportName);
    outputParts.push(
      pad1 + 'public ' + jegType + ' ' + jegGetterName + '() {\n' + pad2 + 'return this.' + jegField + ';\n' + pad1 + '}'
    );
    if (moduleInfo.expGlobals[jeg].globalMutable) {
      var /** @const {string} */ jegSetterParam = this.localN_(0);
      outputParts.push(
        pad1 +
          'public void ' +
          this.safeName_(moduleInfo.expGlobals[jeg].exportName + '$set') +
          '(' +
          jegType +
          ' ' +
          jegSetterParam +
          ') {\n' +
          pad2 +
          'this.' +
          jegField +
          ' = ' +
          jegSetterParam +
          ';\n' +
          pad1 +
          '}'
      );
    }
  }

  outputParts.push('}');

  this.finalizeClassParts_(outputParts, usedBindings);

  // Expose the populated marker sets so a preceding {@code runUsageDiscovery_}
  // can read the final state, exactly as the jscommon backends do.  Until this
  // existed, {@code discoveredHelpers_} stayed null for the class backends and
  // {@code precomputeMangledNames_} registered EVERY emittable helper, so a
  // helper that merely existed claimed an encoder slot and shifted every key
  // after it — which is what made adding a helper here a module-wide rename.
  this.lastEmitUsedHelpers_ = usedHelpers;
  this.lastEmitUsedBindings_ = usedBindings;
  var /** @const {string} */ emittedSource = outputParts.join('\n');
  this.publishTrapSites_(emittedSource);

  return emittedSource;
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
  return Wasm2Lang.Backend.AbstractCodegen.subWalkExpression_(wasmModule, binaryen, funcInfo, visitor, funcInfo.body);
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
