"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const node_util_1 = __importDefault(require("node:util"));
const normalizeValue = (value) => {
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            stack: value.stack,
        };
    }
    return value;
};
const writeLog = (level, event, context) => {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...(context ?? {}),
    };
    process.stdout.write(`${node_util_1.default.inspect(entry, { depth: 6, breakLength: 120, compact: true })}\n`);
};
exports.logger = {
    debug(event, context) {
        writeLog("DEBUG", event, context);
    },
    info(event, context) {
        writeLog("INFO", event, context);
    },
    warn(event, context) {
        writeLog("WARN", event, context);
    },
    error(event, context) {
        const normalizedContext = context
            ? Object.fromEntries(Object.entries(context).map(([key, value]) => [
                key,
                normalizeValue(value),
            ]))
            : undefined;
        writeLog("ERROR", event, normalizedContext);
    },
};
