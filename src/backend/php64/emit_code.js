'use strict';

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {!Array<!Wasm2Lang.OutputSink.ChunkEntry>}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitCode = function (wasmModule, options) {
  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Collect internal function names (safe identifiers, unmangled keys).
  var /** @const {!Array<string>} */ internalFuncNames = [];
  for (var /** number */ fn = 0, /** @const {number} */ fnCount = moduleInfo.functions.length; fn !== fnCount; ++fn) {
    internalFuncNames[internalFuncNames.length] = Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.functions[fn].name);
  }

  // Emit function bodies first to discover which helpers are needed.
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** number */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
    var /** @const {!BinaryenFunctionInfo} */ funcInfo = moduleInfo.functions[f];
    functionParts[functionParts.length] = this.emitFunction_(
      wasmModule,
      binaryen,
      funcInfo,
      moduleInfo.importedNames,
      moduleInfo.globals,
      moduleInfo.impFuncs,
      internalFuncNames,
      moduleInfo.functionSignatures,
      moduleInfo.globalTypes
    );
  }
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_;
  this.usedHelpers_ = null;

  // Pre-resolve mangled helper names used across multiple definitions.
  var /** @const {string} */ nI = this.n_('_w2l_i');
  var /** @const {string} */ nF32 = this.n_('_w2l_f32');

  // Core coercion helpers (always emitted).
  outputParts[outputParts.length] =
    'function ' + nI + '($v): int { $v = (int)$v; $v &= 0xFFFFFFFF; return ($v > 2147483647) ? ($v - 4294967296) : $v; }';
  outputParts[outputParts.length] = 'function ' + nF32 + "($v): float { return unpack('g', pack('g', (float)$v))[1]; }";

  // Opcode-specific helpers (only when referenced).
  if (used['_w2l_clz']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_clz') +
      '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 0x80000000)) { ++$n; $v = ($v << 1) & 0xFFFFFFFF; } return $n; }';
  }
  if (used['_w2l_ctz']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_ctz') +
      '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 1)) { ++$n; $v >>= 1; } return $n; }';
  }
  if (used['_w2l_popcnt']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_popcnt') +
      '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; $n = 0; while (0 !== $v) { $n += $v & 1; $v >>= 1; } return $n; }';
  }
  if (used['_w2l_imul']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_imul') +
      '(int $a, int $b): int { $al = $a & 0xFFFF; $ah = ($a >> 16) & 0xFFFF; return ' +
      nI +
      '($al * ($b & 0xFFFF) + (($ah * ($b & 0xFFFF) + $al * (($b >> 16) & 0xFFFF)) << 16)); }';
  }
  if (used['_w2l_copysign_f64']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_copysign_f64') +
      '($x, $y): float { $x = abs((float)$x); return (ord(pack("E", (float)$y)[0]) & 128) ? -$x : $x; }';
  }
  if (used['_w2l_copysign_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_copysign_f32') +
      '($x, $y): float { return ' +
      nF32 +
      '(' +
      this.n_('_w2l_copysign_f64') +
      '($x, $y)); }';
  }
  if (used['_w2l_trunc_f64']) {
    outputParts[outputParts.length] =
      'function ' + this.n_('_w2l_trunc_f64') + '($x): float { $x = (float)$x; return $x < 0.0 ? ceil($x) : floor($x); }';
  }
  if (used['_w2l_trunc_f32']) {
    outputParts[outputParts.length] =
      'function ' + this.n_('_w2l_trunc_f32') + '($x): float { return ' + nF32 + '(' + this.n_('_w2l_trunc_f64') + '($x)); }';
  }
  if (used['_w2l_nearest_f64']) {
    outputParts[outputParts.length] =
      'function ' + this.n_('_w2l_nearest_f64') + '($x): float { return round((float)$x, 0, PHP_ROUND_HALF_EVEN); }';
  }
  if (used['_w2l_nearest_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_nearest_f32') +
      '($x): float { return ' +
      nF32 +
      '(' +
      this.n_('_w2l_nearest_f64') +
      '($x)); }';
  }
  if (used['_w2l_trunc_s_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_s_f32_to_i32') +
      '($x): int { return ' +
      nI +
      '((int)' +
      this.n_('_w2l_trunc_f64') +
      '(' +
      nF32 +
      '($x))); }';
  }
  if (used['_w2l_trunc_u_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_u_f32_to_i32') +
      '($x): int { return ' +
      this.n_('_w2l_trunc_u_f64_to_i32') +
      '(' +
      nF32 +
      '($x)); }';
  }
  if (used['_w2l_trunc_s_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_s_f64_to_i32') +
      '($x): int { return ' +
      nI +
      '((int)' +
      this.n_('_w2l_trunc_f64') +
      '((float)$x)); }';
  }
  if (used['_w2l_trunc_u_f64_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_u_f64_to_i32') +
      '($x): int { $x = ' +
      this.n_('_w2l_trunc_f64') +
      '((float)$x); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }';
  }
  if (used['_w2l_trunc_sat_s_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_s_f32_to_i32') +
      '($x): int { return ' +
      this.n_('_w2l_trunc_sat_s_f64_to_i32') +
      '(' +
      nF32 +
      '($x)); }';
  }
  if (used['_w2l_trunc_sat_u_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_u_f32_to_i32') +
      '($x): int { return ' +
      this.n_('_w2l_trunc_sat_u_f64_to_i32') +
      '(' +
      nF32 +
      '($x)); }';
  }
  if (used['_w2l_trunc_sat_s_f64_to_i32']) {
    var /** @const {string} */ nTruncF64 = this.n_('_w2l_trunc_f64');
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_s_f64_to_i32') +
      '($x): int { $x = ' +
      nTruncF64 +
      '((float)$x); return is_nan($x) ? 0 : ($x >= 2147483648.0 ? ' +
      nI +
      '(2147483647) : ($x <= -2147483649.0 ? ' +
      nI +
      '(-2147483648) : ' +
      nI +
      '((int)$x))); }';
  }
  if (used['_w2l_trunc_sat_u_f64_to_i32']) {
    var /** @const {string} */ nTruncF64u = this.n_('_w2l_trunc_f64');
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_trunc_sat_u_f64_to_i32') +
      '($x): int { $x = ' +
      nTruncF64u +
      '((float)$x); if (is_nan($x) || $x < 0.0) return 0; if ($x >= 4294967296.0) return ' +
      nI +
      '(-1); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }';
  }
  if (used['_w2l_convert_u_i32_to_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_convert_u_i32_to_f32') +
      '($x): float { $x = ' +
      nI +
      '($x); return ' +
      nF32 +
      '($x < 0 ? $x + 4294967296.0 : $x); }';
  }
  if (used['_w2l_convert_u_i32_to_f64']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_convert_u_i32_to_f64') +
      '($x): float { $x = ' +
      nI +
      '($x); return $x < 0 ? $x + 4294967296.0 : (float)$x; }';
  }
  if (used['_w2l_reinterpret_f32_to_i32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_reinterpret_f32_to_i32') +
      '($x): int { return ' +
      nI +
      "(unpack('V', pack('g', " +
      nF32 +
      '($x)))[1]); }';
  }
  if (used['_w2l_reinterpret_i32_to_f32']) {
    outputParts[outputParts.length] =
      'function ' +
      this.n_('_w2l_reinterpret_i32_to_f32') +
      '($x): float { return ' +
      nF32 +
      "(unpack('g', pack('V', " +
      nI +
      '($x)))[1]); }';
  }

  // Module header.
  var /** @const {string} */ pad1 = Wasm2Lang.Backend.AbstractCodegen.pad_(1);
  var /** @const {string} */ nBuf = this.phpVar_('buffer');
  outputParts[outputParts.length] = '$' + moduleName + ' = function(array $foreign, string &' + nBuf + '): array {';

  // Imported function bindings.
  for (var /** number */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length; i !== importCount; ++i) {
    outputParts[outputParts.length] =
      pad1 +
      this.phpVar_('$if_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.impFuncs[i].importBaseName)) +
      " = $foreign['" +
      moduleInfo.impFuncs[i].importBaseName +
      "'] ?? null;";
  }

  // Module-level globals.
  for (var /** number */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    outputParts[outputParts.length] =
      pad1 +
      this.phpVar_('$g_' + Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.globals[gi].globalName)) +
      ' = ' +
      moduleInfo.globals[gi].globalInitValue +
      ';';
  }

  // Forward declarations for internal functions.
  for (var /** number */ fi = 0, /** @const {number} */ fNameLen = internalFuncNames.length; fi !== fNameLen; ++fi) {
    outputParts[outputParts.length] = pad1 + this.phpVar_(internalFuncNames[fi]) + ' = null;';
  }

  // Append function bodies.
  for (var /** number */ fp = 0, /** @const {number} */ fpLen = functionParts.length; fp !== fpLen; ++fp) {
    outputParts[outputParts.length] = functionParts[fp];
  }

  // Return array.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (var /** number */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length; r !== exportCount; ++r) {
    returnEntries[returnEntries.length] =
      "'" +
      moduleInfo.expFuncs[r].exportName +
      "' => " +
      this.phpVar_(Wasm2Lang.Backend.Php64Codegen.phpSafeName_(moduleInfo.expFuncs[r].internalName));
  }
  outputParts[outputParts.length] = pad1 + 'return [' + returnEntries.join(', ') + '];';
  outputParts[outputParts.length] = '};';

  // Traversal summary.
  // prettier-ignore
  outputParts[outputParts.length] = /** @type {string} */ (Wasm2Lang.Backend.AbstractCodegen.prototype.emitCode.call(this, wasmModule, options));

  return Wasm2Lang.OutputSink.interleaveNewlines(outputParts);
};
