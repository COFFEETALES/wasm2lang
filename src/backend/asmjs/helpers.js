'use strict';

/**
 * Emits only the helpers that were referenced during function body emission.
 *
 * @param {number} scratchByteOffset
 * @param {number} scratchWordIndex
 * @param {number} scratchQwordIndex
 * @param {number} heapPageCount
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.AsmjsCodegen.prototype.emitHelpers_ = function (
  scratchByteOffset,
  scratchWordIndex,
  scratchQwordIndex,
  heapPageCount
) {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_ || {};
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {string} */ pad3 = pad(3);
  var /** @const {string} */ pad4 = pad(4);

  // Pre-resolve mangled names used across multiple helpers.
  var /** @const */ self = this;
  /** @param {string} s @return {string} */
  var n = function (s) {
    return self.n_(s);
  };
  var /** @const {string} */ l0 = this.localN_(0);
  var /** @const {string} */ l1 = this.localN_(1);
  var /** @const {string} */ l2 = this.localN_(2);
  var /** @const {string} */ l3 = this.localN_(3);
  var /** @const {string} */ nHEAPU8 = n('HEAPU8');
  var /** @const {string} */ nHEAP32 = n('HEAP32');
  var /** @const {string} */ nHEAPF32 = n('HEAPF32');
  var /** @const {string} */ nHEAPF64 = n('HEAPF64');
  var /** @const {string} */ nMathFround = n('Math_fround');
  var /** @const {string} */ nMathAbs = n('Math_abs');
  var /** @const {string} */ nMathCeil = n('Math_ceil');
  var /** @const {string} */ nMathFloor = n('Math_floor');
  var /** @const {string} */ nMathClz32 = n('Math_clz32');

  /**
   * Conditionally emit a helper: guard on used[], mark bindings, push body.
   * @param {string} name
   * @param {!Array<string>} bindings
   * @param {string} body
   */
  var h = function (name, bindings, body) {
    if (!used[name]) return;
    for (var bi = 0; bi < bindings.length; ++bi) self.markBinding_(bindings[bi]);
    lines[lines.length] = body;
  };

  /**
   * Generate byte-copy lines between memory pointer and scratch area.
   * @param {number} count Number of bytes (4 or 8).
   * @param {boolean} toMemory true = scratch→memory (store), false = memory→scratch (load).
   * @return {string} Newline-prefixed copy statements.
   */
  var byteCopy = function (count, toMemory) {
    var /** @type {string} */ s = '';
    for (var bi = 0; bi < count; ++bi) {
      var /** @const {string} */ ptrExpr = nHEAPU8 + '[' + (0 === bi ? l0 + ' >> 0' : l0 + ' + ' + String(bi) + ' >> 0') + ']';
      var /** @const {string} */ scrExpr = nHEAPU8 + '[' + String(scratchByteOffset + bi) + ']';
      s += '\n' + pad2 + (toMemory ? ptrExpr + ' = ' + scrExpr : scrExpr + ' = ' + ptrExpr) + ';';
    }
    return s;
  };

  // prettier-ignore
  h('$w2l_ctz', ['Math_clz32'],
    pad1 + 'function ' + n('$w2l_ctz') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + 'var ' + l1 + ' = 0;\n' +
    pad2 + 'if ((' + l0 + '|0) == 0) {\n' +
    pad3 + 'return 32|0;\n' +
    pad2 + '}\n' +
    pad2 + l1 + ' = ' + l0 + ' & (-' + l0 + '|0);\n' +
    pad2 + 'return 32 - ' + nMathClz32 + '(' + l1 + ' - 1|0)|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_popcnt', [],
    pad1 + 'function ' + n('$w2l_popcnt') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + 'var ' + l1 + ' = 0;\n' +
    pad2 + 'while ((' + l0 + '|0) != 0) {\n' +
    pad3 + l0 + ' = ' + l0 + ' & (' + l0 + ' - 1|0);\n' +
    pad3 + l1 + ' = ' + l1 + ' + 1|0;\n' +
    pad2 + '}\n' +
    pad2 + 'return ' + l1 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_copysign_f64', ['Math_abs'],
    pad1 + 'function ' + n('$w2l_copysign_f64') + '(' + l0 + ', ' + l1 + ') {\n' +
    pad2 + l0 + ' = +' + l0 + ';\n' +
    pad2 + l1 + ' = +' + l1 + ';\n' +
    pad2 + l0 + ' = +' + nMathAbs + '(' + l0 + ');\n' +
    pad2 + 'if (' + l1 + ' < 0.0) {\n' +
    pad3 + 'return +(-' + l0 + ');\n' +
    pad2 + '}\n' +
    pad2 + 'if (' + l1 + ' == 0.0) {\n' +
    pad3 + 'if (1.0 / ' + l1 + ' < 0.0) {\n' +
    pad4 + 'return +(-' + l0 + ');\n' +
    pad3 + '}\n' +
    pad2 + '}\n' +
    pad2 + 'return +' + l0 + ';\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_copysign_f32', ['Math_abs', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_copysign_f32') + '(' + l0 + ', ' + l1 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + l1 + ' = ' + nMathFround + '(' + l1 + ');\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + nMathAbs + '(+' + l0 + '));\n' +
    pad2 + 'if (' + l1 + ' < ' + nMathFround + '(0.0)) {\n' +
    pad3 + 'return ' + nMathFround + '(-' + l0 + ');\n' +
    pad2 + '}\n' +
    pad2 + 'if (' + l1 + ' == ' + nMathFround + '(0.0)) {\n' +
    pad3 + 'if (1.0 / +' + l1 + ' < 0.0) {\n' +
    pad4 + 'return ' + nMathFround + '(-' + l0 + ');\n' +
    pad3 + '}\n' +
    pad2 + '}\n' +
    pad2 + 'return ' + nMathFround + '(' + l0 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_f64', ['Math_ceil', 'Math_floor'],
    pad1 + 'function ' + n('$w2l_trunc_f64') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = +' + l0 + ';\n' +
    pad2 + 'return +(' + l0 + ' < 0.0 ? ' + nMathCeil + '(' + l0 + ') : ' + nMathFloor + '(' + l0 + '));\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_f32', ['Math_ceil', 'Math_floor', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_trunc_f32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + 'return ' + nMathFround + '(+' + l0 + ' < 0.0 ? ' + nMathCeil + '(+' + l0 + ') : ' + nMathFloor + '(+' + l0 + '));\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_nearest_f64', ['Math_floor'],
    pad1 + 'function ' + n('$w2l_nearest_f64') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = +' + l0 + ';\n' +
    pad2 + 'var ' + l1 + ' = 0.0, ' + l2 + ' = 0.0, ' + l3 + ' = 0;\n' +
    pad2 + l1 + ' = ' + nMathFloor + '(' + l0 + ');\n' +
    pad2 + l2 + ' = +' + l0 + ' - +' + l1 + ';\n' +
    pad2 + 'if (' + l2 + ' < 0.5) {\n' +
    pad3 + 'return +' + l1 + ';\n' +
    pad2 + '}\n' +
    pad2 + 'if (' + l2 + ' > 0.5) {\n' +
    pad3 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (' + l0 + ' < 0.0) { return +(-0.0); } }\n' +
    pad3 + 'return +(' + l1 + ' + 1.0);\n' +
    pad2 + '}\n' +
    pad2 + l3 + ' = ~~' + l1 + ';\n' +
    pad2 + 'if ((' + l3 + ' & 1) == 0) {\n' +
    pad3 + 'return +' + l1 + ';\n' +
    pad2 + '}\n' +
    pad2 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (' + l0 + ' < 0.0) { return +(-0.0); } }\n' +
    pad2 + 'return +(' + l1 + ' + 1.0);\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_nearest_f32', ['Math_floor', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_nearest_f32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + 'var ' + l1 + ' = 0.0, ' + l2 + ' = 0.0, ' + l3 + ' = 0;\n' +
    pad2 + l1 + ' = ' + nMathFloor + '(+' + l0 + ');\n' +
    pad2 + l2 + ' = +' + l0 + ' - +' + l1 + ';\n' +
    pad2 + 'if (' + l2 + ' < 0.5) {\n' +
    pad3 + 'return ' + nMathFround + '(' + l1 + ');\n' +
    pad2 + '}\n' +
    pad2 + 'if (' + l2 + ' > 0.5) {\n' +
    pad3 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (+' + l0 + ' < 0.0) { return ' + nMathFround + '(-0.0); } }\n' +
    pad3 + 'return ' + nMathFround + '(' + l1 + ' + 1.0);\n' +
    pad2 + '}\n' +
    pad2 + l3 + ' = ~~' + l1 + ';\n' +
    pad2 + 'if ((' + l3 + ' & 1) == 0) {\n' +
    pad3 + 'return ' + nMathFround + '(' + l1 + ');\n' +
    pad2 + '}\n' +
    pad2 + 'if (+(' + l1 + ' + 1.0) == 0.0) { if (+' + l0 + ' < 0.0) { return ' + nMathFround + '(-0.0); } }\n' +
    pad2 + 'return ' + nMathFround + '(' + l1 + ' + 1.0);\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_u_f32_to_i32', ['Math_fround'],
    pad1 + 'function ' + n('$w2l_trunc_u_f32_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + 'if (+' + l0 + ' >= 2147483648.0) {\n' +
    pad3 + 'return (~~(+' + l0 + ' - 2147483648.0) + -2147483648)|0;\n' +
    pad2 + '}\n' +
    pad2 + 'return ~~+' + l0 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_u_f64_to_i32', [],
    pad1 + 'function ' + n('$w2l_trunc_u_f64_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = +' + l0 + ';\n' +
    pad2 + 'if (' + l0 + ' >= 2147483648.0) {\n' +
    pad3 + 'return (~~(' + l0 + ' - 2147483648.0) + -2147483648)|0;\n' +
    pad2 + '}\n' +
    pad2 + 'return ~~' + l0 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_sat_s_f32_to_i32', ['Math_fround'],
    pad1 + 'function ' + n('$w2l_trunc_sat_s_f32_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;\n' +
    pad2 + 'if (+' + l0 + ' >= 2147483648.0) return 2147483647|0;\n' +
    pad2 + 'if (+' + l0 + ' <= -2147483649.0) return -2147483648|0;\n' +
    pad2 + 'return ~~+' + l0 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_sat_u_f32_to_i32', ['Math_fround'],
    pad1 + 'function ' + n('$w2l_trunc_sat_u_f32_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;\n' +
    pad2 + 'if (+' + l0 + ' >= 4294967296.0) return -1|0;\n' +
    pad2 + 'if (+' + l0 + ' < 0.0) return 0;\n' +
    pad2 + 'if (+' + l0 + ' >= 2147483648.0) {\n' +
    pad3 + 'return (~~(+' + l0 + ' - 2147483648.0) + -2147483648)|0;\n' +
    pad2 + '}\n' +
    pad2 + 'return ~~+' + l0 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_sat_s_f64_to_i32', [],
    pad1 + 'function ' + n('$w2l_trunc_sat_s_f64_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = +' + l0 + ';\n' +
    pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;\n' +
    pad2 + 'if (' + l0 + ' >= 2147483648.0) return 2147483647|0;\n' +
    pad2 + 'if (' + l0 + ' <= -2147483649.0) return -2147483648|0;\n' +
    pad2 + 'return ~~' + l0 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_trunc_sat_u_f64_to_i32', [],
    pad1 + 'function ' + n('$w2l_trunc_sat_u_f64_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = +' + l0 + ';\n' +
    pad2 + 'if (' + l0 + ' != ' + l0 + ') return 0;\n' +
    pad2 + 'if (' + l0 + ' >= 4294967296.0) return -1|0;\n' +
    pad2 + 'if (' + l0 + ' < 0.0) return 0;\n' +
    pad2 + 'if (' + l0 + ' >= 2147483648.0) {\n' +
    pad3 + 'return (~~(' + l0 + ' - 2147483648.0) + -2147483648)|0;\n' +
    pad2 + '}\n' +
    pad2 + 'return ~~' + l0 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_store_f32', ['HEAPF32', 'HEAPU8', 'HEAP32', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_store_f32') + '(' + l0 + ', ' + l1 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + l1 + ' = ' + nMathFround + '(' + l1 + ');\n' +
    pad2 + nHEAPF32 + '[' + scratchWordIndex + '] = ' + nMathFround + '(' + l1 + ');' +
    byteCopy(4, true) + '\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_load_f32', ['HEAPF32', 'HEAPU8', 'HEAP32', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_load_f32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + 'var ' + l1 + ' = ' + nMathFround + '(0);' +
    byteCopy(4, false) + '\n' +
    pad2 + l1 + ' = ' + nMathFround + '(' + nHEAPF32 + '[' + scratchWordIndex + ']);\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;\n' +
    pad2 + 'return ' + nMathFround + '(' + l1 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_store_f64', ['HEAPF64', 'HEAPU8', 'HEAP32'],
    pad1 + 'function ' + n('$w2l_store_f64') + '(' + l0 + ', ' + l1 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + l1 + ' = +' + l1 + ';\n' +
    pad2 + nHEAPF64 + '[' + scratchQwordIndex + '] = ' + l1 + ';' +
    byteCopy(8, true) + '\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;\n' +
    pad2 + nHEAP32 + '[' + String(scratchWordIndex + 1) + '] = 0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_load_f64', ['HEAPF64', 'HEAPU8', 'HEAP32'],
    pad1 + 'function ' + n('$w2l_load_f64') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + 'var ' + l1 + ' = 0.0;' +
    byteCopy(8, false) + '\n' +
    pad2 + l1 + ' = +' + nHEAPF64 + '[' + scratchQwordIndex + '];\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;\n' +
    pad2 + nHEAP32 + '[' + String(scratchWordIndex + 1) + '] = 0;\n' +
    pad2 + 'return +' + l1 + ';\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_reinterpret_f32_to_i32', ['HEAPF32', 'HEAP32', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_reinterpret_f32_to_i32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + 'var ' + l1 + ' = 0;\n' +
    pad2 + nHEAPF32 + '[' + scratchWordIndex + '] = ' + nMathFround + '(' + l0 + ');\n' +
    pad2 + l1 + ' = ' + nHEAP32 + '[' + scratchWordIndex + ']|0;\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;\n' +
    pad2 + 'return ' + l1 + '|0;\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_reinterpret_i32_to_f32', ['HEAP32', 'HEAPF32', 'Math_fround'],
    pad1 + 'function ' + n('$w2l_reinterpret_i32_to_f32') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + 'var ' + l1 + ' = ' + nMathFround + '(0);\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = ' + l0 + ';\n' +
    pad2 + l1 + ' = ' + nMathFround + '(' + nHEAPF32 + '[' + scratchWordIndex + ']);\n' +
    pad2 + nHEAP32 + '[' + scratchWordIndex + '] = 0;\n' +
    pad2 + 'return ' + nMathFround + '(' + l1 + ');\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_memory_fill', ['HEAPU8'],
    pad1 + 'function ' + n('$w2l_memory_fill') + '(' + l0 + ', ' + l1 + ', ' + l2 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + l1 + ' = ' + l1 + '|0;\n' +
    pad2 + l2 + ' = ' + l2 + '|0;\n' +
    pad2 + 'var ' + l3 + ' = 0;\n' +
    pad2 + l3 + ' = (' + l0 + ' + ' + l2 + ')|0;\n' +
    pad2 + 'while ((' + l0 + '|0) < (' + l3 + '|0)) {\n' +
    pad3 + nHEAPU8 + '[' + l0 + ' >> 0] = ' + l1 + ';\n' +
    pad3 + l0 + ' = ' + l0 + ' + 1|0;\n' +
    pad2 + '}\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_memory_copy', ['HEAPU8'],
    pad1 + 'function ' + n('$w2l_memory_copy') + '(' + l0 + ', ' + l1 + ', ' + l2 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + l1 + ' = ' + l1 + '|0;\n' +
    pad2 + l2 + ' = ' + l2 + '|0;\n' +
    pad2 + 'var ' + l3 + ' = 0;\n' +
    pad2 + 'if ((' + l0 + '|0) <= (' + l1 + '|0)) {\n' +
    pad3 + l3 + ' = 0;\n' +
    pad3 + 'while ((' + l3 + '|0) < (' + l2 + '|0)) {\n' +
    pad4 + nHEAPU8 + '[(' + l0 + ' + ' + l3 + '|0) >> 0] = ' + nHEAPU8 + '[(' + l1 + ' + ' + l3 + '|0) >> 0]|0;\n' +
    pad4 + l3 + ' = ' + l3 + ' + 1|0;\n' +
    pad3 + '}\n' +
    pad2 + '} else {\n' +
    pad3 + l3 + ' = (' + l2 + ' - 1)|0;\n' +
    pad3 + 'while ((' + l3 + '|0) >= 0) {\n' +
    pad4 + nHEAPU8 + '[(' + l0 + ' + ' + l3 + '|0) >> 0] = ' + nHEAPU8 + '[(' + l1 + ' + ' + l3 + '|0) >> 0]|0;\n' +
    pad4 + l3 + ' = ' + l3 + ' - 1|0;\n' +
    pad3 + '}\n' +
    pad2 + '}\n' +
    pad1 + '}');

  // prettier-ignore
  h('$w2l_memory_grow', [],
    pad1 + 'function ' + n('$w2l_memory_grow') + '(' + l0 + ') {\n' +
    pad2 + l0 + ' = ' + l0 + '|0;\n' +
    pad2 + 'if ((' + l0 + '|0) == 0) {\n' +
    pad3 + 'return ' + String(heapPageCount) + '|0;\n' +
    pad2 + '}\n' +
    pad2 + 'return -1;\n' +
    pad1 + '}');

  return lines;
};
