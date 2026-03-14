'use strict';

/**
 * Pass: label-prefixing  (phase: codegen-prep)
 *
 * Prefixes named structured-control labels with `wasm2lang_` during the
 * wasm2lang:codegen normalization bundle. Branch targets are rebuilt to match
 * so backend emitters only see the normalized label namespace.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass = function () {
  /** @type {string} */
  this.passName = 'label-prefixing';
  /** @type {string} */
  this.phase = Wasm2Lang.Wasm.Tree.PassRunner.Phase.CODEGEN_PREP;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassModuleHook|undefined)} */
  this.validateModule = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionEnter = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionLeave = void 0;
};

/**
 * @private
 * @const {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.PREFIX_ = 'wasm2lang_';

/**
 * @private
 * @typedef {{
 *   labelStacks: !Object<string, !Array<string>>,
 *   prefixedDefinitionCount: number,
 *   remappedTargetCount: number
 * }}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_;

/**
 * @private
 * @param {?string} name
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.hasLabelName_ = function (name) {
  return 'string' === typeof name && '' !== name;
};

/**
 * @private
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.prefixLabelName_ = function (name) {
  var /** @const {string} */ prefix = Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.PREFIX_;
  if (0 === name.indexOf(prefix)) {
    return name;
  }
  return prefix + name;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} state
 * @param {string} oldName
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.pushLabel_ = function (state, oldName) {
  var /** @type {!Array<string>|undefined} */ stack = state.labelStacks[oldName];
  if (!stack) {
    stack = [];
    state.labelStacks[oldName] = stack;
  }

  var /** @const {string} */ newName = this.prefixLabelName_(oldName);
  stack[stack.length] = newName;

  if (newName !== oldName) {
    state.prefixedDefinitionCount++;
  }
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} state
 * @param {string} oldName
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.popLabel_ = function (state, oldName) {
  var /** @type {!Array<string>|undefined} */ stack = state.labelStacks[oldName];
  if (!stack || 0 === stack.length) {
    return;
  }

  stack.pop();
  if (0 === stack.length) {
    delete state.labelStacks[oldName];
  }
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} state
 * @param {string} name
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.resolveLabel_ = function (state, name) {
  var /** @type {!Array<string>|undefined} */ stack = state.labelStacks[name];
  if (!stack || 0 === stack.length) {
    return name;
  }
  return stack[stack.length - 1];
};

/**
 * @private
 * @param {number} replacementPtr
 * @return {!Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.replaceWith_ = function (replacementPtr) {
  return {
    decisionAction: Wasm2Lang.Wasm.Tree.TraversalKernel.Action.REPLACE_NODE,
    expressionPointer: replacementPtr
  };
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.enter_ = function (state, nodeCtx) {
  var /** @const {!BinaryenExpressionInfo} */ expression = /** @type {!BinaryenExpressionInfo} */ (nodeCtx.expression);
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @type {?string} */ labelName = null;

  if (binaryen.BlockId === expression.id || binaryen.LoopId === expression.id) {
    labelName = /** @type {?string} */ (expression.name);
    if (this.hasLabelName_(labelName)) {
      this.pushLabel_(state, /** @type {string} */ (labelName));
    }
  }

  return null;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} state
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.leave_ = function (state, nodeCtx) {
  var /** @const {!Binaryen} */ binaryen = nodeCtx.binaryen;
  var /** @const {!BinaryenModule} */ module = /** @type {!BinaryenModule} */ (nodeCtx.treeModule);
  var /** @const {!BinaryenExpressionInfo} */ expression = /** @type {!BinaryenExpressionInfo} */ (
      binaryen.getExpressionInfo(nodeCtx.expressionPointer)
    );
  var /** @type {?string} */ labelName = null;
  var /** @type {string} */ remappedName = '';

  if (binaryen.BlockId === expression.id || binaryen.LoopId === expression.id) {
    labelName = /** @type {?string} */ (expression.name);
    if (!this.hasLabelName_(labelName)) {
      return null;
    }

    remappedName = this.resolveLabel_(state, /** @type {string} */ (labelName));
    this.popLabel_(state, /** @type {string} */ (labelName));

    if (remappedName === labelName) {
      return null;
    }

    if (binaryen.BlockId === expression.id) {
      // Child pointers were already updated in-place by TraversalKernel.
      return this.replaceWith_(
        module.block(remappedName, /** @type {!Array<number>} */ ((expression.children || []).slice(0)), expression.type)
      );
    }

    return this.replaceWith_(module.loop(remappedName, /** @type {number} */ (expression.body || 0)));
  }

  if (binaryen.BreakId === expression.id) {
    labelName = /** @type {?string} */ (expression.name);
    if (!this.hasLabelName_(labelName)) {
      return null;
    }

    remappedName = this.resolveLabel_(state, /** @type {string} */ (labelName));
    if (remappedName === labelName) {
      return null;
    }

    state.remappedTargetCount++;
    return this.replaceWith_(
      module.break(
        remappedName,
        /** @type {number} */ (expression.condition || 0),
        /** @type {number} */ (expression.value || 0)
      )
    );
  }

  if (binaryen.SwitchId === expression.id) {
    var /** @const {!Array<string>} */ names = /** @type {!Array<string>} */ ((expression.names || []).slice(0));
    var /** @const {number} */ nameCount = names.length;
    var /** @type {boolean} */ hasChanges = false;
    var /** @type {number} */ i = 0;

    for (i = 0; i !== nameCount; ++i) {
      remappedName = this.resolveLabel_(state, names[i]);
      if (remappedName !== names[i]) {
        names[i] = remappedName;
        hasChanges = true;
        state.remappedTargetCount++;
      }
    }

    var /** @const {string} */ defaultName = /** @type {string} */ (expression.defaultName || '');
    var /** @type {string} */ remappedDefaultName = defaultName;
    if ('' !== defaultName) {
      remappedDefaultName = this.resolveLabel_(state, defaultName);
      if (remappedDefaultName !== defaultName) {
        hasChanges = true;
        state.remappedTargetCount++;
      }
    }

    if (!hasChanges) {
      return null;
    }

    return this.replaceWith_(
      module.switch(
        names,
        remappedDefaultName,
        /** @type {number} */ (expression.condition || 0),
        /** @type {number} */ (expression.value || 0)
      )
    );
  }

  return null;
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.prototype.createVisitor = function (funcMetadata) {
  void funcMetadata;
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} */ state =
    /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass.State_} */ ({
      labelStacks: /** @type {!Object<string, !Array<string>>} */ (Object.create(null)),
      prefixedDefinitionCount: 0,
      remappedTargetCount: 0
    });
  var /** @const {!Wasm2Lang.Wasm.Tree.CustomPasses.LabelPrefixingPass} */ self = this;

  var /** @const {!Wasm2Lang.Wasm.Tree.TraversalLeaveCallback} */ leaveCallback =
      /**
       * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
       * @param {!Wasm2Lang.Wasm.Tree.TraversalChildResultList=} childResults
       * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
       */
      function (nodeCtx, childResults) {
        void childResults;
        return self.leave_(state, nodeCtx);
      };

  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: this.enter_.bind(this, state),
    leave: leaveCallback
  });
};
