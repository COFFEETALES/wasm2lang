'use strict';

/**
 * Application logic for the redundant-block-removal pass.
 *
 * This module owns the accessor for redundant block removal metadata and
 * the analysis descriptor for postbuild testing.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalApplication = {};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Returns true if the named block was removed as redundant.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @param {string} blockName
 * @return {boolean}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalApplication.wasBlockRemoved = function (
  passRunResultIndex,
  funcName,
  blockName
) {
  return Wasm2Lang.Wasm.Tree.CustomPasses.hasNamedMetadataFlag(
    passRunResultIndex,
    funcName,
    /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
      return fm.redundantBlockRemovals;
    },
    blockName
  );
};

// ---------------------------------------------------------------------------
// Analysis descriptor
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'redundantBlockRemoval',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.redundantBlockRemovals;
  }
);
