'use strict';

/**
 * Pass: feature-profile-validation  (phase: analyze)
 *
 * Enforces a conservative legacy wasm profile by rejecting threads / SIMD /
 * GC-family features and by ensuring traversal only sees expression IDs
 * registered in NodeSchema.
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

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {!BinaryenFeatures} */ features = binaryen.Features;
  var /** @const {number} */ previousFeatures = wasmModule.getFeatures();
  var /** @type {number} */ disallowedMask = 0;
  var /** @type {number} */ allowedMask = 0;
  var /** @type {number} */ isValidAllowedProfile = 0;

  disallowedMask |= features.Atomics;
  disallowedMask |= features.SIMD128;
  disallowedMask |= features.RelaxedSIMD;
  disallowedMask |= features.FP16;
  disallowedMask |= features.GC;
  disallowedMask |= features.Strings;
  disallowedMask |= features.ReferenceTypes;
  disallowedMask |= features.ExceptionHandling;
  disallowedMask |= features.TailCall;
  disallowedMask |= features.Memory64;
  disallowedMask |= features.MultiMemory;
  disallowedMask |= features.StackSwitching;
  disallowedMask |= features.SharedEverything;
  disallowedMask |= features.Multivalue;
  disallowedMask |= features.BulkMemory;
  disallowedMask |= features.BulkMemoryOpt;

  allowedMask = features.All & ~disallowedMask;

  try {
    wasmModule.setFeatures(allowedMask);
    isValidAllowedProfile = wasmModule.validate();
  } finally {
    wasmModule.setFeatures(previousFeatures);
  }

  if (0 === isValidAllowedProfile) {
    throw new Error(
      'Wasm2Lang feature validation: module uses disallowed modern feature(s) (threads, SIMD, GC/reference, exceptions, memory64, multivalue, bulk-memory family).'
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

  var /** @const {string} */ funcName = funcMetadata.name || '<unknown>';
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
