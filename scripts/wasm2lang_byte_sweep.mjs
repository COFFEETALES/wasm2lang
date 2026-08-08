// Byte-identity sweep: emit a corpus snapshot, then diff two snapshots.
//
//   node scripts/wasm2lang_byte_sweep.mjs emit <corpusDir> <outDir> [treeDir]
//   node scripts/wasm2lang_byte_sweep.mjs diff <dirA> <dirB>
//
// This is the proof obligation from CLAUDE.md ("Why 'off' is byte-identical —
// and how to keep it that way") made runnable from the repo instead of being
// rewritten in temp/ every session.  `emit` renders every corpus module
// (*.wast / *.orig.wast) with `wasm2lang.js --dev` — no closure build needed —
// across all five backends, mangled (`--mangler ABC`) and unmangled, under
// both `binaryen:max,wasm2lang:codegen` and `binaryen:none,wasm2lang:codegen`.
// The `:none` leg matters: `:max` folds constant-operand shapes before an
// emitter sees them, so `:none` is the leg that drives the full emitter
// surface.  Modules whose basename is in TRAP_SHAPE_MODULES additionally
// render under every `--trap-sites` shape, under `:max`.
//
// A build that FAILS is captured too, as `<name>.refusal.txt` holding the
// first `Error:` line — the same refusal on both sides compares equal, and a
// refusal appearing on one side only is a difference that matters.
//
// Snapshot the tree BEFORE a change, snapshot again after, then `diff`.
// Feed both snapshots the SAME corpus files; regenerating the corpus per side
// invites a difference that is not the change's fault.  Input paths are
// resolved to Windows form because `wast:/c/...` reaches node verbatim and it
// opens `C:\c\...`.
import fs from 'fs';
import path from 'path';
import {execFile} from 'child_process';

const BACKENDS = [
  ['ASMJS', 'asm.js', 'ASMJS_HEAP_SIZE'],
  ['JAVASCRIPT', 'js', 'JS_HEAP_SIZE'],
  ['PHP64', 'php', 'PHP64_HEAP_SIZE'],
  ['JAVA', 'java', 'JAVA_HEAP_SIZE'],
  ['CSHARP', 'cs', 'CSHARP_HEAP_SIZE']
];
const NORMALIZE = [
  ['max', 'binaryen:max,wasm2lang:codegen'],
  ['none', 'binaryen:none,wasm2lang:codegen']
];
// full/kind × default/host-abort, exercised on the fixtures so a mangler-slot
// shift or a table drift is caught by the sweep rather than by a consumer.
const TRAP_SHAPES = ['full', 'kind', 'full,host-abort', 'kind,host-abort'];
const TRAP_SHAPE_MODULES = /^(trap_sites|switch_dispatch)$/;
const MANGLER_KEY = 'ABC';
const CONCURRENCY = 8;
const win = p => path.resolve(p).replace(/\\/g, '/');

function emitOne(tree, wast, spec, outFile) {
  const args = [
    win(tree) + '/wasm2lang.js',
    '--dev',
    '--input-file',
    'wast:' + win(wast),
    '--normalize-wasm',
    spec.bundle,
    '--language-out',
    spec.lang,
    '--define',
    spec.heapDefine + '=' + 65536 * 8,
    '--emit-metadata=memBuffer',
    '--emit-code=module',
    '--out-file=' + win(outFile)
  ];
  if (spec.mangled) args.splice(2, 0, '--mangler', MANGLER_KEY);
  if (spec.trapShape) args.splice(2, 0, '--trap-sites=' + spec.trapShape);
  return new Promise(resolve => {
    execFile(process.execPath, args, {cwd: win(tree), maxBuffer: 1 << 28}, err => {
      if (err) {
        // Keep only the first Error line: two trees refusing the same way must
        // compare equal despite differing stack line numbers.
        const m = /Error: [^\n]*/.exec(String(err.stderr || err.message));
        fs.writeFileSync(outFile + '.refusal.txt', (m ? m[0] : 'FAILED') + '\n');
      }
      resolve();
    });
  });
}

function specsForModule(base) {
  const specs = [];
  for (const [lang, ext, heapDefine] of BACKENDS) {
    for (const [normTag, bundle] of NORMALIZE) {
      for (const mangled of [false, true]) {
        specs.push({
          lang: lang,
          heapDefine: heapDefine,
          bundle: bundle,
          mangled: mangled,
          trapShape: '',
          name: base + '.' + normTag + (mangled ? '.m' : '') + '.' + ext
        });
      }
    }
    if (TRAP_SHAPE_MODULES.test(base)) {
      for (const shape of TRAP_SHAPES) {
        for (const mangled of [false, true]) {
          specs.push({
            lang: lang,
            heapDefine: heapDefine,
            bundle: NORMALIZE[0][1],
            mangled: mangled,
            trapShape: shape,
            name: base + '.ts-' + shape.replace(',', '-') + (mangled ? '.m' : '') + '.' + ext
          });
        }
      }
    }
  }
  return specs;
}

async function emitSnapshot(corpusDir, outDir, tree) {
  fs.mkdirSync(outDir, {recursive: true});
  const corpus = fs
    .readdirSync(corpusDir)
    .filter(f => f.endsWith('.wast'))
    .sort();
  const jobs = [];
  for (const file of corpus) {
    const base = file.replace(/\.orig\.wast$/, '').replace(/\.wast$/, '');
    const wast = path.join(corpusDir, file);
    for (const spec of specsForModule(base)) {
      jobs.push({wast: wast, spec: spec, out: path.join(outDir, spec.name)});
    }
  }
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      await emitOne(tree, job.wast, job.spec, job.out);
      if (++done % 100 === 0) process.stderr.write(done + '/' + jobs.length + '\n');
    }
  }
  await Promise.all(Array.from({length: CONCURRENCY}, worker));
  console.log('emitted ' + jobs.length + ' artifacts from ' + corpus.length + ' modules into ' + outDir);
}

function diffSnapshots(dirA, dirB) {
  const listing = d =>
    fs.readdirSync(d).filter(f => fs.statSync(path.join(d, f)).isFile());
  const a = new Set(listing(dirA));
  const b = new Set(listing(dirB));
  let same = 0;
  const diffs = [];
  for (const f of [...a].sort()) {
    if (!b.has(f)) {
      diffs.push('only in A: ' + f);
      continue;
    }
    const ba = fs.readFileSync(path.join(dirA, f));
    const bb = fs.readFileSync(path.join(dirB, f));
    if (ba.equals(bb)) same++;
    else diffs.push('DIFFERS: ' + f + '  (' + ba.length + ' vs ' + bb.length + ' bytes)');
  }
  for (const f of [...b].sort()) if (!a.has(f)) diffs.push('only in B: ' + f);
  for (const d of diffs) console.log(d);
  console.log('identical: ' + same + '   differing: ' + diffs.length + '   total: ' + (same + diffs.length));
  process.exitCode = diffs.length ? 1 : 0;
}

const [mode, arg1, arg2, arg3] = process.argv.slice(2);
if (mode === 'emit' && arg1 && arg2) {
  await emitSnapshot(arg1, arg2, arg3 || process.cwd());
} else if (mode === 'diff' && arg1 && arg2) {
  diffSnapshots(arg1, arg2);
} else {
  console.error('usage: wasm2lang_byte_sweep.mjs emit <corpusDir> <outDir> [treeDir]');
  console.error('       wasm2lang_byte_sweep.mjs diff <dirA> <dirB>');
  process.exitCode = 2;
}
