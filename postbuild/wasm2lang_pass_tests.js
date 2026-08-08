'use strict';

/**
 * Pass-family end-to-end tests for the compiled wasm2lang artifact.
 *
 * Each PassFamily descriptor pairs a WAST fixture with assertions that
 * validate both the normalization phase (pass execution producing metadata)
 * and the application phase (accessor readback of that metadata).
 *
 * Usage:
 *   node wasm2lang_pass_tests.js --artifact <path-to-wasmxlang.js>
 */

var fs = require('fs');
var path = require('path');
var url = require('url');

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

var artifactPath = null;
var args = process.argv.slice(2);
for (var a = 0; a < args.length; ++a) {
  if ('--artifact' === args[a] && a + 1 < args.length) {
    artifactPath = args[++a];
  }
}
if (!artifactPath) {
  console.error('Usage: node wasm2lang_pass_tests.js --artifact <path>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load compiled artifact
// ---------------------------------------------------------------------------

var wasm2lang = require(path.resolve(artifactPath));

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assert(value, msg) {
  if (!value) throw new Error(msg);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }
}

function assertNotNull(value, msg) {
  if (null == value) throw new Error(msg + ' (got null/undefined)');
}

function assertNull(value, msg) {
  if (null != value) throw new Error(msg + ' (expected null, got ' + JSON.stringify(value) + ')');
}

function assertHasKey(obj, key, msg) {
  if (!(key in obj)) {
    throw new Error(msg + ' (missing key "' + key + '" in ' + JSON.stringify(Object.keys(obj)) + ')');
  }
}

function findKeyWithPrefix(obj, prefix, msg) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; ++i) {
    if (0 === keys[i].indexOf(prefix)) return keys[i];
  }
  throw new Error(msg + ' (no key with prefix "' + prefix + '" in ' + JSON.stringify(keys) + ')');
}

// ---------------------------------------------------------------------------
// Domain-specific assertion helpers
// ---------------------------------------------------------------------------

/** Asserts a metadata key is null for a given function. */
function assertMetadataNull(result, funcName, metaKey) {
  assertHasKey(result, funcName, '$' + funcName + ' must exist');
  assertNull(result[funcName][metaKey], '$' + funcName + ' ' + metaKey);
}

/** Asserts a loop-simplification plan exists with the expected loopKind(s). */
function assertLoopPlan(result, funcName, expectedKinds) {
  assertHasKey(result, funcName, '$' + funcName + ' must exist');
  var meta = result[funcName]['loopSimplification'];
  assertNotNull(meta, '$' + funcName + ' loopSimplification');
  var keys = Object.keys(meta);
  assert(keys.length > 0, '$' + funcName + ' must have at least one loop plan');
  var plan = meta[keys[0]];
  assertNotNull(plan, '$' + funcName + ' loop plan');
  var kinds = Array.isArray(expectedKinds) ? expectedKinds : [expectedKinds];
  assert(
    kinds.indexOf(plan['loopKind']) !== -1,
    '$' + funcName + ' loopKind should be ' + kinds.join(' or ') + ', got ' + plan['loopKind']
  );
}

/** Asserts a block-loop fusion plan with the expected pattern letter. */
function assertFusionPlan(result, funcName, expectedPattern) {
  assertHasKey(result, funcName, '$' + funcName + ' must exist');
  var meta = result[funcName]['blockLoopFusion'];
  assertNotNull(meta, '$' + funcName + ' blockLoopFusion');
  var key = findKeyWithPrefix(meta, 'w2l_fused$', '$' + funcName + ' must have w2l_fused$ key');
  assertNotNull(meta[key], '$' + funcName + ' fusion plan');
  assertEqual(meta[key]['fusionPattern'], expectedPattern, '$' + funcName + ' fusionPattern');
}

/** Asserts a prefixed dispatch/root-switch key exists and is true. */
function assertDispatchKey(result, funcName, metaKey, prefix) {
  assertHasKey(result, funcName, '$' + funcName + ' must exist');
  var meta = result[funcName][metaKey];
  assertNotNull(meta, '$' + funcName + ' ' + metaKey);
  var key = findKeyWithPrefix(meta, prefix, '$' + funcName + ' must have ' + prefix + ' key');
  assertEqual(meta[key], true, '$' + funcName + ' ' + prefix + ' detection');
}

// ---------------------------------------------------------------------------
// Pass family registry
// ---------------------------------------------------------------------------

function PassFamily(name, fixturePath, assertions) {
  this.name = name;
  this.fixturePath = fixturePath;
  this.assertions = assertions;
}

// ---------------------------------------------------------------------------
// Family: local-init-folding
// ---------------------------------------------------------------------------

var localInitFolding = new PassFamily('local-init-folding', 'local_init_folding.wast', function (result) {
  assertHasKey(result, 'singleFold', '$singleFold must exist');
  assertNotNull(result['singleFold']['localInitFolding'], '$singleFold localInitFolding');
  assertEqual(result['singleFold']['localInitFolding']['1'], 42, '$singleFold local 1');

  assertHasKey(result, 'multiFold', '$multiFold must exist');
  assertNotNull(result['multiFold']['localInitFolding'], '$multiFold localInitFolding');
  assertEqual(result['multiFold']['localInitFolding']['0'], 10, '$multiFold local 0');
  assertEqual(result['multiFold']['localInitFolding']['1'], 20, '$multiFold local 1');

  assertMetadataNull(result, 'noFold', 'localInitFolding');

  assertHasKey(result, 'mixedFold', '$mixedFold must exist');
  assertNotNull(result['mixedFold']['localInitFolding'], '$mixedFold localInitFolding');
  assertEqual(result['mixedFold']['localInitFolding']['1'], 7, '$mixedFold local 1');

  assertMetadataNull(result, 'zeroOnlyFold', 'localInitFolding');
});

// ---------------------------------------------------------------------------
// Family: block-loop-fusion
// ---------------------------------------------------------------------------

var blockLoopFusion = new PassFamily('block-loop-fusion', 'block_loop_fusion.wast', function (result) {
  assertFusionPlan(result, 'fusionA', 'a');
  assertFusionPlan(result, 'fusionB', 'b');
  assertMetadataNull(result, 'noFusion', 'blockLoopFusion');
  assertFusionPlan(result, 'fusionOuterExit', 'a');
});

// ---------------------------------------------------------------------------
// Family: switch-dispatch (includes root-switch)
// ---------------------------------------------------------------------------

var switchDispatch = new PassFamily('switch-dispatch', 'switch_dispatch.wast', function (result) {
  assertDispatchKey(result, 'flatSwitch', 'switchDispatch', 'w2l_switch$');
  assertMetadataNull(result, 'flatSwitch', 'rootSwitch');

  // Action code breaks to the outer dispatch block — still detected as w2l_switch$.
  assertDispatchKey(result, 'flatSwitchRequiresLabel', 'switchDispatch', 'w2l_switch$');
  assertMetadataNull(result, 'flatSwitchRequiresLabel', 'rootSwitch');

  // Non-wrapping dispatch: outer block has trailing case actions but is not
  // first child of parent — still detected as w2l_switch$.
  assertDispatchKey(result, 'nonWrappingDispatch', 'switchDispatch', 'w2l_switch$');
  assertMetadataNull(result, 'nonWrappingDispatch', 'rootSwitch');

  // Wrapping dispatch with epilogue: first child of loop body with trailing
  // siblings → detection pass wraps into w2l_switch$ block with epilogue.
  assertDispatchKey(result, 'wrappingDispatchEpilogue', 'switchDispatch', 'w2l_switch$');
  assertMetadataNull(result, 'wrappingDispatchEpilogue', 'rootSwitch');

  // Epilogue chain-name break: dispatch whose epilogue contains a br to one
  // of the chain block names.  Detection itself must still emit w2l_switch$;
  // emission correctness (no `break $_;`) is covered by the structural
  // regex in tests/wasm2lang_17_codegen_passes.harness.mjs.
  assertDispatchKey(result, 'epilogueChainBreak', 'switchDispatch', 'w2l_switch$');
  assertMetadataNull(result, 'epilogueChainBreak', 'rootSwitch');

  // Terminator-ended dispatch: intermediate blocks end with return
  // rather than unconditional break — still detected as w2l_switch$.
  assertDispatchKey(result, 'terminatorDispatch', 'switchDispatch', 'w2l_switch$');
  assertMetadataNull(result, 'terminatorDispatch', 'rootSwitch');

  assertDispatchKey(result, 'rootSwitch', 'switchDispatch', 'w2l_switch$');
  assertDispatchKey(result, 'rootSwitch', 'rootSwitch', 'w2l_rootsw$');
});

// ---------------------------------------------------------------------------
// Family: loop-simplification
// ---------------------------------------------------------------------------

var loopSimplification = new PassFamily('loop-simplification', 'loop_simplification.wast', function (result) {
  // Entry guard + trailing continue → detected as 'while' (or 'for' without guard).
  assertLoopPlan(result, 'forLoop', ['for', 'while']);
  assertLoopPlan(result, 'doWhileLoop', 'dowhile');
  assertLoopPlan(result, 'whileLoop', 'while');
  assertLoopPlan(result, 'doWhileDirectBrIf', 'dowhile');
  assertLoopPlan(result, 'ifGuardedWhile', 'while');
  // Multi-guard while: two consecutive br_if exit guards combined → 'while'.
  assertLoopPlan(result, 'multiGuardWhile', 'while');
  // Exit guard targets distant block → must NOT become while, stays as for.
  assertLoopPlan(result, 'noWhileDistantExit', 'for');
  // Non-fused enclosing block (tail code after loop) → must stay as for:
  // while-form would execute tail code that the original br_if skips.
  // This catches the Rule-2 semantic preservation bug.
  assertLoopPlan(result, 'noWhileBlockTail', 'for');
  // Terminal-exit: unconditional exit with internal continue paths → for.
  assertLoopPlan(result, 'terminalExitLoop', ['for', 'while']);
});

// ---------------------------------------------------------------------------
// Family: if-else-recovery
// ---------------------------------------------------------------------------

var ifElseRecovery = new PassFamily('if-else-recovery', 'if_else_recovery.wast', function (result) {
  // Single if-then-break: chain=1, label removed.
  assertHasKey(result, 'singleIfElse', '$singleIfElse must exist');
  var meta1 = result['singleIfElse']['ifElseRecovery'];
  assertNotNull(meta1, '$singleIfElse ifElseRecovery');
  var key1 = Object.keys(meta1)[0];
  assertEqual(meta1[key1]['chainLength'], 1, '$singleIfElse chainLength');
  assertEqual(meta1[key1]['labelRemoved'], true, '$singleIfElse labelRemoved');

  // Three chained if-then-break: chain=3, label removed.
  assertHasKey(result, 'chainedIfElse', '$chainedIfElse must exist');
  var meta2 = result['chainedIfElse']['ifElseRecovery'];
  assertNotNull(meta2, '$chainedIfElse ifElseRecovery');
  var key2 = Object.keys(meta2)[0];
  assertEqual(meta2[key2]['chainLength'], 3, '$chainedIfElse chainLength');
  assertEqual(meta2[key2]['labelRemoved'], true, '$chainedIfElse labelRemoved');

  // First child is br_if → no recovery.
  assertMetadataNull(result, 'noRecovery', 'ifElseRecovery');

  // Intermediate br keeps label: chain=1, label kept.
  assertHasKey(result, 'recoveryLabelKept', '$recoveryLabelKept must exist');
  var meta4 = result['recoveryLabelKept']['ifElseRecovery'];
  assertNotNull(meta4, '$recoveryLabelKept ifElseRecovery');
  var key4 = Object.keys(meta4)[0];
  assertEqual(meta4[key4]['chainLength'], 1, '$recoveryLabelKept chainLength');
  assertEqual(meta4[key4]['labelRemoved'], false, '$recoveryLabelKept labelRemoved');
});

// ---------------------------------------------------------------------------
// Family: block-guard-elision
// ---------------------------------------------------------------------------

var blockGuardElision = new PassFamily('block-guard-elision', 'block_guard_elision.wast', function (result) {
  // Simple guard: br_if targeting self, no remaining refs → label removed.
  assertHasKey(result, 'guardSimple', '$guardSimple must exist');
  var meta1 = result['guardSimple']['blockGuardElision'];
  assertNotNull(meta1, '$guardSimple blockGuardElision');
  var key1 = Object.keys(meta1)[0];
  assertEqual(meta1[key1]['labelRemoved'], true, '$guardSimple labelRemoved');

  // Multi-body guard with eqz condition → label removed.
  assertHasKey(result, 'guardMultiBody', '$guardMultiBody must exist');
  var meta2 = result['guardMultiBody']['blockGuardElision'];
  assertNotNull(meta2, '$guardMultiBody blockGuardElision');
  var key2 = Object.keys(meta2)[0];
  assertEqual(meta2[key2]['labelRemoved'], true, '$guardMultiBody labelRemoved');

  // Guard with remaining reference → label kept.
  assertHasKey(result, 'guardKeptLabel', '$guardKeptLabel must exist');
  var meta3 = result['guardKeptLabel']['blockGuardElision'];
  assertNotNull(meta3, '$guardKeptLabel blockGuardElision');
  var key3 = Object.keys(meta3)[0];
  assertEqual(meta3[key3]['labelRemoved'], false, '$guardKeptLabel labelRemoved');

  // First child is If → no guard elision.
  assertMetadataNull(result, 'noGuard', 'blockGuardElision');

  // Unconditional br → no guard elision.
  assertMetadataNull(result, 'noGuardUnconditional', 'blockGuardElision');
});

// ---------------------------------------------------------------------------
// Family: redundant-block-removal
// ---------------------------------------------------------------------------

var redundantBlockRemoval = new PassFamily('redundant-block-removal', 'redundant_block_removal.wast', function (result) {
  // Single-child unreferenced → removed (value = true for single-child).
  assertHasKey(result, 'singleChildRemoved', '$singleChildRemoved must exist');
  var meta1 = result['singleChildRemoved']['redundantBlockRemoval'];
  assertNotNull(meta1, '$singleChildRemoved redundantBlockRemoval');
  assertHasKey(meta1, 'wrapper', '$singleChildRemoved must have wrapper key');
  assertEqual(meta1['wrapper'], true, '$singleChildRemoved single-child unwrap');

  // Multi-child unreferenced → label stripped (value = false for multi-child).
  assertHasKey(result, 'multiChildLabelRemoved', '$multiChildLabelRemoved must exist');
  var meta2 = result['multiChildLabelRemoved']['redundantBlockRemoval'];
  assertNotNull(meta2, '$multiChildLabelRemoved redundantBlockRemoval');
  assertHasKey(meta2, 'wrapper', '$multiChildLabelRemoved must have wrapper key');
  assertEqual(meta2['wrapper'], false, '$multiChildLabelRemoved label strip');

  // Referenced label → NOT removed.
  assertMetadataNull(result, 'singleChildKept', 'redundantBlockRemoval');

  // Unnamed block → not touched.
  assertMetadataNull(result, 'unnamedBlock', 'redundantBlockRemoval');
});

// ---------------------------------------------------------------------------
// Family: const-condition-folding
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Emission families
//
// Unlike pass families (which verify metadata from getPassAnalysis), emission
// families run the full transpile pipeline and assert on the emitted backend
// source string.  Use these to catch backend-emitter bugs that normalization
// metadata would not surface.
// ---------------------------------------------------------------------------

// `assertions` receives (code, result) — the second argument is the whole
// materialized transpile result, so a family can assert on side-car outputs
// such as the `--trap-sites` table and not just the emitted source.
// `opt_extraOptions` is merged into the transpile options.
// `opt_expectErrorPattern` inverts the family: transpile is expected to FAIL,
// and the family passes only when it rejects with a message matching the
// pattern.  Some contracts are about refusing to emit — asserting on a string
// that must never be produced cannot express them.
function EmissionFamily(
  name,
  fixturePath,
  languageOut,
  assertions,
  opt_normalizeWasm,
  opt_extraOptions,
  opt_expectErrorPattern
) {
  this.name = name;
  this.fixturePath = fixturePath;
  this.languageOut = languageOut;
  this.assertions = assertions;
  this.normalizeWasm = opt_normalizeWasm || ['binaryen:max', 'wasm2lang:codegen'];
  this.extraOptions = opt_extraOptions || {};
  this.expectErrorPattern = opt_expectErrorPattern || null;
}

// Regression: `i32.eqz(i32.or(cmp, cmp))` compound negation.  Binaryen:max
// folds two consecutive br_if exit guards into this shape; if the backend's
// negation peephole flips only a single inner comparison operator, the
// emitted condition miscompiles (this was the root cause of the quic.js
// AES-GCM decryption failure).  Safe forms: `!(a==X | a==Y)` wrapper OR
// De Morgan's (`a !== X & a !== Y`).
var eqzOrCompoundNegation = new EmissionFamily(
  'eqz-or-compound-negation',
  'eqz_or_compound_negation.wast',
  'javascript',
  function (code) {
    // The broken form: an inequality joined by `|`/`&` with a matching
    // equality (or vice versa) — this is exactly the partial flip the
    // buggy negateComparison_ produced.
    var mixedInequality1 = /!==?\s*-?\d+\s*[|&]\s*[^|&]*?===?\s*-?\d+/;
    var mixedInequality2 = /===?\s*-?\d+\s*[|&]\s*[^|&]*?!==?\s*-?\d+/;
    assert(
      !mixedInequality1.test(code) && !mixedInequality2.test(code),
      'emission contains partial-flip compound condition (a != X | a == Y) — would miscompile'
    );
    var fullNotWrap = /!\s*\(\s*[^()]*===?\s*-?\d+[^()]*[|&][^()]*===?\s*-?\d+/;
    var deMorgan = /!==?\s*-?\d+\s*&\s*[^|&]*?!==?\s*-?\d+/;
    assert(
      fullNotWrap.test(code) || deMorgan.test(code),
      'emission lacks a full negation form: expected `!(a==X | a==Y)` or `(a!=X) & (a!=Y)`'
    );
  }
);

// ---------------------------------------------------------------------------
// Async binaryen loader (same pattern as build_common.js)
// ---------------------------------------------------------------------------

function loadBinaryen() {
  var nodePath = process.env.NODE_PATH || path.join(path.resolve(path.dirname(artifactPath), '..'), 'node_modules');
  var binaryenPath = path.join(nodePath, 'binaryen', 'index.js');
  return import(url.pathToFileURL(binaryenPath)['href']).then(function (m) {
    return m.default;
  });
}

// ---------------------------------------------------------------------------
// Run all families
// ---------------------------------------------------------------------------

var families = [
  localInitFolding,
  blockLoopFusion,
  switchDispatch,
  loopSimplification,
  ifElseRecovery,
  blockGuardElision,
  redundantBlockRemoval
];

// Regression: kernel must refresh `nodeCtx.expression` before invoking
// a leave callback, so a pass that inspects `expr.children` sees the
// post-walk child slots (any REPLACE_NODE from a child's own leave was
// applied via the kernel's setter call).  The fixture stacks two nested
// block-guard-elision candidates: the outer block's first child is the
// inner block.  With a stale snapshot, BlockGuardElisionPass on the
// outer block constructs its new wrapper using the *original* inner
// block pointer — preserving the inner's `(br_if $inner cond)` pattern
// in emitted JS as `$block: { if (!cond) break $block; ... }`.  The
// regression manifests as the inner block label surviving emission.
// binaryen:max would peephole the nested-guard pattern away before our
// passes see it, masking the kernel bug.  This family runs with
// binaryen:none so the kernel walker is exercised directly.
var kernelLeaveFreshness = new EmissionFamily(
  'kernel-leave-freshness',
  'kernel_leave_freshness.wast',
  'javascript',
  function (code) {
    // Stale-kernel signature: a labeled block whose body is a single
    // negated-condition break to itself.  A correct kernel emits two
    // clean `if (cond) { body }` constructs and never introduces a
    // labeled block here.
    var labeledBreakWrap = /\$\w+\s*:\s*\{\s*if\s*\(!/;
    assert(
      !labeledBreakWrap.test(code),
      'kernel leave callback read stale child slots — inner BGE transformation lost\n' + code
    );
    // Sanity: both clean `if ($r) {` arms must appear.
    var cleanIfArms = (code.match(/if\s*\(\$\w+\)\s*\{/g) || []).length;
    assert(
      cleanIfArms >= 2,
      'expected two clean `if (cond) { ... }` arms after both BGE transformations; saw ' + cleanIfArms + '\n' + code
    );
  },
  ['binaryen:none', 'wasm2lang:codegen']
);

// --trap-sites OFF.  Guards the opt-in contract at unit level: the emitted
// trap must stay the historical argument-less `$w2l_trap();`, no abort must
// appear, no checked-division helper must be referenced, and no site table
// must be produced.  If this family fails, the byte-identical promise the
// consumer relies on to adopt the feature without re-baselining is already
// broken, whatever the artifact diff says.
var trapSitesOff = new EmissionFamily(
  'trap-sites-off',
  'trap_sites.wast',
  'javascript',
  function (code, result) {
    assert(/\$w2l_trap\(\)\s*;/.test(code), 'expected the bare `$w2l_trap();` form when --trap-sites is off\n' + code);
    assert(!/\$w2l_trap\(\s*\d/.test(code), 'a (kind, siteId) payload leaked into a build with --trap-sites off\n' + code);
    assert(!/\$w2l_div_s_i32/.test(code), 'a checked-division helper leaked into a build with --trap-sites off\n' + code);
    assert(!result['traps'], 'a trap-site table was produced with --trap-sites off');
  },
  ['binaryen:none', 'wasm2lang:codegen']
);

// --trap-sites ON.  Pins the three properties a host actually depends on:
// every trap carries (kind, siteId); every emitted id resolves in the table;
// and two traps in ONE function get DISTINCT ids — the case that motivated
// the feature and the one a single global counter would silently get wrong if
// it were ever reset per function.
var trapSitesOn = new EmissionFamily(
  'trap-sites-on',
  'trap_sites.wast',
  'javascript',
  function (code, result) {
    var table = result['traps'];
    assert(table, 'no trap-site table emitted with --trap-sites on');
    var parsed = JSON.parse(table);
    assert(parsed.version === 2, 'expected site-table format version 2, got ' + parsed.version);

    // The abort must not be a spin on this backend.  Asserted BEFORE anything
    // below executes the module, so a regression that reintroduced
    // `while (1) {}` fails here with a message instead of hanging the whole
    // postbuild run with no diagnostic — which is the very failure mode the
    // spin inflicts on a browser tab.
    assert(
      !/while \(1\) \{\}/.test(code),
      'the javascript backend aborts by spinning; a host that does not throw would freeze with no stack and no log\n' + code
    );

    var emitted = [];
    var callRe = /\$w2l_trap\((\d+),\s*(\d+)\)/g;
    var m;
    while ((m = callRe.exec(code)) !== null) {
      emitted.push({kind: Number(m[1]), site: Number(m[2])});
    }
    assert(emitted.length >= 3, 'expected at least 3 instrumented trap calls; saw ' + emitted.length + '\n' + code);

    var byId = {};
    for (var i = 0; i < parsed.sites.length; i++) byId[parsed.sites[i].id] = parsed.sites[i];
    for (var j = 0; j < emitted.length; j++) {
      var row = byId[emitted[j].site];
      assert(row, 'emitted site id ' + emitted[j].site + ' does not resolve in the table');
      assert(
        row.kind === emitted[j].kind,
        'site ' + emitted[j].site + ': code says kind ' + emitted[j].kind + ', table says ' + row.kind
      );
    }

    // The table must describe only what SHIPPED.  The reverse direction (every
    // emitted call resolves) is checked above; this is the direction that used
    // to fail, and by a wide margin — 918 rows for 54 live sites on the
    // consumer's module, 257 for 13 on ours.  A row with no call behind it is
    // an id the host can never receive.
    var emittedIds = {};
    for (var e = 0; e < emitted.length; e++) emittedIds[emitted[e].site] = true;
    for (var r = 0; r < parsed.sites.length; r++) {
      assert(
        emittedIds[parsed.sites[r].id],
        'table row ' + parsed.sites[r].id + ' has no trap call behind it — the table is still a superset'
      );
    }
    assert(
      parsed.siteCount === Object.keys(emittedIds).length,
      'table has ' + parsed.siteCount + ' rows for ' + Object.keys(emittedIds).length + ' live sites'
    );
    // Filtering must be reported, never silent, and must not renumber: a site
    // id is what the host receives at runtime.
    assert(
      parsed.allocatedSiteCount >= parsed.siteCount,
      'allocatedSiteCount (' + parsed.allocatedSiteCount + ') < siteCount (' + parsed.siteCount + ')'
    );
    var maxId = 0;
    for (var mi = 0; mi < parsed.sites.length; mi++) maxId = Math.max(maxId, parsed.sites[mi].id);
    assert(maxId < parsed.allocatedSiteCount, 'site id ' + maxId + ' is outside the allocated range — ids were renumbered');

    // Every row must name the identifier its container is DECLARED under, or a
    // host holding a stack frame has nothing to join the table on.  Under
    // --mangler this is the only column that still matches the stack.
    for (var sy = 0; sy < parsed.sites.length; sy++) {
      var symbol = parsed.sites[sy].symbol;
      assert('string' === typeof symbol && '' !== symbol, 'table row ' + parsed.sites[sy].id + ' carries no emitted symbol');
      assert(
        new RegExp('function ' + symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').test(code),
        'symbol "' + symbol + '" is not declared anywhere in the emitted source'
      );
    }

    // Two unreachables inside $twoTrapsOneFunc must be separable.
    var sameFunc = parsed.sites.filter(function (s) {
      return s.funcName === 'twoTrapsOneFunc';
    });
    assert(sameFunc.length === 2, 'expected 2 sites in twoTrapsOneFunc; saw ' + sameFunc.length);
    assert(sameFunc[0].id !== sameFunc[1].id, 'two traps in one function share a site id');
    assert(sameFunc[0].ordinal !== sameFunc[1].ordinal, 'two traps in one function share an ordinal');

    // The abort must follow the hook, so a host that fails to throw cannot
    // resume on a fabricated value.
    assert(/\$w2l_trap\(1, \d+\);\s*\n\s*throw new Error\(/.test(code), 'trap hook is not followed by an abort\n' + code);

    // A non-zero literal divisor cannot trap, so it must NOT be instrumented.
    assert(
      !/\$w2l_div_s_i32\([^,]+,\s*10\)/.test(code),
      'a constant non-zero divisor was needlessly routed through the checked helper\n' + code
    );
    // A variable divisor must be.
    assert(/\$w2l_div_s_i32\(/.test(code), 'a variable divisor was not routed through the checked helper\n' + code);

    // ---- Runtime: actually PROVOKE each kind and check what the host sees.
    // Static text assertions cannot prove the hook is reached with the right
    // payload, nor that the guard fires on the right condition.  The emitted
    // 'javascript' module is ordinary JS, so it can be instantiated here.
    var seen = [];
    var foreign = {
      __wasm2lang_trap: function (k, s) {
        seen.push([k, s]);
        throw new Error('trap');
      }
    };
    var factory = eval(code + '\nmodule');
    var inst = factory(globalThis, foreign, new ArrayBuffer(1 << 20));

    function provoke(label, fn) {
      var before = seen.length;
      try {
        fn();
      } catch (e) {
        /* the abort is expected */
      }
      assert(seen.length === before + 1, label + ': expected exactly one hook call, saw ' + (seen.length - before));
      return seen[seen.length - 1];
    }

    var cases = [
      [
        'unreachable',
        1,
        function () {
          inst.twoTrapsOneFunc(1);
        }
      ],
      [
        'div_s_zero',
        2,
        function () {
          inst.divByVariable(1, 0);
        }
      ],
      [
        'div_u_zero',
        3,
        function () {
          inst.divUByVariable(1, 0);
        }
      ],
      [
        'rem_s_zero',
        4,
        function () {
          inst.remSByVariable(1, 0);
        }
      ],
      [
        'rem_u_zero',
        5,
        function () {
          inst.remUByVariable(1, 0);
        }
      ],
      [
        'div_s_overflow',
        6,
        function () {
          inst.divByVariable(-2147483648, -1);
        }
      ],
      [
        'trunc_f2i_range',
        7,
        function () {
          inst.truncOutOfRange(NaN);
        }
      ]
    ];
    var provokedKinds = {};
    for (var c = 0; c < cases.length; c++) {
      var got = provoke(cases[c][0], cases[c][2]);
      assert(got[0] === cases[c][1], cases[c][0] + ': host received kind ' + got[0] + ', expected ' + cases[c][1]);
      var resolved = byId[got[1]];
      assert(resolved, cases[c][0] + ': site id ' + got[1] + ' does not resolve in the table');
      assert(resolved.kind === cases[c][1], cases[c][0] + ': table says kind ' + resolved.kind + ' for site ' + got[1]);
      provokedKinds[got[0]] = true;
    }
    // Every kind this backend can actually raise must have been provoked, not
    // just a representative sample — a kind that is emitted but never exercised
    // is a classification the host would meet for the first time in production.
    // 8 (indirect_signature) and 9 (memory_oob) are reserved and never emitted,
    // so they are deliberately absent; if one ever gains an emit site, this
    // assertion is what will demand a case for it.
    for (var wanted = 1; wanted <= 7; wanted++) {
      assert(provokedKinds[wanted], 'kind ' + wanted + ' is emittable but no runtime case provokes it');
    }

    // The two unreachables must be distinguishable AT RUNTIME, not just on paper.
    var firstArm = provoke('twoTrapsOneFunc(1)', function () {
      inst.twoTrapsOneFunc(1);
    });
    var secondArm = provoke('twoTrapsOneFunc(0)', function () {
      inst.twoTrapsOneFunc(0);
    });
    assert(
      firstArm[1] !== secondArm[1],
      'both traps in twoTrapsOneFunc reported the same site id (' + firstArm[1] + ') — they are indistinguishable'
    );

    // A constant divisor must still compute, not trap.
    assert(inst.divByConstant(100) === 10, 'divByConstant(100) returned ' + inst.divByConstant(100) + ', expected 10');

    // ---- A host that does NOT throw must still be stopped — and stopped with
    // something a crash report can carry.  Two ways to get this wrong: fall
    // through (the caller resumes on the `return 0` after the trap and gets a
    // fabricated value indistinguishable from a real one) or spin (the tab
    // freezes with no stack, no log, nothing to report — worse than the
    // corruption it replaced).  This block reaching its end at all is the
    // proof that neither happens; the static assertion above already ruled out
    // the spin, so running it here cannot hang.
    var silentSeen = [];
    var silentInst = factory(
      globalThis,
      {
        __wasm2lang_trap: function (k, s) {
          silentSeen.push([k, s]);
        }
      },
      new ArrayBuffer(1 << 20)
    );
    var silentAbort = null;
    var silentReturn = 'not-set';
    try {
      silentReturn = silentInst.twoTrapsOneFunc(1);
    } catch (silentError) {
      silentAbort = silentError;
    }
    assert(1 === silentSeen.length, 'non-throwing host: expected one hook call, saw ' + silentSeen.length);
    assert(silentAbort, 'a host that declined to throw resumed the caller — the unconditional abort is missing');
    assert('not-set' === silentReturn, 'the trap site fell through and handed the caller a fabricated ' + silentReturn);
    assert(
      /w2l trap kind=1 site=\d+/.test(String(silentAbort.message)),
      'the abort is not self-describing, so a crash report carries nothing: ' + silentAbort.message
    );
    assert(
      Number(String(silentAbort.message).replace(/^.*site=/, '')) === silentSeen[0][1],
      'the abort names a different site than the hook received'
    );
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {'trapSites': true}
);

// The asm.js half of the same abort contract, and the reason it is a separate
// family rather than a branch in the one above: `throw` is outside the asm.js
// subset, so this backend genuinely cannot have the modern-JS abort and keeps
// the spin.  Pinning that here turns the compromise into a tested property
// instead of a comment — a well-meaning "fix" that emits `throw` would sail
// past the javascript family and only fail later, in a validator, far from the
// change.  It also pins the asymmetry itself: the spin must NOT appear in the
// modern-JS output, which the javascript family asserts from the other side.
var trapSitesAsmjsAbort = new EmissionFamily(
  'trap-sites-asmjs-abort',
  'trap_sites.wast',
  'asmjs',
  function (code, result) {
    assert(
      /\$w2l_trap\(\d+,\s*\d+\);\s*\n\s*\$w2l_abort\(\);/.test(code),
      'asm.js trap site is not followed by the abort call\n' + code
    );
    assert(
      /function \$w2l_abort\(\) \{\s*\n\s*\$w2l_abort\(\);\s*\n\s*\}/.test(code),
      'the $w2l_abort helper is missing or is not self-recursive\n' + code
    );
    // A spin would stop the fall-through just as well and tell nobody anything.
    assert(!/while \(1\) \{\}/.test(code), 'asm.js reverted to a spin abort — a frozen tab carries no diagnosis\n' + code);
    // `return $w2l_abort();` would be a tail call, which ES6 proper tail calls
    // (JavaScriptCore) would flatten back into the infinite loop this replaces.
    assert(
      !/return\s+\$w2l_abort\(\)/.test(code),
      'the abort recursion is in tail position and could be TCO-flattened\n' + code
    );
    assert(!/\bthrow\b/.test(code), 'a `throw` leaked into asm.js output — it is outside the validated subset\n' + code);

    // Runtime: a host that does NOT throw must still be stopped, and stopped
    // fast enough that nobody calls it a hang.  This assertion could not exist
    // while the abort was a spin: reaching it at all is the proof.
    var seen = [];
    var inst = eval(code + '\nmodule')(
      globalThis,
      {
        __wasm2lang_trap: function (k, s) {
          seen.push([k, s]);
        }
      },
      new ArrayBuffer(1 << 20)
    );
    var started = Date.now();
    var aborted = null;
    var returned = 'not-set';
    try {
      returned = inst.twoTrapsOneFunc(1);
    } catch (e) {
      aborted = e;
    }
    assert(1 === seen.length, 'asm.js non-throwing host: expected one hook call, saw ' + seen.length);
    assert(aborted, 'asm.js abort let a non-throwing host resume the caller');
    assert('not-set' === returned, 'asm.js trap site fell through and returned ' + returned);
    assert(Date.now() - started < 5000, 'asm.js abort took ' + (Date.now() - started) + ' ms — that is a hang, not an abort');
    // The site table must be filtered and symbol-bearing here too: asm.js has
    // no exception message, so the hook call is the only liveness evidence and
    // this is the path where a stale pattern would silently empty the table.
    var parsed = JSON.parse(result['traps']);
    assert(parsed.siteCount > 0, 'asm.js site table came back empty — the liveness pattern no longer matches the emitted call');
    for (var i = 0; i < parsed.sites.length; i++) {
      assert(parsed.sites[i].symbol, 'asm.js table row ' + parsed.sites[i].id + ' carries no emitted symbol');
    }
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {'trapSites': true}
);

// --trap-sites=kind.  The release-weight mode: the kind travels alone, no ids
// are allocated and no table is written, so there is nothing to ship next to
// the module and nothing that can fall out of sync with it.  What it must
// still do is the entire point — classify.  A crash in a delivered build has
// to come back as "division by zero" rather than as silence, so the checked
// division helpers must survive into this mode even though the site
// bookkeeping does not.
var trapSitesKindOnly = new EmissionFamily(
  'trap-sites-kind-only',
  'trap_sites.wast',
  'javascript',
  function (code, result) {
    assert(!result['traps'], 'kind mode wrote a site table; it exists precisely so there is no artifact to distribute');
    assert(!/\$w2l_trap\(\d+,/.test(code), 'a siteId survived into kind mode\n' + code);
    assert(!/site=/.test(code), 'an abort still names a site id that no table resolves\n' + code);
    assert(/\$w2l_trap\(\d+\)/.test(code), 'kind mode did not pass the kind to the hook\n' + code);

    // Classification is the reason the mode exists, so the div/rem guards must
    // still be here — without them a division by zero never reaches the hook
    // at all and the crash stays exactly as mute as before.
    assert(
      /\$w2l_div_s_i32\(/.test(code),
      'kind mode dropped the checked-division helper — div-by-zero would be unclassifiable'
    );
    assert(
      !/\$w2l_div_s_i32\([^,]+,\s*10\)/.test(code),
      'a constant non-zero divisor was routed through the checked helper in kind mode\n' + code
    );

    // Runtime: the host must receive a usable classification, and a host that
    // declines to throw must still be stopped.
    var seen = [];
    var inst = eval(code + '\nmodule')(
      globalThis,
      {
        __wasm2lang_trap: function (k) {
          seen.push(k);
        }
      },
      new ArrayBuffer(1 << 20)
    );
    var cases = [
      [
        1,
        function () {
          inst.twoTrapsOneFunc(1);
        }
      ],
      [
        2,
        function () {
          inst.divByVariable(1, 0);
        }
      ],
      [
        7,
        function () {
          inst.truncOutOfRange(NaN);
        }
      ]
    ];
    for (var c = 0; c < cases.length; c++) {
      var before = seen.length;
      var aborted = false;
      try {
        cases[c][1]();
      } catch (e) {
        aborted = true;
      }
      assert(seen.length === before + 1, 'kind ' + cases[c][0] + ': expected one hook call, saw ' + (seen.length - before));
      assert(
        seen[seen.length - 1] === cases[c][0],
        'host received kind ' + seen[seen.length - 1] + ', expected ' + cases[c][0]
      );
      assert(aborted, 'kind ' + cases[c][0] + ': a non-throwing host was allowed to resume');
    }
    assert(inst.divByConstant(100) === 10, 'divByConstant(100) miscomputed in kind mode');
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {'trapSites': true, 'trapSiteIds': false}
);

// ---------------------------------------------------------------------------
// Call-graph extraction, for the host-abort families.
//
// The property those families pin is the consumer's, not ours: their delivery
// pipeline walks the artifact's call graph and rejects any cycle, a self-loop
// included.  Grepping for `$w2l_abort` would only prove that ONE known cycle is
// gone; building the graph proves no other appeared in its place, which is what
// the mode actually promises.
// ---------------------------------------------------------------------------

/** Returns the index of the closing quote of the literal starting at `i`. */
function skipStringLiteral(code, i) {
  var quote = code.charAt(i);
  for (var j = i + 1; j < code.length; ++j) {
    var c = code.charAt(j);
    if ('\\' === c) {
      ++j;
      continue;
    }
    if (c === quote) return j;
  }
  return code.length;
}

/** Returns the index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(code, open) {
  var depth = 0;
  for (var i = open; i < code.length; ++i) {
    var c = code.charAt(i);
    if ('"' === c || "'" === c) {
      i = skipStringLiteral(code, i);
      continue;
    }
    if ('/' === c && '/' === code.charAt(i + 1)) {
      i = code.indexOf('\n', i);
      if (i < 0) return -1;
      continue;
    }
    if ('/' === c && '*' === code.charAt(i + 1)) {
      i = code.indexOf('*/', i + 2);
      if (i < 0) return -1;
      ++i;
      continue;
    }
    if ('{' === c) ++depth;
    else if ('}' === c && 0 === --depth) return i;
  }
  return -1;
}

/**
 * Returns one entry per `function NAME(...) { ... }` in `code`, carrying the
 * span of the whole declaration and of its body.  Covers both the declarations
 * and the named function expression the module shell is wrapped in.
 */
function scanFunctionSpans(code) {
  var declaration = /function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  var spans = [];
  var match;
  while ((match = declaration.exec(code)) !== null) {
    var open = code.indexOf('{', declaration.lastIndex);
    if (open < 0) continue;
    var close = matchBrace(code, open);
    if (close < 0) continue;
    spans.push({name: match[1], declStart: match.index, bodyStart: open + 1, end: close});
  }
  return spans;
}

/** Escapes `name` for use inside a RegExp. */
function escapeForRegExp(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the call graph of `code`: name -> [names it calls from its OWN body].
 * Nested declarations are blanked out of the enclosing body first, so the
 * module shell does not inherit an edge for every call its children make.
 */
function buildCallGraph(code) {
  var spans = scanFunctionSpans(code);
  var graph = Object.create(null);
  var i;
  for (i = 0; i < spans.length; ++i) graph[spans[i].name] = [];
  var names = Object.keys(graph);
  for (i = 0; i < spans.length; ++i) {
    var self = spans[i];
    var body = code.slice(self.bodyStart, self.end).split('');
    for (var n = 0; n < spans.length; ++n) {
      var nested = spans[n];
      if (n === i || nested.declStart < self.bodyStart || nested.end > self.end) continue;
      for (var b = nested.declStart - self.bodyStart; b <= nested.end - self.bodyStart; ++b) body[b] = ' ';
    }
    var ownBody = body.join('');
    for (var t = 0; t < names.length; ++t) {
      if (new RegExp('(?:^|[^A-Za-z0-9_$])' + escapeForRegExp(names[t]) + '\\s*\\(').test(ownBody)) {
        graph[self.name].push(names[t]);
      }
    }
  }
  return graph;
}

/** Returns a cycle in `graph` as a name array, or null when it is acyclic. */
function findCallCycle(graph) {
  var state = Object.create(null);
  var stack = [];
  var found = null;
  function visit(name) {
    if (found) return;
    if (1 === state[name]) {
      found = stack.slice(stack.indexOf(name)).concat([name]);
      return;
    }
    if (2 === state[name]) return;
    state[name] = 1;
    stack.push(name);
    var callees = graph[name] || [];
    for (var i = 0; i < callees.length; ++i) visit(callees[i]);
    stack.pop();
    state[name] = 2;
  }
  Object.keys(graph).forEach(visit);
  return found;
}

// --trap-sites=<mode>,host-abort on asm.js.  The mode emits the hook and
// NOTHING after it, so the module carries no self-recursive $w2l_abort — the
// one construct a consumer whose artifact validation forbids call-graph cycles
// cannot accept, and the reason --trap-sites was unusable for them in either
// payload mode.
//
// Three things have to hold together, and each of them is a way a well-meaning
// change could quietly undo the mode.  The graph must be acyclic (not merely
// free of the one helper we know about).  No spin may have taken the abort's
// place — that would satisfy the validator while making the artifact strictly
// worse than the recursion it replaced.  And the trade-off must be REAL: a host
// that returns from the hook resumes the caller on a fabricated value.  That
// last assertion looks like it is pinning a bug; it is pinning the price of the
// mode, so nobody can reintroduce an abort here and still call it host-abort.
function hostAbortFamily(name, modeOptions, expectTable) {
  return new EmissionFamily(
    name,
    'trap_sites.wast',
    'asmjs',
    function (code, result) {
      assert(!/w2l_abort/.test(code), 'host-abort emitted the abort helper it exists to remove\n' + code);

      var cycle = findCallCycle(buildCallGraph(code));
      assert(null === cycle, 'host-abort output has a call-graph cycle: ' + (cycle || []).join(' -> ') + '\n' + code);

      // A spin passes a call-graph validator too, and is the worse artifact:
      // it stops the fall-through by freezing, with no stack and no log.
      assert(
        !/while\s*\(\s*(?:1|true)\s*\)/.test(code) && !/for\s*\(\s*;\s*;\s*\)/.test(code),
        'host-abort replaced the abort with a spin — a frozen tab carries no diagnosis\n' + code
      );
      assert(!/\bthrow\b/.test(code), 'a `throw` leaked into asm.js output — it is outside the validated subset\n' + code);

      // The hook itself is untouched: this mode drops the abort, not the
      // diagnosis, and the payload shape still follows the selected mode.
      if (expectTable) {
        assert(/\$w2l_trap\(\d+,\s*\d+\)/.test(code), 'host-abort dropped the (kind, siteId) payload\n' + code);
        var parsed = JSON.parse(result['traps']);
        assert(parsed.siteCount > 0, 'host-abort site table came back empty — liveness detection no longer matches');
        // Dropping the abort helper frees a mangler slot and shifts every later
        // helper's token, so `symbol` legitimately differs from a non-host-abort
        // build.  What must NOT differ is that each row names something the
        // artifact it was emitted with actually declares.
        for (var s = 0; s < parsed.sites.length; ++s) {
          var symbol = parsed.sites[s].symbol;
          assert(symbol, 'host-abort table row ' + parsed.sites[s].id + ' carries no emitted symbol');
          assert(
            new RegExp('function ' + escapeForRegExp(symbol) + '\\s*\\(').test(code),
            'host-abort row ' + parsed.sites[s].id + ' names "' + symbol + '", which is declared nowhere in the source'
          );
        }
      } else {
        assert(!result['traps'], 'host-abort in kind mode wrote a site table');
        assert(!/\$w2l_trap\(\d+,/.test(code), 'a siteId survived into kind mode\n' + code);
        assert(/\$w2l_trap\(\d+\)/.test(code), 'kind mode did not pass the kind to the hook\n' + code);
      }

      // The checked-division guards stay on: without them a division by zero
      // never reaches the hook at all and there is nothing to classify.
      assert(/\$w2l_div_s_i32\(/.test(code), 'host-abort dropped the checked-division helper\n' + code);

      var factory = eval(code + '\nmodule');

      // A host that throws is what this mode requires, and it is the host —
      // not the module — that stops the program.
      var thrownSeen = [];
      var thrownInst = factory(
        globalThis,
        {
          __wasm2lang_trap: function (k, s) {
            thrownSeen.push([k, s]);
            throw new Error('host stop');
          }
        },
        new ArrayBuffer(1 << 20)
      );
      var thrownReturn = 'not-set';
      var thrownError = null;
      try {
        thrownReturn = thrownInst.twoTrapsOneFunc(1);
      } catch (e) {
        thrownError = e;
      }
      assert(1 === thrownSeen.length, 'throwing host: expected one hook call, saw ' + thrownSeen.length);
      assert(1 === thrownSeen[0][0], 'throwing host: expected kind 1 (unreachable), got ' + thrownSeen[0][0]);
      assert(thrownError, 'a host that threw did not stop the caller');
      assert('not-set' === thrownReturn, 'the caller resumed despite the host throwing, returning ' + thrownReturn);

      // And the documented price, asserted rather than left in a comment: with
      // nothing emitted after the hook, a host that returns hands the caller a
      // value wasm says cannot exist.  If this ever stops holding, an abort has
      // come back and the mode no longer does what its name says.
      var silentSeen = [];
      var silentInst = factory(
        globalThis,
        {
          __wasm2lang_trap: function (k, s) {
            silentSeen.push([k, s]);
          }
        },
        new ArrayBuffer(1 << 20)
      );
      var silentReturn = 'not-set';
      var silentError = null;
      try {
        silentReturn = silentInst.twoTrapsOneFunc(1);
      } catch (e) {
        silentError = e;
      }
      assert(null === silentError, 'host-abort still aborted on its own: ' + silentError);
      assert(1 === silentSeen.length, 'non-throwing host: expected one hook call, saw ' + silentSeen.length);
      assert(
        3 === silentReturn,
        'expected the documented fall-through onto the fabricated value; got ' +
          silentReturn +
          ' — if an abort came back, host-abort is no longer host-abort'
      );

      // Unaffected paths still compute.
      assert(10 === silentInst.divByConstant(100), 'divByConstant(100) miscomputed under host-abort');
    },
    ['binaryen:none', 'wasm2lang:codegen'],
    modeOptions
  );
}

var trapSitesHostAbort = hostAbortFamily('trap-sites-host-abort', {'trapSites': true, 'trapHostAbort': true}, true);

var trapSitesHostAbortKind = hostAbortFamily(
  'trap-sites-host-abort-kind',
  {'trapSites': true, 'trapSiteIds': false, 'trapHostAbort': true},
  false
);

// host-abort is asm.js-only, and silently so on the four backends that abort
// with a `throw`: a throw is not a call and forms no cycle, so honouring the
// modifier there would drop the fall-through guard in exchange for nothing.
// Pinned here because "unchanged" is exactly the kind of claim that rots.
var trapSitesHostAbortThrowingBackend = new EmissionFamily(
  'trap-sites-host-abort-throwing-backend',
  'trap_sites.wast',
  'javascript',
  function (code) {
    assert(
      /\$w2l_trap\(1, \d+\);\s*\n\s*throw new Error\(/.test(code),
      'host-abort disarmed the throwing backend, which had no cycle to remove\n' + code
    );
    assert(/w2l trap kind=1 site=\d+/.test(code), 'the self-describing abort message went missing\n' + code);
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {'trapSites': true, 'trapHostAbort': true}
);

// An i64 operation that reaches a backend with no i64 renderer means
// `i64-to-i32-lowering` never ran — the module cannot be expressed, and the only
// honest outcome is to stop.  Emitting a placeholder call instead is how 13 753
// references to a function that does not exist ended up in a real build, in
// source that read perfectly normally until it threw ReferenceError.
//
// asm.js and PHP are the two backends that depend on the lowering; both must
// refuse.  JavaScript is the control: it handles i64 natively, so the very same
// module and pipeline must still emit successfully.
function i64RefusalFamily(name, languageOut) {
  return new EmissionFamily(
    name,
    'i64_needs_lowering.wast',
    languageOut,
    function () {},
    ['binaryen:none'],
    {},
    /cannot express the i64 operation/
  );
}

var i64ControlNative = new EmissionFamily(
  'i64-no-lowering-javascript-ok',
  'i64_needs_lowering.wast',
  'javascript',
  function (code) {
    assert(!/__unknown/.test(code), 'a placeholder call leaked into a backend that handles i64 natively\n' + code);
    assert(/addI64/.test(code), 'the native-i64 backend did not emit the function\n' + code);
  },
  ['binaryen:none']
);

// A backend with no SIMD type must REFUSE a module that uses v128, not emit one
// with the SIMD quietly missing.  The fixture is pure v128 data movement, which
// is precisely the shape the old per-renderer refusal let through: it guarded
// the SIMD arithmetic ops and nothing else, so asm.js emitted a valid-parsing,
// wrong-computing module at exit 0.
//
// java and csharp are the controls: the same module and pipeline must still
// emit, because both express v128 as a language primitive.
function simdRefusalFamily(name, languageOut) {
  return new EmissionFamily(
    name,
    'simd_no_lane_ops.wast',
    languageOut,
    function () {},
    ['binaryen:max', 'wasm2lang:codegen'],
    {},
    /cannot express v128/
  );
}

var simdRefusalAsmjs = simdRefusalFamily('simd-refused-asmjs', 'asmjs');
var simdRefusalJavascript = simdRefusalFamily('simd-refused-javascript', 'javascript');
var simdRefusalPhp64 = simdRefusalFamily('simd-refused-php64', 'php64');

// The controls run at binaryen:none so the swizzle actually reaches the
// backend: both its operands are constants, and binaryen:max folds the whole
// thing to a v128.const before any emitter sees it.  The refusal families above
// deliberately stay at binaryen:max — v128 survives folding as a parameter, a
// store and a constant, which is the point.
var simdNativeJava = new EmissionFamily(
  'simd-native-java-ok',
  'simd_no_lane_ops.wast',
  'java',
  function (code) {
    assert(-1 !== code.indexOf('import jdk.incubator.vector.*;'), 'the Vector API import is missing from a SIMD module');
    assert(
      /static IntVector \S*v128_swizzle_i8x16\(IntVector \w+, IntVector \w+\)/.test(code),
      'the swizzle did not survive to the Vector helper'
    );
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {}
);

var simdNativeCsharp = new EmissionFamily(
  'simd-native-csharp-ok',
  'simd_no_lane_ops.wast',
  'csharp',
  function (code) {
    assert(-1 !== code.indexOf('System.Runtime.Intrinsics'), 'the Vector128 namespace is missing from a SIMD module');
    assert(/Vector128\.Shuffle\(/.test(code), 'the swizzle did not survive to a Vector128 shuffle');
    assert(-1 === code.indexOf('unknown expr id'), 'a placeholder comment reached the emitted C#');
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {}
);

var simdVectorPathOperands = new EmissionFamily(
  'simd-vector-path-operands',
  'simd_vector_ops.wast',
  'java',
  function (code) {
    assert(
      /static IntVector \S*v128_bitselect_v128\(IntVector \w+, IntVector \w+, IntVector \w+\)/.test(code),
      'bitselect is not a three-parameter helper — the inline form evaluates its mask twice\n'
    );
    // The AND-then-OR chain is the bitselect formula, so it MUST appear exactly
    // once — inside the helper body.  A second occurrence is a call site that
    // expanded inline, which is the defect: the mask is named twice there.
    // Asserting its absence outright would fail on the helper itself.
    var bitselectChains = (code.match(/lanewise\(VectorOperators\.AND, [^;]*?\)\.lanewise\(VectorOperators\.OR,/g) || [])
      .length;
    assertEqual(
      bitselectChains,
      1,
      'the bitselect AND/OR chain must occur once (the helper body) — a second is an inline call site that evaluates its mask twice'
    );
    assert(
      /VectorShuffle\.fromValues\(ByteVector\.SPECIES_128(, \d+){16}\)/.test(code),
      'shuffle is not a 16-index BYTE rearrange — a 4-lane form is wrong for any unaligned mask'
    );
    assert(!/VectorShuffle\.fromValues\(IntVector\.SPECIES_128/.test(code), 'the 4-lane shuffle form came back');
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {}
);

var emissionFamilies = [
  eqzOrCompoundNegation,
  kernelLeaveFreshness,
  simdVectorPathOperands,
  simdRefusalAsmjs,
  simdRefusalJavascript,
  simdRefusalPhp64,
  simdNativeJava,
  simdNativeCsharp,
  trapSitesOff,
  trapSitesOn,
  trapSitesAsmjsAbort,
  trapSitesKindOnly,
  trapSitesHostAbort,
  trapSitesHostAbortKind,
  trapSitesHostAbortThrowingBackend,
  i64RefusalFamily('i64-no-lowering-asmjs-refused', 'asmjs'),
  i64RefusalFamily('i64-no-lowering-php64-refused', 'php64'),
  i64ControlNative
];

loadBinaryen().then(function (binaryen) {
  var fixtureDir = path.resolve(__dirname, 'fixtures');
  var failures = 0;
  var passes = 0;

  for (var i = 0; i < families.length; i++) {
    var family = families[i];
    var wast = fs.readFileSync(path.resolve(fixtureDir, family.fixturePath), 'utf8');

    try {
      var testResult = wasm2lang['getPassAnalysis'](binaryen, wast);
      family.assertions(testResult);
      console.log('\x1b[0;32mPASS\x1b[0m: ' + family.name);
      ++passes;
    } catch (e) {
      console.error('\x1b[0;31mFAIL\x1b[0m: ' + family.name + ': ' + e.message);
      ++failures;
    }
  }

  // Emission families run ONE AT A TIME, not concurrently.
  //
  // transpile() is asynchronous (the mangler precomputes names), so two
  // overlapping transpiles interleave across every await point.  Serialising
  // them costs a few seconds and removes a whole class of order-dependent
  // failure — in particular any backend state that is static rather than
  // per-instance would be corrupted by whichever emit pinned it last.
  function runEmissionFamily(ef) {
    var wastSrc = fs.readFileSync(path.resolve(fixtureDir, ef.fixturePath), 'utf8');
    var p;
    try {
      var transpileOptions = {
        'inputData': wastSrc,
        'normalizeWasm': ef.normalizeWasm,
        'languageOut': ef.languageOut,
        'emitCode': 'module'
      };
      for (var optKey in ef.extraOptions) {
        if (Object.prototype.hasOwnProperty.call(ef.extraOptions, optKey)) {
          transpileOptions[optKey] = ef.extraOptions[optKey];
        }
      }
      var emit = wasm2lang['transpile'](binaryen, transpileOptions);
      p = emit && typeof emit.then === 'function' ? emit : Promise.resolve(emit);
    } catch (e) {
      p = Promise.reject(e);
    }
    return p
      .then(function (result) {
        if (ef.expectErrorPattern) {
          var emitted = (result && result['code']) || '';
          throw new Error('expected transpile to be refused, but it emitted ' + emitted.length + ' chars of source');
        }
        var codeStr = result && result['code'];
        if (!codeStr) throw new Error('transpile did not return emitted code');
        ef.assertions(codeStr, result);
        console.log('[0;32mPASS[0m: ' + ef.name);
        ++passes;
      })
      .catch(function (e) {
        if (ef.expectErrorPattern && ef.expectErrorPattern.test(String(e.message))) {
          console.log('[0;32mPASS[0m: ' + ef.name);
          ++passes;
          return;
        }
        console.error('[0;31mFAIL[0m: ' + ef.name + ': ' + e.message);
        ++failures;
      });
  }

  var emissionChain = Promise.resolve();
  for (var j = 0; j < emissionFamilies.length; j++) {
    (function (ef) {
      emissionChain = emissionChain.then(function () {
        return runEmissionFamily(ef);
      });
    })(emissionFamilies[j]);
  }

  emissionChain.then(function () {
    var total = families.length + emissionFamilies.length;
    console.log('');
    console.log(passes + '/' + total + ' families passed.');
    if (failures > 0) {
      console.log('\x1b[0;31m' + failures + ' FAILED\x1b[0m');
    }
    process.exit(failures > 0 ? 1 : 0);
  });
});
