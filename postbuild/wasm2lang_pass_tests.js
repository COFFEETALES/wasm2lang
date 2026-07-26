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
function EmissionFamily(name, fixturePath, languageOut, assertions, opt_normalizeWasm, opt_extraOptions) {
  this.name = name;
  this.fixturePath = fixturePath;
  this.languageOut = languageOut;
  this.assertions = assertions;
  this.normalizeWasm = opt_normalizeWasm || ['binaryen:max', 'wasm2lang:codegen'];
  this.extraOptions = opt_extraOptions || {};
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
    for (var c = 0; c < cases.length; c++) {
      var got = provoke(cases[c][0], cases[c][2]);
      assert(got[0] === cases[c][1], cases[c][0] + ': host received kind ' + got[0] + ', expected ' + cases[c][1]);
      var resolved = byId[got[1]];
      assert(resolved, cases[c][0] + ': site id ' + got[1] + ' does not resolve in the table');
      assert(resolved.kind === cases[c][1], cases[c][0] + ': table says kind ' + resolved.kind + ' for site ' + got[1]);
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
  },
  ['binaryen:none', 'wasm2lang:codegen'],
  {'trapSites': true}
);

var emissionFamilies = [eqzOrCompoundNegation, kernelLeaveFreshness, trapSitesOff, trapSitesOn];

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

  var emissionPromises = [];
  for (var j = 0; j < emissionFamilies.length; j++) {
    (function (ef) {
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
      emissionPromises.push(
        p
          .then(function (result) {
            var codeStr = result && result['code'];
            if (!codeStr) throw new Error('transpile did not return emitted code');
            ef.assertions(codeStr, result);
            console.log('\x1b[0;32mPASS\x1b[0m: ' + ef.name);
            ++passes;
          })
          .catch(function (e) {
            console.error('\x1b[0;31mFAIL\x1b[0m: ' + ef.name + ': ' + e.message);
            ++failures;
          })
      );
    })(emissionFamilies[j]);
  }

  Promise.all(emissionPromises).then(function () {
    var total = families.length + emissionFamilies.length;
    console.log('');
    console.log(passes + '/' + total + ' families passed.');
    if (failures > 0) {
      console.log('\x1b[0;31m' + failures + ' FAILED\x1b[0m');
    }
    process.exit(failures > 0 ? 1 : 0);
  });
});
