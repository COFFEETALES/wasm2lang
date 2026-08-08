'use strict';

// Widening integer SIMD ops (wasm reference).
//
// Prints one line per exported function.  The runner diffs this against the
// reference produced by the ORIGINAL wasm module, so an extmul half taken
// from the wrong end, a saturating clamp at the wrong bound, or a narrow that
// truncates where wasm saturates shows up as a line difference.
const moduleImports = {};

const runTest = function (buff, out, exports) {
  void buff;
  out('extmul_low_s_16=' + exports.extmul_low_s_16() + '\n');
  out('extmul_low_s_16b=' + exports.extmul_low_s_16b() + '\n');
  out('extmul_high_s_16=' + exports.extmul_high_s_16() + '\n');
  out('extmul_low_u_16=' + exports.extmul_low_u_16() + '\n');
  out('extmul_high_u_16=' + exports.extmul_high_u_16() + '\n');
  out('extmul_low_s_32=' + exports.extmul_low_s_32() + '\n');
  out('extmul_high_s_32=' + exports.extmul_high_s_32() + '\n');
  out('extmul_low_u_32=' + exports.extmul_low_u_32() + '\n');
  out('extmul_high_u_32=' + exports.extmul_high_u_32() + '\n');
  out('extmul_low_s_64=' + exports.extmul_low_s_64() + '\n');
  out('extmul_low_s_64h=' + exports.extmul_low_s_64h() + '\n');
  out('extmul_high_s_64=' + exports.extmul_high_s_64() + '\n');
  out('extmul_low_u_64=' + exports.extmul_low_u_64() + '\n');
  out('extmul_high_u_64=' + exports.extmul_high_u_64() + '\n');
  out('narrow_u_8=' + exports.narrow_u_8() + '\n');
  out('narrow_u_8b=' + exports.narrow_u_8b() + '\n');
  out('narrow_u_16=' + exports.narrow_u_16() + '\n');
  out('narrow_u_16b=' + exports.narrow_u_16b() + '\n');
  out('narrow_s_8=' + exports.narrow_s_8() + '\n');
  out('narrow_s_16=' + exports.narrow_s_16() + '\n');
  out('extend_low_s_16=' + exports.extend_low_s_16() + '\n');
  out('extend_high_s_16=' + exports.extend_high_s_16() + '\n');
  out('extend_low_u_16=' + exports.extend_low_u_16() + '\n');
  out('extend_high_u_16=' + exports.extend_high_u_16() + '\n');
  out('extend_low_s_32=' + exports.extend_low_s_32() + '\n');
  out('extend_high_u_32=' + exports.extend_high_u_32() + '\n');
  out('add_sat_s_8=' + exports.add_sat_s_8() + '\n');
  out('add_sat_u_8=' + exports.add_sat_u_8() + '\n');
  out('sub_sat_s_8=' + exports.sub_sat_s_8() + '\n');
  out('sub_sat_u_8=' + exports.sub_sat_u_8() + '\n');
  out('add_sat_s_16=' + exports.add_sat_s_16() + '\n');
  out('add_sat_u_16=' + exports.add_sat_u_16() + '\n');
  out('sub_sat_s_16=' + exports.sub_sat_s_16() + '\n');
  out('sub_sat_u_16=' + exports.sub_sat_u_16() + '\n');
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
