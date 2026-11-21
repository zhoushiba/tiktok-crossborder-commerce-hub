import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './store/auth';
import './styles/index.css';

/**
 * 应用入口：
 * 1. 注册 Element Plus 与图标
 * 2. 挂载 Pinia 后恢复本地 token（刷新页面不丢登录态）
 * 3. 挂载 hash 路由，静态服务器无需 rewrite 规则
 */
const app = createApp(App);

app.use(createPinia());
app.use(ElementPlus);
app.use(router);

for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component);
}

const auth = useAuthStore();
auth.restore();

app.mount('#app');
