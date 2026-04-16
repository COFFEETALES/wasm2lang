'use strict';

/**
 * Application logic for the redundant-block-removal pass.
 *
 * Owns the {@code wasBlockRemoved} flag accessor and the postbuild analysis
 * descriptor for the block-removal map produced by RedundantBlockRemovalPass.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalApplication = {};

Wasm2Lang.Wasm.Tree.CustomPasses.RedundantBlockRemovalApplication.wasBlockRemoved =
  Wasm2Lang.Wasm.Tree.CustomPasses.declareNamedFlagAccessor_(
    'redundantBlockRemoval',
    /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
      return fm.redundantBlockRemovals;
    }
  );
