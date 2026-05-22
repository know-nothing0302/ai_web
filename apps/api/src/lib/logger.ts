import util from "node:util";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
};

const writeLog = (
  level: LogLevel,
  event: string,
  context?: Record<string, unknown>
): void => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ?? {}),
  };
  process.stdout.write(
    `${util.inspect(entry, { depth: 6, breakLength: 120, compact: true })}\n`
  );
};

export const logger = {
  debug(event: string, context?: Record<string, unknown>): void {
    writeLog("DEBUG", event, context);
  },
  info(event: string, context?: Record<string, unknown>): void {
    writeLog("INFO", event, context);
  },
  warn(event: string, context?: Record<string, unknown>): void {
    writeLog("WARN", event, context);
  },
  error(event: string, context?: Record<string, unknown>): void {
    const normalizedContext = context
      ? Object.fromEntries(
          Object.entries(context).map(([key, value]) => [
            key,
            normalizeValue(value),
          ])
        )
      : undefined;
    writeLog("ERROR", event, normalizedContext);
  },
};
