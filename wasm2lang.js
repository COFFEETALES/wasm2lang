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

    var moduleSpecs = [
      {'sourcePath': 'src/0-header.js', 'exportName': 'Wasm2Lang'},
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
      {'sourcePath': 'src/backend/identifier_mangler.js'}
    ];

    // Backend files: codegen.js (constructors) must load first for all
    // backends, then the remaining per-backend extension files.
    var backendIds = ['asmjs', 'java', 'php64'];
    var backendFiles = [
      'binary_ops.js',
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
    for (var bi = 0; bi < backendIds.length; ++bi) {
      moduleSpecs[moduleSpecs.length] = {'sourcePath': 'src/backend/' + backendIds[bi] + '/codegen.js'};
    }
    for (var bi2 = 0; bi2 < backendIds.length; ++bi2) {
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
      {'sourcePath': 'src/wasm/tree/custom_passes/drop_const_elision_pass.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/local_init_folding_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/local_init_folding_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/switch_dispatch_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/switch_dispatch_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/block_loop_fusion_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/block_loop_fusion_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/loop_simplification_normalize.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/loop_simplification_apply.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/feature_profile_validation_pass.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes/registry.js'},
      {'sourcePath': 'src/wasm/tree/node_schema.js'},
      {'sourcePath': 'src/wasm/tree/pass_runner.js'},
      {'sourcePath': 'src/wasm/tree/traversal_kernel.js'},
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
