'use strict';

/**
 * @override
 * @param {!BinaryenModule} wasmModule
 * @param {!Wasm2Lang.Options.Schema.NormalizedOptions} options
 * @return {string}
 */
Wasm2Lang.Backend.Php64Codegen.prototype.emitCode = function (wasmModule, options) {
  this.initDiagnostics_();

  var /** @const {!Binaryen} */ binaryen = Wasm2Lang.Processor.getBinaryen();
  var /** @const {string} */ moduleName = /** @type {string} */ (options.emitCode);
  var /** @const {!Wasm2Lang.Backend.AbstractCodegen.ModuleCodegenInfo_} */ moduleInfo =
      this.collectModuleCodegenInfo_(wasmModule);
  var /** @const {!Array<string>} */ outputParts = [];

  // Collect internal function names (safe identifiers, unmangled keys).
  var /** @const {!Array<string>} */ internalFuncNames = [];
  for (var /** @type {number} */ fn = 0, /** @const {number} */ fnCount = moduleInfo.functions.length; fn !== fnCount; ++fn) {
    internalFuncNames[internalFuncNames.length] = this.safeName_(moduleInfo.functions[fn].name);
  }

  // Resolve stdlib imports.
  var /** @const */ stdlibBindings = Wasm2Lang.Backend.AbstractCodegen.resolveStdlibBindings_(
      moduleInfo.impFuncs,
      moduleInfo.impGlobals,
      '',
      {
        'E': 'M_E',
        'LN10': 'M_LN10',
        'LN2': 'M_LN2',
        'LOG2E': 'M_LOG2E',
        'LOG10E': 'M_LOG10E',
        'PI': 'M_PI',
        'SQRT1_2': 'M_SQRT1_2',
        'SQRT2': 'M_SQRT2'
      },
      'INF',
      'NAN'
    );
  var /** @const {!Object<string, string>} */ phpStdlibNames = stdlibBindings.w2lStdlibNames;
  var /** @const {!Object<string, string>} */ phpStdlibGlobals = stdlibBindings.w2lStdlibGlobals;

  // Emit function bodies first to discover which helpers and bindings are needed.
  this.castNames_ = moduleInfo.castNames;
  this.usedHelpers_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  this.usedBindings_ = /** @type {!Object<string, boolean>} */ (Object.create(null));
  var /** @const {!Array<string>} */ functionParts = [];
  for (var /** @type {number} */ f = 0, /** @const {number} */ funcCount = moduleInfo.functions.length; f !== funcCount; ++f) {
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
      moduleInfo.globalTypes,
      moduleInfo.flatTableEntries.length > 0,
      phpStdlibNames,
      phpStdlibGlobals
    );
  }
  var /** @const {!Object<string, boolean>} */ used = this.usedHelpers_;
  this.usedHelpers_ = null;
  this.castNames_ = null;
  var /** @const {!Object<string, boolean>} */ usedB = /** @type {!Object<string, boolean>} */ (this.usedBindings_);
  this.usedBindings_ = null;

  // Force-mark exported globals as used so their bindings are emitted.
  for (
    var /** @type {number} */ pegm = 0, /** @const {number} */ pegmLen = moduleInfo.expGlobals.length;
    pegm !== pegmLen;
    ++pegm
  ) {
    usedB['$g_' + this.safeName_(moduleInfo.expGlobals[pegm].internalName)] = true;
  }

  // Conditional helper emission via local shorthand.
  var /** @const */ self = this;
  /** @param {string} s @return {string} */
  var n = function (s) {
    return self.n_(s);
  };
  var /** @const {string} */ nI = n('_w2l_i');
  var /** @const {string} */ nF32 = n('_w2l_f32');
  /** @param {string} name @param {string} body */
  var h = function (name, body) {
    if (used[name]) {
      outputParts[outputParts.length] = 'function ' + n(name) + body;
    }
  };

  // Core coercion helpers (always emitted).
  outputParts[outputParts.length] =
    'function ' + nI + '($v): int { $v = (int)$v; $v &= 0xFFFFFFFF; return ($v > 2147483647) ? ($v - 4294967296) : $v; }';
  outputParts[outputParts.length] = 'function ' + nF32 + "($v): float { return unpack('g', pack('g', (float)$v))[1]; }";

  // Opcode-specific helpers (only when referenced).
  h('_w2l_extend8_s', '(int $v): int { $v &= 0xFF; return $v >= 0x80 ? $v - 0x100 : $v; }');
  h('_w2l_extend16_s', '(int $v): int { $v &= 0xFFFF; return $v >= 0x8000 ? $v - 0x10000 : $v; }');
  h(
    '_w2l_clz',
    '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 0x80000000)) { ++$n; $v = ($v << 1) & 0xFFFFFFFF; } return $n; }'
  );
  h(
    '_w2l_ctz',
    '(int $v): int { $v = ' +
      nI +
      '($v) & 0xFFFFFFFF; if (0 === $v) return 32; $n = 0; while (0 === ($v & 1)) { ++$n; $v >>= 1; } return $n; }'
  );
  h(
    '_w2l_popcnt',
    '(int $v): int { $v = ' + nI + '($v) & 0xFFFFFFFF; $n = 0; while (0 !== $v) { $n += $v & 1; $v >>= 1; } return $n; }'
  );
  h(
    '_w2l_imul',
    '(int $a, int $b): int { $al = $a & 0xFFFF; $ah = ($a >> 16) & 0xFFFF; return ' +
      nI +
      '($al * ($b & 0xFFFF) + (($ah * ($b & 0xFFFF) + $al * (($b >> 16) & 0xFFFF)) << 16)); }'
  );
  h('_w2l_copysign_f64', '($x, $y): float { $x = abs((float)$x); return (ord(pack("E", (float)$y)[0]) & 128) ? -$x : $x; }');
  h('_w2l_copysign_f32', '($x, $y): float { return ' + nF32 + '(' + n('_w2l_copysign_f64') + '($x, $y)); }');
  h('_w2l_trunc_f64', '($x): float { $x = (float)$x; return $x < 0.0 ? ceil($x) : floor($x); }');
  h('_w2l_trunc_f32', '($x): float { return ' + nF32 + '(' + n('_w2l_trunc_f64') + '($x)); }');
  h('_w2l_nearest_f64', '($x): float { return round((float)$x, 0, PHP_ROUND_HALF_EVEN); }');
  h('_w2l_nearest_f32', '($x): float { return ' + nF32 + '(' + n('_w2l_nearest_f64') + '($x)); }');
  h('_w2l_trunc_s_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_s_f64_to_i32') + '(' + nF32 + '($x)); }');
  h('_w2l_trunc_u_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_u_f64_to_i32') + '(' + nF32 + '($x)); }');
  // prettier-ignore
  h(
    '_w2l_trunc_s_f64_to_i32',
    '($x): int { if (is_nan($x) || is_infinite($x)) throw new \\RuntimeException(); $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); if ($x >= 2147483648.0 || $x < -2147483648.0) throw new \\RuntimeException(); return ' +
      nI +
      '((int)$x); }'
  );
  // prettier-ignore
  h(
    '_w2l_trunc_u_f64_to_i32',
    '($x): int { if (is_nan($x) || is_infinite($x)) throw new \\RuntimeException(); $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); if ($x >= 4294967296.0 || $x < 0.0) throw new \\RuntimeException(); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }'
  );
  h('_w2l_trunc_sat_s_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_sat_s_f64_to_i32') + '(' + nF32 + '($x)); }');
  h('_w2l_trunc_sat_u_f32_to_i32', '($x): int { return ' + n('_w2l_trunc_sat_u_f64_to_i32') + '(' + nF32 + '($x)); }');
  h(
    '_w2l_trunc_sat_s_f64_to_i32',
    '($x): int { $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); return is_nan($x) ? 0 : ($x >= 2147483648.0 ? ' +
      nI +
      '(2147483647) : ($x <= -2147483649.0 ? ' +
      nI +
      '(-2147483648) : ' +
      nI +
      '((int)$x))); }'
  );
  h(
    '_w2l_trunc_sat_u_f64_to_i32',
    '($x): int { $x = ' +
      n('_w2l_trunc_f64') +
      '((float)$x); if (is_nan($x) || $x < 0.0) return 0; if ($x >= 4294967296.0) return ' +
      nI +
      '(-1); return $x >= 2147483648.0 ? ' +
      nI +
      '((int)($x - 2147483648.0) + -2147483648) : ' +
      nI +
      '((int)$x); }'
  );
  h('_w2l_convert_u_i32_to_f32', '($x): float { $x = ' + nI + '($x); return ' + nF32 + '($x < 0 ? $x + 4294967296.0 : $x); }');
  h('_w2l_convert_u_i32_to_f64', '($x): float { $x = ' + nI + '($x); return $x < 0 ? $x + 4294967296.0 : (float)$x; }');
  h('_w2l_reinterpret_f32_to_i32', '($x): int { return ' + nI + "(unpack('V', pack('g', " + nF32 + '($x)))[1]); }');
  h('_w2l_reinterpret_i32_to_f32', '($x): float { return ' + nF32 + "(unpack('g', pack('V', " + nI + '($x)))[1]); }');
  h(
    '_w2l_memory_fill',
    '(string &$buf, int $d, int $v, int $n): void { $buf = substr_replace($buf, str_repeat(chr($v & 0xFF), $n), $d, $n); }'
  );
  h(
    '_w2l_memory_copy',
    '(string &$buf, int $d, int $s, int $n): void { $buf = substr_replace($buf, substr($buf, $s, $n), $d, $n); }'
  );
  h(
    '_w2l_memory_grow',
    '(string &$buf, int $delta): int { $p = (int)(strlen($buf) / 65536); if ($delta === 0) return $p; $buf .= str_repeat("\\x00", $delta * 65536); return $p; }'
  );

  // Module header.
  var /** @const {string} */ pad1 = Wasm2Lang.Backend.AbstractCodegen.pad_(1);
  var /** @const {string} */ nBuf = this.phpVar_('buffer');
  outputParts[outputParts.length] = '$' + moduleName + ' = function(array $foreign, string &' + nBuf + '): array {';

  // Imported function bindings — skip stdlib and unused imports.
  for (
    var /** @type {number} */ i = 0, /** @const {number} */ importCount = moduleInfo.impFuncs.length;
    i !== importCount;
    ++i
  ) {
    if (moduleInfo.impFuncs[i].wasmFuncName in phpStdlibNames) {
      continue;
    }
    var /** @const {string} */ phpImpKey = '$if_' + this.safeName_(moduleInfo.impFuncs[i].importBaseName);
    if (!usedB[phpImpKey]) {
      continue;
    }
    outputParts[outputParts.length] =
      pad1 + this.phpVar_(phpImpKey) + " = $foreign['" + moduleInfo.impFuncs[i].importBaseName + "'] ?? null;";
  }

  // Module-level globals (only those referenced by function bodies).
  for (var /** @type {number} */ gi = 0, /** @const {number} */ gLen = moduleInfo.globals.length; gi !== gLen; ++gi) {
    var /** @const {string} */ phpGlobalKey = '$g_' + this.safeName_(moduleInfo.globals[gi].globalName);
    if (!usedB[phpGlobalKey]) {
      continue;
    }
    outputParts[outputParts.length] = pad1 + this.phpVar_(phpGlobalKey) + ' = ' + moduleInfo.globals[gi].globalInitValue + ';';
  }

  // Forward declarations for internal functions.
  for (var /** @type {number} */ fi = 0, /** @const {number} */ fNameLen = internalFuncNames.length; fi !== fNameLen; ++fi) {
    outputParts[outputParts.length] = pad1 + this.phpVar_(internalFuncNames[fi]) + ' = null;';
  }

  // Function table forward declaration.
  if (moduleInfo.flatTableEntries.length > 0) {
    outputParts[outputParts.length] = pad1 + this.phpVar_('ftable') + ' = [];';
  }

  // Append function bodies.
  for (var /** @type {number} */ fp = 0, /** @const {number} */ fpLen = functionParts.length; fp !== fpLen; ++fp) {
    outputParts[outputParts.length] = functionParts[fp];
  }

  // Function table population.
  if (moduleInfo.flatTableEntries.length > 0) {
    var /** @const {!Array<string>} */ ftEntries = [];
    for (
      var /** @type {number} */ fte = 0, /** @const {number} */ fteLen = moduleInfo.flatTableEntries.length;
      fte !== fteLen;
      ++fte
    ) {
      var /** @const {string|null} */ fteName = moduleInfo.flatTableEntries[fte];
      if (null === fteName) {
        ftEntries[ftEntries.length] = 'null';
      } else {
        ftEntries[ftEntries.length] = this.phpVar_(this.safeName_(fteName));
      }
    }
    outputParts[outputParts.length] = pad1 + this.phpVar_('ftable') + ' = [' + ftEntries.join(', ') + '];';
  }

  // Exported global accessor closures.
  for (var /** @type {number} */ peg = 0, /** @const {number} */ pegLen = moduleInfo.expGlobals.length; peg !== pegLen; ++peg) {
    var /** @const {string} */ pegVar = this.phpVar_('$g_' + this.safeName_(moduleInfo.expGlobals[peg].internalName));
    var /** @const {string} */ pegGetterVar = this.phpVar_('$get_' + this.safeName_(moduleInfo.expGlobals[peg].exportName));
    outputParts[outputParts.length] = pad1 + pegGetterVar + ' = function() use (&' + pegVar + ') { return ' + pegVar + '; };';
    if (moduleInfo.expGlobals[peg].globalMutable) {
      var /** @const {string} */ pegSetterVar = this.phpVar_('$set_' + this.safeName_(moduleInfo.expGlobals[peg].exportName));
      var /** @const {string} */ pegSetterParam = this.localN_(0);
      outputParts[outputParts.length] =
        pad1 +
        pegSetterVar +
        ' = function(' +
        pegSetterParam +
        ') use (&' +
        pegVar +
        ') { ' +
        pegVar +
        ' = ' +
        pegSetterParam +
        '; };';
    }
  }

  // Return array.
  var /** @const {!Array<string>} */ returnEntries = [];
  for (
    var /** @type {number} */ r = 0, /** @const {number} */ exportCount = moduleInfo.expFuncs.length;
    r !== exportCount;
    ++r
  ) {
    returnEntries[returnEntries.length] =
      "'" + moduleInfo.expFuncs[r].exportName + "' => " + this.phpVar_(this.safeName_(moduleInfo.expFuncs[r].internalName));
  }
  for (var /** @type {number} */ pegr = 0; pegr !== pegLen; ++pegr) {
    returnEntries[returnEntries.length] =
      "'" +
      moduleInfo.expGlobals[pegr].exportName +
      "' => " +
      this.phpVar_('$get_' + this.safeName_(moduleInfo.expGlobals[pegr].exportName));
    if (moduleInfo.expGlobals[pegr].globalMutable) {
      returnEntries[returnEntries.length] =
        "'" +
        moduleInfo.expGlobals[pegr].exportName +
        '$set' +
        "' => " +
        this.phpVar_('$set_' + this.safeName_(moduleInfo.expGlobals[pegr].exportName));
    }
  }
  outputParts[outputParts.length] = pad1 + 'return [' + returnEntries.join(', ') + '];';
  outputParts[outputParts.length] = '};';

  // Traversal summary from data collected during the codegen traversal above.
  outputParts[outputParts.length] = this.emitDiagnosticSummary_(wasmModule, options);

  return outputParts.join('\n');
};
