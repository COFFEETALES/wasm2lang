// Java test harness for wasm2lang_07_stdlib.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();
    mod.exerciseStdlibMath1();
    mod.exerciseStdlibMath2();
    mod.exerciseStdlibConstants();

    w2lDumpCRC(memBuffer);
}

/exit
