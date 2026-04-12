'use strict';

/**
 * Application logic for the block-guard elision pass.
 *
 * This module owns the accessor for BlockGuardElisionPlan metadata produced by
 * BlockGuardElisionPass, plus the analysis descriptor for postbuild testing.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionApplication = {};

/** @const {function(!Wasm2Lang.Wasm.Tree.PassMetadata):*} */
var extractBlockGuardElisions_ = /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
  return fm.blockGuardElisions;
};

/**
 * Returns the BlockGuardElisionPlan for the given block, or null.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {?Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.BlockGuardElisionApplication.getBlockGuardElisionPlan = function (
  passRunResultIndex,
  funcName,
  blockName
) {
  return /** @type {?Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.getNamedMetadataEntry(passRunResultIndex, funcName, extractBlockGuardElisions_, blockName)
  );
};

Wasm2Lang.Wasm.Tree.CustomPasses.registerProjectedPlanAnalysis_(
  'blockGuardElision',
  extractBlockGuardElisions_,
  /** @param {*} plan @return {!Object} */ function (plan) {
    return {'labelRemoved': /** @type {!Wasm2Lang.Wasm.Tree.BlockGuardElisionPlan} */ (plan).labelRemoved};
  }
);
