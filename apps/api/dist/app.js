"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const logger_1 = require("./lib/logger");
const cas_1 = require("./modules/auth/cas");
const routes_1 = require("./modules/articles/routes");
const routes_2 = require("./modules/aixy/routes");
const routes_3 = require("./modules/channels/routes");
const routes_4 = require("./modules/feedback/routes");
const routes_5 = require("./modules/page_agent/routes");
const routes_6 = require("./modules/push/routes");
const routes_7 = require("./modules/stats/routes");
const routes_8 = require("./modules/subscriptions/routes");
const health_1 = require("./routes/health");
const routes_9 = require("./modules/profile/routes");
const routes_10 = require("./modules/users/routes");
const routes_11 = require("./modules/birthday/routes");
exports.app = (0, express_1.default)();
exports.app.set("trust proxy", 1);
const webCorsOrigin = (() => {
    try {
        return new URL(env_1.env.webBaseUrl).origin;
    }
    catch {
        return env_1.env.webBaseUrl;
    }
})();
exports.app.use((0, cors_1.default)({
    origin: webCorsOrigin,
    credentials: true,
}));
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.json({ limit: "1mb" }));
exports.app.use((0, express_session_1.default)({
    name: "sid",
    secret: env_1.env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env_1.env.nodeEnv === "production",
        maxAge: 1000 * 60 * 60 * 8,
    },
}));
exports.app.use("/api/health", health_1.healthRouter);
exports.app.use("/api/auth", cas_1.authRouter);
exports.app.use("/api/articles", routes_1.articleRouter);
exports.app.use("/api/channels", routes_3.channelRouter);
exports.app.use("/api/subscriptions", routes_8.subscriptionRouter);
exports.app.use("/api/push", routes_6.pushRouter);
exports.app.use("/api/stats", routes_7.statsRouter);
exports.app.use("/api/ai", routes_2.aiXyRouter);
exports.app.use("/api/feedback", routes_4.feedbackRouter);
exports.app.use("/api/profile", routes_9.profileRouter);
exports.app.use("/api/internal/users", routes_10.userRouter);
exports.app.use("/api/internal/birthday", routes_11.birthdayRouter);
exports.app.use("/api/page-agent", routes_5.pageAgentRouter);
exports.app.use((error, request, response, _next) => {
    logger_1.logger.error("http.request.failed", {
        method: request.method,
        path: request.originalUrl,
        error,
    });
    response.status(500).json({ message: "服务异常", detail: error.message });
});
