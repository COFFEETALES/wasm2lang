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
  var key = findKeyWithPrefix(meta, 'lb$', '$' + funcName + ' must have lb$ key');
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
});

// ---------------------------------------------------------------------------
// Family: block-loop-fusion
// ---------------------------------------------------------------------------

var blockLoopFusion = new PassFamily('block-loop-fusion', 'block_loop_fusion.wast', function (result) {
  assertFusionPlan(result, 'fusionA', 'a');
  assertFusionPlan(result, 'fusionB', 'b');
  assertMetadataNull(result, 'noFusion', 'blockLoopFusion');
  assertMetadataNull(result, 'noFusionOuterExit', 'blockLoopFusion');
});

// ---------------------------------------------------------------------------
// Family: switch-dispatch (includes root-switch)
// ---------------------------------------------------------------------------

var switchDispatch = new PassFamily('switch-dispatch', 'switch_dispatch.wast', function (result) {
  assertDispatchKey(result, 'flatSwitch', 'switchDispatch', 'sw$');
  assertMetadataNull(result, 'flatSwitch', 'rootSwitch');

  // Action code breaks to the outer dispatch block — still detected as sw$.
  assertDispatchKey(result, 'flatSwitchRequiresLabel', 'switchDispatch', 'sw$');
  assertMetadataNull(result, 'flatSwitchRequiresLabel', 'rootSwitch');

  assertDispatchKey(result, 'rootSwitch', 'switchDispatch', 'sw$');
  assertDispatchKey(result, 'rootSwitch', 'rootSwitch', 'rs$');
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
  // Exit guard targets distant block → must NOT become while, stays as for.
  assertLoopPlan(result, 'noWhileDistantExit', 'for');
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

var families = [localInitFolding, blockLoopFusion, switchDispatch, loopSimplification, ifElseRecovery];

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

  console.log('');
  console.log(passes + '/' + families.length + ' pass families passed.');
  if (failures > 0) {
    console.log('\x1b[0;31m' + failures + ' FAILED\x1b[0m');
  }

  process.exit(failures > 0 ? 1 : 0);
});
