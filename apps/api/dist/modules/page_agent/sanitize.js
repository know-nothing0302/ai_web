"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncateForModel = exports.sanitizeForModel = void 0;
const sensitivePatterns = [
    /\b1\d{10}\b/g,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\b(?:工号|学号|编号)[:：]?\s*[A-Za-z0-9_-]{4,}\b/g,
    /\b(?:我是|姓名是|我叫)[\u4e00-\u9fa5A-Za-z·]{2,20}\b/g,
];
const sanitizeForModel = (value) => {
    return sensitivePatterns.reduce((result, pattern) => result.replace(pattern, "[REDACTED]"), value).trim();
};
exports.sanitizeForModel = sanitizeForModel;
const truncateForModel = (value, maxLength) => {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};
exports.truncateForModel = truncateForModel;
