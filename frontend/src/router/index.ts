import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

/**
 * hash 路由：静态文件服务器（含 Edge headless 截图、nginx 无 rewrite）都能直接运行。
 * meta.title 用于侧边栏/面包屑，meta.layout=blank 让登录页不套后台框架。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { layout: 'blank', title: '登录' },
  },
  { path: '/', redirect: '/overview' },
  { path: '/overview', name: 'overview', component: () => import('@/views/DashboardView.vue'), meta: { title: '数据总览' } },
  { path: '/products', name: 'products', component: () => import('@/views/ProductsView.vue'), meta: { title: '选品库' } },
  { path: '/live', name: 'live', component: () => import('@/views/LiveView.vue'), meta: { title: '直播场次' } },
  { path: '/orders', name: 'orders', component: () => import('@/views/OrdersView.vue'), meta: { title: '订单履约' } },
  { path: '/affiliates', name: 'affiliates', component: () => import('@/views/AffiliatesView.vue'), meta: { title: '达人分销' } },
  { path: '/settlements', name: 'settlements', component: () => import('@/views/SettlementsView.vue'), meta: { title: '佣金结算' } },
  { path: '/inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue'), meta: { title: '库存物流' } },
  { path: '/training', name: 'training', component: () => import('@/views/TrainingView.vue'), meta: { title: '实训管理' } },
  { path: '/logs', name: 'logs', component: () => import('@/views/LogsView.vue'), meta: { title: '操作日志' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '系统设置' } },
  { path: '/:pathMatch(.*)*', redirect: '/overview' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * 全局前置守卫：
 * - 未登录访问业务页统一跳登录页
 * - 演示模式：任意路由携带 ?demo=1 时用管理员账号自动登录，
 *   便于作品集截图与面试演示（真实部署可通过去掉该分支关闭）
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.isLoggedIn && to.query.demo === '1') {
    try {
      await auth.login('admin', 'Admin@123');
    } catch {
      /* 演示账号不可用时回落到普通登录流程 */
    }
  }

  if (to.name !== 'login' && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.isLoggedIn) {
    return { name: 'overview' };
  }
  return true;
});
