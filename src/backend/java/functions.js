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
      ? this.safeName_(exportNameMap[funcInfo.name])
      : this.n_(this.safeName_(funcInfo.name));
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
  if (0 !== numVars) {
    var /** @const {?Object<string, number>} */ initOverrides = this.getLocalInitOverrides_(funcInfo.name);
    for (var /** number */ vi = 0; vi !== numVars; ++vi) {
      var /** @const {number} */ localType = varTypes[vi];
      var /** @const {number} */ localIdx = numParams + vi;
      var /** @const {number|void} */ overrideValue = initOverrides ? initOverrides[String(localIdx)] : void 0;
      // prettier-ignore
      var /** @const {string} */ initStr = overrideValue !== void 0
        ? this.renderConst_(binaryen, /** @type {number} */ (overrideValue), localType)
        : this.renderLocalInit_(binaryen, localType);
      parts[parts.length] =
        pad2 +
        Wasm2Lang.Backend.JavaCodegen.javaTypeName_(binaryen, localType) +
        ' ' +
        this.localN_(localIdx) +
        ' = ' +
        initStr +
        ';';
    }
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
