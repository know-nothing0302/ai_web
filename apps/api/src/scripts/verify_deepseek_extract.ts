import http from "node:http";
import dotenv from "dotenv";
import { closeDb, initDb } from "../lib/db";
import { extractArticleFromUrl } from "../modules/articles/url_extract_service";

dotenv.config({ path: ".env" });

const articleHtml = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <title>DeepSeek 链路验证文章</title>
    <meta property="article:published_time" content="2026-04-28T08:00:00.000Z" />
  </head>
  <body>
    <main>
      <article>
        <h1>DeepSeek 链路验证文章</h1>
        <p>这是一段用于真实联调的正文内容，包含医学人工智能、知识服务与高校应用场景，长度足够用于自动提取和摘要生成。</p>
        <p>第二段补充了教学科研协同、智能问答、栏目分发与运营管理等信息，以便模型给出稳定的摘要和栏目判断。</p>
        <p>第三段继续补充上线验证信息，确保正文长度和语义密度都满足当前提取逻辑的最小要求。</p>
      </article>
    </main>
  </body>
</html>
`;

const startServer = async (): Promise<http.Server> => {
  const server = http.createServer((request, response) => {
    if (request.url === "/article") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(articleHtml);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
};

const run = async (): Promise<void> => {
  const server = await startServer();
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("验证服务端口获取失败");
  }
  const url = `http://127.0.0.1:${address.port}/article`;
  try {
    await initDb();
    const result = await extractArticleFromUrl({
      url,
      requestUserId: "verify-user",
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          step: "extractArticleFromUrl",
          title: result.title,
          channelCode: result.channelCode,
          summary: result.summary,
          contentLength: result.meta.contentLength,
          missingFields: result.meta.missingFields,
          publishedAt: result.publishedAt,
        },
        null,
        2
      )}\n`
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
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

run().catch((error: Error & { status?: number }) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        step: "extractArticleFromUrl",
        message: error.message,
        status: error.status,
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
});
