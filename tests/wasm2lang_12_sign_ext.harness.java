// Java test harness for wasm2lang_12_sign_ext.
{
    java.util.Map<String, Object> foreign = new java.util.LinkedHashMap<>();

    WasmModule mod = new WasmModule(foreign, memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "i32_values")) {
        mod.exerciseSignExt(v.intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
