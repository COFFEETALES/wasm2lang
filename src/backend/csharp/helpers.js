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
  void scratchByteOffset;
  void scratchWordIndex;
  void scratchQwordIndex;
  void heapPageCount;
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

  // --- Trapping / saturating float→int truncations.

  // prettier-ignore
  h('$w2l_trunc_s_f64_to_i32',
    pad1 + 'static int ' + n('$w2l_trunc_s_f64_to_i32') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) throw new System.ArithmeticException();\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 2147483648.0 || ' + l0 + ' < -2147483648.0) throw new System.ArithmeticException();\n' +
    pad2 + 'return (int)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_u_f64_to_i32',
    pad1 + 'static int ' + n('$w2l_trunc_u_f64_to_i32') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) throw new System.ArithmeticException();\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 4294967296.0 || ' + l0 + ' < 0.0) throw new System.ArithmeticException();\n' +
    pad2 + 'return (int)(uint)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_sat_s_f64_to_i32',
    pad1 + 'static int ' + n('$w2l_trunc_sat_s_f64_to_i32') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) return 0;\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 2147483648.0) return int.MaxValue;\n' +
    pad2 + 'if (' + l0 + ' <= -2147483649.0) return int.MinValue;\n' +
    pad2 + 'return (int)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_sat_u_f64_to_i32',
    pad1 + 'static int ' + n('$w2l_trunc_sat_u_f64_to_i32') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) return 0;\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 4294967296.0) return -1;\n' +
    pad2 + 'if (' + l0 + ' < 0.0) return 0;\n' +
    pad2 + 'return (int)(uint)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_s_f64_to_i64',
    pad1 + 'static long ' + n('$w2l_trunc_s_f64_to_i64') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) throw new System.ArithmeticException();\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 9.223372036854776E18 || ' + l0 + ' < -9.223372036854776E18) throw new System.ArithmeticException();\n' +
    pad2 + 'return (long)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_u_f64_to_i64',
    pad1 + 'static long ' + n('$w2l_trunc_u_f64_to_i64') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) throw new System.ArithmeticException();\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 1.8446744073709552E19 || ' + l0 + ' < 0.0) throw new System.ArithmeticException();\n' +
    pad2 + 'return (long)(ulong)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_sat_s_f64_to_i64',
    pad1 + 'static long ' + n('$w2l_trunc_sat_s_f64_to_i64') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) return 0L;\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 9.223372036854776E18) return long.MaxValue;\n' +
    pad2 + 'if (' + l0 + ' <= -9.223372036854776E18) return long.MinValue;\n' +
    pad2 + 'return (long)' + l0 + ';\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_trunc_sat_u_f64_to_i64',
    pad1 + 'static long ' + n('$w2l_trunc_sat_u_f64_to_i64') + '(double ' + l0 + ') {\n' +
    pad2 + 'if (double.IsNaN(' + l0 + ')) return 0L;\n' +
    pad2 + l0 + ' = System.Math.Truncate(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' >= 1.8446744073709552E19) return -1L;\n' +
    pad2 + 'if (' + l0 + ' < 0.0) return 0L;\n' +
    pad2 + 'return (long)(ulong)' + l0 + ';\n' +
    pad1 + '}');

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
  for (var /** @type {number} */ di = 0; di < F32_DELEGATES.length; ++di) {
    var /** @const {string} */ dName = F32_DELEGATES[di];
    var /** @const {string} */ dTarget = dName.replace('_f32', '_f64');
    var /** @const {string} */ dRet = -1 !== dName.indexOf('_to_i64') ? 'long' : 'int';
    // prettier-ignore
    h(dName,
      pad1 + 'static ' + dRet + ' ' + n(dName) + '(float ' + l0 + ') {\n' +
      pad2 + 'return ' + n(dTarget) + '((double)' + l0 + ');\n' +
      pad1 + '}');
  }

  return lines;
};
