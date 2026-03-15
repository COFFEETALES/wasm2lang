'use strict';

/**
 * @const
 */
Wasm2Lang.Wasm.Tree.CustomPasses = {};

/**
 * Initializes the common metadata fields shared by every pass object.
 *
 * @param {!Wasm2Lang.Wasm.Tree.Pass} target
 * @param {string} passName
 * @param {string} phase
 * @return {void}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.initializePass = function (target, passName, phase) {
  target.passName = passName;
  target.phase = phase;
  target.validateModule = void 0;
  target.onFunctionEnter = void 0;
  target.onFunctionLeave = void 0;
};

/**
 * Creates a traversal visitor with only an enter callback.
 *
 * @param {!Object} target
 * @param {!Function} enterFn
 * @param {*} enterState
 * @return {!Wasm2Lang.Wasm.Tree.TraversalVisitor}
 */
Wasm2Lang.Wasm.Tree.CustomPasses.createEnterVisitor = function (target, enterFn, enterState) {
  // prettier-ignore
  return /** @const {!Wasm2Lang.Wasm.Tree.TraversalVisitor} */ ({
    enter: enterFn.bind(target, enterState)
  });
};
