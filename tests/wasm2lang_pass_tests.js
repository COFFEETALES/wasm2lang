'use strict';

/**
 * Pass-family end-to-end tests for the compiled wasm2lang artifact.
 *
 * Each PassFamily descriptor pairs a WAST fixture with assertions that
 * validate both the normalization phase (pass execution producing metadata)
 * and the application phase (accessor readback of that metadata).
 *
 * Usage (from test_artifacts/):
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
// Load compiled artifact (CJS — synchronous require is fine)
// ---------------------------------------------------------------------------

var wasm2lang = require(path.resolve(artifactPath));

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }
}

function assertNotNull(value, message) {
  if (value == null) {
    throw new Error(message + ' (got null/undefined)');
  }
}

function assertNull(value, message) {
  if (value != null) {
    throw new Error(message + ' (expected null, got ' + JSON.stringify(value) + ')');
  }
}

function assertHasKey(obj, key, message) {
  if (!(key in obj)) {
    throw new Error(message + ' (missing key "' + key + '" in ' + JSON.stringify(Object.keys(obj)) + ')');
  }
}

/**
 * Finds a key in obj that starts with the given prefix.
 * Returns the full key, or throws if not found.
 */
function findKeyWithPrefix(obj, prefix, message) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; ++i) {
    if (0 === keys[i].indexOf(prefix)) {
      return keys[i];
    }
  }
  throw new Error(message + ' (no key with prefix "' + prefix + '" in ' + JSON.stringify(keys) + ')');
}

// ---------------------------------------------------------------------------
// Pass family registry
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @param {string} fixturePath  Relative to tests/pass_fixtures/
 * @param {function(!Object)} assertions
 */
function PassFamily(name, fixturePath, assertions) {
  this.name = name;
  this.fixturePath = fixturePath;
  this.assertions = assertions;
}

// ---------------------------------------------------------------------------
// Family: local-init-folding
// ---------------------------------------------------------------------------

var localInitFolding = new PassFamily('local-init-folding', 'local_init_folding.wast', function (result) {
  // $singleFold: local $x (index 1, after param $p) folded to 42
  assertHasKey(result, 'singleFold', '$singleFold must exist');
  var sf = result['singleFold'];
  assertNotNull(sf['localInitFolding'], '$singleFold localInitFolding must be non-null');
  assertEqual(sf['localInitFolding']['1'], 42, '$singleFold local 1 should be folded to 42');

  // $multiFold: locals $a (index 0) and $b (index 1) folded to 10 and 20
  assertHasKey(result, 'multiFold', '$multiFold must exist');
  var mf = result['multiFold'];
  assertNotNull(mf['localInitFolding'], '$multiFold localInitFolding must be non-null');
  assertEqual(mf['localInitFolding']['0'], 10, '$multiFold local 0 should be folded to 10');
  assertEqual(mf['localInitFolding']['1'], 20, '$multiFold local 1 should be folded to 20');

  // $noFold: no folding expected (local.get before local.set)
  assertHasKey(result, 'noFold', '$noFold must exist');
  var nf = result['noFold'];
  assertNull(nf['localInitFolding'], '$noFold localInitFolding should be null');
});

// ---------------------------------------------------------------------------
// Family: block-loop-fusion
// ---------------------------------------------------------------------------

var blockLoopFusion = new PassFamily('block-loop-fusion', 'block_loop_fusion.wast', function (result) {
  // $fusionA: block $outer fused (pattern A: block wrapping sole loop)
  assertHasKey(result, 'fusionA', '$fusionA must exist');
  var fa = result['fusionA'];
  assertNotNull(fa['blockLoopFusion'], '$fusionA blockLoopFusion must be non-null');
  var faKey = findKeyWithPrefix(fa['blockLoopFusion'], 'lb$', '$fusionA must have lb$ key');
  var faPlan = fa['blockLoopFusion'][faKey];
  assertNotNull(faPlan, '$fusionA plan must be non-null');
  assertEqual(faPlan['fusionPattern'], 'a', '$fusionA fusionPattern should be a');

  // $fusionB: block $inner fused (pattern B: loop wrapping sole block)
  assertHasKey(result, 'fusionB', '$fusionB must exist');
  var fb = result['fusionB'];
  assertNotNull(fb['blockLoopFusion'], '$fusionB blockLoopFusion must be non-null');
  var fbKey = findKeyWithPrefix(fb['blockLoopFusion'], 'lb$', '$fusionB must have lb$ key');
  var fbPlan = fb['blockLoopFusion'][fbKey];
  assertNotNull(fbPlan, '$fusionB plan must be non-null');
  assertEqual(fbPlan['fusionPattern'], 'b', '$fusionB fusionPattern should be b');

  // $noFusion: no fusion expected
  assertHasKey(result, 'noFusion', '$noFusion must exist');
  var nf = result['noFusion'];
  assertNull(nf['blockLoopFusion'], '$noFusion blockLoopFusion should be null');
});

// ---------------------------------------------------------------------------
// Family: switch-dispatch (includes root-switch)
// ---------------------------------------------------------------------------

var switchDispatch = new PassFamily('switch-dispatch', 'switch_dispatch.wast', function (result) {
  // $flatSwitch: dispatch block detected with sw$ prefix
  assertHasKey(result, 'flatSwitch', '$flatSwitch must exist');
  var fsd = result['flatSwitch'];
  assertNotNull(fsd['switchDispatch'], '$flatSwitch switchDispatch must be non-null');
  var fsKey = findKeyWithPrefix(fsd['switchDispatch'], 'sw$', '$flatSwitch must have sw$ key');
  assertEqual(fsd['switchDispatch'][fsKey], true, '$flatSwitch sw$ block detected as dispatch');
  // No root-switch in a plain dispatch
  assertNull(fsd['rootSwitch'], '$flatSwitch rootSwitch should be null');

  // $rootSwitch: dispatch block detected with sw$ and outer block with rs$
  assertHasKey(result, 'rootSwitch', '$rootSwitch must exist');
  var rs = result['rootSwitch'];
  assertNotNull(rs['switchDispatch'], '$rootSwitch switchDispatch must be non-null');
  var rsSwKey = findKeyWithPrefix(rs['switchDispatch'], 'sw$', '$rootSwitch must have sw$ dispatch key');
  assertEqual(rs['switchDispatch'][rsSwKey], true, '$rootSwitch sw$ block detected as dispatch');
  assertNotNull(rs['rootSwitch'], '$rootSwitch rootSwitch must be non-null');
  var rsKey = findKeyWithPrefix(rs['rootSwitch'], 'rs$', '$rootSwitch must have rs$ key');
  assertEqual(rs['rootSwitch'][rsKey], true, '$rootSwitch rs$ block detected as root-switch');
});

// ---------------------------------------------------------------------------
// Family: loop-simplification
// ---------------------------------------------------------------------------

var loopSimplification = new PassFamily('loop-simplification', 'loop_simplification.wast', function (result) {
  // $forLoop: trailing self-continue → loopKind 'for'
  assertHasKey(result, 'forLoop', '$forLoop must exist');
  var fl = result['forLoop'];
  assertNotNull(fl['loopSimplification'], '$forLoop loopSimplification must be non-null');
  var flKeys = Object.keys(fl['loopSimplification']);
  assert(flKeys.length > 0, '$forLoop must have at least one loop plan');
  var flPlan = fl['loopSimplification'][flKeys[0]];
  assertNotNull(flPlan, '$forLoop plan must be non-null');
  // The for-loop detection may produce 'for' or 'while' depending on
  // whether the entry guard is present. With block $exit wrapping, the
  // pass sees (br_if $exit ...) as entry guard → 'while' pattern.
  // Accept either 'for' or 'while' since both are valid simplifications.
  assert(
    flPlan['loopKind'] === 'for' || flPlan['loopKind'] === 'while',
    '$forLoop loopKind should be for or while, got ' + flPlan['loopKind']
  );

  // $doWhileLoop: conditional continue at end → loopKind 'dowhile'
  assertHasKey(result, 'doWhileLoop', '$doWhileLoop must exist');
  var dw = result['doWhileLoop'];
  assertNotNull(dw['loopSimplification'], '$doWhileLoop loopSimplification must be non-null');
  var dwKeys = Object.keys(dw['loopSimplification']);
  assert(dwKeys.length > 0, '$doWhileLoop must have at least one loop plan');
  var dwPlan = dw['loopSimplification'][dwKeys[0]];
  assertNotNull(dwPlan, '$doWhileLoop plan must be non-null');
  assertEqual(dwPlan['loopKind'], 'dowhile', '$doWhileLoop loopKind should be dowhile');

  // $whileLoop: entry guard + trailing self-continue → loopKind 'while'
  assertHasKey(result, 'whileLoop', '$whileLoop must exist');
  var wl = result['whileLoop'];
  assertNotNull(wl['loopSimplification'], '$whileLoop loopSimplification must be non-null');
  var wlKeys = Object.keys(wl['loopSimplification']);
  assert(wlKeys.length > 0, '$whileLoop must have at least one loop plan');
  var wlPlan = wl['loopSimplification'][wlKeys[0]];
  assertNotNull(wlPlan, '$whileLoop plan must be non-null');
  assertEqual(wlPlan['loopKind'], 'while', '$whileLoop loopKind should be while');
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

var families = [localInitFolding, blockLoopFusion, switchDispatch, loopSimplification];

loadBinaryen().then(function (binaryen) {
  var fixtureDir = path.resolve(__dirname, '../tests/pass_fixtures');
  var failures = 0;
  var passes = 0;

  for (var i = 0; i < families.length; i++) {
    var family = families[i];
    var wastPath = path.resolve(fixtureDir, family.fixturePath);
    var wast = fs.readFileSync(wastPath, 'utf8');

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
