import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { env } from "../config/env";
import { app } from "../app";
import { closeDb, initDb } from "../lib/db";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  await initDb();
  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api/feedback`;

    const createResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ux",
        content: "右侧反馈入口很好找，但希望提交成功后提示更轻一点。",
        contact: "tester@example.com",
        pageRoute: "/articles/mock-id",
        pageTitle: "文章详情",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.type, "ux");
    assert.equal(created.pageRoute, "/articles/mock-id");

    const invalidResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ux",
        content: "",
        pageRoute: "/articles/mock-id",
        pageTitle: "文章详情",
      }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
