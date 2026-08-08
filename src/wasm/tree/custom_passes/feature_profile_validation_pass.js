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
  Wasm2Lang.Wasm.Tree.CustomPasses.initializePass(
    /** @type {!Wasm2Lang.Wasm.Tree.Pass} */ (this),
    'feature-profile-validation',
    Wasm2Lang.Wasm.Tree.PassRunner.Phase.ANALYZE
  );
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
  // Binaryen encodes MVP as the zero-feature baseline; only post-MVP
  // extensions have individual feature bits. The allowlist is the shared
  // {@code WasmNormalization.getFeatureMask} — the same mask
  // {@code readWasmModule} enables before this pass runs, so "allowed" here
  // cannot drift from "enabled" there. Add explicitly supported post-MVP
  // features one by one in that shared mask.
  var /** @const {number} */ allowedMask = Wasm2Lang.Wasm.WasmNormalization.getFeatureMask(binaryen);
  var /** @type {number} */ isValidAllowedProfile = 0;

  try {
    wasmModule.setFeatures(allowedMask);
    isValidAllowedProfile = wasmModule.validate();
  } finally {
    wasmModule.setFeatures(previousFeatures);
  }

  if (0 === isValidAllowedProfile) {
    throw new Error(
      Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.describeProfileViolation_(wasmModule, features, allowedMask)
    );
  }

  this.moduleValidated_ = true;
};

/**
 * Builds the rejection message for a module that failed the allowed-profile
 * validation, naming the wasm features it requires beyond the allowlist.
 *
 * Probing strategy: a module requires feature F when it validates under the
 * full feature set but not under the full set minus F.  That subtractive
 * probe over-approximates — binaryen's feature set has internal
 * prerequisites (disabling ReferenceTypes while GC stays enabled fails as a
 * *configuration*, not as a module requirement) — so the collected set is
 * then minimized: any bit whose removal keeps {@code allowedMask} plus the
 * set valid was a prerequisite artifact, not a module need.  This runs only
 * on the failure path — an accepted module pays nothing — so the extra
 * {@code validate()} calls (and binaryen's stderr output for the failing
 * ones) are an acceptable price for a refusal that names what is missing
 * instead of making the user bisect their toolchain flags.
 *
 * Feature names are read off the {@code Features} object itself so a
 * binaryen upgrade extends the diagnostic automatically.  Composite masks
 * ({@code MVP} = 0, {@code All}, any aliased bundle) are skipped by the
 * power-of-two filter; allowed bits cannot be the offender and are skipped
 * too, but their names are collected so the message can state the supported
 * profile without hard-coding a list that would drift from the mask above.
 *
 * @private
 * @param {!BinaryenModule} wasmModule
 * @param {!BinaryenFeatures} features
 * @param {number} allowedMask
 * @return {string}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.describeProfileViolation_ = function (
  wasmModule,
  features,
  allowedMask
) {
  var /** @const {string} */ prefix = 'Wasm2Lang feature validation: ';
  var /** @const {number} */ previousFeatures = wasmModule.getFeatures();
  var /** @const {!Array<string>} */ requiredNames = [];
  var /** @const {!Array<string>} */ allowedNames = [];
  var /** @const {!Object<number, boolean>} */ seenBits = /** @type {!Object<number, boolean>} */ (Object.create(null));

  /**
   * @param {number} mask
   * @return {boolean}
   */
  function validatesWith(mask) {
    wasmModule.setFeatures(mask);
    return 0 !== wasmModule.validate();
  }

  var /** @const {!Array<number>} */ requiredBits = [];
  var /** @type {number} */ requiredMask = 0;

  try {
    if (!validatesWith(features.All)) {
      return prefix + 'module does not validate even with every wasm feature enabled.';
    }
    for (var /** @type {string} */ featureName in features) {
      var /** @const {*} */ bitValue = features[featureName];
      if ('number' !== typeof bitValue) {
        continue;
      }
      var /** @const {number} */ bit = bitValue;
      // Skip MVP (0), composite masks (All and any bundle), and aliases of a
      // bit already probed.
      if (0 === bit || 0 !== (bit & (bit - 1)) || seenBits[bit]) {
        continue;
      }
      seenBits[bit] = true;
      if (0 !== (bit & allowedMask)) {
        allowedNames.push(featureName);
      } else if (!validatesWith(features.All & ~bit)) {
        requiredNames.push(featureName);
        requiredBits.push(bit);
        requiredMask |= bit;
      }
    }

    // Minimize: keep a bit only when dropping it from the explanation breaks
    // validation again.  A surviving drop marks a prerequisite artifact of
    // the subtractive probe rather than something the module itself uses.
    if (0 !== requiredNames.length && validatesWith(allowedMask | requiredMask)) {
      for (var /** @type {number} */ ri = requiredNames.length - 1; ri >= 0; --ri) {
        var /** @const {number} */ withoutBit = requiredMask & ~requiredBits[ri];
        if (validatesWith(allowedMask | withoutBit)) {
          requiredMask = withoutBit;
          requiredNames.splice(ri, 1);
        }
      }
    } else {
      // The collected set does not explain the failure — refuse to name
      // features the probe cannot stand behind.
      requiredNames.length = 0;
    }
  } finally {
    wasmModule.setFeatures(previousFeatures);
  }

  if (0 === requiredNames.length) {
    // Validates under All, fails under the allowlist, yet the probe found no
    // set of missing bits that accounts for it — an unexpected shape, so
    // fall back to the generic wording rather than invent a name.
    return prefix + 'module uses wasm feature(s) outside the supported allowlist.';
  }
  return (
    prefix +
    'module requires unsupported wasm feature(s): ' +
    requiredNames.sort().join(', ') +
    '. Supported post-MVP features: ' +
    allowedNames.sort().join(', ') +
    '.'
  );
};

/**
 * @private
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @param {!Wasm2Lang.Wasm.Tree.TraversalNodeContext} nodeCtx
 * @return {?Wasm2Lang.Wasm.Tree.TraversalDecisionInput}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.prototype.enter_ = function (funcMetadata, nodeCtx) {
  var /** @const {!Wasm2Lang.Wasm.Tree.ExpressionInfo} */ expression = nodeCtx.expression;

  if (Wasm2Lang.Wasm.Tree.NodeSchema.supportsExpressionId(expression.id)) {
    return null;
  }

  var /** @const {string} */ funcName = funcMetadata.passFuncName || '<unknown>';
  throw new Error(
    'Wasm2Lang feature validation: unsupported expression ID ' + expression.id + ' in function "' + funcName + '".'
  );
};

/**
 * @param {!Wasm2Lang.Wasm.Tree.PassMetadata} funcMetadata
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.FeatureProfileValidationPass.prototype.createVisitor = function (funcMetadata) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor(this, this.enter_, funcMetadata);
};
