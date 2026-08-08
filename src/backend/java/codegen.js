'use strict';

/**
 * @constructor
 * @extends {Wasm2Lang.Backend.AbstractCodegen}
 */
Wasm2Lang.Backend.JavaCodegen = function () {
  Wasm2Lang.Backend.AbstractCodegen.call(this);
  this.f32WidensToF64_ = true;
  this.reservedWords_ = Wasm2Lang.Backend.JavaCodegen.RESERVED_;
  // Java spellings for the shared class-shell emitter (emitClassCode_).
  this.classDeclPrefix_ = 'class ';
  this.bufferTypeName_ = 'java.nio.ByteBuffer ';
  this.importFieldTypeName_ = 'Object ';
  this.classLambdaArrow_ = ' -> ';
  this.tableEntryRefPrefix_ = 'this::';
  this.tableInvokeOpen_ = '].call(';
  this.classMemorySizeSuffix_ = '.capacity() / 65536';
  // Java raises ArithmeticException both for a failed truncation and for a
  // division by zero, so without a payload a host genuinely cannot tell the
  // two apart.  That ambiguity is the reason --trap-sites exists.
  this.trapThrowOpen_ = 'throw new ArithmeticException(';
  this.helperTrapThrowOpen_ = 'throw new ArithmeticException(';
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  var /** @const */ install = Wasm2Lang.Backend.AbstractCodegen.installBinaryRenderers_;
  install(
    this.binaryRenderers_,
    J.renderArithmeticBinary_,
    J.renderMultiplyBinary_,
    J.renderDivisionBinary_,
    J.renderBitwiseBinary_,
    J.renderRotateBinary_,
    J.renderComparisonBinary_
  );
  install(
    this.i64BinaryRenderers_,
    J.renderArithmeticBinary_,
    J.renderMultiplyBinary_,
    J.renderI64DivisionBinary_,
    J.renderBitwiseBinary_,
    J.renderI64RotateBinary_,
    J.renderI64ComparisonBinary_
  );
};

Wasm2Lang.Backend.JavaCodegen.prototype = Object.create(Wasm2Lang.Backend.AbstractCodegen.prototype);
Wasm2Lang.Backend.JavaCodegen.prototype.constructor = Wasm2Lang.Backend.JavaCodegen;
Wasm2Lang.Backend.registerBackend('java', Wasm2Lang.Backend.JavaCodegen);

/**
 * Java handles i64 natively via {@code long} — no lowering needed.
 *
 * @override
 * @return {boolean}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.needsI64Lowering = function () {
  return false;
};
