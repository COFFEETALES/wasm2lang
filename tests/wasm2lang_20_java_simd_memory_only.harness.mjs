'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports) {
  void out;
  const bytes = new Uint8Array(buff);
  for (let alignment = 0; alignment < 16; ++alignment) {
    const src = 256 + alignment;
    const dst = 512 + alignment;
    for (let i = 0; i < 16; ++i) {
      bytes[src + i] = (alignment * 19 + i * 11 + 5) & 0xff;
      bytes[dst + i] = 0x55;
    }
    exports.copySIMD16(src, dst);
    for (let i = 0; i < 16; ++i) {
      if (bytes[dst + i] !== ((alignment * 19 + i * 11 + 5) & 0xff)) {
        throw new Error('memory-only SIMD copy mismatch');
      }
    }
  }
  if (exports.copySIMD16Effectful(256, 512) !== 12) {
    throw new Error('fused SIMD copy changed destination/source evaluation order');
  }
  let trapped = false;
  try {
    exports.copySIMD16Effectful(-1, bytes.length - 15);
  } catch (e) {
    trapped = e instanceof WebAssembly.RuntimeError;
  }
  if (!trapped || exports.getCopyTrace() !== 12) {
    throw new Error('fused SIMD copy changed pointer evaluation before a trap');
  }
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
