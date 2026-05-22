import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { app } from "../app";
import { env } from "../config/env";
import { closeDb, initDb } from "../lib/db";
import { feedbackStore } from "../lib/store";

const run = async (): Promise<void> => {
  env.devAuthBypass = true;
  await initDb();

  await feedbackStore.create({
    userId: "100002013029",
    type: "bug",
    content: "统计页反馈详情测试",
    contact: "wechat:test",
    pageRoute: "/admin/stats",
    pageTitle: "统计信息",
    source: "test",
  });

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/feedback/admin?page=1&pageSize=10`
    );
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(Array.isArray(body.items), true);
    assert.equal(body.items.length >= 1, true);
    assert.equal(body.items[0].content, "统计页反馈详情测试");
    assert.equal(body.items[0].pageTitle, "统计信息");
    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.pageSize, 10);
  } finally {
    server.close();
    await closeDb();
  }
};

void run();
