// Java regression harness for i32 select arms emitted from comparisons.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();
    mod.exerciseSelectI32BooleanArms();
    w2lDumpCRC(memBuffer);
}

/exit
