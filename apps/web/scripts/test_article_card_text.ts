/// <reference types="node" />
import assert from "node:assert/strict";
import { sanitizeCardText } from "../src/shared/text_sanitizer";

assert.equal(sanitizeCardText("**教育部**发布"), "教育部发布");
assert.equal(sanitizeCardText("  *AI* 摘要  "), "AI 摘要");
assert.equal(sanitizeCardText("普通文本"), "普通文本");

process.stdout.write("article card text sanitize test passed\n");
