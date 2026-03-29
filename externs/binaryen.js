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
 * @type {(number|undefined)}
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
