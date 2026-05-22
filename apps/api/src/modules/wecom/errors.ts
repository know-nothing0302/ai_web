export class WecomConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WecomConfigError";
  }
}

interface WecomApiErrorOptions {
  endpoint: string;
  attempt: number;
  errcode?: number;
  errmsg?: string;
  responseBody?: unknown;
  cause?: unknown;
}

export class WecomApiError extends Error {
  endpoint: string;
  attempt: number;
  errcode?: number;
  errmsg?: string;
  responseBody?: unknown;

  constructor(message: string, options: WecomApiErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "WecomApiError";
    this.endpoint = options.endpoint;
    this.attempt = options.attempt;
    this.errcode = options.errcode;
    this.errmsg = options.errmsg;
    this.responseBody = options.responseBody;
  }
}

export const isWecomTokenExpired = (errcode?: number): boolean =>
  errcode === 42001 || errcode === 40014 || errcode === 40001;
