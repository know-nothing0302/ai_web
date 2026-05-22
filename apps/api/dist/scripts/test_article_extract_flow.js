"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = __importDefault(require("node:http"));
const axios_1 = __importDefault(require("axios"));
const articleHtml = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>医学 AI 前沿观察</title>
    <meta property="article:published_time" content="2026-04-27T08:00:00.000Z" />
    <meta name="author" content="徐医融媒中心" />
  </head>
  <body>
    <header>
      <nav>首页 | 资讯 | 关于我们</nav>
    </header>
    <main>
      <article>
        <h1>医学 AI 前沿观察</h1>
        <p>来源：徐医融媒中心</p>
        <p>这是用于提取测试的正文第一段，包含医学影像与智能辅助诊疗内容。</p>
        <p>这是用于提取测试的正文第二段，包含教学、科研与医院应用场景。</p>
        <p>这是用于提取测试的正文第三段，补充临床决策支持、数据治理与实际部署经验。</p>
        <p>免责声明：本文仅供站点演示使用。</p>
      </article>
    </main>
  </body>
</html>
`;
const shortHtml = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>短内容页面</title>
  </head>
  <body>
    <article>
      <h1>短内容页面</h1>
      <p>内容太短。</p>
    </article>
  </body>
</html>
`;
const pmcHtml = `
<!doctype html>
<html lang="en">
  <head>
    <title>Artificial intelligence-driven transformative applications in disease diagnosis technology</title>
    <meta
      name="citation_title"
      content="Artificial intelligence-driven transformative applications in disease diagnosis technology"
    />
    <meta name="citation_author" content="Junyu Zhou" />
    <meta name="citation_author" content="Sunmin Park" />
    <meta name="citation_author" content="Xunbin Wei" />
    <meta
      name="citation_author_institution"
      content="Institute of Advanced Clinical Medicine, Peking University"
    />
    <meta name="citation_publication_date" content="2025 Apr 11" />
  </head>
  <body>
    <main>
      <article>
        <h1>Artificial intelligence-driven transformative applications in disease diagnosis technology</h1>
        <p>Artificial intelligence is rapidly transforming disease diagnosis across cancer, Alzheimer disease and diabetes.</p>
        <p>Researchers reviewed recent studies and highlighted progress in imaging analysis, biomarker detection and predictive screening.</p>
        <p>These advances are improving diagnostic accuracy, supporting early intervention and expanding access to clinical decision support.</p>
      </article>
    </main>
  </body>
</html>
`;
const assertStatus = (actual, expected, context, body) => {
    strict_1.default.equal(actual, expected, `${context} status=${actual} body=${JSON.stringify(body)}`);
};
const startContentServer = async () => {
    const server = node_http_1.default.createServer((request, response) => {
        if (request.url === "/article") {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(articleHtml);
            return;
        }
        if (request.url === "/short") {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(shortHtml);
            return;
        }
        if (request.url === "/pmc") {
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(pmcHtml);
            return;
        }
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("not found");
    });
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("内容测试服务端口获取失败");
    }
    return {
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
    };
};
const run = async () => {
    process.env.DEV_AUTH_BYPASS = "true";
    process.env.AI_XY_API_URL = "http://127.0.0.1:65535/mock-ai";
    const originalPost = axios_1.default.post;
    axios_1.default.post = (async (url, body, config) => {
        if (String(url).includes("/v1/chat/completions")) {
            const prompt = String(body?.messages?.[1]?.content);
            if (prompt.includes("请将以下内容提炼为120-180字中文摘要")) {
                if (prompt.includes("人工智能正在重塑疾病诊断技术的发展路径")) {
                    return {
                        data: {
                            choices: [
                                {
                                    message: {
                                        content: "## 应用概览\n\n文章围绕**癌症**、**阿尔茨海默病**和**糖尿病**等疾病诊断场景，概括了人工智能在医学影像识别、生物标志物分析和风险预测中的最新进展。\n\n## 关键价值\n\n研究指出 AI 正持续提升**早筛能力**、**诊断准确率**与临床决策支持水平，同时也提示标准化建设、数据质量控制、模型可信性与临床实施仍是落地推广中的关键前提。",
                                    },
                                },
                            ],
                        },
                    };
                }
                return {
                    data: {
                        choices: [
                            {
                                message: {
                                    content: "该文系统梳理了医学人工智能在影像分析、辅助诊疗、教学科研协同和医院治理中的最新应用，重点概括了临床决策支持、数据治理、场景落地与能力建设等关键环节，为高校和医院推进智慧医疗、智能教学与业务协同提供了较为完整的实践参考，也强调了持续优化流程与能力建设的重要性。",
                                },
                            },
                        ],
                    },
                };
            }
            strict_1.default.match(prompt, /必须输出一段简短导语/);
            strict_1.default.match(prompt, /必须形成 2 到 5 个主章节/);
            strict_1.default.match(prompt, /关键事实和数字必须突出/);
            if (prompt.includes("Artificial intelligence-driven transformative applications in disease diagnosis technology")) {
                return {
                    data: {
                        choices: [
                            {
                                message: {
                                    content: JSON.stringify({
                                        summary: "本文综述了人工智能在疾病诊断中的变革性应用，重点涵盖癌症、阿尔茨海默病和糖尿病。通过2022至2024年间文献的系统计量分析（GraphRAG方法），展示了AI在医学影像和分子数据分析中的突破。癌症早期检测覆盖19种类型；阿尔茨海默病风险检测准确率高达90%；糖尿病预测在症状出现前已显成效。尽管面临标准化和数据质量挑战，AI正推动诊断向更精准、高效和可及的方向转变。",
                                        content: "## 技术进展\n\n人工智能正在重塑疾病诊断技术的发展路径。文章围绕**癌症**、**阿尔茨海默病**和**糖尿病**等场景，概括了 AI 在医学影像识别、生物标志物分析和风险预测方面的最新应用进展。\n\n## 应用价值\n\n这些进展显示，AI 在提升**诊断准确率**、支持**早筛**和优化临床决策方面具有明显价值。与此同时，标准化建设、数据质量控制和临床实施能力仍是后续推广中的重要前提。",
                                        channelCode: "medical-frontier",
                                        author: "",
                                    }),
                                },
                            },
                        ],
                    },
                };
            }
            return {
                data: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    summary: "该文系统梳理了医学人工智能在影像分析、辅助诊疗、教学科研协同和医院治理中的最新应用，重点概括了临床决策支持、数据治理、场景落地与能力建设等关键环节，为高校和医院推进智慧医疗、智能教学与业务协同提供了较为完整的实践参考，也提示了持续建设基础设施与规范流程的重要性。",
                                    content: "医学人工智能正在从**单点辅助**走向教学、科研和临床协同应用。\n## 应用进展\n一是**医学影像分析**能力持续成熟。二是**智能辅助诊疗**覆盖更多场景。三是**临床决策支持**与数据治理协同推进。\n## 实践价值\n对于推进**智慧医疗**与医学教育协同发展，这些实践经验具有较强参考价值。",
                                    channelCode: "medical-frontier",
                                    author: "徐医融媒中心",
                                }),
                            },
                        },
                    ],
                },
            };
        }
        return originalPost(url, body, config);
    });
    const { initDb, closeDb } = await import("../lib/db.js");
    const { app } = await import("../app.js");
    await initDb();
    const apiServer = app.listen(0);
    await new Promise((resolve) => {
        apiServer.once("listening", () => resolve());
    });
    const apiAddress = apiServer.address();
    if (!apiAddress || typeof apiAddress === "string") {
        throw new Error("API 测试服务端口获取失败");
    }
    const baseUrl = `http://127.0.0.1:${apiAddress.port}`;
    const contentServer = await startContentServer();
    const articleUrl = `${contentServer.baseUrl}/article`;
    try {
        const extract = await axios_1.default.post(`${baseUrl}/api/articles/extract-from-url`, { url: articleUrl }, { validateStatus: () => true });
        assertStatus(extract.status, 200, "extract article", extract.data);
        strict_1.default.equal(extract.data.title, "医学 AI 前沿观察");
        strict_1.default.equal(extract.data.author, "徐医融媒中心");
        strict_1.default.ok(extract.data.summary.length >= 120);
        strict_1.default.ok(extract.data.summary.length <= 180);
        strict_1.default.equal(extract.data.channelCode, "medical-frontier");
        strict_1.default.match(String(extract.data.content), /医学人工智能正在从.*走向/);
        strict_1.default.match(String(extract.data.content), /^##\s+/m);
        strict_1.default.match(String(extract.data.content), /^医学人工智能正在从.*\n\n## 应用进展/m);
        strict_1.default.match(String(extract.data.content), /## 应用进展\n\n- \*\*医学影像分析\*\*能力持续成熟。/);
        strict_1.default.match(String(extract.data.content), /- \*\*智能辅助诊疗\*\*覆盖更多场景。/);
        strict_1.default.match(String(extract.data.content), /- \*\*临床决策支持\*\*与数据治理协同推进。/);
        strict_1.default.match(String(extract.data.content), /\*\*.+\*\*/);
        strict_1.default.doesNotMatch(String(extract.data.content), /免责声明|首页 \| 资讯/);
        strict_1.default.ok(typeof extract.data.sourceContent === "string" && extract.data.sourceContent.length > 0);
        strict_1.default.match(String(extract.data.sourceContent), /这是用于提取测试的正文第一段/);
        strict_1.default.doesNotMatch(String(extract.data.sourceContent), /^##\s+/m);
        strict_1.default.notEqual(extract.data.content, [
            "来源：徐医融媒中心",
            "这是用于提取测试的正文第一段，包含医学影像与智能辅助诊疗内容。",
            "这是用于提取测试的正文第二段，包含教学、科研与医院应用场景。",
            "这是用于提取测试的正文第三段，补充临床决策支持、数据治理与实际部署经验。",
            "免责声明：本文仅供站点演示使用。",
        ].join("\n\n"));
        strict_1.default.equal(extract.data.originalUrl, articleUrl);
        strict_1.default.equal(extract.data.publishedAt, "2026-04-27T08:00:00.000Z");
        strict_1.default.deepEqual(extract.data.meta.missingFields, []);
        const created = await axios_1.default.post(`${baseUrl}/api/articles`, {
            title: extract.data.title,
            summary: extract.data.summary,
            content: extract.data.content,
            sourceContent: extract.data.sourceContent,
            authorName: extract.data.author,
            originalUrl: extract.data.originalUrl,
            publishedAt: extract.data.publishedAt,
            channelCode: extract.data.channelCode,
            tags: [],
            status: "draft",
        }, { validateStatus: () => true });
        assertStatus(created.status, 201, "create article with extracted author", created.data);
        strict_1.default.equal(created.data.author, "徐医融媒中心");
        strict_1.default.equal(created.data.sourceContent, extract.data.sourceContent);
        const pmcPage = await axios_1.default.post(`${baseUrl}/api/articles/extract-from-url`, { url: `${contentServer.baseUrl}/pmc` }, { validateStatus: () => true });
        assertStatus(pmcPage.status, 200, "extract pmc article", pmcPage.data);
        strict_1.default.equal(pmcPage.data.author, "Institute of Advanced Clinical Medicine, Peking University");
        strict_1.default.equal(pmcPage.data.publishedAt, "2025-04-11T00:00:00.000Z");
        strict_1.default.ok(pmcPage.data.summary.length >= 120);
        strict_1.default.ok(pmcPage.data.summary.length <= 250);
        strict_1.default.match(String(pmcPage.data.content), /^##\s+/m);
        strict_1.default.match(String(pmcPage.data.content), /\*\*.+\*\*/);
        strict_1.default.match(String(pmcPage.data.content), /人工智能/);
        const shortPage = await axios_1.default.post(`${baseUrl}/api/articles/extract-from-url`, { url: `${contentServer.baseUrl}/short` }, { validateStatus: () => true });
        assertStatus(shortPage.status, 422, "extract short article", shortPage.data);
        strict_1.default.match(String(shortPage.data.message), /正文|内容/);
        process.stdout.write("article extract flow test passed\n");
    }
    finally {
        axios_1.default.post = originalPost;
        await new Promise((resolve, reject) => {
            apiServer.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        await new Promise((resolve, reject) => {
            contentServer.server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        await closeDb();
    }
};
run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
});
