import "express-session";
import { SessionUser } from "./types";

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}
