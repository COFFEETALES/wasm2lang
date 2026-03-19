'use strict';

/**
 * Emits a single Java method body.
 *
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @param {!Object<string, string>} importedNames
 * @param {!Object<string, !Wasm2Lang.Backend.AbstractCodegen.FunctionSignature_>} functionSignatures
 * @param {!Object<string, number>} globalTypes
 * @param {!Object<string, string>} exportNameMap
 * @return {string}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitFunction_ = function (
  wasmModule,
  binaryen,
  funcInfo,
  importedNames,
  functionSignatures,
  globalTypes,
  exportNameMap
) {
  var /** @const {!Array<string>} */ parts = [];
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {boolean} */ isExported = funcInfo.name in exportNameMap;
  var /** @const {string} */ fnName = isExported
      ? Wasm2Lang.Backend.JavaCodegen.javaSafeName_(exportNameMap[funcInfo.name])
      : this.n_(Wasm2Lang.Backend.JavaCodegen.javaSafeName_(funcInfo.name));
  var /** @const {string} */ visibility = isExported ? '' : 'private ';
  var /** @const {!Array<number>} */ paramTypes = binaryen.expandType(funcInfo.params);
  var /** @const {number} */ numParams = paramTypes.length;
  var /** @const {!Array<number>} */ varTypes = /** @type {!Array<number>} */ (funcInfo.vars) || [];
  var /** @const {number} */ numVars = varTypes.length;
  var /** @const {string} */ returnType = Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, funcInfo.results);

  // Method header (indent 1 = inside class).
  var /** @const {!Array<string>} */ paramDecls = [];
  for (var /** number */ pi = 0; pi !== numParams; ++pi) {
    paramDecls[paramDecls.length] =
      Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, paramTypes[pi]) + ' ' + this.localN_(pi);
  }
  parts[parts.length] = pad1 + visibility + returnType + ' ' + fnName + '(' + paramDecls.join(', ') + ') {';

  // Local variable declarations.
  for (var /** number */ vi = 0; vi !== numVars; ++vi) {
    var /** @const {number} */ localType = varTypes[vi];
    parts[parts.length] =
      pad2 +
      Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, localType) +
      ' ' +
      this.localN_(numParams + vi) +
      ' = ' +
      this.renderLocalInit_(binaryen, localType) +
      ';';
  }

  // Walk the body with the code-gen visitor.
  if (0 !== funcInfo.body) {
    var /** @const {!Wasm2Lang.Backend.JavaCodegen.EmitState_} */ emitState = {
        binaryen: binaryen,
        functionInfo: funcInfo,
        functionSignatures: functionSignatures,
        globalTypes: globalTypes,
        labelKinds: /** @type {!Object<string, string>} */ (Object.create(null)),
        labelMap: /** @type {!Object<string, number>} */ (Object.create(null)),
        importedNames: importedNames,
        exportNameMap: exportNameMap,
        indent: 2,
        lastExprIsTerminal: false,
        wasmModule: wasmModule,
        visitor: null,
        fusedBlockToLoop: /** @type {!Object<string, string>} */ (Object.create(null)),
        pendingBlockFusion: '',
        currentLoopName: '',
        doWhileBodyPtrs: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        doWhileConditionStr: '',
        whileBodyPtrs: /** @type {!Object<string, boolean>} */ (Object.create(null)),
        whileConditionStr: '',
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

  parts[parts.length] = pad1 + '}';
  return parts.join('\n');
};
