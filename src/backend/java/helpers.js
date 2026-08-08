'use strict';

/**
 * Inter-helper dependencies (opcode-specific helpers only).
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.JavaCodegen.HELPER_DEPS_ = {
  '$w2l_trunc_f32': ['$w2l_trunc_f64'],
  '$w2l_trunc_s_f32_to_i32': ['$w2l_trunc_s_f64_to_i32'],
  '$w2l_trunc_s_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_u_f32_to_i32': ['$w2l_trunc_u_f64_to_i32'],
  '$w2l_trunc_u_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_s_f32_to_i32': ['$w2l_trunc_sat_s_f64_to_i32'],
  '$w2l_trunc_sat_s_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_u_f32_to_i32': ['$w2l_trunc_sat_u_f64_to_i32'],
  '$w2l_trunc_sat_u_f64_to_i32': ['$w2l_trunc_f64'],
  '$w2l_trunc_s_f32_to_i64': ['$w2l_trunc_s_f64_to_i64'],
  '$w2l_trunc_s_f64_to_i64': ['$w2l_trunc_f64'],
  '$w2l_trunc_u_f32_to_i64': ['$w2l_trunc_u_f64_to_i64'],
  '$w2l_trunc_u_f64_to_i64': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_s_f32_to_i64': ['$w2l_trunc_sat_s_f64_to_i64'],
  '$w2l_trunc_sat_s_f64_to_i64': ['$w2l_trunc_f64'],
  '$w2l_trunc_sat_u_f32_to_i64': ['$w2l_trunc_sat_u_f64_to_i64'],
  '$w2l_trunc_sat_u_f64_to_i64': ['$w2l_trunc_f64']
};

/** @override @protected @return {?Object<string, !Array<string>>} */
Wasm2Lang.Backend.JavaCodegen.prototype.getHelperDeps_ = function () {
  return Wasm2Lang.Backend.JavaCodegen.HELPER_DEPS_;
};

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @override
 * @protected
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitHelpers_ = function (
  scratchByteOffset,
  scratchWordIndex,
  scratchQwordIndex,
  heapPageCount
) {
  var /** @const {!Array<string>} */ lines = [];

  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {string} */ pad3 = pad(3);
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ l3 = this.localN_(3);
  var /** @const */ self = this;
  var n = /** @param {string} s @return {string} */ function (s) {
    return self.n_(s);
  };

  // Conditionally emit a helper via the shared emit-or-collect funnel.
  // v128 helpers also own the Vector API import dependency so modules whose
  // only SIMD instructions are ordinary v128.load/store still compile.
  var h = /** @param {string} name @param {string} body */ function (name, body) {
    var /** @const {?Array<string>} */ bindings =
        '$w2l_select_v128' === name || '$w2l_v128_load' === name || '$w2l_v128_store' === name || '$w2l_v128_copy' === name
          ? ['$v128']
          : null;
    self.emitOrCollectHelper_(lines, name, bindings, body);
  };

  // Java evaluates call arguments left-to-right, so these helpers preserve
  // wasm select's eager true/false/condition operand order.
  this.emitSelectHelperFamily_(
    h,
    ['i32', 'int', 'i64', 'long', 'f32', 'float', 'f64', 'double', 'v128', 'IntVector'],
    pad1,
    pad2
  );

  // prettier-ignore
  h('$w2l_trunc_f64',
    pad1 + 'static double ' + n('$w2l_trunc_f64') + '(double ' + l0 + ') {\n' +
    pad2 + 'return ' + l0 + ' < 0.0 ? Math.ceil(' + l0 + ') : Math.floor(' + l0 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_nearest_f64',
    pad1 + 'static double ' + n('$w2l_nearest_f64') + '(double ' + l0 + ') {\n' +
    pad2 + 'return Math.rint(' + l0 + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_nearest_f32',
    pad1 + 'static float ' + n('$w2l_nearest_f32') + '(float ' + l0 + ') {\n' +
    pad2 + 'return (float)Math.rint((double)' + l0 + ');\n' +
    pad1 + '}');

  // Trapping / saturating f64→i32 truncations, shared with C#.  The i64 batch
  // is deliberately a separate call below so the three convert_u helpers in
  // between keep their roster positions.
  this.emitTruncF64HelperFamily_(h, pad1, pad2, 'i32');

  // prettier-ignore
  h('$w2l_convert_u_i32_to_f32',
    pad1 + 'static float ' + n('$w2l_convert_u_i32_to_f32') + '(int ' + l0 + ') {\n' +
    pad2 + 'return (float)Integer.toUnsignedLong(' + l0 + ');\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_convert_u_i64_to_f32',
    pad1 + 'static float ' + n('$w2l_convert_u_i64_to_f32') + '(long ' + l0 + ') {\n' +
    pad2 + 'if (' + l0 + ' >= 0L) return (float)' + l0 + ';\n' +
    pad2 + 'return (float)((' + l0 + ' >>> 1) | (' + l0 + ' & 1L)) * 2.0f;\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_convert_u_i64_to_f64',
    pad1 + 'static double ' + n('$w2l_convert_u_i64_to_f64') + '(long ' + l0 + ') {\n' +
    pad2 + 'if (' + l0 + ' >= 0L) return (double)' + l0 + ';\n' +
    pad2 + 'return (double)((' + l0 + ' >>> 1) | (' + l0 + ' & 1L)) * 2.0;\n' +
    pad1 + '}');
  // Trapping / saturating f64→i64 truncations, shared with C#.
  this.emitTruncF64HelperFamily_(h, pad1, pad2, 'i64');

  // prettier-ignore
  h('$w2l_convert_u_i32_to_f64',
    pad1 + 'static double ' + n('$w2l_convert_u_i32_to_f64') + '(int ' + l0 + ') {\n' +
    pad2 + 'return (double)Integer.toUnsignedLong(' + l0 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_memory_fill',
    pad1 + 'static void ' + n('$w2l_memory_fill') +
      '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ', int ' + l2 + ', int ' + l3 + ') {\n' +
    pad2 + 'byte[] ' + n('$t') + ' = new byte[' + l3 + '];\n' +
    pad2 + 'java.util.Arrays.fill(' + n('$t') + ', (byte)' + l2 + ');\n' +
    pad2 + l0 + '.put(' + l1 + ', ' + n('$t') + ', 0, ' + l3 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_memory_copy',
    pad1 + 'static void ' + n('$w2l_memory_copy') +
      '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ', int ' + l2 + ', int ' + l3 + ') {\n' +
    pad2 + 'byte[] ' + n('$t') + ' = new byte[' + l3 + '];\n' +
    pad2 + l0 + '.get(' + l2 + ', ' + n('$t') + ', 0, ' + l3 + ');\n' +
    pad2 + l0 + '.put(' + l1 + ', ' + n('$t') + ', 0, ' + l3 + ');\n' +
    pad1 + '}');

  var /** @const {string} */ nBuf = this.n_('buffer');
  // prettier-ignore
  h('$w2l_memory_grow',
    pad1 + 'int ' + n('$w2l_memory_grow') + '(int ' + l0 + ') {\n' +
    pad2 + 'int ' + l1 + ' = this.' + nBuf + '.capacity() / 65536;\n' +
    pad2 + 'if (' + l0 + ' == 0) return ' + l1 + ';\n' +
    pad2 + 'return -1;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_v128_load',
    pad1 + 'static IntVector ' + n('$w2l_v128_load') + '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ') {\n' +
    pad2 + 'if (' + l1 + ' < 0 || ' + l1 + ' > ' + l0 + '.limit() - 16) throw new IndexOutOfBoundsException();\n' +
    pad2 + 'if (java.nio.ByteOrder.nativeOrder() == java.nio.ByteOrder.LITTLE_ENDIAN && ' + l0 + '.hasArray()) {\n' +
    pad3 + 'return ByteVector.fromArray(ByteVector.SPECIES_128, ' +
      l0 + '.array(), ' + l0 + '.arrayOffset() + ' + l1 + ').reinterpretAsInts();\n' +
    pad2 + '}\n' +
    pad2 + 'boolean ' + l2 + ' = ' + l0 + '.order() == java.nio.ByteOrder.BIG_ENDIAN;\n' +
    pad2 + 'return IntVector.zero(IntVector.SPECIES_128)' +
      '.withLane(0, ' + l2 + ' ? Integer.reverseBytes(' + l0 + '.getInt(' + l1 + ')) : ' + l0 + '.getInt(' + l1 + '))' +
      '.withLane(1, ' + l2 + ' ? Integer.reverseBytes(' + l0 + '.getInt(' + l1 + ' + 4)) : ' + l0 + '.getInt(' + l1 + ' + 4))' +
      '.withLane(2, ' + l2 + ' ? Integer.reverseBytes(' + l0 + '.getInt(' + l1 + ' + 8)) : ' + l0 + '.getInt(' + l1 + ' + 8))' +
      '.withLane(3, ' + l2 + ' ? Integer.reverseBytes(' + l0 + '.getInt(' + l1 + ' + 12)) : ' + l0 + '.getInt(' + l1 + ' + 12));\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_v128_store',
    pad1 + 'static void ' + n('$w2l_v128_store') +
      '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ', IntVector ' + l2 + ') {\n' +
    pad2 + 'if (' + l1 + ' < 0 || ' + l1 + ' > ' + l0 + '.limit() - 16) throw new IndexOutOfBoundsException();\n' +
    pad2 + 'if (' + l0 + '.isReadOnly()) throw new java.nio.ReadOnlyBufferException();\n' +
    pad2 + 'if (java.nio.ByteOrder.nativeOrder() == java.nio.ByteOrder.LITTLE_ENDIAN && ' + l0 + '.hasArray()) {\n' +
    pad3 + l2 + '.reinterpretAsBytes().intoArray(' +
      l0 + '.array(), ' + l0 + '.arrayOffset() + ' + l1 + ');\n' +
    pad3 + 'return;\n' +
    pad2 + '}\n' +
    pad2 + 'boolean ' + l3 + ' = ' + l0 + '.order() == java.nio.ByteOrder.BIG_ENDIAN;\n' +
    pad2 + l0 + '.putInt(' + l1 + ', ' + l3 + ' ? Integer.reverseBytes(' + l2 + '.lane(0)) : ' + l2 + '.lane(0));\n' +
    pad2 + l0 + '.putInt(' + l1 + ' + 4, ' + l3 + ' ? Integer.reverseBytes(' + l2 + '.lane(1)) : ' + l2 + '.lane(1));\n' +
    pad2 + l0 + '.putInt(' + l1 + ' + 8, ' + l3 + ' ? Integer.reverseBytes(' + l2 + '.lane(2)) : ' + l2 + '.lane(2));\n' +
    pad2 + l0 + '.putInt(' + l1 + ' + 12, ' + l3 + ' ? Integer.reverseBytes(' + l2 + '.lane(3)) : ' + l2 + '.lane(3));\n' +
    pad1 + '}');

  // A direct v128.store(v128.load(...)) keeps the vector inside one helper.
  // This is both the exact wasm evaluation unit and the boundary HotSpot needs
  // to scalar-replace the temporary ByteVector in the heap-buffer fast path.
  //
  // The fast path is the ONLY Vector API reference outside the v128 op helpers,
  // and it is reached from renderStore_'s peephole rather than from a SIMD
  // opcode — so it is the one place where the import can be needed without any
  // lanewise operation having been emitted.  The long-pair fallback below is the
  // whole operation on its own: a raw 16-byte move is byte-order-independent as
  // long as the read and the write use the same order, which two getLong/putLong
  // pairs on one buffer do by construction.
  var /** @const {string} */ copyFastPath =
      pad2 +
      'if (java.nio.ByteOrder.nativeOrder() == java.nio.ByteOrder.LITTLE_ENDIAN && ' +
      l0 +
      '.hasArray()) {\n' +
      pad3 +
      'ByteVector.fromArray(ByteVector.SPECIES_128, ' +
      l0 +
      '.array(), ' +
      l0 +
      '.arrayOffset() + ' +
      l2 +
      ').intoArray(' +
      l0 +
      '.array(), ' +
      l0 +
      '.arrayOffset() + ' +
      l1 +
      ');\n' +
      pad3 +
      'return;\n' +
      pad2 +
      '}\n';
  // prettier-ignore
  h('$w2l_v128_copy',
    pad1 + 'static void ' + n('$w2l_v128_copy') +
      '(java.nio.ByteBuffer ' + l0 + ', int ' + l1 + ', int ' + l2 + ') {\n' +
    pad2 + 'if (' + l2 + ' < 0 || ' + l2 + ' > ' + l0 + '.limit() - 16) throw new IndexOutOfBoundsException();\n' +
    pad2 + 'if (' + l1 + ' < 0 || ' + l1 + ' > ' + l0 + '.limit() - 16) throw new IndexOutOfBoundsException();\n' +
    pad2 + 'if (' + l0 + '.isReadOnly()) throw new java.nio.ReadOnlyBufferException();\n' +
    copyFastPath +
    pad2 + 'long ' + l3 + ' = ' + l0 + '.getLong(' + l2 + ');\n' +
    pad2 + 'long ' + n('$t') + ' = ' + l0 + '.getLong(' + l2 + ' + 8);\n' +
    pad2 + l0 + '.putLong(' + l1 + ', ' + l3 + ');\n' +
    pad2 + l0 + '.putLong(' + l1 + ' + 8, ' + n('$t') + ');\n' +
    pad1 + '}');

  // f32→f64 delegation stubs: all follow the same cast-and-delegate pattern.
  var /** @const {!Array<string>} */ F32_DELEGATES = [
      '$w2l_trunc_f32',
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

  // --- SIMD ops the Vector API cannot express as a single lanewise operator.
  //
  // Registered last so the encoder slots of every pre-existing key are
  // unchanged, and pulled into the mangler roster only when actually marked
  // (see the lastEmitUsedHelpers_ publication in emit_code.js).
  //
  // Hardcoded parameter names, NOT localN_ values.  These two emitters are the
  // only helper bodies that declare temporaries of their own (a, b, r, ovf, sat,
  // v, lo, hi, ix, j, f, d), and the mangler's local pool hands out single
  // characters first — so a body that mixes the two schemes emits
  // `IntVector a = a...` the moment the pool assigns `a` to slot 0, which does
  // not compile.  Measured on the C# side of exactly this shape (CS0136, dense
  // fixture, suite mangler key, 2026-08-02); Java had the same exposure and only
  // luck kept it quiet.  With every name in the body hardcoded, the pool's
  // contents cannot reach it at all.  p/q/c/k are chosen because no temporary in
  // either emitter uses them.
  this.emitSIMDHelpers_(h, n, pad1, pad2, 'p', 'q', 'c');
  this.emitSIMDMemoryHelpers_(h, n, pad1, pad2, 'p', 'q', 'c', 'k');

  return lines;
};

/**
 * Emits the SIMDLoad and SIMDLoadStoreLane helpers.
 *
 * None of these is a plain 16-byte v128 load.  Each reads FEWER than 16 bytes
 * and then splats, sign/zero-extends or zero-fills, or touches a single lane.
 * Until 2026-08-02 this backend rendered every one of them as a full-width
 * $w2l_v128_load, ignoring expr.op entirely, and every lane op as a fixed
 * 32-bit lane — measured wrong for 21 of 25 probe functions, silently.
 *
 * The scalar reads go through ByteBuffer's own accessors, the same way
 * {@code renderLoad_} does, so endianness is handled in exactly one place.
 * The lane index is a parameter, not part of the name: withLane and lane
 * accept a runtime index, and one helper per (op, lane) pair would be up to
 * sixteen times the roster for nothing.
 *
 * @protected
 * @param {function(string, string): void} h
 * @param {function(string): string} n
 * @param {string} pad1
 * @param {string} pad2
 * @param {string} l0
 * @param {string} l1
 * @param {string} l2
 * @param {string} l3
 * @return {void}
 */
Wasm2Lang.Backend.JavaCodegen.prototype.emitSIMDMemoryHelpers_ = function (h, n, pad1, pad2, l0, l1, l2, l3) {
  var /** @const {string} */ T = 'IntVector';
  var /** @const {string} */ BUF = 'java.nio.ByteBuffer';
  // Signature shared by every load helper: (buffer, pointer).
  var /** @const {string} */ SIG = '(' + BUF + ' ' + l0 + ', int ' + l1 + ')';

  // Splat loads: read one element and broadcast it at its OWN width.
  var /** @const {!Array<!Array<string>>} */ SPLAT = [
      ['load8_splat', 'ByteVector', l0 + '.get(' + l1 + ')'],
      ['load16_splat', 'ShortVector', l0 + '.getShort(' + l1 + ')'],
      ['load32_splat', 'IntVector', l0 + '.getInt(' + l1 + ')'],
      ['load64_splat', 'LongVector', l0 + '.getLong(' + l1 + ')']
    ];
  for (var si = 0; si !== SPLAT.length; ++si) {
    var /** @const {string} */ spName = '$w2l_v128_' + SPLAT[si][0];
    var /** @const {string} */ spCls = SPLAT[si][1];
    // prettier-ignore
    h(spName,
      pad1 + 'static ' + T + ' ' + n(spName) + SIG + ' {\n' +
      pad2 + 'return ' + spCls + '.broadcast(' + spCls + '.SPECIES_128, ' + SPLAT[si][2] + ')' +
        ('IntVector' === spCls ? '' : '.reinterpretAsInts()') + ';\n' +
      pad1 + '}');
  }

  // Extending loads: read 8 bytes and widen each element to double its width.
  // Written lane by lane rather than through convertShape because the source
  // is memory, not a vector — assembling a vector first only to widen it would
  // read sixteen bytes where the instruction is defined to read eight.
  //
  // [name, result class, element read, lane count, stride, cast open, cast close]
  // The lane count and stride are strings so the table stays homogeneous —
  // Closure rejects a number cast out of an Array<string> under
  // --jscomp_error=*, and a mixed Array<*> would need a cast on every column.
  var /** @const {!Array<!Array<string>>} */ EXTLOAD = [
      ['load8x8_s', 'ShortVector', 'get', '8', '1', '(short)', ''],
      ['load8x8_u', 'ShortVector', 'get', '8', '1', '(short)(', ' & 0xFF)'],
      ['load16x4_s', 'IntVector', 'getShort', '4', '2', '', ''],
      ['load16x4_u', 'IntVector', 'getShort', '4', '2', '(', ' & 0xFFFF)'],
      ['load32x2_s', 'LongVector', 'getInt', '2', '4', '(long)', ''],
      ['load32x2_u', 'LongVector', 'getInt', '2', '4', '(', ' & 0xFFFFFFFFL)']
    ];
  for (var xi = 0; xi !== EXTLOAD.length; ++xi) {
    var /** @const {string} */ xName = '$w2l_v128_' + EXTLOAD[xi][0];
    var /** @const {string} */ xCls = EXTLOAD[xi][1];
    var /** @const {number} */ xCount = Number(EXTLOAD[xi][3]);
    var /** @const {number} */ xStride = Number(EXTLOAD[xi][4]);
    var /** @type {string} */ xLanes = '';
    for (var xl = 0; xl !== xCount; ++xl) {
      var /** @const {string} */ xRead = l0 + '.' + EXTLOAD[xi][2] + '(' + l1 + (0 === xl ? '' : ' + ' + xl * xStride) + ')';
      xLanes += pad2 + 'v = v.withLane(' + xl + ', ' + EXTLOAD[xi][5] + xRead + EXTLOAD[xi][6] + ');\n';
    }
    // prettier-ignore
    h(xName,
      pad1 + 'static ' + T + ' ' + n(xName) + SIG + ' {\n' +
      pad2 + xCls + ' v = ' + xCls + '.zero(' + xCls + '.SPECIES_128);\n' +
      xLanes +
      pad2 + 'return v.reinterpretAsInts();\n' +
      pad1 + '}');
  }

  // Zero-extending scalar loads: one element into lane 0, every other lane zero.
  var /** @const {!Array<!Array<string>>} */ ZEROLOAD = [
      ['load32_zero', 'IntVector', l0 + '.getInt(' + l1 + ')'],
      ['load64_zero', 'LongVector', l0 + '.getLong(' + l1 + ')']
    ];
  for (var zi = 0; zi !== ZEROLOAD.length; ++zi) {
    var /** @const {string} */ zName = '$w2l_v128_' + ZEROLOAD[zi][0];
    var /** @const {string} */ zCls = ZEROLOAD[zi][1];
    // prettier-ignore
    h(zName,
      pad1 + 'static ' + T + ' ' + n(zName) + SIG + ' {\n' +
      pad2 + 'return ' + zCls + '.zero(' + zCls + '.SPECIES_128).withLane(0, ' + ZEROLOAD[zi][2] + ')' +
        ('IntVector' === zCls ? '' : '.reinterpretAsInts()') + ';\n' +
      pad1 + '}');
  }

  // Lane load/store, at the lane's own width.
  // [width, vector class, reinterpret-in, buffer getter, buffer setter, cast]
  var /** @const {!Array<!Array<string>>} */ LANEOPS = [
      ['8', 'ByteVector', '.reinterpretAsBytes()', 'get', 'put', ''],
      ['16', 'ShortVector', '.reinterpretAsShorts()', 'getShort', 'putShort', ''],
      ['32', 'IntVector', '', 'getInt', 'putInt', ''],
      ['64', 'LongVector', '.reinterpretAsLongs()', 'getLong', 'putLong', '']
    ];
  for (var li = 0; li !== LANEOPS.length; ++li) {
    var /** @const {string} */ lWidth = LANEOPS[li][0];
    var /** @const {string} */ lIn = LANEOPS[li][2];
    var /** @const {string} */ lOut = '' === lIn ? '' : '.reinterpretAsInts()';
    var /** @const {string} */ ldName = '$w2l_v128_load' + lWidth + '_lane';
    // prettier-ignore
    h(ldName,
      pad1 + 'static ' + T + ' ' + n(ldName) + '(' + BUF + ' ' + l0 + ', int ' + l1 + ', ' +
        T + ' ' + l2 + ', int ' + l3 + ') {\n' +
      pad2 + 'return ' + l2 + lIn + '.withLane(' + l3 + ', ' + l0 + '.' + LANEOPS[li][3] + '(' + l1 + '))' +
        lOut + ';\n' +
      pad1 + '}');
    var /** @const {string} */ stName = '$w2l_v128_store' + lWidth + '_lane';
    // prettier-ignore
    h(stName,
      pad1 + 'static void ' + n(stName) + '(' + BUF + ' ' + l0 + ', int ' + l1 + ', ' +
        T + ' ' + l2 + ', int ' + l3 + ') {\n' +
      pad2 + l0 + '.' + LANEOPS[li][4] + '(' + l1 + ', ' + l2 + lIn + '.lane(' + l3 + '));\n' +
      pad1 + '}');
  }

  return;
};

/**
 * Emits the Java SIMD helpers.
 *
 * Two reasons a SIMD op lands here rather than inline.  Either its formula
 * needs an operand more than once — repeating an operand in an expression
 * repeats whatever computed it, so a call-valued operand would be evaluated
 * twice — or jdk.incubator.vector has no operator for it at all.  The second
 * case is common: SADD, SSUB, SUADD, SUSUB, UMIN, UMAX, UAVERGE, CEIL, FLOOR,
 * RINT and TRUNC do not exist in JDK 21 (enumerated by reflection), which is
 * why this backend refused every saturating and rounding op.  A helper body is
 * a statement list, so it can do what an expression cannot.
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
Wasm2Lang.Backend.JavaCodegen.prototype.emitSIMDHelpers_ = function (h, n, pad1, pad2, l0, l1, l2) {
  var /** @const */ J = Wasm2Lang.Backend.JavaCodegen;
  var /** @const */ S = Wasm2Lang.Backend.SIMDOps;
  var /** @const {string} */ T = 'IntVector';
  // laneType -> [vector class, element type, signed max literal, shift amount]
  var /** @const {!Array<!Array<string>>} */ SAT_LANES = [
      ['i8x16', 'ByteVector', 'byte', '(byte)0x7F', '7'],
      ['i16x8', 'ShortVector', 'short', '(short)0x7FFF', '15']
    ];

  // Saturating add/sub, signed and unsigned.  Branch-free and exact at every
  // width; the Vector API has no saturating operator of any kind.
  //
  //   signed add : overflow iff (a^sum) & (b^sum) < 0; the clamp is
  //                (a >> w-1) ^ MAX, which is MAX when a >= 0 and MIN when a < 0
  //   signed sub : overflow iff (a^b) & (a^diff) < 0, same clamp
  //   unsigned   : add overflows iff sum <u a  -> all ones
  //                sub underflows iff a <u b   -> zero
  for (var si = 0; si !== SAT_LANES.length; ++si) {
    var /** @const {string} */ sLane = SAT_LANES[si][0];
    var /** @const {string} */ sCls = SAT_LANES[si][1];
    var /** @const {string} */ sSpecies = sCls + '.SPECIES_128';
    var /** @const {string} */ sMax = SAT_LANES[si][3];
    var /** @const {string} */ sShift = SAT_LANES[si][4];
    var /** @const {string} */ sA = J.laneView_(l0, sLane);
    var /** @const {string} */ sB = J.laneView_(l1, sLane);
    for (var sk = 0; sk !== 4; ++sk) {
      var /** @const {boolean} */ sIsAdd = sk < 2;
      var /** @const {boolean} */ sIsSigned = 0 === sk % 2;
      var /** @const {string} */ sOpName = (sIsAdd ? 'add_sat_' : 'sub_sat_') + (sIsSigned ? 's' : 'u');
      var /** @const {string} */ sName = '$w2l_v128_' + sOpName + '_' + sLane;
      var /** @type {string} */ sBody;
      if (sIsSigned) {
        sBody =
          pad2 +
          sCls +
          ' a = ' +
          sA +
          ';\n' +
          pad2 +
          sCls +
          ' b = ' +
          sB +
          ';\n' +
          pad2 +
          sCls +
          ' r = a.' +
          (sIsAdd ? 'add' : 'sub') +
          '(b);\n' +
          pad2 +
          sCls +
          ' ovf = ' +
          (sIsAdd
            ? 'a.lanewise(VectorOperators.XOR, r).lanewise(VectorOperators.AND, b.lanewise(VectorOperators.XOR, r))'
            : 'a.lanewise(VectorOperators.XOR, b).lanewise(VectorOperators.AND, a.lanewise(VectorOperators.XOR, r))') +
          ';\n' +
          pad2 +
          sCls +
          ' sat = a.lanewise(VectorOperators.ASHR, ' +
          sShift +
          ').lanewise(VectorOperators.XOR, ' +
          sCls +
          '.broadcast(' +
          sSpecies +
          ', ' +
          sMax +
          '));\n' +
          pad2 +
          'return r.blend(sat, ovf.compare(VectorOperators.LT, ' +
          sCls +
          '.zero(' +
          sSpecies +
          ')))' +
          '.reinterpretAsInts();\n';
      } else if (sIsAdd) {
        sBody =
          pad2 +
          sCls +
          ' a = ' +
          sA +
          ';\n' +
          pad2 +
          sCls +
          ' r = a.add(' +
          sB +
          ');\n' +
          pad2 +
          'return r.blend(' +
          sCls +
          '.broadcast(' +
          sSpecies +
          ', (' +
          SAT_LANES[si][2] +
          ')-1), ' +
          'r.compare(VectorOperators.UNSIGNED_LT, a)).reinterpretAsInts();\n';
      } else {
        sBody =
          pad2 +
          sCls +
          ' a = ' +
          sA +
          ';\n' +
          pad2 +
          sCls +
          ' b = ' +
          sB +
          ';\n' +
          pad2 +
          'return a.sub(b).blend(' +
          sCls +
          '.zero(' +
          sSpecies +
          '), ' +
          'a.compare(VectorOperators.UNSIGNED_LT, b)).reinterpretAsInts();\n';
      }
      // prettier-ignore
      h(sName,
        pad1 + 'static ' + T + ' ' + n(sName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
        sBody +
        pad1 + '}');
    }
  }

  // avgr_u: (a | b) - ((a ^ b) >>> 1).  Exact at every unsigned width, and free
  // of the overflow a widening average would need.  Helper because both
  // operands appear twice.
  var /** @const {!Array<string>} */ AVG_LANES = ['i8x16', 'i16x8'];
  for (var vi = 0; vi !== AVG_LANES.length; ++vi) {
    var /** @const {string} */ vLane = AVG_LANES[vi];
    var /** @const {string} */ vCls = J.simdView_(vLane)[0];
    var /** @const {string} */ vName = '$w2l_v128_avgr_u_' + vLane;
    // prettier-ignore
    h(vName,
      pad1 + 'static ' + T + ' ' + n(vName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
      pad2 + vCls + ' a = ' + J.laneView_(l0, vLane) + ';\n' +
      pad2 + vCls + ' b = ' + J.laneView_(l1, vLane) + ';\n' +
      pad2 + 'return a.lanewise(VectorOperators.OR, b).sub(' +
        'a.lanewise(VectorOperators.XOR, b).lanewise(VectorOperators.LSHR, 1)).reinterpretAsInts();\n' +
      pad1 + '}');
  }

  // Unsigned min/max: no UMIN/UMAX operator, but UNSIGNED_LT is a real
  // comparison, so the selection is a blend.  Helper because both operands
  // appear twice.
  var /** @const {!Array<string>} */ MINMAX_LANES = ['i8x16', 'i16x8', 'i32x4'];
  for (var mi = 0; mi !== MINMAX_LANES.length; ++mi) {
    var /** @const {string} */ mLane = MINMAX_LANES[mi];
    var /** @const {string} */ mCls = J.simdView_(mLane)[0];
    for (var mk = 0; mk !== 2; ++mk) {
      var /** @const {boolean} */ mIsMin = 0 === mk;
      var /** @const {string} */ mName = '$w2l_v128_' + (mIsMin ? 'min_u_' : 'max_u_') + mLane;
      // prettier-ignore
      h(mName,
        pad1 + 'static ' + T + ' ' + n(mName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
        pad2 + mCls + ' a = ' + J.laneView_(l0, mLane) + ';\n' +
        pad2 + mCls + ' b = ' + J.laneView_(l1, mLane) + ';\n' +
        pad2 + 'return a.blend(b, ' + (mIsMin ? 'b' : 'a') +
          '.compare(VectorOperators.UNSIGNED_LT, ' + (mIsMin ? 'a' : 'b') + ')).reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // pmin/pmax: wasm defines pmin as "b < a ? b : a" and pmax as "a < b ? b : a",
  // which propagates the SECOND operand when either side is NaN.  min/max would
  // canonicalize NaN instead, so they are not interchangeable.
  var /** @const {!Array<string>} */ PLANES = ['f32x4', 'f64x2'];
  for (var pi = 0; pi !== PLANES.length; ++pi) {
    var /** @const {string} */ pLane = PLANES[pi];
    var /** @const {string} */ pCls = J.simdView_(pLane)[0];
    for (var pk = 0; pk !== 2; ++pk) {
      var /** @const {boolean} */ pIsMin = 0 === pk;
      var /** @const {string} */ pName = '$w2l_v128_' + (pIsMin ? 'pmin_' : 'pmax_') + pLane;
      // prettier-ignore
      h(pName,
        pad1 + 'static ' + T + ' ' + n(pName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
        pad2 + pCls + ' a = ' + J.laneView_(l0, pLane) + ';\n' +
        pad2 + pCls + ' b = ' + J.laneView_(l1, pLane) + ';\n' +
        pad2 + 'return a.blend(b, ' + (pIsMin ? 'b.compare(VectorOperators.LT, a)' : 'a.compare(VectorOperators.LT, b)') +
          ').reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // popcnt: BIT_COUNT exists for byte lanes and counts the byte's own bits
  // (verified on JDK 21), so this one is a single lanewise call.
  var /** @const {string} */ pcName = '$w2l_v128_popcnt_i8x16';
  // prettier-ignore
  h(pcName,
    pad1 + 'static ' + T + ' ' + n(pcName) + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return ' + J.laneView_(l0, 'i8x16') +
      '.lanewise(VectorOperators.BIT_COUNT).reinterpretAsInts();\n' +
    pad1 + '}');

  // Rounding: no CEIL/FLOOR/RINT/TRUNC operator, so each lane goes through the
  // scalar Math equivalent.  nearest is roundTiesToEven, which is Math.rint —
  // NOT Math.round, which rounds halves up and would differ on every .5 lane.
  var /** @const {!Array<!Array<string>>} */ ROUND_OPS = [
      ['ceil', 'Math.ceil'],
      ['floor', 'Math.floor'],
      ['trunc', 'w2lTrunc'],
      ['nearest', 'Math.rint']
    ];
  var /** @const {!Array<!Array<string>>} */ ROUND_LANES = [
      ['f32x4', 'FloatVector', 'float', '4'],
      ['f64x2', 'DoubleVector', 'double', '2']
    ];
  for (var ri = 0; ri !== ROUND_LANES.length; ++ri) {
    var /** @const {string} */ rLane = ROUND_LANES[ri][0];
    var /** @const {string} */ rCls = ROUND_LANES[ri][1];
    var /** @const {string} */ rElem = ROUND_LANES[ri][2];
    var /** @const {number} */ rCount = S.laneInfo(rLane).laneCount;
    for (var ro = 0; ro !== ROUND_OPS.length; ++ro) {
      var /** @const {string} */ rOp = ROUND_OPS[ro][0];
      var /** @const {string} */ rFn = ROUND_OPS[ro][1];
      var /** @const {string} */ rName = '$w2l_v128_' + rOp + '_' + rLane;
      var /** @type {string} */ rLanes = '';
      for (var rl = 0; rl !== rCount; ++rl) {
        // Math.* return double; the f32 lanes cast back, which is exact because
        // every rounded value is representable.
        var /** @const {string} */ rCall =
            'trunc' === rOp
              ? 'v.lane(' +
                rl +
                ') < 0 ? (' +
                rElem +
                ')Math.ceil(v.lane(' +
                rl +
                ')) : (' +
                rElem +
                ')Math.floor(v.lane(' +
                rl +
                '))'
              : '(' + rElem + ')' + rFn + '(v.lane(' + rl + '))';
        rLanes += pad2 + 'v = v.withLane(' + rl + ', ' + rCall + ');\n';
      }
      // prettier-ignore
      h(rName,
        pad1 + 'static ' + T + ' ' + n(rName) + '(' + T + ' ' + l0 + ') {\n' +
        pad2 + rCls + ' v = ' + J.laneView_(l0, rLane) + ';\n' +
        rLanes +
        pad2 + 'return v.reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // --- Widening and narrowing.
  //
  // convertShape is the Vector API's shape-changing conversion: an expanding
  // one takes a `part` selecting which slice of the source fills the result
  // (0 = low half, 1 = high half), a contracting one takes a NEGATIVE part
  // selecting where the result lands (0 = low lanes, -1 = high lanes, the rest
  // zero).  Both were verified on JDK 21 rather than taken from the javadoc.
  // It returns Vector<E>, hence the casts.
  //
  // source lane -> [source class, wide class, wide species, signed, unsigned]
  var /** @const {!Array<!Array<string>>} */ WIDEN = [
      ['i8x16', 'ByteVector', 'ShortVector', 'B2S', 'ZERO_EXTEND_B2S'],
      ['i16x8', 'ShortVector', 'IntVector', 'S2I', 'ZERO_EXTEND_S2I'],
      ['i32x4', 'IntVector', 'LongVector', 'I2L', 'ZERO_EXTEND_I2L']
    ];
  var wideOf = /** @param {number} i @return {string} */ function (i) {
    return WIDEN[i][2] + '.SPECIES_128';
  };

  // extend_{low,high}_{s,u}: one half of the source, widened.  Keyed by the
  // SOURCE lane, which is what the shared classifier reports for this op.
  for (var wi = 0; wi !== WIDEN.length; ++wi) {
    var /** @const {string} */ wSrcLane = WIDEN[wi][0];
    var /** @const {string} */ wWideCls = WIDEN[wi][2];
    for (var wk = 0; wk !== 4; ++wk) {
      var /** @const {boolean} */ wHigh = wk >= 2;
      var /** @const {boolean} */ wSigned = 0 === wk % 2;
      var /** @const {string} */ wName =
          '$w2l_v128_extend_' + (wHigh ? 'high_' : 'low_') + (wSigned ? 's' : 'u') + '_' + wSrcLane;
      // prettier-ignore
      h(wName,
        pad1 + 'static ' + T + ' ' + n(wName) + '(' + T + ' ' + l0 + ') {\n' +
        pad2 + 'return ((' + wWideCls + ')' + J.laneView_(l0, wSrcLane) + '.convertShape(VectorOperators.' +
          WIDEN[wi][wSigned ? 3 : 4] + ', ' + wideOf(wi) + ', ' + (wHigh ? '1' : '0') +
          ')).reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // extmul_{low,high}_{s,u}: widen one half of EACH operand, then multiply in
  // the wide view, where no product can overflow.  Keyed by the RESULT lane,
  // which is what the classifier reports for this op — the opposite convention
  // from extend above, which is why both tables exist.
  for (var xi = 0; xi !== WIDEN.length; ++xi) {
    var /** @const {string} */ xSrcLane = WIDEN[xi][0];
    var /** @const {string} */ xWideCls = WIDEN[xi][2];
    var /** @const {string} */ xResLane = Wasm2Lang.Backend.SIMDOps.widerLane(xSrcLane);
    for (var xk = 0; xk !== 4; ++xk) {
      var /** @const {boolean} */ xHigh = xk >= 2;
      var /** @const {boolean} */ xSigned = 0 === xk % 2;
      var /** @const {string} */ xName =
          '$w2l_v128_extmul_' + (xHigh ? 'high_' : 'low_') + (xSigned ? 's' : 'u') + '_' + xResLane;
      var xHalf = /** @param {string} src @return {string} */ function (src) {
        return (
          '((' +
          xWideCls +
          ')' +
          J.laneView_(src, xSrcLane) +
          '.convertShape(VectorOperators.' +
          WIDEN[xi][xSigned ? 3 : 4] +
          ', ' +
          wideOf(xi) +
          ', ' +
          (xHigh ? '1' : '0') +
          '))'
        );
      };
      // prettier-ignore
      h(xName,
        pad1 + 'static ' + T + ' ' + n(xName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
        pad2 + 'return ' + xHalf(l0) + '.mul(' + xHalf(l1) + ').reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // narrow_{s,u}: pack two wide vectors into one of half-width lanes, saturating
  // at the target lane's bounds.  _s clamps a negative source to the signed
  // minimum, _u clamps it to zero — which is why the two cannot share a clamp.
  // The clamp happens in the WIDE view, so the contracting conversion that
  // follows only truncates, and truncation is exact once every lane is in range.
  //
  // result lane -> [wide lane, wide class, narrow class, conv, sMin, sMax, uMax]
  var /** @const {!Array<!Array<string>>} */ NARROW = [
      ['i8x16', 'i16x8', 'ShortVector', 'ByteVector', 'S2B', '(short)-128', '(short)127', '(short)255'],
      ['i16x8', 'i32x4', 'IntVector', 'ShortVector', 'I2S', '-32768', '32767', '65535']
    ];
  for (var ni = 0; ni !== NARROW.length; ++ni) {
    var /** @const {string} */ nResLane = NARROW[ni][0];
    var /** @const {string} */ nWideLane = NARROW[ni][1];
    var /** @const {string} */ nWideCls = NARROW[ni][2];
    var /** @const {string} */ nNarrowCls = NARROW[ni][3];
    var /** @const {string} */ nSpecies = nWideCls + '.SPECIES_128';
    var /** @const {string} */ nNarrowSpecies = nNarrowCls + '.SPECIES_128';
    for (var nk = 0; nk !== 2; ++nk) {
      var /** @const {boolean} */ nSigned = 0 === nk;
      var /** @const {string} */ nName = '$w2l_v128_narrow_' + (nSigned ? 's' : 'u') + '_' + nResLane;
      var nClamp = /** @param {string} src @return {string} */ function (src) {
        return nSigned
          ? J.laneView_(src, nWideLane) +
              '.min(' +
              nWideCls +
              '.broadcast(' +
              nSpecies +
              ', ' +
              NARROW[ni][6] +
              '))' +
              '.max(' +
              nWideCls +
              '.broadcast(' +
              nSpecies +
              ', ' +
              NARROW[ni][5] +
              '))'
          : J.laneView_(src, nWideLane) +
              '.max(' +
              nWideCls +
              '.zero(' +
              nSpecies +
              '))' +
              '.min(' +
              nWideCls +
              '.broadcast(' +
              nSpecies +
              ', ' +
              NARROW[ni][7] +
              '))';
      };
      // prettier-ignore
      h(nName,
        pad1 + 'static ' + T + ' ' + n(nName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
        pad2 + nNarrowCls + ' a = (' + nNarrowCls + ')' + nClamp(l0) +
          '.convertShape(VectorOperators.' + NARROW[ni][4] + ', ' + nNarrowSpecies + ', 0);\n' +
        pad2 + nNarrowCls + ' b = (' + nNarrowCls + ')' + nClamp(l1) +
          '.convertShape(VectorOperators.' + NARROW[ni][4] + ', ' + nNarrowSpecies + ', -1);\n' +
        pad2 + 'return a.lanewise(VectorOperators.OR, b).reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // extadd_pairwise sums ADJACENT lanes into one of double the width.  Widening
  // halves would pair lanes 0..n/2 with n/2..n, a different pairing, so the even
  // and odd lanes are separated by shifting within the wide view: the even lane
  // is the low half of each wide lane, the odd lane the high half.  Keyed by the
  // SOURCE lane.
  var /** @const {!Array<!Array<string>>} */ EXTADD = [
      ['i8x16', 'i16x8', 'ShortVector', '8', '(short)0xFF'],
      ['i16x8', 'i32x4', 'IntVector', '16', '0xFFFF']
    ];
  for (var ei = 0; ei !== EXTADD.length; ++ei) {
    var /** @const {string} */ eSrcLane = EXTADD[ei][0];
    var /** @const {string} */ eWideLane = EXTADD[ei][1];
    var /** @const {string} */ eCls = EXTADD[ei][2];
    var /** @const {string} */ eSh = EXTADD[ei][3];
    var /** @const {string} */ eMask = EXTADD[ei][4];
    for (var ek = 0; ek !== 2; ++ek) {
      var /** @const {boolean} */ eSigned = 0 === ek;
      var /** @const {string} */ eName = '$w2l_v128_extadd_pairwise_' + (eSigned ? 's' : 'u') + '_' + eSrcLane;
      var /** @const {string} */ eEven = eSigned
          ? 'v.lanewise(VectorOperators.LSHL, ' + eSh + ').lanewise(VectorOperators.ASHR, ' + eSh + ')'
          : 'v.lanewise(VectorOperators.AND, ' + eCls + '.broadcast(' + eCls + '.SPECIES_128, ' + eMask + '))';
      var /** @const {string} */ eOdd = eSigned
          ? 'v.lanewise(VectorOperators.ASHR, ' + eSh + ')'
          : 'v.lanewise(VectorOperators.LSHR, ' + eSh + ')';
      // prettier-ignore
      h(eName,
        pad1 + 'static ' + T + ' ' + n(eName) + '(' + T + ' ' + l0 + ') {\n' +
        pad2 + eCls + ' v = ' + J.laneView_(l0, eWideLane) + ';\n' +
        pad2 + 'return ' + eEven + '.add(' + eOdd + ').reinterpretAsInts();\n' +
        pad1 + '}');
    }
  }

  // dot_s: result[k] = a[2k]*b[2k] + a[2k+1]*b[2k+1].  The pairwise sum crosses
  // lanes, and the Vector API's cross-lane primitive (rearrange over two
  // vectors) has index semantics that differ from what this needs, so the four
  // sums are written out.  Correctness first: this op has no vector primitive
  // on either backend.
  var /** @const {string} */ dotName = '$w2l_v128_dot_s_i16x8';
  var dotHalf = /** @param {string} part @return {string} */ function (part) {
    return (
      '((IntVector)' +
      J.laneView_(l0, 'i16x8') +
      '.convertShape(VectorOperators.S2I, IntVector.SPECIES_128, ' +
      part +
      ')).mul((IntVector)' +
      J.laneView_(l1, 'i16x8') +
      '.convertShape(VectorOperators.S2I, IntVector.SPECIES_128, ' +
      part +
      '))'
    );
  };
  // prettier-ignore
  h(dotName,
    pad1 + 'static ' + T + ' ' + n(dotName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
    pad2 + 'IntVector lo = ' + dotHalf('0') + ';\n' +
    pad2 + 'IntVector hi = ' + dotHalf('1') + ';\n' +
    pad2 + 'return IntVector.zero(IntVector.SPECIES_128)' +
      '.withLane(0, lo.lane(0) + lo.lane(1)).withLane(1, lo.lane(2) + lo.lane(3))' +
      '.withLane(2, hi.lane(0) + hi.lane(1)).withLane(3, hi.lane(2) + hi.lane(3));\n' +
    pad1 + '}');

  // q15mulr_sat_s: saturate_i16((a*b + 0x4000) >> 15).  The intermediate needs
  // 32 bits — at a = b = -32768 the shifted value is 32768, one past the i16
  // maximum, which is the case the saturation exists for.
  var /** @const {string} */ qName = '$w2l_v128_q15mulr_sat_s_i16x8';
  var qHalf = /** @param {string} part @return {string} */ function (part) {
    return (
      '((IntVector)' +
      J.laneView_(l0, 'i16x8') +
      '.convertShape(VectorOperators.S2I, IntVector.SPECIES_128, ' +
      part +
      ')).mul((IntVector)' +
      J.laneView_(l1, 'i16x8') +
      '.convertShape(VectorOperators.S2I, IntVector.SPECIES_128, ' +
      part +
      ')).add(IntVector.broadcast(IntVector.SPECIES_128, 0x4000))' +
      '.lanewise(VectorOperators.ASHR, 15)' +
      '.min(IntVector.broadcast(IntVector.SPECIES_128, 32767))' +
      '.max(IntVector.broadcast(IntVector.SPECIES_128, -32768))'
    );
  };
  // prettier-ignore
  h(qName,
    pad1 + 'static ' + T + ' ' + n(qName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
    pad2 + 'ShortVector a = (ShortVector)' + qHalf('0') +
      '.convertShape(VectorOperators.I2S, ShortVector.SPECIES_128, 0);\n' +
    pad2 + 'ShortVector b = (ShortVector)' + qHalf('1') +
      '.convertShape(VectorOperators.I2S, ShortVector.SPECIES_128, -1);\n' +
    pad2 + 'return a.lanewise(VectorOperators.OR, b).reinterpretAsInts();\n' +
    pad1 + '}');

  // --- Width- and domain-changing float conversions.
  //
  // The signed directions have a real operator: Java's own float->int cast
  // rounds toward zero, maps NaN to 0 and saturates out-of-range values at
  // MIN/MAX, which is exactly wasm's trunc_sat_s.  The UNSIGNED directions have
  // none — the Vector API has no F2UI or UI2F — so those go lane by lane.
  // prettier-ignore
  h('$w2l_v128_trunc_sat_s_f32x4_i32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_trunc_sat_s_f32x4_i32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return (IntVector)' + J.laneView_(l0, 'f32x4') +
      '.convert(VectorOperators.F2I, 0);\n' +
    pad1 + '}');

  // trunc_sat_u: saturate at 0 and at 2^32-1, whose int bit pattern is -1.
  // The cast goes through long because (int) of a value above 2^31 would
  // already have saturated at Integer.MAX_VALUE.
  var /** @type {string} */ tsuLanes = '';
  for (var ti = 0; ti !== 4; ++ti) {
    tsuLanes +=
      pad2 +
      'f = v.lane(' +
      ti +
      ');\n' +
      pad2 +
      'r = r.withLane(' +
      ti +
      ', Float.isNaN(f) || f <= 0.0f ? 0 : ' +
      'f >= 4294967296.0f ? -1 : (int)(long)f);\n';
  }
  // prettier-ignore
  h('$w2l_v128_trunc_sat_u_f32x4_i32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_trunc_sat_u_f32x4_i32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'FloatVector v = ' + J.laneView_(l0, 'f32x4') + ';\n' +
    pad2 + 'IntVector r = IntVector.zero(IntVector.SPECIES_128);\n' +
    pad2 + 'float f;\n' +
    tsuLanes +
    pad2 + 'return r;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_v128_convert_s_i32x4_f32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_convert_s_i32x4_f32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return ((FloatVector)' + l0 + '.convert(VectorOperators.I2F, 0)).reinterpretAsInts();\n' +
    pad1 + '}');

  // convert_u reads each lane as UNSIGNED, so the int is widened through long
  // before the conversion; a plain (float) cast would treat it as signed.
  var /** @type {string} */ cvuLanes = '';
  for (var ci = 0; ci !== 4; ++ci) {
    cvuLanes += pad2 + 'r = r.withLane(' + ci + ', (float)(' + l0 + '.lane(' + ci + ') & 0xFFFFFFFFL));\n';
  }
  // prettier-ignore
  h('$w2l_v128_convert_u_i32x4_f32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_convert_u_i32x4_f32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'FloatVector r = FloatVector.zero(FloatVector.SPECIES_128);\n' +
    cvuLanes +
    pad2 + 'return r.reinterpretAsInts();\n' +
    pad1 + '}');

  // promote_low widens the two LOW f32 lanes to f64; demote_zero narrows both
  // f64 lanes into the two low f32 lanes and zeroes the upper half — which is
  // what part 0 of the contracting conversion already produces.
  // prettier-ignore
  h('$w2l_v128_promote_low_f32x4_f64x2',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_promote_low_f32x4_f64x2') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return ((DoubleVector)' + J.laneView_(l0, 'f32x4') +
      '.convertShape(VectorOperators.F2D, DoubleVector.SPECIES_128, 0)).reinterpretAsInts();\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_v128_demote_zero_f64x2_f32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_demote_zero_f64x2_f32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return ((FloatVector)' + J.laneView_(l0, 'f64x2') +
      '.convertShape(VectorOperators.D2F, FloatVector.SPECIES_128, 0)).reinterpretAsInts();\n' +
    pad1 + '}');

  // --- f64x2 <-> i32x4, the four conversions that reach only the LOW half.
  //
  // convert_low widens the two low i32 lanes to f64; trunc_sat_zero truncates
  // both f64 lanes into the two low i32 lanes and zeroes the upper half.  Both
  // directions have a signed form with a real operator and an unsigned form
  // with none, which is the same split as the f32x4 pair above.
  //
  // Measured on JDK 21 rather than read from the javadoc: I2D and D2I both
  // exist, `convertShape(I2D, DoubleVector.SPECIES_128, 0)` takes exactly the
  // low two int lanes, and `convertShape(D2I, IntVector.SPECIES_128, 0)`
  // already implements wasm's trunc_sat_zero_s completely — NaN maps to 0,
  // +1e20 saturates to INT_MAX, -1e20 to INT_MIN, and the upper two lanes come
  // back zero.  So the signed pair needs no range test of its own.
  // prettier-ignore
  h('$w2l_v128_convert_low_s_i32x4_f64x2',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_convert_low_s_i32x4_f64x2') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return ((DoubleVector)' + l0 +
      '.convertShape(VectorOperators.I2D, DoubleVector.SPECIES_128, 0)).reinterpretAsInts();\n' +
    pad1 + '}');
  // convert_low_u reads each lane as UNSIGNED; there is no ZERO_EXTEND_I2D, so
  // the widening goes through a long and the two lanes are written out.
  var /** @type {string} */ cluLanes = '';
  for (var cli = 0; cli !== 2; ++cli) {
    cluLanes += pad2 + 'r = r.withLane(' + cli + ', (double)(' + l0 + '.lane(' + cli + ') & 0xFFFFFFFFL));\n';
  }
  // prettier-ignore
  h('$w2l_v128_convert_low_u_i32x4_f64x2',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_convert_low_u_i32x4_f64x2') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'DoubleVector r = DoubleVector.zero(DoubleVector.SPECIES_128);\n' +
    cluLanes +
    pad2 + 'return r.reinterpretAsInts();\n' +
    pad1 + '}');
  // prettier-ignore
  h('$w2l_v128_trunc_sat_zero_s_f64x2_i32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_trunc_sat_zero_s_f64x2_i32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'return (IntVector)' + J.laneView_(l0, 'f64x2') +
      '.convertShape(VectorOperators.D2I, IntVector.SPECIES_128, 0);\n' +
    pad1 + '}');
  // trunc_sat_zero_u saturates at 0 and at 2^32-1, whose int bit pattern is -1.
  // The cast goes through long because (int) of a value above 2^31 would
  // already have saturated at Integer.MAX_VALUE.
  var /** @type {string} */ tzuLanes = '';
  for (var tzi = 0; tzi !== 2; ++tzi) {
    tzuLanes +=
      pad2 +
      'd = v.lane(' +
      tzi +
      ');\n' +
      pad2 +
      'r = r.withLane(' +
      tzi +
      ', Double.isNaN(d) || d <= 0.0 ? 0 : d >= 4294967296.0 ? -1 : (int)(long)d);\n';
  }
  // prettier-ignore
  h('$w2l_v128_trunc_sat_zero_u_f64x2_i32x4',
    pad1 + 'static ' + T + ' ' + n('$w2l_v128_trunc_sat_zero_u_f64x2_i32x4') + '(' + T + ' ' + l0 + ') {\n' +
    pad2 + 'DoubleVector v = ' + J.laneView_(l0, 'f64x2') + ';\n' +
    pad2 + 'IntVector r = IntVector.zero(IntVector.SPECIES_128);\n' +
    pad2 + 'double d;\n' +
    tzuLanes +
    pad2 + 'return r;\n' +
    pad1 + '}');

  // swizzle indexes BYTES of the first operand by the byte values of the
  // second; wasm yields zero for any index >= 16.  selectFrom throws on an
  // out-of-range index instead of zeroing (verified on JDK 21), so the lanes
  // are gathered explicitly with the range test wasm specifies.
  var /** @const {string} */ swName = '$w2l_v128_swizzle_i8x16';
  var /** @type {string} */ swLanes = '';
  for (var swl = 0; swl !== 16; ++swl) {
    swLanes += pad2 + 'r = r.withLane(' + swl + ', (j = ix.lane(' + swl + ') & 0xFF) < 16 ? v.lane(j) : (byte)0);\n';
  }
  // prettier-ignore
  h(swName,
    pad1 + 'static ' + T + ' ' + n(swName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ') {\n' +
    pad2 + 'ByteVector v = ' + J.laneView_(l0, 'i8x16') + ';\n' +
    pad2 + 'ByteVector ix = ' + J.laneView_(l1, 'i8x16') + ';\n' +
    pad2 + 'ByteVector r = ByteVector.zero(ByteVector.SPECIES_128);\n' +
    pad2 + 'int j;\n' +
    swLanes +
    pad2 + 'return r.reinterpretAsInts();\n' +
    pad1 + '}');

  // bitselect(a, b, c) = (a & c) | (b & ~c).  The mask appears twice, so the
  // inline form evaluated whatever produced it twice — a call operand was
  // called twice, which wasm does not do.  A parameter evaluates its argument
  // exactly once, which is the whole reason every other multi-use formula in
  // this file is a helper.  Whole-vector bitwise, so the carrier view is
  // already the right one and no reinterpret is needed.
  var /** @const {string} */ bsName = '$w2l_v128_bitselect_v128';
  // prettier-ignore
  h(bsName,
    pad1 + 'static ' + T + ' ' + n(bsName) + '(' + T + ' ' + l0 + ', ' + T + ' ' + l1 + ', ' + T + ' ' + l2 + ') {\n' +
    pad2 + 'return ' + l0 + '.lanewise(VectorOperators.AND, ' + l2 + ')' +
      '.lanewise(VectorOperators.OR, ' + l1 + '.lanewise(VectorOperators.AND, ' +
      l2 + '.lanewise(VectorOperators.NOT)));\n' +
    pad1 + '}');

  return;
};
