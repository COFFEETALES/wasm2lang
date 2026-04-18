'use strict';

/**
 * Inter-helper dependencies (opcode-specific helpers only).
 * Core helpers (_w2l_i, _w2l_f32) are always emitted and omitted here.
 *
 * @const {!Object<string, !Array<string>>}
 */
Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_ = {
  '_w2l_extend8_s': [],
  '_w2l_extend16_s': [],
  '_w2l_clz': [],
  '_w2l_ctz': [],
  '_w2l_popcnt': [],
  '_w2l_imul': [],
  '_w2l_copysign_f64': [],
  '_w2l_copysign_f32': ['_w2l_copysign_f64'],
  '_w2l_trunc_f64': [],
  '_w2l_trunc_f32': ['_w2l_trunc_f64'],
  '_w2l_nearest_f64': [],
  '_w2l_nearest_f32': ['_w2l_nearest_f64'],
  '_w2l_trunc_s_f32_to_i32': ['_w2l_trunc_s_f64_to_i32'],
  '_w2l_trunc_u_f32_to_i32': ['_w2l_trunc_u_f64_to_i32'],
  '_w2l_trunc_s_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_u_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_sat_s_f32_to_i32': ['_w2l_trunc_sat_s_f64_to_i32'],
  '_w2l_trunc_sat_u_f32_to_i32': ['_w2l_trunc_sat_u_f64_to_i32'],
  '_w2l_trunc_sat_s_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_trunc_sat_u_f64_to_i32': ['_w2l_trunc_f64'],
  '_w2l_convert_u_i32_to_f32': [],
  '_w2l_convert_u_i32_to_f64': [],
  '_w2l_reinterpret_f32_to_i32': [],
  '_w2l_reinterpret_i32_to_f32': [],
  '_w2l_memory_fill': [],
  '_w2l_memory_copy': [],
  '_w2l_memory_grow': []
};

/** @override @protected @return {?Object<string, !Array<string>>} */
Wasm2Lang.Backend.Php64Codegen.prototype.getHelperDeps_ = function () {
  return Wasm2Lang.Backend.Php64Codegen.HELPER_DEPS_;
};

/**
 * Emits PHP runtime helper function definitions.  Called from emitCode after
 * function bodies are emitted (so {@code usedHelpers_} is populated) and
 * before {@code usedHelpers_} is reset.  The two core coercion helpers
 * ({@code _w2l_i}, {@code _w2l_f32}) are always emitted unconditionally —
 * they are registered as fixed module bindings rather than helpers.  All
 * other helpers route through the shared {@code emitOrCollectHelper_}
 * funnel so the set of emittable names is auto-derived for mangling.
 *
 * @override
 * @protected
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitHelpers_ = function (
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
  var /** @const */ self = this;
  /** @param {string} s @return {string} */
  var n = function (s) {
    return self.n_(s);
  };
  var /** @const {string} */ nI = n('_w2l_i');
  var /** @const {string} */ nF32 = n('_w2l_f32');
  /** @param {string} name @param {string} body */
  var h = function (name, body) {
    self.emitOrCollectHelper_(lines, name, null, 'function ' + n(name) + body);
  };

  // Core coercion helpers (unconditional).  Skipped in collect mode: they
  // live in getFixedModuleBindings_, not in the helper roster.
  if (!this.helperNameCollector_) {
    lines[lines.length] =
      'function ' + nI + '($v): int { $v = (int)$v; $v &= 0xFFFFFFFF; return ($v > 2147483647) ? ($v - 4294967296) : $v; }';
    lines[lines.length] = 'function ' + nF32 + "($v): float { return unpack('g', pack('g', (float)$v))[1]; }";
  }

  // Opcode-specific helpers (only when referenced).
  h('_w2l_extend8_s', '(int $v): int { $v &= 0xFF; return $v >= 0x80 ? $v - 0x100 : $v; }');
  h('_w2l_extend16_s', '(int $v): int { $v &= 0xFFFF; return $v >= 0x8000 ? $v - 0x10000 : $v; }');
  h(
    '_w2l_clz',
    '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 0x80000000)) { ++$n; $v = ($v << 1) & 0xFFFFFFFF; } return $n; }'
  );
  h(
    '_w2l_ctz',
    '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 1)) { ++$n; $v >>= 1; } return $n; }'
  );
  h(
    '_w2l_popcnt',
    '(int $v): int { $v = ' + nI + '($v) & 0xFFFFFFFF; $n = 0; while (0 !== $v) { $n += $v & 1; $v >>= 1; } return $n; }'
  );
  h(
    '_w2l_imul',
    '(int $a, int $b): int { $al = $a & 0xFFFF; $ah = ($a >> 16) & 0xFFFF; return ' +
      nI +
      '($al * ($b & 0xFFFF) + (($ah * ($b & 0xFFFF) + $al * (($b >> 16) & 0xFFFF)) << 16)); }'
  );
  h('_w2l_copysign_f64', '($x, $y): float { $x = abs((float)$x); return (ord(pack("E", (float)$y)[0]) & 128) ? -$x : $x; }');
  h('_w2l_copysign_f32', '($x, $y): float { return ' + nF32 + '(' + n('_w2l_copysign_f64') + '($x, $y)); }');
  h('_w2l_trunc_f64', '($x): float { $x = (float)$x; return $x < 0.0 ? ceil($x) : floor($x); }');
  h('_w2l_trunc_f32', '($x): float { return ' + nF32 + '(' + n('_w2l_trunc_f64') + '($x)); }');
  h('_w2l_nearest_f64', '($x): float { return round((float)$x, 0, PHP_ROUND_HALF_EVEN); }');
  h('_w2l_nearest_f32', '($x): float { return ' + nF32 + '(' + n('_w2l_nearest_f64') + '($x)); }');
  h('_w2l_trunc_s_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_s_f64_to_i32') + '(' + nF32 + '($x)); }');
  h('_w2l_trunc_u_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_u_f64_to_i32') + '(' + nF32 + '($x)); }');
  // prettier-ignore
  h(
    '_w2l_trunc_s_f64_to_i32',
    '($x): int { if (is_nan($x) || is_infinite($x)) throw new \\RuntimeException(); $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); if ($x >= 2147483648.0 || $x < -2147483648.0) throw new \\RuntimeException(); return ' +
      nI +
      '((int)$x); }'
  );
  // prettier-ignore
  h(
    '_w2l_trunc_u_f64_to_i32',
    '($x): int { if (is_nan($x) || is_infinite($x)) throw new \\RuntimeException(); $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); if ($x >= 4294967296.0 || $x < 0.0) throw new \\RuntimeException(); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }'
  );
  h('_w2l_trunc_sat_s_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_sat_s_f64_to_i32') + '(' + nF32 + '($x)); }');
  h('_w2l_trunc_sat_u_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_sat_u_f64_to_i32') + '(' + nF32 + '($x)); }');
  h(
    '_w2l_trunc_sat_s_f64_to_i32',
    '($x): int { $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); return is_nan($x) ? 0 : ($x >= 2147483648.0 ? ' +
      nI +
      '(2147483647) : ($x <= -2147483649.0 ? ' +
      nI +
      '(-2147483648) : ' +
      nI +
      '((int)$x))); }'
  );
  h(
    '_w2l_trunc_sat_u_f64_to_i32',
    '($x): int { $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); if (is_nan($x) || $x < 0.0) return 0; if ($x >= 4294967296.0) return ' +
      nI +
      '(-1); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }'
  );
  h('_w2l_convert_u_i32_to_f32', '($x): float { $x = ' + nI + '($x); return ' + nF32 + '($x < 0 ? $x + 4294967296.0 : $x); }');
  h('_w2l_convert_u_i32_to_f64', '($x): float { $x = ' + nI + '($x); return $x < 0 ? $x + 4294967296.0 : (float)$x; }');
  h('_w2l_reinterpret_f32_to_i32', '($x): int { return ' + nI + "(unpack('V', pack('g', " + nF32 + '($x)))[1]); }');
  h('_w2l_reinterpret_i32_to_f32', '($x): float { return ' + nF32 + "(unpack('g', pack('V', " + nI + '($x)))[1]); }');
  h(
    '_w2l_memory_fill',
    '(string &$buf, int $d, int $v, int $n): void { $buf = substr_replace($buf, str_repeat(chr($v & 0xFF), $n), $d, $n); }'
  );
  h(
    '_w2l_memory_copy',
    '(string &$buf, int $d, int $s, int $n): void { $buf = substr_replace($buf, substr($buf, $s, $n), $d, $n); }'
  );
  h(
    '_w2l_memory_grow',
    '(string &$buf, int $delta): int { $p = (int)(strlen($buf) / 65536); if ($delta === 0) return $p; $buf .= str_repeat("\\x00", $delta * 65536); return $p; }'
  );

  return lines;
};
