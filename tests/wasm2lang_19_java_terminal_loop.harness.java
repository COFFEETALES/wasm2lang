// Java regression harness for terminal loops followed by dead unreachable.
{
    WasmModule mod = new WasmModule(new java.util.LinkedHashMap<>(), memBuffer);
    mod.alignHeapTop();
    mod.exerciseTerminalLoopWithOuterExit();
    w2lDumpCRC(memBuffer);
}

/exit
