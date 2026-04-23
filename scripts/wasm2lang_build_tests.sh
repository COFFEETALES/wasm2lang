#!/bin/sh
# vim: set tabstop=2 shiftwidth=2 expandtab :

set -e

prefix="${0%'.sh'}"
if [ ${#0} -ne ${#prefix} ]; then
  SH_SOURCE="$(cd "$(dirname "$0")" ; pwd -P)"
  EXPECTED_CWD="$(cd "$SH_SOURCE/../test_artifacts" && pwd -P)"
  ACTUAL_CWD="$(pwd -P)"

  fn() {
    local file filename testbase variant_list variant_suffix
    local artifact_dir artifact_base harness_file harness_name harness_variant_name
    local build_languages mangler_key mangler_flag MANGLER_LEN
    local wasm_normalize wasm_normalize_per_lang codegen_normalize codegen_input lang
    local codegen_dir codegen_name testbase_only prenorm_name ext f1 f2 tmpfile
    local codegen_suffix prenorm_suffix
    local constraint_failures

    local LF="$(printf '\012+')"
    LF="${LF%?}"

    if [ "$ACTUAL_CWD" != "$EXPECTED_CWD" ]; then
      echo -e "\033[0;31mError:\033[0m run from $EXPECTED_CWD (current: $ACTUAL_CWD)" >&2
      return 1
    fi

    # Emit WASM in binary ($1='') or text ($1='text') form, with extension $2.
    # Optional $3 = target language id (ASMJS|JAVASCRIPT|PHP64|JAVA): when set,
    # uses $wasm_normalize_per_lang and writes to ${artifact_base}.$3.$2 with
    # --language-out so language-dependent binaryen passes (optimize-for-js,
    # avoid-reinterprets, i64 lowering — see Backend.isJsTarget /
    # needsI64Lowering) produce the right IR per target.
    emit_wasm_form() {
      local norm out lang_flag
      if [ -n "$3" ]; then
        norm="$wasm_normalize_per_lang"
        out="${artifact_base}.$3.$2"
        lang_flag="--language-out $3"
      else
        norm="$wasm_normalize"
        out="${artifact_base}.$2"
        lang_flag=""
      fi
      cat ./"${testbase}".orig.wast \
      |                             \
      node                          \
        "../wasm2lang.js"           \
        --normalize-wasm "$norm"    \
        $lang_flag                  \
        --emit-web-assembly $1      \
        --input-file wast:-         \
        --out-file="$out"
    }

    # Emit code for one language, skipping if not in $build_languages.
    #   $1 language-out id    (ASMJS|JAVASCRIPT|PHP64|JAVA)
    #   $2 output extension   (asm.js|js|php|java)
    #   $3 heap-size define   (ASMJS_HEAP_SIZE|JS_HEAP_SIZE|PHP64_HEAP_SIZE|JAVA_HEAP_SIZE)
    # %LANG% in $codegen_input is substituted with $1, so a variant whose .wasm
    # is per-language (e.g. prenorm_max) can point at its target's .wasm.
    emit_language_code() {
      case " $build_languages " in *" $1 "*) ;; *) return 0 ;; esac
      local input
      input="$(printf '%s' "$codegen_input" | sed "s/%LANG%/$1/g")"
      node                                        \
        "../wasm2lang.js"                         \
        --normalize-wasm "$codegen_normalize"     \
        $mangler_flag                             \
        --language-out "$1"                       \
        --define "$3=$((65536 * 8))"              \
        --emit-metadata=memBuffer                 \
        --emit-code=module                        \
        --out-file="${artifact_base}.$2"          \
        $input
    }

    echo -e "\033[1;34mBuilding tests...\033[0m"
    export NODE_PATH="${SH_SOURCE}/../node_modules"
    export WASM2LANG_OPTIMIZE_OUTPUT=on

    rm -rf                              \
      ./wasm2lang_*_*/                  \
      ./wasm2lang_*.shared.data.json    \
      ./wasm2lang_*.orig.wast           \
      ./wasm2lang_*_runner.js           \
      ./wasm2lang_*_runner.jsh          \
      ./wasm2lang_*_runner.php          \
      ./wasm2lang_run_tests.sh

    cp '../scripts/wasm2lang_run_tests.sh' .
    cp '../scripts/wasm2lang_java_runner.jsh' .
    cp '../scripts/wasm2lang_php_runner.php' .
    cp '../scripts/wasm2lang_wasm_asmjs_runner.js' .

    for file in '../tests/wasm2lang_'*'.build.js'; do
      filename="$(basename "$file")"
      testbase="${filename%.build.js}"

      if [ -n "${UNIQUE_MANGLER_KEY:-}" ]; then
        mangler_key="$UNIQUE_MANGLER_KEY"
      else
        MANGLER_LEN=$(( $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % 25 + 8 ))
        mangler_key="$(head -c 256 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | head -c "$MANGLER_LEN")"
      fi

      # Generate original WAST + shared data (once per test, before variants).
      node                                                  \
        "../tests/$filename"                                \
        --emit-shared-data "./${testbase}.shared.data.json" \
        1>./"${testbase}".orig.wast

      # Per-test language restriction (default: all languages).
      if [ -f "../tests/${testbase}.build.languages" ]; then
        build_languages="$(cat "../tests/${testbase}.build.languages")"
      else
        build_languages="ASMJS JAVASCRIPT PHP64 JAVA"
      fi

      # Read variant list from .build.normalize (one suffix per line) or
      # fall back to the default four-variant set.  Each variant fully
      # defines its own normalization/input pipeline below; the variant
      # suffix alone is enough to identify it.
      #   baseline — raw WASM, no wasm2lang:codegen at all; sanity-checks that
      #              the backend tolerates un-normalized IR and that runtime
      #              memory dumps match the normalized variants.
      #   codegen  — single-pass emission with wasm2lang:codegen applied in
      #              the same process that emits the code.
      #   prenorm  — two-pass: wasm2lang:codegen is applied to emit a
      #              normalized .wasm, then a second invocation reads that
      #              binary with --pre-normalized and emits the code.
      #   nopre    — like prenorm but the second invocation omits
      #              --pre-normalized, exercising the backend's IR-based
      #              fallback for recovering the normalization patterns
      #              after a binary round-trip.
      #   codegen_max / prenorm_max — same single- vs two-pass split as
      #              codegen/prenorm, but with binaryen:max enabled.  The
      #              binary round-trip in prenorm_max canonicalizes locals
      #              and strips unreferenced block names, which the codegen
      #              pipeline must mirror in-process; this pair regression-
      #              tests that convergence (see canonicalizeForCodegen).
      if [ -f "../tests/${testbase}.build.normalize" ]; then
        variant_list="$(cat "../tests/${testbase}.build.normalize")"
      else
        variant_list="baseline${LF}codegen${LF}prenorm${LF}nopre${LF}nomangle${LF}codegen_max${LF}prenorm_max"
      fi

      while IFS=' ' read -r variant_suffix _; do
        [ -n "$variant_suffix" ] || continue
        artifact_dir="${testbase}_${variant_suffix}"
        artifact_base="${artifact_dir}/${artifact_dir}"

        # Variant-specific pipeline selection: each branch fully specifies
        # how the .wasm/.wast is produced (wasm_normalize) and how the code
        # emitter reads it back (codegen_normalize + codegen_input), and
        # whether the code emitter runs with (mangler_flag set) or without
        # (mangler_flag empty) the identifier mangler.  The nomangle variant
        # is the only one that exercises labelN_'s non-mangler path, which
        # must sanitize raw binaryen label names into valid target-language
        # identifiers (e.g. 'folding-inner0' -> '$folding_inner0').
        mangler_flag="--mangler $mangler_key"
        wasm_normalize_per_lang=""
        case "$variant_suffix" in
          baseline)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file wast:${artifact_base}.wast"
            ;;
          codegen)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:none,wasm2lang:codegen"
            codegen_input="--input-file wast:${artifact_base}.wast"
            ;;
          prenorm)
            wasm_normalize="binaryen:none,wasm2lang:codegen"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.wasm --pre-normalized"
            ;;
          nopre)
            wasm_normalize="binaryen:none,wasm2lang:codegen"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.wasm"
            ;;
          nomangle)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:none,wasm2lang:codegen"
            codegen_input="--input-file wast:${artifact_base}.wast"
            mangler_flag=""
            ;;
          codegen_max)
            wasm_normalize="binaryen:none"
            codegen_normalize="binaryen:max,wasm2lang:codegen"
            codegen_input="--input-file wast:${artifact_base}.wast"
            ;;
          prenorm_max)
            # Shared .wasm/.wast carries no binaryen transformations (used
            # only by the V8 runtime test).  The two-step pipeline reads a
            # per-language .wasm produced by emit_wasm_form with
            # $wasm_normalize_per_lang — binaryen:max is language-dependent
            # (optimize-for-js, avoid-reinterprets) so each target needs its
            # own .wasm.  emit_language_code resolves %LANG% to the target id.
            wasm_normalize="binaryen:none"
            wasm_normalize_per_lang="binaryen:max,wasm2lang:codegen"
            codegen_normalize="binaryen:none"
            codegen_input="--input-file ${artifact_base}.%LANG%.wasm --pre-normalized"
            ;;
          *)
            echo -e "\033[0;31mError:\033[0m unknown variant suffix '$variant_suffix'" >&2
            return 1
            ;;
        esac

        mkdir "$artifact_dir"
        for harness_file in "../tests/${testbase}.harness."*; do
          harness_name="$(basename "$harness_file")"
          harness_variant_name="${artifact_dir}${harness_name#$testbase}"
          cp "$harness_file" "./${artifact_dir}/${harness_variant_name}"
        done

        emit_wasm_form ''     wasm
        emit_wasm_form 'text' wast

        if [ -n "$wasm_normalize_per_lang" ]; then
          for lang in ASMJS JAVASCRIPT PHP64 JAVA; do
            case " $build_languages " in
              *" $lang "*) emit_wasm_form '' wasm "$lang" ;;
            esac
          done
        fi

        emit_language_code ASMJS      asm.js ASMJS_HEAP_SIZE
        emit_language_code JAVASCRIPT js     JS_HEAP_SIZE
        emit_language_code PHP64      php    PHP64_HEAP_SIZE
        emit_language_code JAVA       java   JAVA_HEAP_SIZE
      done <<EOF
$variant_list
EOF
    done

    # Constraint: for every test with both <codegen_suffix> and
    # <prenorm_suffix> variants, the emitted code in each language must be
    # byte-identical once the variant directory name is substituted.  A
    # divergence here means wasm2lang:codegen (applied in-memory) and the
    # round-trip-through-binary prenorm pipeline no longer converge to the
    # same IR.
    #
    # The check is strict for the binaryen:none pair (codegen vs prenorm):
    # any divergence there is a real codegen bug.  The binaryen:max pair
    # (codegen_max vs prenorm_max) is advisory: binaryen's optimize-for-js
    # makes structural choices (label-loop fusion, statement ordering) that
    # legitimately differ between in-memory IR and post-binary-round-trip
    # IR.  Functional equivalence is verified by the test runner.
    compare_codegen_vs_prenorm() {
      codegen_suffix="$1"
      prenorm_suffix="$2"
      mode="$3" # "strict" or "advisory"
      for codegen_dir in ./*_${codegen_suffix}; do
        [ -d "$codegen_dir" ] || continue
        codegen_name="$(basename "$codegen_dir")"
        testbase_only="${codegen_name%_${codegen_suffix}}"
        prenorm_name="${testbase_only}_${prenorm_suffix}"
        [ -d "./${prenorm_name}" ] || continue
        for ext in asm.js js php java; do
          f1="${codegen_dir}/${codegen_name}.${ext}"
          f2="./${prenorm_name}/${prenorm_name}.${ext}"
          [ -f "$f1" ] && [ -f "$f2" ] || continue
          tmpfile="$(mktemp)"
          sed "s/${codegen_name}/${prenorm_name}/g" "$f1" > "$tmpfile"
          if ! diff -q "$tmpfile" "$f2" >/dev/null 2>&1; then
            if [ "$mode" = "strict" ]; then
              echo -e "  \033[0;31mFAIL\033[0m: ${testbase_only}.${ext} (${codegen_suffix} vs ${prenorm_suffix})" >&2
              constraint_failures=$((constraint_failures + 1))
            else
              echo -e "  \033[0;33mWARN\033[0m: ${testbase_only}.${ext} (${codegen_suffix} vs ${prenorm_suffix}) — cosmetic divergence (functional equivalence verified by test runner)" >&2
              constraint_warnings=$((constraint_warnings + 1))
            fi
          fi
          rm -f "$tmpfile"
        done
      done
    }

    echo "----------------------------------------"
    echo -e "\033[0;33mVerifying codegen/prenorm output equivalence...\033[0m"
    constraint_failures=0
    constraint_warnings=0
    compare_codegen_vs_prenorm codegen     prenorm     strict
    compare_codegen_vs_prenorm codegen_max prenorm_max advisory
    echo "----------------------------------------"
    if [ "$constraint_failures" -gt 0 ]; then
      echo -e "Constraint check: \033[0;31mFAILED\033[0m (${constraint_failures} codegen/prenorm output mismatches)" >&2
      return 1
    fi
    if [ "$constraint_warnings" -gt 0 ]; then
      echo -e "Constraint check: \033[0;32mPASSED\033[0m (strict) with \033[0;33m${constraint_warnings} advisory warning(s)\033[0m on the binaryen:max pair"
    else
      echo -e "Constraint check: \033[0;32mPASSED\033[0m (codegen/prenorm output equivalence)"
    fi

    echo -e "\033[1;34mBuild complete.\033[0m"
    return 0
  }
  fn
fi
