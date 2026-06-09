import "express-session";
import { SessionUser } from "./types";

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    /** CAS 登录前暂存的目标路径，回调后取出跳转 */
    returnTo?: string;
  }
}
