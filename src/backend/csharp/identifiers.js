'use strict';

// ---------------------------------------------------------------------------
// Mangler integration and naming.
//
// C# identifiers cannot contain {@code $}, which the shared module-binding
// keys ({@code $g_*}, {@code $if_*}, {@code $w2l_*}, {@code $ftable_*}) and
// the unmangled label/local fallbacks all use.  The overrides below map every
// {@code $} to {@code _} on the unmangled path; the mangled path is already
// {@code $}-free because the csharp mangler profile's charsets exclude it.
// ---------------------------------------------------------------------------

/**
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.getFixedModuleBindings_ = function (options) {
  return ['buffer'];
};

/**
 * The {@code buffer} field appears in {@code this.buffer[...]} and load/store
 * helper bodies for every memory access, so promote it to the hot tier.
 *
 * @override
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.getHotModuleBindings_ = function (options) {
  return ['buffer'];
};

/**
 * @override
 * @protected
 * @param {string} originalName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.n_ = function (originalName) {
  if (this.mangler_) {
    return this.mangler_.mn(originalName);
  }
  return Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(originalName).replace(/\$/g, '_');
};

/**
 * @override
 * @protected
 * @param {number} index
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.localN_ = function (index) {
  if (this.mangler_) {
    return this.mangler_.ln(index);
  }
  return 'l' + index;
};

/**
 * @override
 * @protected
 * @param {!Object<string, number>} labelMap
 * @param {string} binaryenName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.labelN_ = function (labelMap, binaryenName) {
  if (!this.mangler_) {
    return Wasm2Lang.Backend.AbstractCodegen.safeIdentifier_(binaryenName).replace(/\$/g, '_');
  }
  return Wasm2Lang.Backend.AbstractCodegen.prototype.labelN_.call(this, labelMap, binaryenName);
};

/**
 * Returns the exit-label name for a break target.  C# has no labeled
 * {@code break}, so every labeled break becomes a {@code goto} to a label
 * placed AFTER the construct; loop labels stay continue-targets at the
 * construct head.  The exit label gets its own label-pool slot via a
 * NUL-separated derived key (binaryen names cannot contain NUL).
 *
 * @protected
 * @param {!Object<string, number>} labelMap
 * @param {string} binaryenName
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.csExitLabelN_ = function (labelMap, binaryenName) {
  if (!this.mangler_) {
    return this.labelN_(labelMap, binaryenName) + '_brk';
  }
  return this.labelN_(labelMap, binaryenName + '\u0000brk');
};

/**
 * C# allocates up to two label-pool slots per wasm label (continue target
 * plus exit target), so the local pool must cover twice the label count.
 *
 * @override
 * @protected
 * @param {!BinaryenModule} wasmModule
 * @param {!Binaryen} binaryen
 * @param {!BinaryenFunctionInfo} funcInfo
 * @return {number}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.countFunctionLabels_ = function (wasmModule, binaryen, funcInfo) {
  return 2 * Wasm2Lang.Backend.AbstractCodegen.prototype.countFunctionLabels_.call(this, wasmModule, binaryen, funcInfo);
};

/**
 * Maps a wasm value type to a C# type name.
 *
 * @param {!Binaryen} binaryen
 * @param {number} wasmType
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.csharpTypeName_ = function (binaryen, wasmType) {
  if (Wasm2Lang.Backend.ValueType.isI32(binaryen, wasmType)) return 'int';
  if (Wasm2Lang.Backend.ValueType.isI64(binaryen, wasmType)) return 'long';
  if (Wasm2Lang.Backend.ValueType.isF32(binaryen, wasmType)) return 'float';
  if (Wasm2Lang.Backend.ValueType.isF64(binaryen, wasmType)) return 'double';
  if (Wasm2Lang.Backend.ValueType.isV128(binaryen, wasmType)) {
    return Wasm2Lang.Backend.CsharpCodegen.V128_TYPE_;
  }
  return 'void';
};

/**
 * Carrier type for a wasm {@code v128}.
 *
 * wasm v128 is 128 untyped bits that each instruction reinterprets as its own
 * lane geometry, so the carrier is the byte view and every op reinterprets
 * into the lane type it needs via {@code As*()} — which is free, it is a
 * bit-preserving view change.  Picking one fixed lane width as the carrier is
 * what made the Java backend wrong: it carried everything as 4x32 and never
 * reinterpreted, so byte and float ops operated on the wrong lanes.
 *
 * Fully qualified because the emitted compilation unit deliberately carries no
 * using directives (see emitCode), so code and metadata stay concatenation-safe.
 *
 * @const {string}
 */
Wasm2Lang.Backend.CsharpCodegen.V128_TYPE_ = 'System.Runtime.Intrinsics.Vector128<byte>';

/**
 * Open form of the carrier type, for naming {@code Vector128<T>.Zero} in a lane
 * view other than the carrier's.  Kept beside {@code V128_TYPE_} so the fully
 * qualified name exists once; the two must not drift.
 *
 * @const {string}
 */
Wasm2Lang.Backend.CsharpCodegen.V128_OF_ = 'System.Runtime.Intrinsics.Vector128<';

/**
 * Formats a float literal for C# (appends {@code f} suffix for f32).
 *
 * NaN must be bit-exact: .NET's {@code double.NaN} carries the raw pattern
 * 0xFFF8000000000000 (sign bit set), while wasm/JS canonical NaN is
 * 0x7FF8000000000000 — a raw-bit memory store of {@code double.NaN} would
 * diverge from the wasm oracle, so NaN renders through BitConverter.
 *
 * @param {number} value
 * @param {boolean} isF32
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.formatCsharpFloat_ = function (value, isF32) {
  if (value !== value) {
    return isF32
      ? 'System.BitConverter.Int32BitsToSingle(0x7FC00000)'
      : 'System.BitConverter.Int64BitsToDouble(0x7FF8000000000000L)';
  }
  if (!isFinite(value)) {
    return (isF32 ? 'float.' : 'double.') + (0 < value ? 'PositiveInfinity' : 'NegativeInfinity');
  }
  var /** @const {string} */ s = Wasm2Lang.Backend.AbstractCodegen.formatFloatLiteral_(value);
  return isF32 ? s + 'f' : s;
};
