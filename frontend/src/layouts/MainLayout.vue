<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/i18n';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, locale, toggleLocale } = useI18n();

interface MenuItem {
  path: string;
  label: string;
  icon: string;
}

const businessMenu = computed<MenuItem[]>(() => [
  { path: '/overview', label: t('menuOverview'), icon: 'DataLine' },
  { path: '/products', label: t('menuProducts'), icon: 'Goods' },
  { path: '/live', label: t('menuLive'), icon: 'VideoCamera' },
  { path: '/orders', label: t('menuOrders'), icon: 'Tickets' },
  { path: '/affiliates', label: t('menuAffiliates'), icon: 'User' },
  { path: '/settlements', label: t('menuSettlements'), icon: 'Wallet' },
  { path: '/inventory', label: t('menuInventory'), icon: 'Box' },
]);

const deliveryMenu = computed<MenuItem[]>(() => [
  { path: '/training', label: t('menuTraining'), icon: 'School' },
  { path: '/logs', label: t('menuLogs'), icon: 'Document' },
  { path: '/settings', label: t('menuSettings'), icon: 'Setting' },
]);

const activePath = computed(() => route.path);
const pageTitle = computed(() => {
  const all = [...businessMenu.value, ...deliveryMenu.value];
  return all.find((item) => item.path === route.path)?.label ?? t('menuOverview');
});

const roleLabel = computed(() => {
  const map: Record<string, string> = {
    ADMIN: t('roleAdmin'),
    OPERATOR: t('roleOperator'),
    HOST: t('roleHost'),
    AGENCY: t('roleAgency'),
  };
  return map[auth.role] ?? auth.role;
});

function go(path: string) {
  router.push(path);
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm(t('logout'), t('tips'), { type: 'warning' });
    auth.logout();
    router.push('/login');
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="232px" class="aside">
      <div class="logo" @click="go('/overview')">
        <span class="logo-mark">TT</span>
        <div class="logo-text">
          <strong>{{ t('appShort') }}</strong>
          <small>Cross-border Hub</small>
        </div>
      </div>

      <div class="menu-group">{{ t('menuGroupBusiness') }}</div>
      <el-menu :default-active="activePath" class="menu" @select="go">
        <el-menu-item v-for="item in businessMenu" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>

      <div class="menu-group">{{ t('menuGroupDelivery') }}</div>
      <el-menu :default-active="activePath" class="menu" @select="go">
        <el-menu-item v-for="item in deliveryMenu" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="crumbs">
          <span class="brand-dot" />
          <span class="current">{{ pageTitle }}</span>
          <span class="muted">/ {{ t('appSubtitle') }}</span>
        </div>
        <div class="header-right">
          <el-button text circle :title="t('language')" @click="toggleLocale">
            {{ locale === 'zh' ? 'EN' : '中' }}
          </el-button>
          <el-tag size="small" effect="plain" round>{{ roleLabel }}</el-tag>
          <el-dropdown trigger="click">
            <span class="user">
              <el-avatar :size="28" class="avatar">{{ auth.displayName.slice(0, 1) }}</el-avatar>
              <span class="user-name">{{ auth.displayName }}</span>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>{{ auth.user?.username }}</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">{{ t('logout') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}

.aside {
  background: #fff;
  border-right: 1px solid var(--line);
  padding: 14px 10px;
  overflow-y: auto;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 16px;
  cursor: pointer;
}

.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #fe2c55, #25f4ee);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.logo-text strong {
  font-size: 15px;
}

.logo-text small {
  color: var(--ink-3);
  font-size: 11px;
}

.menu-group {
  padding: 12px 12px 6px;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--ink-3);
  text-transform: uppercase;
}

.menu {
  border: none;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid var(--line);
  height: 60px;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.crumbs .current {
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.avatar {
  background: var(--brand);
  font-size: 13px;
}

.user-name {
  font-size: 13px;
  color: var(--ink-2);
}

.main {
  padding: 0;
  background: var(--bg);
  overflow-y: auto;
}
</style>
