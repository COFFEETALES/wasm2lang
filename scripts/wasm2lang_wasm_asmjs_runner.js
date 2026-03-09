'use strict';

const isNode = 'object' === typeof process && 'object' === typeof process.versions && 'string' === typeof process.versions.node;

const isSpiderMonkey = 'function' === typeof print && 'function' === typeof readline;

const stdoutWrite = isNode ? process.stdout.write.bind(process.stdout) : putstr;

if (!isNode && !isSpiderMonkey) {
  throw new Error('Unsupported runtime environment.');
}

const obj = Object.create(null);
obj['test-name'] = '';
obj['asmjs'] = false;
obj['wasm'] = false;

var /** string */ pendingOptionName = '';
(isNode ? process.argv.slice(2) : scriptArgs).forEach(currentArg => {
  if ('--' === currentArg.substring(0, 2)) {
    if (2 === currentArg.length) {
      return;
    }
    pendingOptionName = '';
    obj[currentArg.slice(2)] = true;
    pendingOptionName = currentArg;
  } else if ('' !== pendingOptionName) {
    obj[pendingOptionName.slice(2)] = currentArg;
    pendingOptionName = '';
  }
});

const asmjs = !!obj['asmjs'];
const testName = obj['test-name'];
const wasm = !!obj['wasm'];

(async function () {
  const harness = await import(['./', testName, '.harness.mjs'].join(''));

  let instanceMemoryBuffer = null;

  if (wasm) {
    let bin = null;
    if (isNode) {
      const fs = require('fs');
      bin = fs.readFileSync(0);
    } else {
      throw new Error('WASM input via stdin not supported in this environment.');
    }

    const instance = new WebAssembly.Instance(new WebAssembly.Module(bin), {
      'module': harness.moduleImports
    });
    instanceMemoryBuffer = instance.exports.memory.buffer;
    harness.runTest(instanceMemoryBuffer, stdoutWrite, instance.exports);
  }
  if (asmjs) {
    let code = '';
    if (isNode) {
      const fs = require('fs');
      code = fs.readFileSync(0, {encoding: 'utf8'});
    } else {
      let line;
      while (null !== (line = readline())) {
        code += line + '\n';
      }
    }

    const [memBuffer, module] = eval([code, '[memBuffer, module]'].join('\n'));

    if (isSpiderMonkey) {
      if ([isAsmJSCompilationAvailable(), isAsmJSModule(module)].includes(false)) {
        throw new Error('ASM.js module validation failed.');
      }
    }

    const l = module(isNode ? global : globalThis, harness.moduleImports, memBuffer);
    harness.runTest((instanceMemoryBuffer = memBuffer), stdoutWrite, l);
  }

  if (harness.dumpMemory) {
    const bytes = new Uint8Array(instanceMemoryBuffer);
    /*
    const lookupTable = (function buildCRC32LookupTable(polynomial) {
      const table = [];
      for (let n = 0; n != 256; ++n) {
        let reminder = n;
        for (let i = 0; i != 8; ++i) {
          if (reminder & 1) {
            reminder = (reminder >>> 1) ^ polynomial;
          } else {
            reminder = reminder >>> 1;
          }
        }
        table[table.length] = reminder >>> 0;
      }
      return table;
    })(0xedb88320);

    // $ echo "import binascii; print(hex(binascii.crc32(b'HELLO WORLD')));" | python
    //const bytes = (new TextEncoder()).encode('HELLO WORLD');

    let crc = 0xffffffff;
    for (const byte of bytes) {
      const tableIndex = (crc ^ byte) & 0xff;
      const tableVal = lookupTable[tableIndex];
      if (tableVal === undefined)
        throw new Error('tableIndex out of range 0-255');
      crc = (crc >>> 8) ^ tableVal;
    }
    */

    let crc32 = function (bytes) {
      let crc = 0xffffffff;

      for (let i = 0; i !== bytes.byteLength; ++i) {
        let ch = bytes[i] & 0xff;

        for (let j = 0; j !== 8; ++j) {
          const b = (ch ^ crc) & 1;
          crc >>>= 1;
          if (b) crc ^= 0xedb88320;
          ch >>= 1;
        }
      }

      return ~crc >>> 0; // unsigned 32-bit result
    };

    //stdoutWrite(
    //  'Memory CRC32: 0x' +
    //    ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0') +
    //    '\n'
    //);
    stdoutWrite('Memory CRC32: 0x' + crc32(bytes).toString(16).padStart(8, '0') + '\n');
  }
})();
