'use strict';

/**
 * Formats a 64-bit value (given as two unsigned 32-bit halves) as a C#
 * {@code long} literal.  A hex literal with bit 63 set has type
 * {@code ulong} in C#, so negative values wrap in
 * {@code unchecked((long)0x…UL)}.
 *
 * @private
 * @param {number} lowUnsigned   Low 32 bits (unsigned, 0..0xFFFFFFFF).
 * @param {number} highUnsigned  High 32 bits (unsigned, 0..0xFFFFFFFF).
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.formatCsharpI64Literal_ = function (lowUnsigned, highUnsigned) {
  if (0 === highUnsigned) {
    return 0 === lowUnsigned ? '0L' : String(lowUnsigned) + 'L';
  }
  var /** @const */ hex = Wasm2Lang.Backend.AbstractCodegen.renderI64HexLiteral_;
  if (0 !== (highUnsigned & 0x80000000)) {
    return 'unchecked((long)' + hex(highUnsigned | 0, lowUnsigned, 'UL') + ')';
  }
  return hex(highUnsigned | 0, lowUnsigned, 'L');
};

/**
 * Emits C# init lines using 64-bit {@code w8()} writes with {@code w4()}
 * fallback for odd leading/trailing words.  {@code w8}/{@code w4} are local
 * functions declared by {@code emitMetadata}; this method reports which of
 * them the lines reference via the {@code used} record so unused declarations
 * are skipped.
 *
 * @param {!Int32Array} i32
 * @param {number} startWordIndex
 * @param {{usedW8: boolean, usedW4: boolean}} used
 * @return {!Array<string>}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitStaticI64InitLines_ = function (i32, startWordIndex, used) {
  var /** @const {!Array<string>} */ lines = [];
  var /** @const {number} */ wordCount = i32.length;
  var /** @const */ fmt = Wasm2Lang.Backend.CsharpCodegen.formatCsharpI64Literal_;
  var /** @const {number} */ fillThreshold = 8;
  var /** @type {number} */ pos = 0;

  // Handle leading odd word (startWordIndex is odd).
  if (startWordIndex & 1) {
    if (pos < wordCount && 0 !== i32[pos]) {
      used.usedW4 = true;
      lines[lines.length] = 'w4(' + startWordIndex * 4 + ', ' + String(i32[pos]) + ');';
    }
    pos = 1;
  }

  // Compute pair range.
  var /** @const {number} */ remaining = wordCount - pos;
  var /** @const {number} */ pairEnd = pos + remaining - (remaining % 2);

  // Main i64 loop over pairs [pos, pairEnd) stepping by 2.
  while (pos < pairEnd) {
    var /** @const {number} */ lowSigned = i32[pos];
    var /** @const {number} */ highSigned = i32[pos + 1];

    // Skip zero pairs.
    if (0 === lowSigned && 0 === highSigned) {
      pos += 2;
      continue;
    }

    // Check for fill: count consecutive identical pairs.
    var /** @type {number} */ fillEnd = pos + 2;
    while (fillEnd + 1 < pairEnd && i32[fillEnd] === lowSigned && i32[fillEnd + 1] === highSigned) {
      fillEnd += 2;
    }
    var /** @const {number} */ pairCount = (fillEnd - pos) >>> 1;

    if (pairCount >= fillThreshold) {
      var /** @const {number} */ fillByte = (startWordIndex + pos) * 4;
      var /** @const {string} */ fillLit = fmt(lowSigned >>> 0, highSigned >>> 0);
      used.usedW8 = true;
      lines[lines.length] = 'for (int i = 0; i < ' + pairCount + '; ++i) w8(' + fillByte + ' + i * 8, ' + fillLit + ');';
      pos = fillEnd;
      continue;
    }

    // Set: emit individual w8 calls until zero pair or fill-worthy run.
    while (pos < pairEnd) {
      var /** @const {number} */ sLow = i32[pos];
      var /** @const {number} */ sHigh = i32[pos + 1];

      if (0 === sLow && 0 === sHigh) {
        pos += 2;
        continue;
      }

      // Peek ahead for fill.
      var /** @type {number} */ peekEnd = pos + 2;
      while (peekEnd + 1 < pairEnd && i32[peekEnd] === sLow && i32[peekEnd + 1] === sHigh) {
        peekEnd += 2;
      }
      if ((peekEnd - pos) >>> 1 >= fillThreshold) {
        break;
      }

      var /** @const {number} */ setByte = (startWordIndex + pos) * 4;
      used.usedW8 = true;
      lines[lines.length] = 'w8(' + setByte + ', ' + fmt(sLow >>> 0, sHigh >>> 0) + ');';
      pos += 2;
    }
  }

  // Handle trailing odd word.
  if (pairEnd < wordCount && 0 !== i32[pairEnd]) {
    var /** @const {number} */ trailByte = (startWordIndex + pairEnd) * 4;
    used.usedW4 = true;
    lines[lines.length] = 'w4(' + trailByte + ', ' + String(i32[pairEnd]) + ');';
  }

  return lines;
};

/**
 * Emits the static memory block as a complete C# compilation unit: a static
 * factory class declaring a zero-initialized {@code byte[]} and writing the
 * data segments through little-endian local functions.  Unlike Java's jshell
 * snippet, C# consumers (Add-Type, csc) cannot compile bare top-level
 * statements next to a class declaration, so the buffer is exposed as
 * {@code Wasm<Name>.<name>()}.
 *
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.CsharpCodegen.prototype.emitMetadata = function (wasmModule, options) {
  var /** @const {string} */ bufferName = /** @type {string} */ (options.emitMetadata);
  var /** @const {string} */ holderName = 'Wasm' + bufferName.charAt(0).toUpperCase() + bufferName.substring(1);
  var /** @const {number} */ heapSize = this.resolveHeapSize_(wasmModule, options, 'CSHARP_HEAP_SIZE');
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.StaticMemoryInfo_} */ staticMemory = this.collectStaticMemory_(wasmModule);
  var /** @const {number} */ startWordIndex = staticMemory.startWordIndex;
  var /** @const {!Int32Array} */ i32 = staticMemory.words;
  var /** @const */ pad = Wasm2Lang.Backend.AbstractCodegen.pad_;
  var /** @const {string} */ pad1 = pad(1);
  var /** @const {string} */ pad2 = pad(2);
  var /** @const {!Array<string>} */ lines = [];

  var /** @const {{usedW8: boolean, usedW4: boolean}} */ used = {usedW8: false, usedW4: false};
  var /** @const {!Array<string>} */ initLines =
      0 !== i32.length ? this.emitStaticI64InitLines_(i32, startWordIndex, used) : [];

  lines[lines.length] = 'public static class ' + holderName + ' {';
  lines[lines.length] = pad1 + 'public static byte[] ' + bufferName + '() {';
  lines[lines.length] = pad2 + 'byte[] b = new byte[' + heapSize + '];';
  if (used.usedW8) {
    lines[lines.length] =
      pad2 +
      'void w8(int o, long v) { ' +
      'System.Buffers.Binary.BinaryPrimitives.WriteInt64LittleEndian(System.MemoryExtensions.AsSpan(b, o), v); }';
  }
  if (used.usedW4) {
    lines[lines.length] =
      pad2 +
      'void w4(int o, int v) { ' +
      'System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(System.MemoryExtensions.AsSpan(b, o), v); }';
  }
  for (
    var /** @type {number} */ ii = 0, /** @const {number} */ initLinesCount = initLines.length;
    ii !== initLinesCount;
    ++ii
  ) {
    lines[lines.length] = pad2 + initLines[ii];
  }
  lines[lines.length] = pad2 + 'return b;';
  lines[lines.length] = pad1 + '}';
  lines[lines.length] = '}';

  return lines.join('\n');
};
