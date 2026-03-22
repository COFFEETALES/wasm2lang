'use strict';

/**
 * Emits a single asm.js function body.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @return {string}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const {string} */ fnName = this.n_(this.safeName_(funcInfo.name));
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;

  // Function header (indent 1 = inside module).
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {!Array<string>} */ paramNames = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramNames[paramNames.length] = this.localN_(pi);
  }
  parts[parts.length] = pad(1) + 'function ' + fnName + '(' + paramNames.join(', ') + ') {';

  // Parameter annotations.
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
    parts[parts.length] = pad(2) + 'var ' + varDecls.join(', ') + ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    // indent 2 = inside module + inside function
    var /** @const {!Wasm2Lang.Backend.AsmjsCodegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        labelKinds: /** @type {!Object<string, string>} */ (Object.create(null)),
        labelMap: /** @type {!Object<string, number>} */ (Object.create(null)),
        importedNames: importedNames,
        indent: 2,
        wasmModule: wasmModule,
        visitor: null,
        fusedBlockToLoop: /** @type {!Object<string, string>} */ (Object.create(null)),
        pendingBlockFusion: '',
        currentLoopName: '',
        rootSwitchExitMap: null,
        rootSwitchRsName: '',
        rootSwitchLoopName: ''
      };

    var /** @const */ self = this;
    // prettier-ignore
    var /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ visitor =
      /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
        enter: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc) { return self.emitEnter_(emitState, nc); },
        leave: /** @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nc @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList} cr @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput} */ function(nc, cr) {
          self.adjustLeaveIndent_(emitState, nc);
          return self.emitLeave_(emitState, nc, cr || []);
        }
      });
    emitState.visitor = visitor;
    var /** @type {*} */ bodyResult = this.walkFunctionBody_(wasmModule, binaryen, funcInfo, visitor);
    Wasm2Lang.Backend.AbstractCodegen.appendNonEmptyLines_(parts, bodyResult);
  }

  parts[parts.length] = pad(1) + '}';
  return parts.join('\n');
};
