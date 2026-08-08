// Differential SIMD harness: runs every exported i32-returning function of a
// .wast under the wasm oracle in V8 and under every backend that expresses v128
// natively — Java (Vector API) and C# (Vector128) — and reports per-function
// divergence.  The other three backends have no SIMD type and refuse v128, so
// there is nothing to compare for them.
//
//   node scripts/wasm2lang_simd_diff.mjs <fixture.wast> [java|csharp|all]
//
// The wasm oracle is authoritative: wasm2lang's contract is that emitted code
// behaves identically to the input module.
//
// This exists because "the backend emitted something without refusing" is not
// evidence that an op works.  The Java backend rendered every SIMD op against a
// 4x32 species for years and every SIMDLoad variant as a full-width load; both
// compiled, both ran, and both were wrong — 14 of 28 and 21 of 25 probe
// functions respectively — because nothing compared the result to wasm.
//
// Writing a fixture, two cautions learned the hard way:
//   - Pick values where a signed and an unsigned lane reading DIFFER, and where
//     the low and high halves differ.  Otherwise a half-ignoring or
//     sign-ignoring implementation passes by coincidence.
//   - Do not seed memory with a data segment.  The harnesses hand the module a
//     freshly zeroed buffer and never apply data segments, so every load reads
//     zero; plant the bytes with an explicit store instead.
//
// It runs against `--dev`, so it reads src/ directly and needs no closure build.
import fs from 'fs';
import path from 'path';
import {execFileSync} from 'child_process';

const REPO = 'C:/COFFEE/dev/wasm2lang';
const TMP = REPO + '/temp';
const wast = process.argv[2];
const which = process.argv[3] || 'all';
// An unrecognised name used to run NOTHING and still print "diverging
// functions: 0 / N" with exit 0, because every column's ok-test is
// `!results.X`.  A typo therefore looked exactly like a clean run.
if (!['all', 'java', 'csharp'].includes(which)) {
  console.error('Unknown backend "' + which + '". Expected java, csharp or all.');
  process.exit(2);
}
const base = path.basename(wast).replace(/\.wast$/, '');
const winWast = wast.replace(/^\/c\//, 'C:/');

function w2l(args) {
  return execFileSync(process.execPath, [REPO + '/wasm2lang.js', '--dev'].concat(args), {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

// ---- 1. wasm oracle -------------------------------------------------------
w2l([
  '--input-file',
  'wast:' + winWast,
  '--normalize-wasm',
  'binaryen:none',
  '--emit-web-assembly',
  'binary',
  '--out-file=' + TMP + '/' + base + '.probe.wasm'
]);
const mod = new WebAssembly.Module(fs.readFileSync(TMP + '/' + base + '.probe.wasm'));
const inst = new WebAssembly.Instance(mod, {});
// Only i32-returning, zero-argument exports can be compared this way; a void
// export cannot be string-concatenated in the Java harness and would abort it.
const all = Object.keys(inst.exports).filter(n => typeof inst.exports[n] === 'function' && inst.exports[n].length === 0);
const names = [];
const oracle = {};
for (const n of all) {
  try {
    const v = inst.exports[n]();
    if (typeof v !== 'number') continue;
    oracle[n] = v | 0;
    names.push(n);
  } catch (e) {
    if (inst.exports[n].length !== 0) continue;
    oracle[n] = 'TRAP:' + String(e.message).slice(0, 40);
    names.push(n);
  }
}

// ---- 2. emitted Java ------------------------------------------------------
function runJava() {
  w2l(
    [
      '--input-file',
      'wast:' + winWast,
      '--normalize-wasm',
      'binaryen:none,wasm2lang:codegen',
      '--language-out',
      'JAVA',
      '--define',
      'JAVA_HEAP_SIZE=65536'
    ].concat(['--emit-code=module', '--out-file=' + TMP + '/' + base + '.probe.java'])
  );
  const calls = names
    .map(
      n =>
        'try { System.out.println("' +
        n +
        '=" + mod.' +
        n +
        '()); } ' +
        'catch (Throwable t) { System.out.println("' +
        n +
        '=TRAP:" + t.getClass().getSimpleName()); }'
    )
    .join('\n');
  fs.writeFileSync(
    TMP + '/' + base + '.probe.jsh',
    'var buf = java.nio.ByteBuffer.allocate(65536).order(java.nio.ByteOrder.LITTLE_ENDIAN);\n' +
      'var mod = new WasmModule(new java.util.HashMap<String,Object>(), buf);\n' +
      calls +
      '\n/exit\n'
  );
  const out = execFileSync(
    'C:/Program Files/Microsoft/jdk-21.0.9.10-hotspot/bin/jshell.exe',
    ['--add-modules', 'jdk.incubator.vector', '-q', TMP + '/' + base + '.probe.java', TMP + '/' + base + '.probe.jsh'],
    {encoding: 'utf8', maxBuffer: 1 << 28}
  );
  return parse(out);
}

// ---- 3. emitted C# --------------------------------------------------------
function runCsharp() {
  w2l([
    '--input-file',
    'wast:' + winWast,
    '--normalize-wasm',
    'binaryen:none,wasm2lang:codegen',
    '--language-out',
    'CSHARP',
    '--define',
    'CSHARP_HEAP_SIZE=65536',
    '--emit-code=module',
    '--out-file=' + TMP + '/' + base + '.probe.cs'
  ]);
  const src = fs.readFileSync(TMP + '/' + base + '.probe.cs', 'utf8');
  const calls = names
    .map(
      n =>
        '    try { System.Console.WriteLine("' +
        n +
        '=" + m.' +
        n +
        '()); } ' +
        'catch (System.Exception e) { System.Console.WriteLine("' +
        n +
        '=TRAP:" + e.GetType().Name); }'
    )
    .join('\n');
  const harness =
    src +
    '\npublic static class W2lProbe {\n  public static void Run() {\n' +
    '    var m = new WasmModule(new System.Collections.Generic.Dictionary<string, object>(), new byte[65536]);\n' +
    calls +
    '\n  }\n}\n';
  fs.writeFileSync(TMP + '/' + base + '.probe.all.cs', harness);
  const ps =
    "$ErrorActionPreference='Stop';" +
    "$src=Get-Content -Raw '" +
    TMP +
    '/' +
    base +
    ".probe.all.cs';" +
    'Add-Type -TypeDefinition $src -ErrorAction Stop;[W2lProbe]::Run()';
  const out = execFileSync('C:/Program Files/PowerShell/7/pwsh.exe', ['-NoProfile', '-Command', ps], {
    encoding: 'utf8',
    maxBuffer: 1 << 28
  });
  return parse(out);
}

function parse(text) {
  const r = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_]+)=(.+)$/.exec(line.trim());
    if (m) r[m[1]] = /^TRAP:/.test(m[2]) ? m[2] : Number(m[2]) | 0;
  }
  return r;
}

const results = {};
if (which === 'all' || which === 'java') {
  try {
    results.java = runJava();
  } catch (e) {
    results.java = {__error: String(e.message).slice(0, 300)};
  }
}
if (which === 'all' || which === 'csharp') {
  try {
    results.csharp = runCsharp();
  } catch (e) {
    results.csharp = {__error: String(e.message).slice(0, 300)};
  }
}

let bad = 0;
console.log('fn'.padEnd(26) + 'wasm'.padStart(14) + '  ' + 'java'.padStart(14) + '  ' + 'csharp'.padStart(14));
for (const n of names) {
  const w = oracle[n];
  const j = results.java ? results.java[n] : '-';
  const c = results.csharp ? results.csharp[n] : '-';
  const s2 = results.javascript ? results.javascript[n] : '-';
  const jOk = !results.java || j === w;
  const cOk = !results.csharp || c === w;
  const p = results.php64 ? results.php64[n] : '-';
  if (!jOk || !cOk) bad++;
  console.log(
    n.padEnd(26) +
      String(w).padStart(14) +
      '  ' +
      (String(j) + (jOk ? '' : ' X')).padStart(14) +
      '  ' +
      (String(c) + (cOk ? '' : ' X')).padStart(14)
  );
}
for (const k of ['java', 'csharp'])
  if (results[k] && results[k].__error) console.log('\n' + k + ' ERROR: ' + results[k].__error);
console.log('\ndiverging functions: ' + bad + ' / ' + names.length);
process.exitCode = bad ? 1 : 0;
