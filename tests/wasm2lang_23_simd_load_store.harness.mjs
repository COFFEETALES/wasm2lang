'use strict';

// SIMD load/store family (wasm reference).
//
// Prints one line per exported function.  The runner diffs this against the
// reference produced by the ORIGINAL wasm module, so a full-width load, a wrong splat width
// a missing sign extension or a fixed 32-bit lane shows up as a line
// difference.
const moduleImports = {};

const runTest = function (buff, out, exports) {
  void buff;
  out('load8_splat=' + exports.load8_splat() + '\n');
  out('load16_splat=' + exports.load16_splat() + '\n');
  out('load32_splat=' + exports.load32_splat() + '\n');
  out('load64_splat=' + exports.load64_splat() + '\n');
  out('load64_splat_hi=' + exports.load64_splat_hi() + '\n');
  out('load8x8_s=' + exports.load8x8_s() + '\n');
  out('load8x8_u=' + exports.load8x8_u() + '\n');
  out('load8x8_s_hi=' + exports.load8x8_s_hi() + '\n');
  out('load8x8_s_off=' + exports.load8x8_s_off() + '\n');
  out('load8x8_u_off=' + exports.load8x8_u_off() + '\n');
  out('load16x4_s=' + exports.load16x4_s() + '\n');
  out('load16x4_u=' + exports.load16x4_u() + '\n');
  out('load16x4_s_off=' + exports.load16x4_s_off() + '\n');
  out('load32x2_s=' + exports.load32x2_s() + '\n');
  out('load32x2_s_hi=' + exports.load32x2_s_hi() + '\n');
  out('load32x2_u_hi=' + exports.load32x2_u_hi() + '\n');
  out('load32_zero=' + exports.load32_zero() + '\n');
  out('load32_zero_hi=' + exports.load32_zero_hi() + '\n');
  out('load64_zero=' + exports.load64_zero() + '\n');
  out('load64_zero_hi=' + exports.load64_zero_hi() + '\n');
  out('load8_lane=' + exports.load8_lane() + '\n');
  out('load16_lane=' + exports.load16_lane() + '\n');
  out('load32_lane=' + exports.load32_lane() + '\n');
  out('load64_lane=' + exports.load64_lane() + '\n');
  out('load8_lane_keep=' + exports.load8_lane_keep() + '\n');
  out('load16_lane_keep=' + exports.load16_lane_keep() + '\n');
  out('load32_lane_keep=' + exports.load32_lane_keep() + '\n');
  out('store8_lane=' + exports.store8_lane() + '\n');
  out('store16_lane=' + exports.store16_lane() + '\n');
  out('store32_lane=' + exports.store32_lane() + '\n');
  out('store64_lane=' + exports.store64_lane() + '\n');
  out('store32_lane_keep=' + exports.store32_lane_keep() + '\n');
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
