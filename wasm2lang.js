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
      {'sourcePath': 'src/backend/i32_coercion.js'},
      {'sourcePath': 'src/backend/value_types.js'},
      {'sourcePath': 'src/backend/numeric_ops.js'},
      {'sourcePath': 'src/backend/identifier_mangler.js'},
      {'sourcePath': 'src/backend/asmjs/codegen.js'},
      {'sourcePath': 'src/backend/java/codegen.js'},
      {'sourcePath': 'src/backend/php64/codegen.js'},
      {'sourcePath': 'src/backend/asmjs/binary_ops.js'},
      {'sourcePath': 'src/backend/asmjs/coercion.js'},
      {'sourcePath': 'src/backend/asmjs/control_flow.js'},
      {'sourcePath': 'src/backend/asmjs/emit_code.js'},
      {'sourcePath': 'src/backend/asmjs/functions.js'},
      {'sourcePath': 'src/backend/asmjs/helpers.js'},
      {'sourcePath': 'src/backend/asmjs/identifiers.js'},
      {'sourcePath': 'src/backend/asmjs/mangler_profile.js'},
      {'sourcePath': 'src/backend/asmjs/memory.js'},
      {'sourcePath': 'src/backend/asmjs/metadata.js'},
      {'sourcePath': 'src/backend/asmjs/numeric_ops.js'},
      {'sourcePath': 'src/backend/java/binary_ops.js'},
      {'sourcePath': 'src/backend/java/coercion.js'},
      {'sourcePath': 'src/backend/java/control_flow.js'},
      {'sourcePath': 'src/backend/java/emit_code.js'},
      {'sourcePath': 'src/backend/java/functions.js'},
      {'sourcePath': 'src/backend/java/helpers.js'},
      {'sourcePath': 'src/backend/java/identifiers.js'},
      {'sourcePath': 'src/backend/java/mangler_profile.js'},
      {'sourcePath': 'src/backend/java/memory.js'},
      {'sourcePath': 'src/backend/java/metadata.js'},
      {'sourcePath': 'src/backend/java/numeric_ops.js'},
      {'sourcePath': 'src/backend/php64/binary_ops.js'},
      {'sourcePath': 'src/backend/php64/coercion.js'},
      {'sourcePath': 'src/backend/php64/control_flow.js'},
      {'sourcePath': 'src/backend/php64/emit_code.js'},
      {'sourcePath': 'src/backend/php64/functions.js'},
      {'sourcePath': 'src/backend/php64/helpers.js'},
      {'sourcePath': 'src/backend/php64/identifiers.js'},
      {'sourcePath': 'src/backend/php64/mangler_profile.js'},
      {'sourcePath': 'src/backend/php64/memory.js'},
      {'sourcePath': 'src/backend/php64/metadata.js'},
      {'sourcePath': 'src/backend/php64/numeric_ops.js'},
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
    ];
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
