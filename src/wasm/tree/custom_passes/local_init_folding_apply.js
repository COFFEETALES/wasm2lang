'use strict';

/**
 * Application logic for the local-init-folding pass.
 *
 * This module owns the accessor for localInitOverrides metadata produced by
 * LocalInitFoldingPass — backends call through the thin wrapper on
 * AbstractCodegen.prototype.getLocalInitOverrides_.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingApplication = {};

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Returns the local-init overrides for a given function, or null if none.
 *
 * @param {?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>} passRunResultIndex
 * @param {string} funcName
 * @return {?Object<string, number>}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingApplication.getLocalInitOverrides = function (passRunResultIndex, funcName) {
  return /** @type {?Object<string, number>} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.getFunctionMetadataValue(
      passRunResultIndex,
      funcName,
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.localInitOverrides;
      }
    )
  );
};

// ---------------------------------------------------------------------------
// Analysis descriptor
// ---------------------------------------------------------------------------

Wasm2Lang.Wasm.Tree.CustomPasses.registerFieldAnalysisDescriptor(
  'localInitFolding',
  /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
    return fm.localInitOverrides;
  }
);
