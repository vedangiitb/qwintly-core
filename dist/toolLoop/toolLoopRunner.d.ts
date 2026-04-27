import { FunctionCallingConfigMode, Tool } from "@google/genai";
import { ToolLoopContextPolicy } from "./toolLoopContext.js";
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
export type ToolLoopResult = {
    contents: any[];
    modelContents: any[];
    finalText: string;
    steps: number;
    terminalCall?: {
        name: string;
        args: Record<string, unknown>;
        response: unknown;
    };
};
export type ToolLoopLogger = {
    status: (message: string, meta?: Record<string, unknown>) => void;
    info?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
    error?: (message: string, err?: unknown, meta?: Record<string, unknown>) => void;
};
type AiCallFn = (request: unknown, options: {
    tools?: Tool[];
    model?: string;
    toolCallingMode?: FunctionCallingConfigMode;
}) => Promise<{
    functionCalls?: any[];
    text?: string;
}>;
export type RunToolLoopOptions = {
    initialContents: any[];
    tools: Tool[];
    handlers: Record<string, ToolHandler>;
    maxSteps?: number;
    model?: string;
    toolCallingMode?: FunctionCallingConfigMode;
    terminalToolNames?: string[];
    keepFullTrace?: boolean;
    contextPolicy?: ToolLoopContextPolicy;
    aiCall: AiCallFn;
    logger?: ToolLoopLogger;
    applyPatchAutoRetryMax?: number;
    aiCallAutoRetryMax?: number;
    aiCallAutoRetryBaseMs?: number;
    aiCallAutoRetryMaxMs?: number;
};
export declare function runToolLoop(options: RunToolLoopOptions): Promise<ToolLoopResult>;
export {};
