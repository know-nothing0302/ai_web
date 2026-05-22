"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const auth_1 = require("../middleware/auth");
const createResponse = () => {
    const state = {
        statusCode: 200,
        body: undefined,
    };
    return {
        state,
        status(code) {
            state.statusCode = code;
            return this;
        },
        json(payload) {
            state.body = payload;
            return this;
        },
    };
};
const run = async () => {
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
    (0, auth_1.requireStatsReader)(request, response, () => {
        nextCalled = true;
    });
    strict_1.default.equal(nextCalled, true);
    strict_1.default.equal(response.state.statusCode, 200);
};
void run();
