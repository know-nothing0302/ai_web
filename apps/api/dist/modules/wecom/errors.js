"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWecomTokenExpired = exports.WecomApiError = exports.WecomConfigError = void 0;
class WecomConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "WecomConfigError";
    }
}
exports.WecomConfigError = WecomConfigError;
class WecomApiError extends Error {
    endpoint;
    attempt;
    errcode;
    errmsg;
    responseBody;
    constructor(message, options) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = "WecomApiError";
        this.endpoint = options.endpoint;
        this.attempt = options.attempt;
        this.errcode = options.errcode;
        this.errmsg = options.errmsg;
        this.responseBody = options.responseBody;
    }
}
exports.WecomApiError = WecomApiError;
const isWecomTokenExpired = (errcode) => errcode === 42001 || errcode === 40014 || errcode === 40001;
exports.isWecomTokenExpired = isWecomTokenExpired;
