'use strict';

const moduleImports = {};

const runTest = function (buff, out, exports, data) {
  exports.alignHeapTop();

  for (const q of data.quads) {
    exports.exerciseSIMDLanes(q[0], q[1], q[2], q[3]);
  }
  for (const p of data.pairs) {
    exports.exerciseSIMDArithmetic(p[0], p[1]);
  }
  for (const p of data.pairs) {
    exports.exerciseSIMDBitwise(p[0], p[1]);
  }
  for (const p of data.shift_pairs) {
    exports.exerciseSIMDShift(p[0], p[1]);
  }
  for (const p of data.pairs) {
    exports.exerciseSIMDCompare(p[0], p[1]);
  }
  for (const q of data.quads) {
    exports.exerciseSIMDShuffle(q[0], q[1], q[2], q[3]);
  }
  for (const q of data.quads) {
    exports.exerciseSIMDMemory(q[0], q[1], q[2], q[3]);
  }

  const simdAssert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const bytes = new Uint8Array(buff);
  const simdCapacity = bytes.length;
  const simdBase = simdCapacity - 256;
  for (let alignment = 0; alignment < 16; ++alignment) {
    const src = simdBase + alignment;
    const dst = simdBase + 64 + alignment;
    for (let i = 0; i < 16; ++i) {
      bytes[src + i] = (alignment * 17 + i * 13 + 3) & 0xff;
      bytes[dst + i] = 0xa5;
    }
    exports.copySIMD16(src, dst);
    for (let i = 0; i < 16; ++i) {
      simdAssert(bytes[dst + i] === ((alignment * 17 + i * 13 + 3) & 0xff), 'unaligned heap v128 copy mismatch');
    }
  }

  const lastValid = simdCapacity - 16;
  const validSource = simdBase + 128;
  for (let i = 0; i < 16; ++i) {
    bytes[validSource + i] = (i * 7 + 1) & 0xff;
    bytes[lastValid + i] = 0x6d;
  }
  exports.copySIMD16(validSource, lastValid);
  for (let i = 0; i < 16; ++i) {
    simdAssert(bytes[lastValid + i] === ((i * 7 + 1) & 0xff), 'last-valid v128 copy mismatch');
  }

  const validDestination = simdBase + 160;
  bytes.fill(0x5c, validDestination, validDestination + 16);
  let trapped = false;
  try {
    exports.copySIMD16(simdCapacity - 15, validDestination);
  } catch (e) {
    trapped = e instanceof WebAssembly.RuntimeError;
  }
  simdAssert(trapped, 'out-of-bounds v128 load did not trap');
  for (let i = 0; i < 16; ++i) {
    simdAssert(bytes[validDestination + i] === 0x5c, 'failed v128 load modified its destination');
  }
  trapped = false;
  try {
    exports.copySIMD16(-1, validDestination);
  } catch (e) {
    trapped = e instanceof WebAssembly.RuntimeError;
  }
  simdAssert(trapped, 'negative v128 load did not trap');

  bytes.fill(0x37, simdCapacity - 15, simdCapacity);
  trapped = false;
  try {
    exports.copySIMD16(validSource, simdCapacity - 15);
  } catch (e) {
    trapped = e instanceof WebAssembly.RuntimeError;
  }
  simdAssert(trapped, 'out-of-bounds v128 store did not trap');
  for (let i = 0; i < 15; ++i) {
    simdAssert(bytes[simdCapacity - 15 + i] === 0x37, 'failed v128 store wrote a partial vector');
  }
  trapped = false;
  try {
    exports.copySIMD16(validSource, -1);
  } catch (e) {
    trapped = e instanceof WebAssembly.RuntimeError;
  }
  simdAssert(trapped, 'negative v128 store did not trap');

  // One store(load) expression reads the full v128 before writing. This does
  // not define aliasing for any multi-iteration copy primitive.
  const overlap = simdBase + 192;
  for (let i = 0; i < 32; ++i) bytes[overlap + i] = 0x20 + i;
  exports.copySIMD16(overlap, overlap + 8);
  for (let i = 0; i < 16; ++i) {
    simdAssert(bytes[overlap + 8 + i] === 0x20 + i, 'overlapping v128 load/store lost source bytes');
  }

  exports.exerciseSIMDEdgeCases();
  exports.exerciseSIMDSelectEvaluation();
};

const dumpMemory = true;

export {dumpMemory, moduleImports, runTest};
