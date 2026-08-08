'use strict';

/**
 * Inter-helper dependencies (opcode-specific helpers only): every f32
 * truncation delegates to its f64 twin.
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.CsharpCodegen.HELPER_DEPS_ = {
  '$w2l_trunc_s_f32_to_i32': ['$w2l_trunc_s_f64_to_i32'],
  '$w2l_trunc_u_f32_to_i32': ['$w2l_trunc_u_f64_to_i32'],
  '$w2l_trunc_sat_s_f32_to_i32': ['$w2l_trunc_sat_s_f64_to_i32'],
  '$w2l_trunc_sat_u_f32_to_i32': ['$w2l_trunc_sat_u_f64_to_i32'],
  '$w2l_trunc_s_f32_to_i64': ['$w2l_trunc_s_f64_to_i64'],
  '$w2l_trunc_u_f32_to_i64': ['$w2l_trunc_u_f64_to_i64'],
  '$w2l_trunc_sat_s_f32_to_i64': ['$w2l_trunc_sat_s_f64_to_i64'],
  '$w2l_trunc_sat_u_f32_to_i64': ['$w2l_trunc_sat_u_f64_to_i64']
};

/** @override @protected @return {?Object<string, !Array<string>>} */
Wasm2Lang.Backend.CsharpCodegen.prototype.getHelperDeps_ = function () {
  return Wasm2Lang.Backend.CsharpCodegen.HELPER_DEPS_;
};

/**
 * Emits only the helpers that were referenced during function body emission.
 * Multi-byte memory access goes through BinaryPrimitives so the emitted code
 * is little-endian on every platform; trapping truncations throw
 * ArithmeticException like the wasm trap; signed remainder special-cases
 * {@code -1} because C# throws on {@code MinValue % -1} where wasm needs 0.
 *
 * @override
 * @protected
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitHelpers_ = function (
  scratchByteOffset,
  scratchWordIndex,
  scratchQwordIndex,
  heapPageCount
) {
  var /** @const {!Array<string>} */ lines = [];

  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ l3 = this.localN_(3);
  var /** @const */ self = this;
  var n = /** @param {string} s @return {string} */ function (s) {
    return self.n_(s);
  };
  var /** @const {string} */ nBuf = this.n_('buffer');
  var /** @const {string} */ bufSpan = 'System.MemoryExtensions.AsSpan(this.' + nBuf + ', ' + l0 + ')';

  // Conditionally emit a helper via the shared emit-or-collect funnel.  C#
  // does not track per-helper bindings, so {@code null} is passed.
  var h = /** @param {string} name @param {string} body */ function (name, body) {
    self.emitOrCollectHelper_(lines, name, null, body);
  };

  // C# evaluates call arguments left-to-right, so these helpers preserve
  // wasm select's eager true/false/condition operand order.
  this.emitSelectHelperFamily_(h, ['i32', 'int', 'i64', 'long', 'f32', 'float', 'f64', 'double'], pad1, pad2);

  // --- Little-endian byte[] load/store helpers (instance — they read the
  // buffer field).  Single-byte accesses index the buffer inline instead.

  // prettier-ignore
  h('$w2l_load_i32',
    pad1 + 'int ' + n('$w2l_load_i32') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Buffers.Binary.BinaryPrimitives.ReadInt32LittleEndian(' + bufSpan + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_load_s16',
    pad1 + 'int ' + n('$w2l_load_s16') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Buffers.Binary.BinaryPrimitives.ReadInt16LittleEndian(' + bufSpan + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_load_u16',
    pad1 + 'int ' + n('$w2l_load_u16') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Buffers.Binary.BinaryPrimitives.ReadUInt16LittleEndian(' + bufSpan + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_load_i64',
    pad1 + 'long ' + n('$w2l_load_i64') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Buffers.Binary.BinaryPrimitives.ReadInt64LittleEndian(' + bufSpan + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_load_f32',
    pad1 + 'float ' + n('$w2l_load_f32') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Buffers.Binary.BinaryPrimitives.ReadSingleLittleEndian(' + bufSpan + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_load_f64',
    pad1 + 'double ' + n('$w2l_load_f64') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Buffers.Binary.BinaryPrimitives.ReadDoubleLittleEndian(' + bufSpan + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_store_i32',
    pad1 + 'void ' + n('$w2l_store_i32') + '(int ' + l0 + ', int ' + l1 + ') {\n' +
    pad2 + 'System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(' + bufSpan + ', ' + l1 + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_store_16',
    pad1 + 'void ' + n('$w2l_store_16') + '(int ' + l0 + ', int ' + l1 + ') {\n' +
    pad2 + 'System.Buffers.Binary.BinaryPrimitives.WriteInt16LittleEndian(' + bufSpan + ', (short)' + l1 + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_store_i64',
    pad1 + 'void ' + n('$w2l_store_i64') + '(int ' + l0 + ', long ' + l1 + ') {\n' +
    pad2 + 'System.Buffers.Binary.BinaryPrimitives.WriteInt64LittleEndian(' + bufSpan + ', ' + l1 + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_store_f32',
    pad1 + 'void ' + n('$w2l_store_f32') + '(int ' + l0 + ', float ' + l1 + ') {\n' +
    pad2 + 'System.Buffers.Binary.BinaryPrimitives.WriteSingleLittleEndian(' + bufSpan + ', ' + l1 + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_store_f64',
    pad1 + 'void ' + n('$w2l_store_f64') + '(int ' + l0 + ', double ' + l1 + ') {\n' +
    pad2 + 'System.Buffers.Binary.BinaryPrimitives.WriteDoubleLittleEndian(' + bufSpan + ', ' + l1 + ');\n' +
    pad1 + '}');

  // --- v128 memory access.  wasm v128 load/store are plain 16-byte copies in
  // memory order with no alignment requirement, so these go through the byte
  // buffer directly rather than through BinaryPrimitives, which has no
  // Vector128 overload.  Create/CopyTo are bit-preserving, so no lane
  // interpretation happens here — that belongs to the operations.

  // prettier-ignore
  h('$w2l_v128_load',
    pad1 + Wasm2Lang.Backend.CsharpCodegen.V128_TYPE_ + ' ' + n('$w2l_v128_load') + '(int ' + l0 + ') {\n' +
    pad2 + 'return System.Runtime.Intrinsics.Vector128.Create<byte>(' +
      'System.MemoryExtensions.AsSpan(this.' + nBuf + ', ' + l0 + ', 16));\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_v128_store',
    pad1 + 'void ' + n('$w2l_v128_store') + '(int ' + l0 + ', ' +
      Wasm2Lang.Backend.CsharpCodegen.V128_TYPE_ + ' ' + l1 + ') {\n' +
    pad2 + 'System.Runtime.Intrinsics.Vector128.CopyTo(' + l1 +
      ', System.MemoryExtensions.AsSpan(this.' + nBuf + ', ' + l0 + ', 16));\n' +
    pad1 + '}');

  // --- Signed remainder: wasm rem_s(MIN, -1) is 0; C# '%' would throw.

  // prettier-ignore
  h('$w2l_rem_i32',
    pad1 + 'static int ' + n('$w2l_rem_i32') + '(int ' + l0 + ', int ' + l1 + ') {\n' +
    pad2 + 'return ' + l1 + ' == -1 ? 0 : ' + l0 + ' % ' + l1 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_rem_i64',
    pad1 + 'static long ' + n('$w2l_rem_i64') + '(long ' + l0 + ', long ' + l1 + ') {\n' +
    pad2 + 'return ' + l1 + ' == -1L ? 0L : ' + l0 + ' % ' + l1 + ';\n' +
    pad1 + '}');

  // --- Trapping / saturating float→int truncations (shared with Java; the
  // C# spellings live in the trunc* hook overrides below emitHelpers_).

  this.emitTruncF64HelperFamily_(h, pad1, pad2, 'i32');
  this.emitTruncF64HelperFamily_(h, pad1, pad2, 'i64');

  // --- Bulk memory ops.

  // prettier-ignore
  h('$w2l_memory_fill',
    pad1 + 'static void ' + n('$w2l_memory_fill') +
      '(byte[] ' + l0 + ', int ' + l1 + ', int ' + l2 + ', int ' + l3 + ') {\n' +
    pad2 + 'System.MemoryExtensions.AsSpan(' + l0 + ', ' + l1 + ', ' + l3 + ').Fill((byte)' + l2 + ');\n' +
    pad1 + '}');

  // memory.copy must behave like memmove — Array.Copy handles overlap.
  // prettier-ignore
  h('$w2l_memory_copy',
    pad1 + 'static void ' + n('$w2l_memory_copy') +
      '(byte[] ' + l0 + ', int ' + l1 + ', int ' + l2 + ', int ' + l3 + ') {\n' +
    pad2 + 'System.Array.Copy(' + l0 + ', ' + l2 + ', ' + l0 + ', ' + l1 + ', ' + l3 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_memory_grow',
    pad1 + 'int ' + n('$w2l_memory_grow') + '(int ' + l0 + ') {\n' +
    pad2 + 'int ' + l1 + ' = this.' + nBuf + '.Length / 65536;\n' +
    pad2 + 'if (' + l0 + ' == 0) return ' + l1 + ';\n' +
    pad2 + 'return -1;\n' +
    pad1 + '}');

  // f32→f64 delegation stubs: all follow the same widen-and-delegate pattern.
  var /** @const {!Array<string>} */ F32_DELEGATES = [
      '$w2l_trunc_s_f32_to_i32',
      '$w2l_trunc_u_f32_to_i32',
      '$w2l_trunc_sat_s_f32_to_i32',
      '$w2l_trunc_sat_u_f32_to_i32',
      '$w2l_trunc_s_f32_to_i64',
      '$w2l_trunc_u_f32_to_i64',
      '$w2l_trunc_sat_s_f32_to_i64',
      '$w2l_trunc_sat_u_f32_to_i64'
    ];
  this.emitF32DelegateFamily_(h, F32_DELEGATES, pad1, pad2);

  // --- SIMD ops whose formula needs an operand more than once.
  //
  // These are helpers rather than inline expressions for a correctness reason,
  // not a tidiness one: the emitter produces an expression, so repeating an
  // operand repeats whatever computed it.  Measured on a call-valued operand,
  // the inline form of avgr_u emitted the call FOUR times where wasm evaluates
  // it twice.  A parameter evaluates its argument exactly once, which is the
  // only construct available here — C# has no expression-level binding.
  //
  // Registered last so the encoder slots of every pre-existing key are
  // unchanged, and only pulled into the mangler roster when actually marked
  // (see the lastEmitUsedHelpers_ publication in emit_code.js).
  // Hardcoded parameter names, NOT localN_ values.  These bodies declare
  // temporaries of their own (v, lo, hi, ev, od), and the mangler's local pool
  // hands out single characters first — so a body that mixes the two schemes
  // emits `static V X(V v) { var v = v; ... }` the moment the pool assigns `v`
  // to slot 0.  That is CS0136 and does not compile; it is what the dense SIMD
  // fixture produced under the suite's own mangler key on 2026-08-02, and no
  // other key in the suite revealed it.  With every name in the body hardcoded,
  // the pool's contents cannot reach it.  p/q/c collide with no temporary here.
  this.emitSIMDDuplicatingHelpers_(h, n, pad1, pad2, 'p', 'q');
  this.emitSIMDMemoryHelpers_(h, n, pad1, pad2, 'p', 'q', 'c');

  return lines;
};

/**
 * @override
 * @protected
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.truncNanCheckOpen_ = function () {
  return 'double.IsNaN(';
};

/**
 * C# has {@code System.Math.Truncate}, so unlike Java no {@code $w2l_trunc_f64}
 * helper is involved (and none exists in this backend's roster).
 *
 * @override
 * @protected
 * @param {string} operandExpr
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderTruncF64Ref_ = function (operandExpr) {
  return 'System.Math.Truncate(' + operandExpr + ')';
};

/**
 * @override
 * @protected
 * @param {string} suffix
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.truncSatMaxLit_ = function (suffix) {
  return 'i32' === suffix ? 'int.MaxValue' : 'long.MaxValue';
};

/**
 * @override
 * @protected
 * @param {string} suffix
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.truncSatMinLit_ = function (suffix) {
  return 'i32' === suffix ? 'int.MinValue' : 'long.MinValue';
};

/**
 * C# has unsigned primitives, so the in-range unsigned result is a single
 * cast through the unsigned type — no wrap branch needed.
 *
 * @override
 * @protected
 * @param {string} suffix
 * @param {string} pad2
 * @param {string} l0
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.renderTruncUnsignedTail_ = function (suffix, pad2, l0) {
  return pad2 + 'return ' + ('i32' === suffix ? '(int)(uint)' : '(long)(ulong)') + l0 + ';\n';
};

/**
 * Emits the SIMDLoad and SIMDLoadStoreLane helpers.
 *
 * None of these is a plain 16-byte v128 load.  Each reads FEWER than 16 bytes
 * and then splats, sign/zero-extends or zero-fills, or touches a single lane —
 * so rendering any of them as a full-width load returns the wrong 16 bytes,
 * which is what both backends did until 2026-08-02.  The lane index is a
 * parameter rather than baked into the name: {@code WithElement} and
 * {@code GetElement} accept a runtime index, and one helper per (op, lane)
 * pair would be up to sixteen times the roster for no benefit.
 *
 * @protected
 * @param {function(string, string): void} h
 * @param {function(string): string} n
 * @param {string} pad1
 * @param {string} pad2
 * @param {string} l0
 * @param {string} l1
 * @param {string} l2
 * @return {void}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitSIMDMemoryHelpers_ = function (h, n, pad1, pad2, l0, l1, l2) {
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const {string} */ V = 'System.Runtime.Intrinsics.Vector128';
  var /** @const {string} */ T = Cs.V128_TYPE_;
  var /** @const {string} */ BP = 'System.Buffers.Binary.BinaryPrimitives';
  var /** @const {string} */ nBuf = this.n_('buffer');
  var span = /** @param {string} len @return {string} */ function (len) {
    return 'System.MemoryExtensions.AsSpan(this.' + nBuf + ', ' + l0 + ', ' + len + ')';
  };

  // Splat loads: read one element and broadcast it at its OWN width.
  var /** @const {!Array<!Array<string>>} */ SPLAT = [
      ['load8_splat', 'this.' + nBuf + '[' + l0 + ']'],
      ['load16_splat', BP + '.ReadUInt16LittleEndian(' + span('2') + ')'],
      ['load32_splat', BP + '.ReadInt32LittleEndian(' + span('4') + ')'],
      ['load64_splat', BP + '.ReadInt64LittleEndian(' + span('8') + ')']
    ];
  for (var si = 0; si !== SPLAT.length; ++si) {
    var /** @const {string} */ spName = '$w2l_v128_' + SPLAT[si][0];
    // prettier-ignore
    h(spName,
      pad1 + T + ' ' + n(spName) + '(int ' + l0 + ') {\n' +
      pad2 + 'return ' + V + '.AsByte(' + V + '.Create(' + SPLAT[si][1] + '));\n' +
      pad1 + '}');
  }

  // Extending loads: read 8 bytes and widen each element to double its width.
  // CreateScalar puts those 8 bytes in the low half and zeroes the rest, so
  // WidenLower reads exactly the elements wasm specifies and never touches
  // memory past the eight bytes the instruction is defined to read.
  var /** @const {!Array<!Array<string>>} */ EXTLOAD = [
      ['load8x8_s', 'AsSByte'],
      ['load8x8_u', 'AsByte'],
      ['load16x4_s', 'AsInt16'],
      ['load16x4_u', 'AsUInt16'],
      ['load32x2_s', 'AsInt32'],
      ['load32x2_u', 'AsUInt32']
    ];
  for (var xi = 0; xi !== EXTLOAD.length; ++xi) {
    var /** @const {string} */ xName = '$w2l_v128_' + EXTLOAD[xi][0];
    // prettier-ignore
    h(xName,
      pad1 + T + ' ' + n(xName) + '(int ' + l0 + ') {\n' +
      pad2 + 'return ' + V + '.AsByte(' + V + '.WidenLower(' + V + '.' + EXTLOAD[xi][1] + '(' +
        V + '.CreateScalar(' + BP + '.ReadInt64LittleEndian(' + span('8') + ')))));\n' +
      pad1 + '}');
  }

  // Zero-extending scalar loads: one element into lane 0, every other lane zero.
  var /** @const {!Array<!Array<string>>} */ ZEROLOAD = [
      ['load32_zero', BP + '.ReadInt32LittleEndian(' + span('4') + ')'],
      ['load64_zero', BP + '.ReadInt64LittleEndian(' + span('8') + ')']
    ];
  for (var zi = 0; zi !== ZEROLOAD.length; ++zi) {
    var /** @const {string} */ zName = '$w2l_v128_' + ZEROLOAD[zi][0];
    // prettier-ignore
    h(zName,
      pad1 + T + ' ' + n(zName) + '(int ' + l0 + ') {\n' +
      pad2 + 'return ' + V + '.AsByte(' + V + '.CreateScalar(' + ZEROLOAD[zi][1] + '));\n' +
      pad1 + '}');
  }

  // Lane load/store: only the named lane is read or written, at the lane's own
  // width.  A fixed 32-bit lane — which is what this backend used to assume —
  // is wrong for three of the four widths, in both the index it applies and the
  // number of bytes it moves.
  var /** @const {!Array<!Array<string>>} */ LANEOPS = [
      ['8', 'AsByte', 'byte', 'this.' + nBuf + '[' + l0 + ']', 'this.' + nBuf + '[' + l0 + '] = '],
      [
        '16',
        'AsUInt16',
        'ushort',
        BP + '.ReadUInt16LittleEndian(' + span('2') + ')',
        BP + '.WriteUInt16LittleEndian(' + span('2') + ', '
      ],
      [
        '32',
        'AsInt32',
        'int',
        BP + '.ReadInt32LittleEndian(' + span('4') + ')',
        BP + '.WriteInt32LittleEndian(' + span('4') + ', '
      ],
      [
        '64',
        'AsInt64',
        'long',
        BP + '.ReadInt64LittleEndian(' + span('8') + ')',
        BP + '.WriteInt64LittleEndian(' + span('8') + ', '
      ]
    ];
  for (var li = 0; li !== LANEOPS.length; ++li) {
    var /** @const {string} */ lWidth = LANEOPS[li][0];
    var /** @const {string} */ lView = LANEOPS[li][1];
    var /** @const {string} */ lElem = LANEOPS[li][2];
    var /** @const {string} */ lRead = LANEOPS[li][3];
    var /** @const {string} */ lWrite = LANEOPS[li][4];
    var /** @const {string} */ ldName = '$w2l_v128_load' + lWidth + '_lane';
    // prettier-ignore
    h(ldName,
      pad1 + T + ' ' + n(ldName) + '(int ' + l0 + ', ' + T + ' ' + l1 + ', int ' + l2 + ') {\n' +
      pad2 + 'return ' + V + '.AsByte(' + V + '.WithElement(' + V + '.' + lView + '(' + l1 + '), ' +
        l2 + ', (' + lElem + ')' + lRead + '));\n' +
      pad1 + '}');
    var /** @const {string} */ stName = '$w2l_v128_store' + lWidth + '_lane';
    var /** @const {string} */ stValue = V + '.GetElement(' + V + '.' + lView + '(' + l1 + '), ' + l2 + ')';
    // prettier-ignore
    h(stName,
      pad1 + 'void ' + n(stName) + '(int ' + l0 + ', ' + T + ' ' + l1 + ', int ' + l2 + ') {\n' +
      pad2 + ('8' === lWidth ? lWrite + stValue + ';' : lWrite + stValue + ');') + '\n' +
      pad1 + '}');
  }

  return;
};

/**
 * Emits the SIMD helpers whose bodies reference a parameter more than once.
 *
 * Split out of {@code emitHelpers_} only for length; the call site is at the
 * end of the roster and must stay there, because
 * {@code precomputeMangledNames_} assigns encoder slots positionally over the
 * order this file registers them in.
 *
 * @protected
 * @param {function(string, string): void} h
 * @param {function(string): string} n
 * @param {string} pad1
 * @param {string} pad2
 * @param {string} l0
 * @param {string} l1
 * @return {void}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitSIMDDuplicatingHelpers_ = function (h, n, pad1, pad2, l0, l1) {
  var /** @const */ Cs = Wasm2Lang.Backend.CsharpCodegen;
  var /** @const {string} */ V = 'System.Runtime.Intrinsics.Vector128';
  var /** @const {string} */ T = Cs.V128_TYPE_;
  var /** @const {!Array<string>} */ INT_LANES = ['i8x16', 'i16x8', 'i32x4', 'i64x2'];
  var /** @const {!Array<string>} */ FLOAT_LANES = ['f32x4', 'f64x2'];

  // avgr_u: (a | b) - ((a ^ b) >>> 1).  Exact for every unsigned lane width and
  // free of the overflow a widening average would need.
  for (var ai = 0; ai !== INT_LANES.length; ++ai) {
    var /** @const {string} */ aLane = INT_LANES[ai];
    var /** @const {string} */ aName = '$w2l_v128_avgr_u_' + aLane;
    var /** @const {string} */ av0 = Cs.laneView_(l0, aLane, true);
    var /** @const {string} */ av1 = Cs.laneView_(l1, aLane, true);
    // prettier-ignore
    h(aName,
      pad1 + 'static ' + T + ' ' + n(aName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
      pad2 + 'return ' + Cs.toCarrier_(
        V + '.Subtract(' + V + '.BitwiseOr(' + av0 + ', ' + av1 + '), ' +
        V + '.ShiftRightLogical(' + V + '.Xor(' + av0 + ', ' + av1 + '), 1))') + ';\n' +
      pad1 + '}');
  }

  // pmin/pmax are NOT Min/Max: wasm defines pmin as "b < a ? b : a" and pmax as
  // "a < b ? b : a", which propagates the SECOND operand when either side is
  // NaN.  Min/Max would canonicalize NaN instead.
  for (var pi = 0; pi !== FLOAT_LANES.length; ++pi) {
    var /** @const {string} */ pLane = FLOAT_LANES[pi];
    var /** @const {string} */ pv0 = Cs.laneView_(l0, pLane, false);
    var /** @const {string} */ pv1 = Cs.laneView_(l1, pLane, false);
    for (var pk = 0; pk !== 2; ++pk) {
      var /** @const {boolean} */ isMin = 0 === pk;
      var /** @const {string} */ pName = '$w2l_v128_' + (isMin ? 'pmin_' : 'pmax_') + pLane;
      var /** @const {string} */ pCmp = isMin
          ? V + '.LessThan(' + pv1 + ', ' + pv0 + ')'
          : V + '.LessThan(' + pv0 + ', ' + pv1 + ')';
      // prettier-ignore
      h(pName,
        pad1 + 'static ' + T + ' ' + n(pName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
        pad2 + 'return ' + Cs.toCarrier_(
          V + '.ConditionalSelect(' + pCmp + ', ' + pv1 + ', ' + pv0 + ')') + ';\n' +
        pad1 + '}');
    }
  }

  // popcnt: .NET exposes no Vector128.PopCount (checked on 10.0.9), so this is
  // the classic byte-wise SWAR reduction.  Each step needs its input twice,
  // which is exactly why it cannot be an expression.
  //
  // The working temporary is the hardcoded second name ('q', the l1 the call
  // site passes), drawn from the same fixed p/q set as the parameters — NOT a
  // name from the mangler's local pool.  It used to be literally `v`, and the
  // pool hands out single characters first — so the moment it assigned `v` to
  // slot 0 this emitted `static V X(V v) { var v = v; ... }`, which is CS0136
  // and does not compile.  That is not hypothetical: it is what the dense SIMD
  // fixture produced under the suite's own mangler key on 2026-08-02.  A helper
  // body must keep every name it declares out of the pool's reach, which the
  // hardcoded-names scheme documented at the emitHelpers_ call site guarantees.
  var /** @const {string} */ pcName = '$w2l_v128_popcnt_i8x16';
  // prettier-ignore
  h(pcName,
    pad1 + 'static ' + T + ' ' + n(pcName) + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'var ' + l1 + ' = ' + l0 + ';\n' +
    pad2 + l1 + ' = ' + V + '.Subtract(' + l1 + ', ' + V + '.BitwiseAnd(' + V + '.ShiftRightLogical(' + l1 + ', 1), ' +
      V + '.Create((byte)0x55)));\n' +
    pad2 + l1 + ' = ' + V + '.Add(' + V + '.BitwiseAnd(' + l1 + ', ' + V + '.Create((byte)0x33)), ' +
      V + '.BitwiseAnd(' + V + '.ShiftRightLogical(' + l1 + ', 2), ' + V + '.Create((byte)0x33)));\n' +
    pad2 + 'return ' + V + '.BitwiseAnd(' + V + '.Add(' + l1 + ', ' + V + '.ShiftRightLogical(' + l1 + ', 4)), ' +
      V + '.Create((byte)0x0F));\n' +
    pad1 + '}');

  // extadd_pairwise sums ADJACENT lanes into one of double the width.  Widening
  // halves would pair lanes 0..n/2 with n/2..n, which is a different pairing, so
  // the even and odd lanes are separated by shifting within the wide view: the
  // even lane is the low half of each wide lane, the odd lane the high half.
  // The signed form must sign-extend both, hence the left-then-arithmetic-right
  // shift for the even lane.
  var /** @const {!Array<!Array<string>>} */ EXTADD = [
      ['i16x8', 'short', '8'],
      ['i32x4', 'int', '16']
    ];
  for (var ei = 0; ei !== EXTADD.length; ++ei) {
    var /** @const {string} */ eLane = EXTADD[ei][0];
    var /** @const {string} */ eElem = EXTADD[ei][1];
    var /** @const {string} */ eSh = EXTADD[ei][2];
    for (var es = 0; es !== 2; ++es) {
      var /** @const {boolean} */ eSigned = 0 === es;
      var /** @const {string} */ eName = '$w2l_v128_extadd_pairwise_' + (eSigned ? 's_' : 'u_') + eLane;
      // Both variants compute in the SIGNED wide view.  Using the unsigned view
      // for the _u form would force every mask literal to the unsigned element
      // type too, and a `(short)` mask against a Vector128<ushort> fails type
      // inference (CS0411).  The bit patterns are identical either way; what
      // distinguishes the variants is the shift kind and the mask, below.
      var /** @const {string} */ eView = Cs.laneView_('v', eLane, false);
      var /** @const {string} */ eEven = eSigned
          ? V + '.ShiftRightArithmetic(' + V + '.ShiftLeft(' + eView + ', ' + eSh + '), ' + eSh + ')'
          : V + '.BitwiseAnd(' + eView + ', ' + V + '.Create((' + eElem + ')' + ('8' === eSh ? '0xFF' : '0xFFFF') + '))';
      var /** @const {string} */ eOdd = eSigned
          ? V + '.ShiftRightArithmetic(' + eView + ', ' + eSh + ')'
          : V + '.ShiftRightLogical(' + eView + ', ' + eSh + ')';
      // prettier-ignore
      h(eName,
        pad1 + 'static ' + T + ' ' + n(eName) + '(' + T + ' ' + l0 + ') {\n' +
        pad2 + 'var v = ' + l0 + ';\n' +
        pad2 + 'return ' + Cs.toCarrier_(V + '.Add(' + eEven + ', ' + eOdd + ')') + ';\n' +
        pad1 + '}');
    }
  }

  // dot_s multiplies i16 lanes pairwise into i32 and sums ADJACENT products:
  // result[k] = a[2k]*b[2k] + a[2k+1]*b[2k+1].  Vector128.Dot is a horizontal
  // sum over the whole vector returning a scalar, which is a different
  // operation entirely, so this is built from the widening multiplies.  The
  // even/odd gather relies on Shuffle yielding zero for an out-of-range index,
  // which is why the two halves can simply be added together.
  var /** @const {string} */ dotName = '$w2l_v128_dot_s_i32x4';
  var /** @const {string} */ dA = Cs.laneView_(l0, 'i16x8', false);
  var /** @const {string} */ dB = Cs.laneView_(l1, 'i16x8', false);
  // prettier-ignore
  h(dotName,
    pad1 + 'static ' + T + ' ' + n(dotName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
    pad2 + 'var lo = ' + V + '.Multiply(' + V + '.WidenLower(' + dA + '), ' + V + '.WidenLower(' + dB + '));\n' +
    pad2 + 'var hi = ' + V + '.Multiply(' + V + '.WidenUpper(' + dA + '), ' + V + '.WidenUpper(' + dB + '));\n' +
    pad2 + 'var ev = ' + V + '.Add(' + V + '.Shuffle(lo, ' + V + '.Create(0, 2, 4, 4)), ' +
      V + '.Shuffle(hi, ' + V + '.Create(4, 4, 0, 2)));\n' +
    pad2 + 'var od = ' + V + '.Add(' + V + '.Shuffle(lo, ' + V + '.Create(1, 3, 4, 4)), ' +
      V + '.Shuffle(hi, ' + V + '.Create(4, 4, 1, 3)));\n' +
    pad2 + 'return ' + V + '.AsByte(' + V + '.Add(ev, od));\n' +
    pad1 + '}');

  // q15mulr_sat_s: saturate_i16((a*b + 0x4000) >> 15).  The intermediate needs
  // 32 bits — at a = b = -32768 the shifted value is 32768, one past the signed
  // i16 maximum, which is exactly the case the saturation exists for.
  var /** @const {string} */ qName = '$w2l_v128_q15mulr_sat_s_i16x8';
  var q = /** @param {string} half @return {string} */ function (half) {
    return (
      V +
      '.ShiftRightArithmetic(' +
      V +
      '.Add(' +
      V +
      '.Multiply(' +
      V +
      '.' +
      half +
      '(' +
      dA +
      '), ' +
      V +
      '.' +
      half +
      '(' +
      dB +
      ')), ' +
      V +
      '.Create(0x4000)), 15)'
    );
  };
  // prettier-ignore
  h(qName,
    pad1 + 'static ' + T + ' ' + n(qName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
    pad2 + 'return ' + V + '.AsByte(' + V + '.NarrowWithSaturation(' +
      q('WidenLower') + ', ' + q('WidenUpper') + '));\n' +
    pad1 + '}');

  return;
};
