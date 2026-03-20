'use strict';

// ---------------------------------------------------------------------------
// Function emission.
// ---------------------------------------------------------------------------

/**
 * Builds the PHP {@code use} clause entries for a function closure.
 *
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @param {!Array<string>} internalFuncNames
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.buildUseClause_ = function (globals, imports, internalFuncNames) {
  var /** @const {!Array<string>} */ entries = [];
  entries[entries.length] = '&' + this.phpVar_('buffer');
  for (var /** number */ gi = 0, /** @const {number} */ gLen = globals.length; gi !== gLen; ++gi) {
    entries[entries.length] = '&' + this.phpVar_('$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(globals[gi].globalName));
  }
  for (var /** number */ ii = 0, /** @const {number} */ iLen = imports.length; ii !== iLen; ++ii) {
    entries[entries.length] =
      '&' + this.phpVar_('$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(imports[ii].importBaseName));
  }
  for (var /** number */ fi = 0, /** @const {number} */ fLen = internalFuncNames.length; fi !== fLen; ++fi) {
    entries[entries.length] = '&' + this.phpVar_(internalFuncNames[fi]);
  }
  return entries.join(', ');
};

/**
 * Emits a single PHP function body as a closure assignment.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.GlobalInfo_>} globals
 * @param {!Array<!Wasm2Lang.Backend.AbstractCodegen.ImportedFunctionInfo_>} imports
 * @param {!Array<string>} internalFuncNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  globals,
  imports,
  internalFuncNames,
  functionSignatures,
  globalTypes
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const {string} */ fnName = this.phpVar_(Wasm2Lang.Backend.Php64Codegen.phpSafeName_(funcInfo.name));
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  // Build use clause.
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ useClause = this.buildUseClause_(globals, imports, internalFuncNames);

  // Parameter list.
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  parts[parts.length] = pad(1) + fnName + ' = function(' + paramNames.join(', ') + ') use (' + useClause + ') {';

  // Coerce parameters to their wasm types.
  for (var /** number */ pa = 0; pa !== numParams; ++pa) {
    var /** @const {string} */ pName = this.localN_(pa);
    parts[parts.length] = pad(2) + pName + ' = ' + this.renderCoercionByType_(binaryen, pName, paramTypes[pa]) + ';';
  }

  // Local variable declarations.
  if (0 !== numVars) {
    var /** @const {?Object<string, number>} */ initOverrides = this.getLocalInitOverrides_(funcInfo.name);
    var /** @const {!Array<string>} */ varDecls = [];
    for (var /** number */ vi = 0; vi !== numVars; ++vi) {
      var /** @const {number} */ localType = varTypes[vi];
      var /** @const {number} */ localIdx = numParams + vi;
      var /** @const {number|void} */ overrideValue = initOverrides ? initOverrides[String(localIdx)] : void 0;
      // prettier-ignore
      var /** @const {string} */ initStr = overrideValue !== void 0
        ? this.renderConst_(binaryen, /** @type {number} */ (overrideValue), localType)
        : this.renderLocalInit_(binaryen, localType);
      varDecls[varDecls.length] = this.localN_(localIdx) + ' = ' + initStr;
    }
    parts[parts.length] = pad(2) + varDecls.join('; ') + ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    var /** @const {!Wasm2Lang.Backend.Php64Codegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        inlineTempOffset: numParams + numVars,
        labelStack: [],
        importedNames: importedNames,
        indent: 2,
        wasmModule: wasmModule,
        visitor: null,
        pendingBlockFusion: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: ''
      };

    var /** @const */ self = this;
    var /** @const */ hp = Wasm2Lang.Backend.AbstractCodegen.hasPrefix_;
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
      /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
        enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.emitEnter_(emitState, nc); },
        leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
          var /** @const {!Object<string, *>} */ e = /** @type {!Object<string, *>} */ (nc.expression);
          var /** @const {number} */ eId = /** @type {number} */ (e['id']);
          var /** @const {boolean} */ isFusedBlock = binaryen.BlockId === eId && !!e['name'] &&
              hp(/** @type {string} */ (e['name']), Wasm2Lang.Backend.AbstractCodegen.LB_FUSION_PREFIX_);
          var /** @const {boolean} */ isRsBlock = binaryen.BlockId === eId && !!e['name'] &&
              hp(/** @type {string} */ (e['name']), Wasm2Lang.Backend.AbstractCodegen.RS_ROOT_SWITCH_PREFIX_);
          if (binaryen.LoopId === eId || binaryen.IfId === eId) {
            --emitState.indent;
          } else if (binaryen.BlockId === eId && e['name'] && !isFusedBlock && !isRsBlock) {
            --emitState.indent;
          }
          // Pop label stack for blocks/loops after adjusting indent.
          if (binaryen.LoopId === eId) {
            emitState.labelStack.pop();
          } else if (binaryen.BlockId === eId && e['name'] && !isFusedBlock && !isRsBlock) {
            emitState.labelStack.pop();
          }
          return self.emitLeave_(emitState, nc, cr || []);
        }
      });
    emitState.visitor = visitor;
    var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }

  parts[parts.length] = pad(1) + '};';
  return parts.join('\n');
};
