'use strict';

(async function () {
  var path = await import('path');

  var url = await import('url');

  var binaryen = (
    await import(
      url.pathToFileURL(path.join(process.env.NODE_PATH || path.join(process.cwd(), 'node_modules'), 'binaryen', 'index.js'))[
        'href'
      ]
    )
  ).default;

  var babelTypes = await import('@babel/types');
  var babelGenerator = await import('@babel/generator');

  if (
    process.argv.some(function (arg) {
      return '--dev' === arg;
    })
  ) {
    var fs = await import('fs');

    var moduleSpecs = [
      {'sourcePath': 'src/0-header.js', 'exportName': 'Wasm2Lang'},
      {'sourcePath': 'src/backend/abstract_codegen.js'},
      {'sourcePath': 'src/cli/command_line_parser.js'},
      {'sourcePath': 'src/options/schema.js'},
      {'sourcePath': 'src/utilities/environment.js'},
      {'sourcePath': 'src/wasm/tree/custom_passes.js'},
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
    globalThis['Wasm2Lang'] = require('./dist_artifacts/wasm2lang.js');
  }

  Wasm2Lang.runCliEntryPoint(binaryen, babelTypes, babelGenerator);
})();
