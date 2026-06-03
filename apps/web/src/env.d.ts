declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module "*.css";
declare module "*.pcss";

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PAGE_AGENT_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
