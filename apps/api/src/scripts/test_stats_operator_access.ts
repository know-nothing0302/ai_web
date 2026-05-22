import assert from "node:assert/strict";

import { requireStatsReader } from "../middleware/auth";

const createResponse = () => {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
  };

  return {
    state,
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
  };
};

const run = async (): Promise<void> => {
  const request = {
    session: {
      user: {
        id: "100002013029",
        username: "100002013029",
        displayName: "Stats Operator",
        role: "user",
      },
    },
  };
  const response = createResponse();
  let nextCalled = false;

  requireStatsReader(
    request as never,
    response as never,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(response.state.statusCode, 200);
};

void run();
