'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.CsharpCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  this.exportedMethodVisibility_ = 'public ';
  // C# spellings for the shared class-shell emitter (emitClassCode_).
  this.classDeclPrefix_ = 'public class ';
  this.bufferTypeName_ = 'byte[] ';
  this.importFieldTypeName_ = 'object ';
  this.classLambdaArrow_ = ' => ';
  this.tableEntryRefPrefix_ = 'this.';
  this.tableInvokeOpen_ = '](';
  this.classMemorySizeSuffix_ = '.Length / 65536';
  // C# keeps its existing exception split: unreachable raises
  // System.InvalidOperationException while helpers raise
  // System.ArithmeticException, which the runtime also raises for
  // DivideByZeroException's base cases, so the payload is what separates a
  // failed truncation from an arithmetic trap.
  this.trapThrowOpen_ = 'throw new System.InvalidOperationException(';
  this.helperTrapThrowOpen_ = 'throw new System.ArithmeticException(';
  this.reservedWords_ = Wasm2Lang.Backend.CsharpCodegen.RESERVED_;
  this.preSanitizeRegex_ = /\$/g;
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const */ install = Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_;
  install(
    this.binaryRenderers_,
    Cs.renderArithmeticBinary_,
    Cs.renderMultiplyBinary_,
    Cs.renderDivisionBinary_,
    Cs.renderBitwiseBinary_,
    Cs.renderRotateBinary_,
    Cs.renderComparisonBinary_
  );
  install(
    this.i64BinaryRenderers_,
    Cs.renderArithmeticBinary_,
    Cs.renderMultiplyBinary_,
    Cs.renderI64DivisionBinary_,
    Cs.renderI64BitwiseBinary_,
    Cs.renderI64RotateBinary_,
    Cs.renderI64ComparisonBinary_
  );
};

Wasm2Lang.Backend.CsharpCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.CsharpCodegen.prototype.constructor = Wasm2Lang.Backend.CsharpCodegen;
Wasm2Lang.Backend.registerBackend('csharp', Wasm2Lang.Backend.CsharpCodegen);

/**
 * C# handles i64 natively via {@code long} — no lowering needed.
 *
 * @override
 * @return {boolean}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.needsI64Lowering = function () {
  return false;
};
