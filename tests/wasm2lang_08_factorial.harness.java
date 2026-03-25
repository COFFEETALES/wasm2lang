{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();

    java.util.Map<String, Object> _data = w2lLoadSharedData(System.getProperty("w2l.testname", ""));

    for (Double v : w2lFlat(_data, "factorial_inputs")) {
        mod.exerciseFactorial(v.intValue());
    }

    w2lDumpCRC(memBuffer);
}

/exit
