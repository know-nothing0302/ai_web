/// <reference types="node" />
import assert from "node:assert/strict";

import { normalizeMarkdownForRender, renderMarkdown } from "../src/shared/markdown";

assert.equal(normalizeMarkdownForRender("** 一、研究背景与方法 **"), "**一、研究背景与方法**");
assert.match(
  renderMarkdown("** 一、研究背景与方法 **"),
  /<strong>一、研究背景与方法<\/strong>/
);

process.stdout.write("markdown render test passed\n");
