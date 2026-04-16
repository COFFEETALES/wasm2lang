'use strict';

/**
 * Application logic for the local-init-folding pass.
 *
 * Owns the {@code getLocalInitOverrides} accessor and the postbuild analysis
 * descriptor for localInitOverrides metadata produced by LocalInitFoldingPass.
 * Backends call through the thin wrapper on
 * {@code AbstractCodegen.prototype.getLocalInitOverrides_}.
 *
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingApplication = {};

Wasm2Lang.Wasm.Tree.CustomPasses.LocalInitFoldingApplication.getLocalInitOverrides =
  /** @type {function(?Object<string, !Wasm2Lang.Wasm.Tree.PassMetadata>, string):?Object<string, *>} */ (
    Wasm2Lang.Wasm.Tree.CustomPasses.declareFunctionFieldAccessor_(
      'localInitFolding',
      /** @param {!Wasm2Lang.Wasm.Tree.PassMetadata} fm @return {*} */ function (fm) {
        return fm.localInitOverrides;
      }
    )
  );
