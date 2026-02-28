/**
 * @externs
 */

/**
 * @interface
 * @const
 */
var Binaryen = function () {};

/**
 * @param {string} text
 * @return {!BinaryenModule}
 */
Binaryen.prototype.parseText = function (text) {};

/**
 * @param {!Uint8Array} data
 * @return {!BinaryenModule}
 */
Binaryen.prototype.readBinary = function (data) {};

/**
 * @param {number} level
 * @return {void}
 */
Binaryen.prototype.setOptimizeLevel = function (level) {};

/**
 * @param {number} level
 * @return {void}
 */
Binaryen.prototype.setShrinkLevel = function (level) {};

/**
 * @return {number}
 */
Binaryen.prototype.getOptimizeLevel = function () {};

/**
 * @return {number}
 */
Binaryen.prototype.getShrinkLevel = function () {};

/**
 * @param {number} funcPtr
 * @return {!BinaryenFunctionInfo}
 */
Binaryen.prototype.getFunctionInfo = function (funcPtr) {};

/**
 * @interface
 * @const
 */
var BinaryenModule = function () {};

/**
 * @param {number} exprPtr
 * @return {!BinaryenExpressionInfo}
 */
Binaryen.prototype.getExpressionInfo = function (exprPtr) {};

/**
 * @param {number} type
 * @return {!Array<number>}
 */
Binaryen.prototype.expandType = function (type) {};

/**
 * @type {number}
 */
Binaryen.prototype.none;

/**
 * @type {number}
 */
Binaryen.prototype.i32;

/**
 * @type {number}
 */
Binaryen.prototype.BlockId;

/**
 * @type {number}
 */
Binaryen.prototype.IfId;

/**
 * @type {number}
 */
Binaryen.prototype.LoopId;

/**
 * @type {number}
 */
Binaryen.prototype.BreakId;

/**
 * @type {number}
 */
Binaryen.prototype.SwitchId;

/**
 * @type {number}
 */
Binaryen.prototype.LocalSetId;

/**
 * @type {number}
 */
Binaryen.prototype.GlobalSetId;

/**
 * @type {number}
 */
Binaryen.prototype.UnaryId;

/**
 * @type {number}
 */
Binaryen.prototype.BinaryId;

/**
 * @type {number}
 */
Binaryen.prototype.CallId;

/**
 * @type {number}
 */
Binaryen.prototype.CallIndirectId;

/**
 * @type {number}
 */
Binaryen.prototype.LoadId;

/**
 * @type {number}
 */
Binaryen.prototype.StoreId;

/**
 * @type {number}
 */
Binaryen.prototype.ReturnId;

/**
 * @type {number}
 */
Binaryen.prototype.DropId;

/**
 * @type {number}
 */
Binaryen.prototype.SelectId;

/**
 * @param {!Array<string>} passList
 * @return {void}
 */
BinaryenModule.prototype.runPasses = function (passList) {};

/**
 * @param {string} name
 * @param {!Array<string>} passList
 * @return {void}
 */
BinaryenModule.prototype.runPassesOnFunction = function (name, passList) {};

/**
 * @return {void}
 */
BinaryenModule.prototype.optimize = function () {};

/**
 * @return {number}
 */
BinaryenModule.prototype.getNumFunctions = function () {};

/**
 * @param {number} index
 * @return {number}
 */
BinaryenModule.prototype.getFunctionByIndex = function (index) {};

/**
 * @return {string}
 */
BinaryenModule.prototype.emitText = function () {};

/**
 * Binaryen returns a raw Uint8Array when no source map URL is passed.
 * @return {!Uint8Array}
 */
BinaryenModule.prototype.emitBinary = function () {};

/**
 * @typedef {!Object<string, *>}
 */
var BinaryenExpressionInfo;

/**
 * @typedef {{
 *   name: string,
 *   base: string,
 *   body: number,
 *   params: number,
 *   vars: !Array<number>,
 *   results: number
 * }}
 */
var BinaryenFunctionInfo;

// ---------------------------------------------------------------------------
// Missing expression-type IDs
// ---------------------------------------------------------------------------

/**
 * @type {number}
 */
Binaryen.prototype.NopId;

/**
 * @type {number}
 */
Binaryen.prototype.UnreachableId;

/**
 * @type {number}
 */
Binaryen.prototype.ConstId;

/**
 * @type {number}
 */
Binaryen.prototype.LocalGetId;

/**
 * @type {number}
 */
Binaryen.prototype.GlobalGetId;

/**
 * @type {number}
 */
Binaryen.prototype.MemorySizeId;

/**
 * @type {number}
 */
Binaryen.prototype.MemoryGrowId;

// ---------------------------------------------------------------------------
// BinaryenModule expression-builder methods
// ---------------------------------------------------------------------------

/**
 * @return {number}
 */
BinaryenModule.prototype.nop = function () {};

// ---------------------------------------------------------------------------
// Binaryen expression-mutation sub-APIs
// Each sub-object exposes setter methods for its expression kind.
// ---------------------------------------------------------------------------

/**
 * @interface
 * @const
 */
var BinaryenBlockApi = function () {};

/**
 * @param {number} ptr
 * @param {number} index
 * @param {number} child
 * @return {void}
 */
BinaryenBlockApi.prototype.setChildAt = function (ptr, index, child) {};

/**
 * @type {!BinaryenBlockApi}
 */
Binaryen.prototype.Block;

// --

/**
 * @interface
 * @const
 */
var BinaryenIfApi = function () {};

/**
 * @param {number} ptr
 * @param {number} cond
 * @return {void}
 */
BinaryenIfApi.prototype.setCondition = function (ptr, cond) {};

/**
 * @param {number} ptr
 * @param {number} child
 * @return {void}
 */
BinaryenIfApi.prototype.setIfTrue = function (ptr, child) {};

/**
 * @param {number} ptr
 * @param {number} child
 * @return {void}
 */
BinaryenIfApi.prototype.setIfFalse = function (ptr, child) {};

/**
 * @type {!BinaryenIfApi}
 */
Binaryen.prototype.If;

// --

/**
 * @interface
 * @const
 */
var BinaryenLoopApi = function () {};

/**
 * @param {number} ptr
 * @param {number} body
 * @return {void}
 */
BinaryenLoopApi.prototype.setBody = function (ptr, body) {};

/**
 * @type {!BinaryenLoopApi}
 */
Binaryen.prototype.Loop;

// --

/**
 * @interface
 * @const
 */
var BinaryenBreakApi = function () {};

/**
 * @param {number} ptr
 * @param {number} cond
 * @return {void}
 */
BinaryenBreakApi.prototype.setCondition = function (ptr, cond) {};
/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenBreakApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenBreakApi}
 */
Binaryen.prototype.Break;

// --

/**
 * @interface
 * @const
 */
var BinaryenSwitchApi = function () {};

/**
 * @param {number} ptr
 * @param {number} cond
 * @return {void}
 */
BinaryenSwitchApi.prototype.setCondition = function (ptr, cond) {};
/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenSwitchApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenSwitchApi}
 */
Binaryen.prototype.Switch;

// --

/**
 * @interface
 * @const
 */
var BinaryenLocalSetApi = function () {};

/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenLocalSetApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenLocalSetApi}
 */
Binaryen.prototype.LocalSet;

// --

/**
 * @interface
 * @const
 */
var BinaryenGlobalSetApi = function () {};

/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenGlobalSetApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenGlobalSetApi}
 */
Binaryen.prototype.GlobalSet;

// --

/**
 * @interface
 * @const
 */
var BinaryenUnaryApi = function () {};

/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenUnaryApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenUnaryApi}
 */
Binaryen.prototype.Unary;

// --

/**
 * @interface
 * @const
 */
var BinaryenBinaryApi = function () {};

/**
 * @param {number} ptr
 * @param {number} left
 * @return {void}
 */
BinaryenBinaryApi.prototype.setLeft = function (ptr, left) {};

/**
 * @param {number} ptr
 * @param {number} right
 * @return {void}
 */
BinaryenBinaryApi.prototype.setRight = function (ptr, right) {};

/**
 * @type {!BinaryenBinaryApi}
 */
Binaryen.prototype.Binary;

// --

/**
 * @interface
 * @const
 */
var BinaryenCallApi = function () {};

/**
 * @param {number} ptr
 * @param {number} index
 * @param {number} operand
 * @return {void}
 */
BinaryenCallApi.prototype.setOperandAt = function (ptr, index, operand) {};

/**
 * @type {!BinaryenCallApi}
 */
Binaryen.prototype.Call;

// --

/**
 * @interface
 * @const
 */
var BinaryenCallIndirectApi = function () {};

/**
 * @param {number} ptr
 * @param {number} index
 * @param {number} operand
 * @return {void}
 */
BinaryenCallIndirectApi.prototype.setOperandAt = function (ptr, index, operand) {};

/**
 * @param {number} ptr
 * @param {number} target
 * @return {void}
 */
BinaryenCallIndirectApi.prototype.setTarget = function (ptr, target) {};

/**
 * @type {!BinaryenCallIndirectApi}
 */
Binaryen.prototype.CallIndirect;

// --

/**
 * @interface
 * @const
 */
var BinaryenReturnApi = function () {};

/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenReturnApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenReturnApi}
 */
Binaryen.prototype.Return;

// --

/**
 * @interface
 * @const
 */
var BinaryenDropApi = function () {};

/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenDropApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenDropApi}
 */
Binaryen.prototype.Drop;

// --

/**
 * @interface
 * @const
 */
var BinaryenSelectApi = function () {};

/**
 * @param {number} ptr
 * @param {number} cond
 * @return {void}
 */
BinaryenSelectApi.prototype.setCondition = function (ptr, cond) {};

/**
 * @param {number} ptr
 * @param {number} child
 * @return {void}
 */
BinaryenSelectApi.prototype.setIfTrue = function (ptr, child) {};

/**
 * @param {number} ptr
 * @param {number} child
 * @return {void}
 */
BinaryenSelectApi.prototype.setIfFalse = function (ptr, child) {};

/**
 * @type {!BinaryenSelectApi}
 */
Binaryen.prototype.Select;

// --

/**
 * @interface
 * @const
 */
var BinaryenLoadApi = function () {};

/**
 * @param {number} ptr
 * @param {number} ptrExpr
 * @return {void}
 */
BinaryenLoadApi.prototype.setPtr = function (ptr, ptrExpr) {};

/**
 * @type {!BinaryenLoadApi}
 */
Binaryen.prototype.Load;

// --

/**
 * @interface
 * @const
 */
var BinaryenStoreApi = function () {};

/**
 * @param {number} ptr
 * @param {number} ptrExpr
 * @return {void}
 */
BinaryenStoreApi.prototype.setPtr = function (ptr, ptrExpr) {};

/**
 * @param {number} ptr
 * @param {number} val
 * @return {void}
 */
BinaryenStoreApi.prototype.setValue = function (ptr, val) {};

/**
 * @type {!BinaryenStoreApi}
 */
Binaryen.prototype.Store;

// --

/**
 * @interface
 * @const
 */
var BinaryenMemoryGrowApi = function () {};

/**
 * @param {number} ptr
 * @param {number} delta
 * @return {void}
 */
BinaryenMemoryGrowApi.prototype.setDelta = function (ptr, delta) {};

/**
 * @type {!BinaryenMemoryGrowApi}
 */
Binaryen.prototype.MemoryGrow;

// --

/**
 * @interface
 * @const
 */
var BinaryenFunctionApi = function () {};

/**
 * @param {number} ptr
 * @param {number} body
 * @return {void}
 */
BinaryenFunctionApi.prototype.setBody = function (ptr, body) {};

/**
 * @type {!BinaryenFunctionApi}
 */
Binaryen.prototype.Function;
