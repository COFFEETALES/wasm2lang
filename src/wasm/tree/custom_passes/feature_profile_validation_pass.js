'use strict';

/**
 * Pass: feature-profile-validation  (phase: analyze)
 *
 * Enforces a conservative wasm profile by validating the module against an
 * explicit allowed-feature mask and by ensuring traversal only sees expression
 * IDs registered in NodeSchema.
 *
 * @constructor
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass = function () {
  /** @type {string} */
  this.passName = 'feature-profile-validation';
  /** @type {string} */
  this.phase = Wasm2Lang.Wasm.Tree.PassRunner.Phase.ANALYZE;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionEnter = void 0;
  /** @type {(!Wasm2Lang.Wasm.Tree.PassFunctionHook|undefined)} */
  this.onFunctionLeave = void 0;
  /** @private @type {boolean} */
  this.moduleValidated_ = false;
  /** @type {!Wasm2Lang.Wasm.Tree.PassModuleHook} */
  this.validateModule = this.validateModule_.bind(this);
};

/**
 * @private
 * @param {!BinaryenModule} wasmModule
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.prototype.validateModule_ = function (wasmModule) {
  if (this.moduleValidated_) {
    return;
  }

  var /** @const {!BinaryenFeatures} */ features = Wasm2Lang.Processor.getBinaryen().Features;
  var /** @const {number} */ previousFeatures = wasmModule.getFeatures();
  // Binaryen encodes MVP as the zero-feature baseline; only post-MVP
  // extensions have individual feature bits. Add explicitly supported
  // post-MVP features one by one here.
  var /** @const {number} */ allowedMask = 0 | features.NontrappingFPToInt;
  var /** @type {number} */ isValidAllowedProfile = 0;

  try {
    wasmModule.setFeatures(allowedMask);
    isValidAllowedProfile = wasmModule.validate();
  } finally {
    wasmModule.setFeatures(previousFeatures);
  }

  if (0 === isValidAllowedProfile) {
    throw new Error(
      'Wasm2Lang feature validation: module uses wasm feature(s) outside the supported allowlist.'
    );
  }

  this.moduleValidated_ = true;
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.prototype.enter_ = function (funcMetadata, nodeCtx) {
  // prettier-ignore
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression =
    /** @type {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ (nodeCtx.expression);

  if (Wasm2Lang.Wasm.Tree.NodeSchema.supportsExpressionId(expression.id)) {
    return null;
  }

  var /** @const {string} */ funcName = funcMetadata.passFuncName || '<unknown>';
  throw new Error(
    'Wasm2Lang feature validation: unsupported expression ID ' +
      expression.id +
      ' in function "' +
      funcName +
      '".'
  );
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.prototype.createVisitor = function (funcMetadata) {
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: this.enter_.bind(this, funcMetadata)
  });
};
