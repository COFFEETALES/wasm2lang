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
 * @param {number} exportPtr
 * @return {!BinaryenExportInfo}
 */
Binaryen.prototype.getExportInfo = function (exportPtr) {};

/**
 * @type {number}
 */
Binaryen.prototype.ExternalFunction;

/**
 * @type {number}
 */
Binaryen.prototype.ExternalGlobal;

/**
 * @interface
 * @const
 */
var BinaryenModule = function () {};

/**
 * @param {number} exprPtr
 * @return {number}
 */
Binaryen.prototype.getExpressionId = function (exprPtr) {};

/**
 * @param {number} exprPtr
 * @return {number}
 */
Binaryen.prototype.getExpressionType = function (exprPtr) {};

/**
 * @param {number} exprPtr
 * @return {!BinaryenExpressionInfo}
 */
Binaryen.prototype.getExpressionInfo = function (exprPtr) {};

/**
 * @param {number} funcPtr
 * @param {number} type
 * @return {number}
 */
Binaryen.prototype._BinaryenFunctionAddVar = function (funcPtr, type) {};

/**
 * @record
 */
var BinaryenFeatures = function () {};

/**
 * @type {number}
 */
BinaryenFeatures.prototype.MVP;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.Atomics;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.BulkMemory;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.NontrappingFPToInt;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.SIMD128;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.ExceptionHandling;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.TailCall;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.ReferenceTypes;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.Multivalue;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.GC;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.Memory64;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.RelaxedSIMD;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.Strings;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.MultiMemory;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.StackSwitching;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.SharedEverything;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.FP16;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.BulkMemoryOpt;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.SignExt;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.MutableGlobals;

/**
 * @type {number}
 */
BinaryenFeatures.prototype.All;

/**
 * @type {!BinaryenFeatures}
 */
Binaryen.prototype.Features;

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
Binaryen.prototype.unreachable;

/**
 * @type {number}
 */
Binaryen.prototype.i32;

/**
 * @type {number}
 */
Binaryen.prototype.f32;

/**
 * @type {number}
 */
Binaryen.prototype.f64;

/**
 * @type {number}
 */
Binaryen.prototype.i64;

/**
 * @type {number}
 */
Binaryen.prototype.v128;

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
 * @return {number}
 */
BinaryenModule.prototype.getNumExports = function () {};

/**
 * @param {number} index
 * @return {number}
 */
BinaryenModule.prototype.getExportByIndex = function (index) {};

/**
 * @return {number}
 */
BinaryenModule.prototype.getNumMemorySegments = function () {};

/**
 * @param {string} index
 * @return {!BinaryenMemorySegmentInfo}
 */
BinaryenModule.prototype.getMemorySegmentInfo = function (index) {};

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
 * @return {number}
 */
BinaryenModule.prototype.getFeatures = function () {};

/**
 * @param {number} features
 * @return {void}
 */
BinaryenModule.prototype.setFeatures = function (features) {};

/**
 * @return {number}
 */
BinaryenModule.prototype.validate = function () {};

/**
 * Binaryen expression info shape from getExpressionInfo().
 * Only fields touched by this codebase are modeled here.
 *
 * @record
 */
var BinaryenExpressionInfo = function () {};

/**
 * @type {number}
 */
BinaryenExpressionInfo.prototype.id;

/**
 * @type {number}
 */
BinaryenExpressionInfo.prototype.type;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.value;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.valueType;

/**
 * @type {(number|void)}
 */
BinaryenExpressionInfo.prototype.index;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.condition;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.ifTrue;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.ifFalse;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.body;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.left;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.right;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.ptr;

/**
 * @type {(string|number|undefined)}
 */
BinaryenExpressionInfo.prototype.target;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.delta;

/**
 * @type {(!Array<number>|undefined)}
 */
BinaryenExpressionInfo.prototype.children;

/**
 * @type {(!Array<number>|undefined)}
 */
BinaryenExpressionInfo.prototype.operands;

/**
 * @type {(string|undefined)}
 */
BinaryenExpressionInfo.prototype.name;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.numNames;

/**
 * @type {(!Array<string>|undefined)}
 */
BinaryenExpressionInfo.prototype.names;

/**
 * @type {(string|undefined)}
 */
BinaryenExpressionInfo.prototype.defaultName;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.op;

/**
 * @type {(boolean|undefined)}
 */
BinaryenExpressionInfo.prototype.isSigned;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.offset;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.bytes;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.align;

/**
 * SIMD: vector operand pointer.
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.vec;

/**
 * SIMD Shuffle: 16-byte lane mask array.
 * @type {(!Array<number>|undefined)}
 */
BinaryenExpressionInfo.prototype.mask;

/**
 * SIMD Ternary: first operand pointer.
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.a;

/**
 * SIMD Ternary: second operand pointer.
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.b;

/**
 * SIMD Ternary: third operand pointer (condition/mask).
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.c;

/**
 * SIMD Shift: shift amount pointer.
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.shift;

/**
 * @type {(boolean|undefined)}
 */
BinaryenExpressionInfo.prototype.isTee;

/**
 * @type {(boolean|undefined)}
 */
BinaryenExpressionInfo.prototype.isReturn;

/**
 * @type {(string|undefined)}
 */
BinaryenExpressionInfo.prototype.table;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.params;

/**
 * @type {(number|undefined)}
 */
BinaryenExpressionInfo.prototype.results;

/**
 * @typedef {{
 *   name: string,
 *   module: string,
 *   base: string,
 *   body: number,
 *   params: number,
 *   vars: !Array<number>,
 *   results: number
 * }}
 */
var BinaryenFunctionInfo;

/**
 * @typedef {{
 *   name: string,
 *   kind: number,
 *   value: string
 * }}
 */
var BinaryenExportInfo;

/**
 * @typedef {{
 *   offset: number,
 *   data: !ArrayBuffer,
 *   passive: boolean
 * }}
 */
var BinaryenMemorySegmentInfo;

/**
 * @return {number}
 */
BinaryenModule.prototype.getNumElementSegments = function () {};

/**
 * @param {number} index
 * @return {number}
 */
BinaryenModule.prototype.getElementSegmentByIndex = function (index) {};

/**
 * @param {number} segPtr
 * @return {!BinaryenElementSegmentInfo}
 */
Binaryen.prototype.getElementSegmentInfo = function (segPtr) {};

/**
 * @typedef {{
 *   name: string,
 *   table: string,
 *   offset: number,
 *   data: !Array<string>
 * }}
 */
var BinaryenElementSegmentInfo;

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

/**
 * @type {number}
 */
Binaryen.prototype.MemoryFillId;

/**
 * @type {number}
 */
Binaryen.prototype.MemoryCopyId;

// ---------------------------------------------------------------------------
// SIMD expression-type IDs
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SIMDExtractId;
/** @type {number} */ Binaryen.prototype.SIMDReplaceId;
/** @type {number} */ Binaryen.prototype.SIMDShuffleId;
/** @type {number} */ Binaryen.prototype.SIMDTernaryId;
/** @type {number} */ Binaryen.prototype.SIMDShiftId;
/** @type {number} */ Binaryen.prototype.SIMDLoadId;
/** @type {number} */ Binaryen.prototype.SIMDLoadStoreLaneId;

// ---------------------------------------------------------------------------
// BinaryenModule expression-builder methods
// ---------------------------------------------------------------------------

/**
 * @param {?string} name
 * @param {!Array<number>} children
 * @param {number=} type
 * @return {number}
 */
BinaryenModule.prototype.block = function (name, children, type) {};

/**
 * @param {string} name
 * @param {number} body
 * @return {number}
 */
BinaryenModule.prototype.loop = function (name, body) {};

/**
 * @param {string} name
 * @param {number=} condition
 * @param {number=} value
 * @return {number}
 */
BinaryenModule.prototype.break = function (name, condition, value) {};

/**
 * @param {!Array<string>} names
 * @param {string} defaultName
 * @param {number} condition
 * @param {number=} value
 * @return {number}
 */
BinaryenModule.prototype.switch = function (names, defaultName, condition, value) {};

/**
 * @return {number}
 */
BinaryenModule.prototype.nop = function () {};

// ---------------------------------------------------------------------------
// BinaryenModule local expression-builder sub-API (module.local.*)
// ---------------------------------------------------------------------------

/**
 * @interface
 * @const
 */
var BinaryenLocalApi = function () {};

/** @param {number} index @param {number} type @return {number} */
BinaryenLocalApi.prototype.get = function (index, type) {};
/** @param {number} index @param {number} value @return {number} */
BinaryenLocalApi.prototype.set = function (index, value) {};

/** @type {!BinaryenLocalApi} */
BinaryenModule.prototype.local;

// ---------------------------------------------------------------------------
// BinaryenModule i32 expression-builder sub-API (module.i32.*)
// ---------------------------------------------------------------------------

/**
 * @interface
 * @const
 */
var BinaryenI32Api = function () {};

/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.eq = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.ne = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.lt_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.le_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.gt_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.ge_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.lt_u = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.le_u = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.gt_u = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI32Api.prototype.ge_u = function (l, r) {};
/** @param {number} v @return {number} */
BinaryenI32Api.prototype.eqz = function (v) {};

/** @type {!BinaryenI32Api} */
BinaryenModule.prototype.i32;

// ---------------------------------------------------------------------------
// BinaryenModule i64 expression-builder sub-API (module.i64.*)
// ---------------------------------------------------------------------------

/**
 * @interface
 * @const
 */
var BinaryenI64Api = function () {};

/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.eq = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.ne = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.lt_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.le_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.gt_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.ge_s = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.lt_u = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.le_u = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.gt_u = function (l, r) {};
/** @param {number} l @param {number} r @return {number} */
BinaryenI64Api.prototype.ge_u = function (l, r) {};

/** @type {!BinaryenI64Api} */
BinaryenModule.prototype.i64;

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
var BinaryenMemoryFillApi = function () {};

/** @param {number} ptr @param {number} dest @return {void} */
BinaryenMemoryFillApi.prototype.setDest = function (ptr, dest) {};
/** @param {number} ptr @param {number} value @return {void} */
BinaryenMemoryFillApi.prototype.setValue = function (ptr, value) {};
/** @param {number} ptr @param {number} size @return {void} */
BinaryenMemoryFillApi.prototype.setSize = function (ptr, size) {};
/** @param {number} ptr @return {number} */
BinaryenMemoryFillApi.prototype.getDest = function (ptr) {};
/** @param {number} ptr @return {number} */
BinaryenMemoryFillApi.prototype.getValue = function (ptr) {};
/** @param {number} ptr @return {number} */
BinaryenMemoryFillApi.prototype.getSize = function (ptr) {};

/**
 * @type {!BinaryenMemoryFillApi}
 */
Binaryen.prototype.MemoryFill;

// --

/**
 * @interface
 * @const
 */
var BinaryenMemoryCopyApi = function () {};

/** @param {number} ptr @param {number} dest @return {void} */
BinaryenMemoryCopyApi.prototype.setDest = function (ptr, dest) {};
/** @param {number} ptr @param {number} source @return {void} */
BinaryenMemoryCopyApi.prototype.setSource = function (ptr, source) {};
/** @param {number} ptr @param {number} size @return {void} */
BinaryenMemoryCopyApi.prototype.setSize = function (ptr, size) {};
/** @param {number} ptr @return {number} */
BinaryenMemoryCopyApi.prototype.getDest = function (ptr) {};
/** @param {number} ptr @return {number} */
BinaryenMemoryCopyApi.prototype.getSource = function (ptr) {};
/** @param {number} ptr @return {number} */
BinaryenMemoryCopyApi.prototype.getSize = function (ptr) {};

/**
 * @type {!BinaryenMemoryCopyApi}
 */
Binaryen.prototype.MemoryCopy;

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

// ---------------------------------------------------------------------------
// Global variable APIs
// ---------------------------------------------------------------------------

/**
 * @return {number}
 */
BinaryenModule.prototype.getNumGlobals = function () {};

/**
 * @param {number} index
 * @return {number}
 */
BinaryenModule.prototype.getGlobalByIndex = function (index) {};

/**
 * @param {number} globalPtr
 * @return {!BinaryenGlobalInfo}
 */
Binaryen.prototype.getGlobalInfo = function (globalPtr) {};

/**
 * @typedef {{
 *   name: string,
 *   module: string,
 *   base: string,
 *   type: number,
 *   mutable: boolean,
 *   init: number
 * }}
 */
var BinaryenGlobalInfo;

// ---------------------------------------------------------------------------
// Binary operation constants (i32)
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.AddInt32;
/** @type {number} */ Binaryen.prototype.SubInt32;
/** @type {number} */ Binaryen.prototype.MulInt32;
/** @type {number} */ Binaryen.prototype.DivSInt32;
/** @type {number} */ Binaryen.prototype.DivUInt32;
/** @type {number} */ Binaryen.prototype.RemSInt32;
/** @type {number} */ Binaryen.prototype.RemUInt32;
/** @type {number} */ Binaryen.prototype.AndInt32;
/** @type {number} */ Binaryen.prototype.OrInt32;
/** @type {number} */ Binaryen.prototype.XorInt32;
/** @type {number} */ Binaryen.prototype.ShlInt32;
/** @type {number} */ Binaryen.prototype.ShrSInt32;
/** @type {number} */ Binaryen.prototype.ShrUInt32;
/** @type {number} */ Binaryen.prototype.RotLInt32;
/** @type {number} */ Binaryen.prototype.RotRInt32;
/** @type {number} */ Binaryen.prototype.EqInt32;
/** @type {number} */ Binaryen.prototype.NeInt32;
/** @type {number} */ Binaryen.prototype.LtSInt32;
/** @type {number} */ Binaryen.prototype.LtUInt32;
/** @type {number} */ Binaryen.prototype.LeSInt32;
/** @type {number} */ Binaryen.prototype.LeUInt32;
/** @type {number} */ Binaryen.prototype.GtSInt32;
/** @type {number} */ Binaryen.prototype.GtUInt32;
/** @type {number} */ Binaryen.prototype.GeSInt32;
/** @type {number} */ Binaryen.prototype.GeUInt32;

// ---------------------------------------------------------------------------
// Unary operation constants (i32)
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.EqZInt32;
/** @type {number} */ Binaryen.prototype.ClzInt32;
/** @type {number} */ Binaryen.prototype.CtzInt32;
/** @type {number} */ Binaryen.prototype.PopcntInt32;
/** @type {number} */ Binaryen.prototype.ExtendS8Int32;
/** @type {number} */ Binaryen.prototype.ExtendS16Int32;

// ---------------------------------------------------------------------------
// Binary operation constants (i64)
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.AddInt64;
/** @type {number} */ Binaryen.prototype.SubInt64;
/** @type {number} */ Binaryen.prototype.MulInt64;
/** @type {number} */ Binaryen.prototype.DivSInt64;
/** @type {number} */ Binaryen.prototype.DivUInt64;
/** @type {number} */ Binaryen.prototype.RemSInt64;
/** @type {number} */ Binaryen.prototype.RemUInt64;
/** @type {number} */ Binaryen.prototype.AndInt64;
/** @type {number} */ Binaryen.prototype.OrInt64;
/** @type {number} */ Binaryen.prototype.XorInt64;
/** @type {number} */ Binaryen.prototype.ShlInt64;
/** @type {number} */ Binaryen.prototype.ShrSInt64;
/** @type {number} */ Binaryen.prototype.ShrUInt64;
/** @type {number} */ Binaryen.prototype.RotLInt64;
/** @type {number} */ Binaryen.prototype.RotRInt64;
/** @type {number} */ Binaryen.prototype.EqInt64;
/** @type {number} */ Binaryen.prototype.NeInt64;
/** @type {number} */ Binaryen.prototype.LtSInt64;
/** @type {number} */ Binaryen.prototype.LtUInt64;
/** @type {number} */ Binaryen.prototype.LeSInt64;
/** @type {number} */ Binaryen.prototype.LeUInt64;
/** @type {number} */ Binaryen.prototype.GtSInt64;
/** @type {number} */ Binaryen.prototype.GtUInt64;
/** @type {number} */ Binaryen.prototype.GeSInt64;
/** @type {number} */ Binaryen.prototype.GeUInt64;

// ---------------------------------------------------------------------------
// Unary operation constants (i64)
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.EqZInt64;
/** @type {number} */ Binaryen.prototype.ClzInt64;
/** @type {number} */ Binaryen.prototype.CtzInt64;
/** @type {number} */ Binaryen.prototype.PopcntInt64;
/** @type {number} */ Binaryen.prototype.ExtendS8Int64;
/** @type {number} */ Binaryen.prototype.ExtendS16Int64;
/** @type {number} */ Binaryen.prototype.ExtendS32Int64;

// ---------------------------------------------------------------------------
// Conversion operation constants (i64)
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.WrapInt64;
/** @type {number} */ Binaryen.prototype.ExtendSInt32;
/** @type {number} */ Binaryen.prototype.ExtendUInt32;
/** @type {number} */ Binaryen.prototype.ConvertSInt64ToFloat32;
/** @type {number} */ Binaryen.prototype.ConvertUInt64ToFloat32;
/** @type {number} */ Binaryen.prototype.ConvertSInt64ToFloat64;
/** @type {number} */ Binaryen.prototype.ConvertUInt64ToFloat64;
/** @type {number} */ Binaryen.prototype.TruncSFloat32ToInt64;
/** @type {number} */ Binaryen.prototype.TruncUFloat32ToInt64;
/** @type {number} */ Binaryen.prototype.TruncSFloat64ToInt64;
/** @type {number} */ Binaryen.prototype.TruncUFloat64ToInt64;
/** @type {number} */ Binaryen.prototype.TruncSatSFloat32ToInt64;
/** @type {number} */ Binaryen.prototype.TruncSatUFloat32ToInt64;
/** @type {number} */ Binaryen.prototype.TruncSatSFloat64ToInt64;
/** @type {number} */ Binaryen.prototype.TruncSatUFloat64ToInt64;
/** @type {number} */ Binaryen.prototype.ReinterpretInt64;
/** @type {number} */ Binaryen.prototype.ReinterpretFloat64;

// ---------------------------------------------------------------------------
// Floating-point unary/binary operation constants (MVP subset used here)
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.AbsFloat32;
/** @type {number} */ Binaryen.prototype.AbsFloat64;
/** @type {number} */ Binaryen.prototype.NegFloat32;
/** @type {number} */ Binaryen.prototype.NegFloat64;
/** @type {number} */ Binaryen.prototype.CeilFloat32;
/** @type {number} */ Binaryen.prototype.CeilFloat64;
/** @type {number} */ Binaryen.prototype.FloorFloat32;
/** @type {number} */ Binaryen.prototype.FloorFloat64;
/** @type {number} */ Binaryen.prototype.TruncFloat32;
/** @type {number} */ Binaryen.prototype.TruncFloat64;
/** @type {number} */ Binaryen.prototype.NearestFloat32;
/** @type {number} */ Binaryen.prototype.NearestFloat64;
/** @type {number} */ Binaryen.prototype.SqrtFloat32;
/** @type {number} */ Binaryen.prototype.SqrtFloat64;
/** @type {number} */ Binaryen.prototype.TruncSFloat32ToInt32;
/** @type {number} */ Binaryen.prototype.TruncUFloat32ToInt32;
/** @type {number} */ Binaryen.prototype.TruncSFloat64ToInt32;
/** @type {number} */ Binaryen.prototype.TruncUFloat64ToInt32;
/** @type {number} */ Binaryen.prototype.TruncSatSFloat32ToInt32;
/** @type {number} */ Binaryen.prototype.TruncSatUFloat32ToInt32;
/** @type {number} */ Binaryen.prototype.TruncSatSFloat64ToInt32;
/** @type {number} */ Binaryen.prototype.TruncSatUFloat64ToInt32;
/** @type {number} */ Binaryen.prototype.ConvertSInt32ToFloat32;
/** @type {number} */ Binaryen.prototype.ConvertUInt32ToFloat32;
/** @type {number} */ Binaryen.prototype.ConvertSInt32ToFloat64;
/** @type {number} */ Binaryen.prototype.ConvertUInt32ToFloat64;
/** @type {number} */ Binaryen.prototype.DemoteFloat64;
/** @type {number} */ Binaryen.prototype.PromoteFloat32;
/** @type {number} */ Binaryen.prototype.ReinterpretFloat32;
/** @type {number} */ Binaryen.prototype.ReinterpretInt32;
/** @type {number} */ Binaryen.prototype.AddFloat32;
/** @type {number} */ Binaryen.prototype.SubFloat32;
/** @type {number} */ Binaryen.prototype.MulFloat32;
/** @type {number} */ Binaryen.prototype.DivFloat32;
/** @type {number} */ Binaryen.prototype.MinFloat32;
/** @type {number} */ Binaryen.prototype.MaxFloat32;
/** @type {number} */ Binaryen.prototype.CopySignFloat32;
/** @type {number} */ Binaryen.prototype.EqFloat32;
/** @type {number} */ Binaryen.prototype.NeFloat32;
/** @type {number} */ Binaryen.prototype.LtFloat32;
/** @type {number} */ Binaryen.prototype.GtFloat32;
/** @type {number} */ Binaryen.prototype.LeFloat32;
/** @type {number} */ Binaryen.prototype.GeFloat32;
/** @type {number} */ Binaryen.prototype.AddFloat64;
/** @type {number} */ Binaryen.prototype.SubFloat64;
/** @type {number} */ Binaryen.prototype.MulFloat64;
/** @type {number} */ Binaryen.prototype.DivFloat64;
/** @type {number} */ Binaryen.prototype.MinFloat64;
/** @type {number} */ Binaryen.prototype.MaxFloat64;
/** @type {number} */ Binaryen.prototype.CopySignFloat64;
/** @type {number} */ Binaryen.prototype.EqFloat64;
/** @type {number} */ Binaryen.prototype.NeFloat64;
/** @type {number} */ Binaryen.prototype.LtFloat64;
/** @type {number} */ Binaryen.prototype.GtFloat64;
/** @type {number} */ Binaryen.prototype.LeFloat64;
/** @type {number} */ Binaryen.prototype.GeFloat64;

// ---------------------------------------------------------------------------
// SIMD operation constants — v128 bitwise
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.NotVec128;
/** @type {number} */ Binaryen.prototype.AndVec128;
/** @type {number} */ Binaryen.prototype.OrVec128;
/** @type {number} */ Binaryen.prototype.XorVec128;
/** @type {number} */ Binaryen.prototype.AndNotVec128;
/** @type {number} */ Binaryen.prototype.BitselectVec128;
/** @type {number} */ Binaryen.prototype.AnyTrueVec128;

// ---------------------------------------------------------------------------
// SIMD operation constants — i8x16
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SplatVecI8x16;
/** @type {number} */ Binaryen.prototype.ExtractLaneSVecI8x16;
/** @type {number} */ Binaryen.prototype.ExtractLaneUVecI8x16;
/** @type {number} */ Binaryen.prototype.ReplaceLaneVecI8x16;
/** @type {number} */ Binaryen.prototype.EqVecI8x16;
/** @type {number} */ Binaryen.prototype.NeVecI8x16;
/** @type {number} */ Binaryen.prototype.LtSVecI8x16;
/** @type {number} */ Binaryen.prototype.LtUVecI8x16;
/** @type {number} */ Binaryen.prototype.GtSVecI8x16;
/** @type {number} */ Binaryen.prototype.GtUVecI8x16;
/** @type {number} */ Binaryen.prototype.LeSVecI8x16;
/** @type {number} */ Binaryen.prototype.LeUVecI8x16;
/** @type {number} */ Binaryen.prototype.GeSVecI8x16;
/** @type {number} */ Binaryen.prototype.GeUVecI8x16;
/** @type {number} */ Binaryen.prototype.AbsVecI8x16;
/** @type {number} */ Binaryen.prototype.NegVecI8x16;
/** @type {number} */ Binaryen.prototype.AllTrueVecI8x16;
/** @type {number} */ Binaryen.prototype.BitmaskVecI8x16;
/** @type {number} */ Binaryen.prototype.PopcntVecI8x16;
/** @type {number} */ Binaryen.prototype.ShlVecI8x16;
/** @type {number} */ Binaryen.prototype.ShrSVecI8x16;
/** @type {number} */ Binaryen.prototype.ShrUVecI8x16;
/** @type {number} */ Binaryen.prototype.AddVecI8x16;
/** @type {number} */ Binaryen.prototype.AddSatSVecI8x16;
/** @type {number} */ Binaryen.prototype.AddSatUVecI8x16;
/** @type {number} */ Binaryen.prototype.SubVecI8x16;
/** @type {number} */ Binaryen.prototype.SubSatSVecI8x16;
/** @type {number} */ Binaryen.prototype.SubSatUVecI8x16;
/** @type {number} */ Binaryen.prototype.MinSVecI8x16;
/** @type {number} */ Binaryen.prototype.MinUVecI8x16;
/** @type {number} */ Binaryen.prototype.MaxSVecI8x16;
/** @type {number} */ Binaryen.prototype.MaxUVecI8x16;
/** @type {number} */ Binaryen.prototype.AvgrUVecI8x16;
/** @type {number} */ Binaryen.prototype.NarrowSVecI16x8ToVecI8x16;
/** @type {number} */ Binaryen.prototype.NarrowUVecI16x8ToVecI8x16;
/** @type {number} */ Binaryen.prototype.SwizzleVecI8x16;

// ---------------------------------------------------------------------------
// SIMD operation constants — i16x8
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SplatVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtractLaneSVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtractLaneUVecI16x8;
/** @type {number} */ Binaryen.prototype.ReplaceLaneVecI16x8;
/** @type {number} */ Binaryen.prototype.EqVecI16x8;
/** @type {number} */ Binaryen.prototype.NeVecI16x8;
/** @type {number} */ Binaryen.prototype.LtSVecI16x8;
/** @type {number} */ Binaryen.prototype.LtUVecI16x8;
/** @type {number} */ Binaryen.prototype.GtSVecI16x8;
/** @type {number} */ Binaryen.prototype.GtUVecI16x8;
/** @type {number} */ Binaryen.prototype.LeSVecI16x8;
/** @type {number} */ Binaryen.prototype.LeUVecI16x8;
/** @type {number} */ Binaryen.prototype.GeSVecI16x8;
/** @type {number} */ Binaryen.prototype.GeUVecI16x8;
/** @type {number} */ Binaryen.prototype.AbsVecI16x8;
/** @type {number} */ Binaryen.prototype.NegVecI16x8;
/** @type {number} */ Binaryen.prototype.AllTrueVecI16x8;
/** @type {number} */ Binaryen.prototype.BitmaskVecI16x8;
/** @type {number} */ Binaryen.prototype.ShlVecI16x8;
/** @type {number} */ Binaryen.prototype.ShrSVecI16x8;
/** @type {number} */ Binaryen.prototype.ShrUVecI16x8;
/** @type {number} */ Binaryen.prototype.AddVecI16x8;
/** @type {number} */ Binaryen.prototype.AddSatSVecI16x8;
/** @type {number} */ Binaryen.prototype.AddSatUVecI16x8;
/** @type {number} */ Binaryen.prototype.SubVecI16x8;
/** @type {number} */ Binaryen.prototype.SubSatSVecI16x8;
/** @type {number} */ Binaryen.prototype.SubSatUVecI16x8;
/** @type {number} */ Binaryen.prototype.MulVecI16x8;
/** @type {number} */ Binaryen.prototype.MinSVecI16x8;
/** @type {number} */ Binaryen.prototype.MinUVecI16x8;
/** @type {number} */ Binaryen.prototype.MaxSVecI16x8;
/** @type {number} */ Binaryen.prototype.MaxUVecI16x8;
/** @type {number} */ Binaryen.prototype.AvgrUVecI16x8;
/** @type {number} */ Binaryen.prototype.Q15MulrSatSVecI16x8;
/** @type {number} */ Binaryen.prototype.DotSVecI16x8ToVecI32x4;
/** @type {number} */ Binaryen.prototype.NarrowSVecI32x4ToVecI16x8;
/** @type {number} */ Binaryen.prototype.NarrowUVecI32x4ToVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtendLowSVecI8x16ToVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtendHighSVecI8x16ToVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtendLowUVecI8x16ToVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtendHighUVecI8x16ToVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtMulLowSVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtMulHighSVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtMulLowUVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtMulHighUVecI16x8;
/** @type {number} */ Binaryen.prototype.ExtAddPairwiseSVecI8x16ToI16x8;
/** @type {number} */ Binaryen.prototype.ExtAddPairwiseUVecI8x16ToI16x8;

// ---------------------------------------------------------------------------
// SIMD operation constants — i32x4
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SplatVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtractLaneVecI32x4;
/** @type {number} */ Binaryen.prototype.ReplaceLaneVecI32x4;
/** @type {number} */ Binaryen.prototype.EqVecI32x4;
/** @type {number} */ Binaryen.prototype.NeVecI32x4;
/** @type {number} */ Binaryen.prototype.LtSVecI32x4;
/** @type {number} */ Binaryen.prototype.LtUVecI32x4;
/** @type {number} */ Binaryen.prototype.GtSVecI32x4;
/** @type {number} */ Binaryen.prototype.GtUVecI32x4;
/** @type {number} */ Binaryen.prototype.LeSVecI32x4;
/** @type {number} */ Binaryen.prototype.LeUVecI32x4;
/** @type {number} */ Binaryen.prototype.GeSVecI32x4;
/** @type {number} */ Binaryen.prototype.GeUVecI32x4;
/** @type {number} */ Binaryen.prototype.AbsVecI32x4;
/** @type {number} */ Binaryen.prototype.NegVecI32x4;
/** @type {number} */ Binaryen.prototype.AllTrueVecI32x4;
/** @type {number} */ Binaryen.prototype.BitmaskVecI32x4;
/** @type {number} */ Binaryen.prototype.ShlVecI32x4;
/** @type {number} */ Binaryen.prototype.ShrSVecI32x4;
/** @type {number} */ Binaryen.prototype.ShrUVecI32x4;
/** @type {number} */ Binaryen.prototype.AddVecI32x4;
/** @type {number} */ Binaryen.prototype.SubVecI32x4;
/** @type {number} */ Binaryen.prototype.MulVecI32x4;
/** @type {number} */ Binaryen.prototype.MinSVecI32x4;
/** @type {number} */ Binaryen.prototype.MinUVecI32x4;
/** @type {number} */ Binaryen.prototype.MaxSVecI32x4;
/** @type {number} */ Binaryen.prototype.MaxUVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtendLowSVecI16x8ToVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtendHighSVecI16x8ToVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtendLowUVecI16x8ToVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtendHighUVecI16x8ToVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtMulLowSVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtMulHighSVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtMulLowUVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtMulHighUVecI32x4;
/** @type {number} */ Binaryen.prototype.ExtAddPairwiseSVecI16x8ToI32x4;
/** @type {number} */ Binaryen.prototype.ExtAddPairwiseUVecI16x8ToI32x4;
/** @type {number} */ Binaryen.prototype.TruncSatSVecF32x4ToVecI32x4;
/** @type {number} */ Binaryen.prototype.TruncSatUVecF32x4ToVecI32x4;
/** @type {number} */ Binaryen.prototype.TruncSatZeroSVecF64x2ToVecI32x4;
/** @type {number} */ Binaryen.prototype.TruncSatZeroUVecF64x2ToVecI32x4;

// ---------------------------------------------------------------------------
// SIMD operation constants — i64x2
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SplatVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtractLaneVecI64x2;
/** @type {number} */ Binaryen.prototype.ReplaceLaneVecI64x2;
/** @type {number} */ Binaryen.prototype.EqVecI64x2;
/** @type {number} */ Binaryen.prototype.NeVecI64x2;
/** @type {number} */ Binaryen.prototype.LtSVecI64x2;
/** @type {number} */ Binaryen.prototype.GtSVecI64x2;
/** @type {number} */ Binaryen.prototype.LeSVecI64x2;
/** @type {number} */ Binaryen.prototype.GeSVecI64x2;
/** @type {number} */ Binaryen.prototype.AbsVecI64x2;
/** @type {number} */ Binaryen.prototype.NegVecI64x2;
/** @type {number} */ Binaryen.prototype.AllTrueVecI64x2;
/** @type {number} */ Binaryen.prototype.BitmaskVecI64x2;
/** @type {number} */ Binaryen.prototype.ShlVecI64x2;
/** @type {number} */ Binaryen.prototype.ShrSVecI64x2;
/** @type {number} */ Binaryen.prototype.ShrUVecI64x2;
/** @type {number} */ Binaryen.prototype.AddVecI64x2;
/** @type {number} */ Binaryen.prototype.SubVecI64x2;
/** @type {number} */ Binaryen.prototype.MulVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtendLowSVecI32x4ToVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtendHighSVecI32x4ToVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtendLowUVecI32x4ToVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtendHighUVecI32x4ToVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtMulLowSVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtMulHighSVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtMulLowUVecI64x2;
/** @type {number} */ Binaryen.prototype.ExtMulHighUVecI64x2;

// ---------------------------------------------------------------------------
// SIMD operation constants — f32x4
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SplatVecF32x4;
/** @type {number} */ Binaryen.prototype.ExtractLaneVecF32x4;
/** @type {number} */ Binaryen.prototype.ReplaceLaneVecF32x4;
/** @type {number} */ Binaryen.prototype.EqVecF32x4;
/** @type {number} */ Binaryen.prototype.NeVecF32x4;
/** @type {number} */ Binaryen.prototype.LtVecF32x4;
/** @type {number} */ Binaryen.prototype.GtVecF32x4;
/** @type {number} */ Binaryen.prototype.LeVecF32x4;
/** @type {number} */ Binaryen.prototype.GeVecF32x4;
/** @type {number} */ Binaryen.prototype.AbsVecF32x4;
/** @type {number} */ Binaryen.prototype.NegVecF32x4;
/** @type {number} */ Binaryen.prototype.SqrtVecF32x4;
/** @type {number} */ Binaryen.prototype.AddVecF32x4;
/** @type {number} */ Binaryen.prototype.SubVecF32x4;
/** @type {number} */ Binaryen.prototype.MulVecF32x4;
/** @type {number} */ Binaryen.prototype.DivVecF32x4;
/** @type {number} */ Binaryen.prototype.MinVecF32x4;
/** @type {number} */ Binaryen.prototype.MaxVecF32x4;
/** @type {number} */ Binaryen.prototype.PMinVecF32x4;
/** @type {number} */ Binaryen.prototype.PMaxVecF32x4;
/** @type {number} */ Binaryen.prototype.CeilVecF32x4;
/** @type {number} */ Binaryen.prototype.FloorVecF32x4;
/** @type {number} */ Binaryen.prototype.TruncVecF32x4;
/** @type {number} */ Binaryen.prototype.NearestVecF32x4;
/** @type {number} */ Binaryen.prototype.ConvertSVecI32x4ToVecF32x4;
/** @type {number} */ Binaryen.prototype.ConvertUVecI32x4ToVecF32x4;
/** @type {number} */ Binaryen.prototype.DemoteZeroVecF64x2ToVecF32x4;

// ---------------------------------------------------------------------------
// SIMD operation constants — f64x2
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.SplatVecF64x2;
/** @type {number} */ Binaryen.prototype.ExtractLaneVecF64x2;
/** @type {number} */ Binaryen.prototype.ReplaceLaneVecF64x2;
/** @type {number} */ Binaryen.prototype.EqVecF64x2;
/** @type {number} */ Binaryen.prototype.NeVecF64x2;
/** @type {number} */ Binaryen.prototype.LtVecF64x2;
/** @type {number} */ Binaryen.prototype.GtVecF64x2;
/** @type {number} */ Binaryen.prototype.LeVecF64x2;
/** @type {number} */ Binaryen.prototype.GeVecF64x2;
/** @type {number} */ Binaryen.prototype.AbsVecF64x2;
/** @type {number} */ Binaryen.prototype.NegVecF64x2;
/** @type {number} */ Binaryen.prototype.SqrtVecF64x2;
/** @type {number} */ Binaryen.prototype.AddVecF64x2;
/** @type {number} */ Binaryen.prototype.SubVecF64x2;
/** @type {number} */ Binaryen.prototype.MulVecF64x2;
/** @type {number} */ Binaryen.prototype.DivVecF64x2;
/** @type {number} */ Binaryen.prototype.MinVecF64x2;
/** @type {number} */ Binaryen.prototype.MaxVecF64x2;
/** @type {number} */ Binaryen.prototype.PMinVecF64x2;
/** @type {number} */ Binaryen.prototype.PMaxVecF64x2;
/** @type {number} */ Binaryen.prototype.CeilVecF64x2;
/** @type {number} */ Binaryen.prototype.FloorVecF64x2;
/** @type {number} */ Binaryen.prototype.TruncVecF64x2;
/** @type {number} */ Binaryen.prototype.NearestVecF64x2;
/** @type {number} */ Binaryen.prototype.ConvertLowSVecI32x4ToVecF64x2;
/** @type {number} */ Binaryen.prototype.ConvertLowUVecI32x4ToVecF64x2;
/** @type {number} */ Binaryen.prototype.PromoteLowVecF32x4ToVecF64x2;

// ---------------------------------------------------------------------------
// SIMD operation constants — special loads
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.Load8SplatVec128;
/** @type {number} */ Binaryen.prototype.Load16SplatVec128;
/** @type {number} */ Binaryen.prototype.Load32SplatVec128;
/** @type {number} */ Binaryen.prototype.Load64SplatVec128;
/** @type {number} */ Binaryen.prototype.Load8x8SVec128;
/** @type {number} */ Binaryen.prototype.Load8x8UVec128;
/** @type {number} */ Binaryen.prototype.Load16x4SVec128;
/** @type {number} */ Binaryen.prototype.Load16x4UVec128;
/** @type {number} */ Binaryen.prototype.Load32x2SVec128;
/** @type {number} */ Binaryen.prototype.Load32x2UVec128;
/** @type {number} */ Binaryen.prototype.Load32ZeroVec128;
/** @type {number} */ Binaryen.prototype.Load64ZeroVec128;

// ---------------------------------------------------------------------------
// SIMD operation constants — lane loads/stores
// ---------------------------------------------------------------------------

/** @type {number} */ Binaryen.prototype.Load8LaneVec128;
/** @type {number} */ Binaryen.prototype.Load16LaneVec128;
/** @type {number} */ Binaryen.prototype.Load32LaneVec128;
/** @type {number} */ Binaryen.prototype.Load64LaneVec128;
/** @type {number} */ Binaryen.prototype.Store8LaneVec128;
/** @type {number} */ Binaryen.prototype.Store16LaneVec128;
/** @type {number} */ Binaryen.prototype.Store32LaneVec128;
/** @type {number} */ Binaryen.prototype.Store64LaneVec128;

// ---------------------------------------------------------------------------
// SIMD expression-mutation sub-APIs
// ---------------------------------------------------------------------------

/** @interface @const */ var BinaryenSIMDExtractApi = function () {};
/** @param {number} ptr @param {number} vec @return {void} */
BinaryenSIMDExtractApi.prototype.setVec = function (ptr, vec) {};
/** @type {!BinaryenSIMDExtractApi} */ Binaryen.prototype.SIMDExtract;

/** @interface @const */ var BinaryenSIMDReplaceApi = function () {};
/** @param {number} ptr @param {number} vec @return {void} */
BinaryenSIMDReplaceApi.prototype.setVec = function (ptr, vec) {};
/** @param {number} ptr @param {number} value @return {void} */
BinaryenSIMDReplaceApi.prototype.setValue = function (ptr, value) {};
/** @type {!BinaryenSIMDReplaceApi} */ Binaryen.prototype.SIMDReplace;

/** @interface @const */ var BinaryenSIMDShuffleApi = function () {};
/** @param {number} ptr @param {number} left @return {void} */
BinaryenSIMDShuffleApi.prototype.setLeft = function (ptr, left) {};
/** @param {number} ptr @param {number} right @return {void} */
BinaryenSIMDShuffleApi.prototype.setRight = function (ptr, right) {};
/** @type {!BinaryenSIMDShuffleApi} */ Binaryen.prototype.SIMDShuffle;

/** @interface @const */ var BinaryenSIMDTernaryApi = function () {};
/** @param {number} ptr @param {number} a @return {void} */
BinaryenSIMDTernaryApi.prototype.setA = function (ptr, a) {};
/** @param {number} ptr @param {number} b @return {void} */
BinaryenSIMDTernaryApi.prototype.setB = function (ptr, b) {};
/** @param {number} ptr @param {number} c @return {void} */
BinaryenSIMDTernaryApi.prototype.setC = function (ptr, c) {};
/** @type {!BinaryenSIMDTernaryApi} */ Binaryen.prototype.SIMDTernary;

/** @interface @const */ var BinaryenSIMDShiftApi = function () {};
/** @param {number} ptr @param {number} vec @return {void} */
BinaryenSIMDShiftApi.prototype.setVec = function (ptr, vec) {};
/** @param {number} ptr @param {number} shift @return {void} */
BinaryenSIMDShiftApi.prototype.setShift = function (ptr, shift) {};
/** @type {!BinaryenSIMDShiftApi} */ Binaryen.prototype.SIMDShift;

/** @interface @const */ var BinaryenSIMDLoadApi = function () {};
/** @param {number} ptr @param {number} ptrExpr @return {void} */
BinaryenSIMDLoadApi.prototype.setPtr = function (ptr, ptrExpr) {};
/** @type {!BinaryenSIMDLoadApi} */ Binaryen.prototype.SIMDLoad;

/** @interface @const */ var BinaryenSIMDLoadStoreLaneApi = function () {};
/** @param {number} ptr @param {number} ptrExpr @return {void} */
BinaryenSIMDLoadStoreLaneApi.prototype.setPtr = function (ptr, ptrExpr) {};
/** @param {number} ptr @param {number} vec @return {void} */
BinaryenSIMDLoadStoreLaneApi.prototype.setVec = function (ptr, vec) {};
/** @type {!BinaryenSIMDLoadStoreLaneApi} */ Binaryen.prototype.SIMDLoadStoreLane;
