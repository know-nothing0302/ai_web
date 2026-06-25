import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { authRouter } from "./modules/auth/cas";
import { articleRouter } from "./modules/articles/routes";
import { aiXyRouter } from "./modules/aixy/routes";
import { channelRouter } from "./modules/channels/routes";
import { feedbackRouter } from "./modules/feedback/routes";
import { pageAgentRouter } from "./modules/page_agent/routes";
import { pushRouter } from "./modules/push/routes";
import { statsRouter } from "./modules/stats/routes";
import { subscriptionRouter } from "./modules/subscriptions/routes";
import { healthRouter } from "./routes/health";
import { profileRouter } from "./modules/profile/routes";
import { userRouter } from "./modules/users/routes";
import { birthdayRouter } from "./modules/birthday/routes";
import { surveyRouter } from "./modules/survey/routes";

export const app = express();
app.set("trust proxy", 1);
const webCorsOrigin = (() => {
  try {
    return new URL(env.webBaseUrl).origin;
  } catch {
    return env.webBaseUrl;
  }
})();

// DEBUG: 全局请求日志 — 诊断 /qa/stream 是否到达 Express
app.use((req, _res, next) => {
  if (req.originalUrl.includes("page-agent")) {
    logger.info("app.global.enter", {
      method: req.method,
      url: req.originalUrl,
      hasSession: Boolean(req.session),
      hasUser: Boolean(req.session?.user),
      contentType: req.get("content-type"),
    });
  }
  next();
});

app.use(
  cors({
    origin: webCorsOrigin,
    credentials: true,
  })
);
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "sid",
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/articles", articleRouter);
app.use("/api/channels", channelRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/push", pushRouter);
app.use("/api/stats", statsRouter);
app.use("/api/ai", aiXyRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/profile", profileRouter);
app.use("/api/internal/users", userRouter);
app.use("/api/internal/birthday", birthdayRouter);
app.use("/api/page-agent", pageAgentRouter);
app.use("/api/survey", surveyRouter);

app.use(
  (
    error: Error,
    request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("http.request.failed", {
      method: request.method,
      path: request.originalUrl,
      error,
    });
    response.status(500).json({ message: "服务异常", detail: error.message });
  }
);
