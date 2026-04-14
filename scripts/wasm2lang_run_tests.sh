#/bin/sh
# vim: set tabstop=2 shiftwidth=2 expandtab :

set +e

prefix="${0%'.sh'}"
if [ ${#0} -ne ${#prefix} ]; then
  SH_SOURCE="$(cd "$(dirname "$0")" ; pwd -P)"
  EXPECTED_CWD="$(cd "$SH_SOURCE/../test_artifacts" && pwd -P)"
  ACTUAL_CWD="$(pwd -P)"

  fn() {
    local dirbase directory dirname filebase retcode tmpretcode
    local sibling_base sibling_dir sibling_dirname sibling_filebase sibling_variant
    local LF="$(printf '\012+')"
    LF="${LF%?}"

    retcode=0

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo "Error: run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    echo "Running tests..."

    for directory in './wasm2lang_'*'/'; do
      tmpretcode=0
      dirname="$(basename "$directory")"
      filebase="${dirname}"'/'"${dirname}"
      echo "----------------------------------------"
      echo -e "\033[1;34mRunning test: $dirname\033[0m"
      #
      echo -e "\033[0;33mRunning V8 WASM test...\033[0m"
      cat "${filebase}".wasm               \
      |                                    \
      node                                 \
        "./wasm2lang_wasm_asmjs_runner.js" \
        --test-name "$filebase"            \
        --wasm                             \
      |                                    \
      tee "${filebase}".v8.wasm.out
      #
      if [ -f "${filebase}".asm.js ]; then
        echo -e "\033[0;33mRunning V8 ASMJS test...\033[0m"
        cat "${filebase}".asm.js             \
        |                                    \
        node                                 \
          --trace-warnings                   \
          "./wasm2lang_wasm_asmjs_runner.js" \
          --test-name "$filebase"            \
          --asmjs                            \
          2>&1                               \
        |                                    \
        tee "${filebase}".v8.asmjs.out
      fi
      #
      if [ -f "${filebase}".asm.js ] && [ -x "${SPIDERMONKEY_JS}" ]; then
        echo -e "\033[0;33mRunning SpiderMonkey ASMJS test...\033[0m"
        cat "${filebase}".asm.js             \
        |                                    \
        "${SPIDERMONKEY_JS}"                 \
          --warnings                         \
          "./wasm2lang_wasm_asmjs_runner.js" \
          --test-name "$filebase"            \
          --asmjs                            \
        |                                    \
        tee "${filebase}".sm.asmjs.out
        dos2unix "${filebase}".sm.asmjs.out
      fi
      if [ -f "${filebase}".php ] && [ -x "${PHP_CLI}" ]; then
        echo -e "\033[0;33mRunning PHP test...\033[0m"
        cat "${filebase}".php          \
        |                              \
        "${PHP_CLI}"                   \
          "./wasm2lang_php_runner.php" \
          --test-name "$filebase"      \
        |                              \
        tee "${filebase}".php.out
      fi
      if [ -x "${JSHELL_CLI}" ]; then
        echo -e "\033[0;33mRunning Java test...\033[0m"
        local jshell_harness=""
        if [ -f "${filebase}".harness.java ]; then
          jshell_harness="${filebase}".harness.java
        fi
        "$JSHELL_CLI"                                      \
          -J-Dline.separator="$LF"                         \
          -R-Dline.separator="$LF"                         \
          -R-Dw2l.testname="$filebase"                     \
          --class-path "$GSON_LIBRARY"                     \
          --add-modules jdk.incubator.vector               \
          -q                                               \
          "./wasm2lang_java_runner.jsh"                    \
          "${filebase}".java                               \
          ${jshell_harness}                                \
        |                               \
        tee "${filebase}".jshell.out
      fi
      #
      echo ''
      if [ -f "${filebase}".v8.asmjs.out ]; then
        diff -qs                     \
          "${filebase}".v8.wasm.out  \
          "${filebase}".v8.asmjs.out
        [ $? -eq 0 ] || tmpretcode=1
        if [ -s "${filebase}".v8.asmjs.stderr ]; then
          tmpretcode=1
        fi
      fi
      if [ -f "${filebase}".sm.asmjs.out ] && [ -x "${SPIDERMONKEY_JS}" ]; then
        diff -qs                     \
          "${filebase}".v8.wasm.out  \
          "${filebase}".sm.asmjs.out
        [ $? -eq 0 ] || tmpretcode=1
      fi
      if [ -f "${filebase}".php.out ] && [ -x "${PHP_CLI}" ]; then
        diff -qs                    \
          "${filebase}".v8.wasm.out \
          "${filebase}".php.out
        [ $? -eq 0 ] || tmpretcode=1
      fi
      if [ -x "${JSHELL_CLI}" ]; then
        diff -qs                    \
          "${filebase}".v8.wasm.out \
          "${filebase}".jshell.out
        [ $? -eq 0 ] || tmpretcode=1
      fi
      # When this is the codegen baseline variant, compare its V8 WASM
      # output against every sibling variant's output. All variants derive
      # from the same original .wast, so their execution output must match.
      case "$dirname" in
        *_codegen)
          sibling_base="${dirname%_codegen}"
          for sibling_dir in "${sibling_base}"_*/; do
            [ -d "$sibling_dir" ] || continue
            sibling_dirname="$(basename "${sibling_dir%/}")"
            [ "$sibling_dirname" = "$dirname" ] && continue
            sibling_filebase="${sibling_dirname}/${sibling_dirname}"
            [ -f "${filebase}".v8.wasm.out ] || continue
            [ -f "${sibling_filebase}".v8.wasm.out ] || continue
            sibling_variant="${sibling_dirname##${sibling_base}_}"
            echo -e "\033[0;33mComparing codegen vs ${sibling_variant} V8 WASM output...\033[0m"
            diff -qs                           \
              "${filebase}".v8.wasm.out        \
              "${sibling_filebase}".v8.wasm.out
            [ $? -eq 0 ] || tmpretcode=1
          done
          ;;
      esac
      if [ 1 -eq $tmpretcode ]; then
        echo -e "Test $dirname: \033[0;31mFAILED\033[0m"
      else
        echo -e "Test $dirname: \033[0;32mPASSED\033[0m"
      fi
      retcode=$((retcode | tmpretcode))
      #
    done

    echo "----------------------------------------"
    if [ $retcode -ne 0 ]; then
      echo -e "Some tests: \033[0;31mFAILED\033[0m"
    else
      echo -e "All tests: \033[0;32mPASSED\033[0m"
    fi
    return $retcode
  }
  fn
  exit $?
fi
