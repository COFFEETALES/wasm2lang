// wasm2lang jshell test runner.
//
// Java/jshell equivalent of wasm2lang_wasm_asmjs_runner.js.
//
// Usage (from test_artifacts):
//   jshell --execution local \
//     wasm2lang_java_runner.jsh \
//     <test_dir>/<test_base>.java

// ---- Locate the generated Java source file from arguments ----

// jshell does not expose argv directly; the generated .java file is loaded
// via /open before this runner, so the variables (memBuffer, Module class)
// are already in scope by the time this runner executes.
//
// The build script concatenates the generated .java file with this runner
// into a single jshell session.

// At this point the following should be in scope from the generated code:
//   java.nio.ByteBuffer memBuffer — static memory (from emitMetadata)
//   class Module                  — the module class (from emitCode)

// ---- Memory CRC32 dump ----

{
    //int crc = 0xFFFFFFFF;
    //int len = memBuffer.capacity();

    //for (int i = 0; i < len; ++i) {
    //    int ch = memBuffer.get(i) & 0xFF;
    //    for (int j = 0; j < 8; ++j) {
    //        int bit = (ch ^ crc) & 1;
    //        crc >>>= 1;
    //        if (bit != 0) crc ^= 0xEDB88320;
    //        ch >>= 1;
    //    }
    //}

    //crc = ~crc;
    //String hex = String.format("%08x", crc);

    java.util.zip.CRC32 crc32 = new java.util.zip.CRC32();
    byte[] arr = new byte[memBuffer.capacity()];
    memBuffer.position(0);
    memBuffer.get(arr);
    memBuffer.position(0);
    crc32.update(arr);
    String hex = String.format("%08x", crc32.getValue());
    System.out.println("Memory CRC32: 0x" + hex);
}

/exit
