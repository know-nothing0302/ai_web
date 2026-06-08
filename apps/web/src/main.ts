// Polyfill Array/String .at() for older browsers (Chrome < 92, Safari < 15.4)
// marked v18 依赖此 API；Vite build.target=es2019 不降级运行时 API
if (!Array.prototype.at) {
  Array.prototype.at = function (index: number) {
    const len = this.length;
    const k = index < 0 ? len + index : index;
    return k < 0 || k >= len ? undefined : this[k];
  };
}
if (!String.prototype.at) {
  String.prototype.at = function (index: number) {
    const len = this.length;
    const k = index < 0 ? len + index : index;
    return k < 0 || k >= len ? undefined : this.charAt(k);
  };
}

import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import "./style.css";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");
