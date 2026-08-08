#!/usr/bin/env node
'use strict';

(async function () {
  var path = await import('path');

  var binaryen = (await import('binaryen')).default;

  if (
    process.argv.some(function (arg) {
      return '--dev' === arg;
    })
  ) {
    var fs = await import('fs');

    // This list must stay the exact mirror of the --js globs in
    // scripts/closure.flags.  Closure discovers sources by glob and orders them
    // itself; --dev evals a hand-maintained list in order, so a file added to
    // src/ is picked up by the build and silently missed here.  The drift is
    // invisible until some input reaches the missing code: src/backend/simd_ops.js
    // was absent from day one, and --dev died with "classifyUnaryOp is not a
    // function" on any module using v128 while the shipped build was fine.
    //
    // To re-check after adding a source, compare the two sets rather than
    // eyeballing them: every .js under src/ must appear below exactly once.
    var moduleSpecs = [
      {'sourcePath': 'src/0-header.js', 'exportName': 'Wasm2Lang'},
      {'sourcePath': 'src/backend/trap_kinds.js'},
      {'sourcePath': 'src/backend/abstract_codegen.js'},
      {'sourcePath': 'src/backend/abstract_codegen/pass_state.js'},
      {'sourcePath': 'src/backend/abstract_codegen/module_info.js'},
      {'sourcePath': 'src/backend/abstract_codegen/identifiers.js'},
      {'sourcePath': 'src/backend/abstract_codegen/precedence.js'},
      {'sourcePath': 'src/backend/abstract_codegen/control_flow.js'},
      {'sourcePath': 'src/backend/abstract_codegen/numeric_ops.js'},
      {'sourcePath': 'src/backend/abstract_codegen/traversal.js'},
      {'sourcePath': 'src/backend/i32_coercion.js'},
      {'sourcePath': 'src/backend/i64_coercion.js'},
      {'sourcePath': 'src/backend/value_types.js'},
      {'sourcePath': 'src/backend/numeric_ops.js'},
      {'sourcePath': 'src/backend/simd_ops.js'},
      {'sourcePath': 'src/backend/identifier_mangler.js'}
    ];

    // Backend files: codegen.js (constructors) must load first for all
    // backends, then the remaining per-backend extension files.  javascript
    // inherits control_flow / metadata / numeric_ops from asm.js.  The
    // jscommon/ layer is an abstract base shared by asm.js and modern JS —
    // it must load before both backend codegens.
    moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/jscommon/codegen.js'};
    moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/jscommon/binary_ops.js'};
    moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/jscommon/coercion.js'};
    moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/jscommon/emit_code.js'};
    moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/jscommon/functions.js'};
    moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/jscommon/mangler_profile.js'};

    var sharedBackendFiles = [
      'coercion.js',
      'control_flow.js',
      'emit_code.js',
      'functions.js',
      'helpers.js',
      'identifiers.js',
      'mangler_profile.js',
      'memory.js',
      'metadata.js',
      'numeric_ops.js'
    ];
    var backendFilesById = {
      'asmjs': sharedBackendFiles,
      // csharp keeps its own simd_ops.js: Vector128 is a language primitive, so
      // the backend expresses v128 natively.  java does the same through the
      // Vector API.  The other three have no SIMD type at all and none is
      // emulated — they refuse v128 instead (see Php64Codegen/AsmjsCodegen
      // refuseSIMDOp_ and the v128 rejection in the processor).
      'csharp': ['binary_ops.js', 'simd_ops.js'].concat(sharedBackendFiles),
      'java': ['binary_ops.js', 'simd_ops.js'].concat(sharedBackendFiles),
      'php64': ['binary_ops.js'].concat(sharedBackendFiles),
      // javascript inherits metadata / numeric_ops / control_flow from asm.js.
      'javascript': [
        'binary_ops.js',
        'coercion.js',
        'emit_code.js',
        'helpers.js',
        'identifiers.js',
        'mangler_profile.js',
        'memory.js',
        'metadata.js',
        'numeric_ops.js'
      ]
    };
    var backendIds = ['asmjs', 'csharp', 'java', 'javascript', 'php64'];
    for (var bi = 0; bi < backendIds.length; ++bi) {
      moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/' + backendIds[bi] + '/codegen.js'};
    }
    for (var bi2 = 0; bi2 < backendIds.length; ++bi2) {
      var backendFiles = backendFilesById[backendIds[bi2]];
      for (var bf = 0; bf < backendFiles.length; ++bf) {
        moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/' + backendIds[bi2] + '/' + backendFiles[bf]};
      }
    }

    moduleSpecs = moduleSpecs.concat([
      {'sourcePath': 'src/cli/command_line_parser.js'},
      {'sourcePath': 'src/options/schema.js'},
      {'sourcePath': 'src/utilities/environment.js'},
      {'sourcePath': 'src/utilities/output_sink.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/local_usage_analysis_pass.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/local_init_folding_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/local_init_folding_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/switch_dispatch_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/switch_dispatch_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/block_loop_fusion_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/block_loop_fusion_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/loop_simplification_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/loop_simplification_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/if_else_recovery_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/if_else_recovery_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/block_guard_elision_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/block_guard_elision_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/redundant_block_removal_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/redundant_block_removal_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/feature_profile_validation_pass.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/anchor_markers.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/metadata_section.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/registry.js'},
      {'sourcePath': 'src/wasm/tree/typedefs.js'},
      {'sourcePath': 'src/wasm/tree/node_schema.js'},
      {'sourcePath': 'src/wasm/tree/pass_runner.js'},
      {'sourcePath': 'src/wasm/tree/traversal_kernel.js'},
      {'sourcePath': 'src/wasm/tree/control_flow_summary_analysis.js'},

      {'sourcePath': 'src/wasm/wasm_normalization.js'},
      {'sourcePath': 'src/1-processor.js'},
      {'sourcePath': 'src/2-footer.js'}
    ]);
    for (var i = 0, specCount = moduleSpecs.length; i !== specCount; ++i) {
      const code = fs.readFileSync(path.resolve(__dirname, moduleSpecs[i]['sourcePath']), {
        encoding: 'utf-8'
      });
      if (moduleSpecs[i]['exportName']) {
        globalThis[moduleSpecs[i]['exportName']] = eval([code, moduleSpecs[i]['exportName']].join('\n'));
      } else {
        eval(code);
      }
    }
  } else {
    globalThis['Wasm2Lang'] = require('./dist_artifacts/wasmxlang.js');
  }

  var result = Wasm2Lang.runCliEntryPoint(binaryen);
  if (result && 'function' === typeof result['then']) {
    await result;
  }
})();
