"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeWecomMarkdownText = void 0;
const sanitizeWecomMarkdownText = (value) => value.replace(/\*/g, "").trim();
exports.sanitizeWecomMarkdownText = sanitizeWecomMarkdownText;
