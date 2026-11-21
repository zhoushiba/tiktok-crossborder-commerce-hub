<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/i18n';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const { t, locale, toggleLocale } = useI18n();

const form = reactive({ username: 'admin', password: 'Admin@123' });
const submitting = ref(false);

/** 演示账号：点击即填充，方便面试官直接体验 */
const demoAccounts = [
  { username: 'admin', password: 'Admin@123', labelKey: 'roleAdmin' },
  { username: 'operator', password: 'Operator@123', labelKey: 'roleOperator' },
  { username: 'host', password: 'Host@123', labelKey: 'roleHost' },
  { username: 'agency', password: 'Agency@123', labelKey: 'roleAgency' },
] as const;

function fill(username: string, password: string) {
  form.username = username;
  form.password = password;
}

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning(t('loginRequired'));
    return;
  }
  submitting.value = true;
  try {
    await auth.login(form.username, form.password);
    ElMessage.success(`${t('loginSuccess')} · ${auth.displayName}`);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/overview';
    router.replace(redirect.startsWith('/') ? redirect : '/overview');
  } catch {
    /* 错误提示已在 axios 拦截器统一处理 */
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <section class="brand-panel">
      <div class="brand-top">
        <span class="logo-mark">TT</span>
        <span class="brand-name">{{ t('appName') }}</span>
      </div>

      <h1 class="headline">跨境直播<br />从选品到结算的一条链</h1>
      <p class="tagline">{{ t('appSubtitle') }}</p>

      <ul class="features">
        <li>
          <strong>{{ t('featureShops') }}</strong>
          <span>{{ t('featureShopsDesc') }}</span>
        </li>
        <li>
          <strong>{{ t('featureLive') }}</strong>
          <span>{{ t('featureLiveDesc') }}</span>
        </li>
        <li>
          <strong>{{ t('featureSettlement') }}</strong>
          <span>{{ t('featureSettlementDesc') }}</span>
        </li>
      </ul>

      <div class="brand-footer">
        <span>Node.js · TypeScript · Express · SQLite</span>
        <span>Vue 3 · Element Plus · ECharts</span>
      </div>
    </section>

    <section class="form-panel">
      <div class="lang-switch">
        <el-button text @click="toggleLocale">{{ locale === 'zh' ? 'English' : '简体中文' }}</el-button>
      </div>

      <div class="form-card">
        <h2>{{ t('loginTitle') }}</h2>
        <p class="sub">{{ t('loginSubtitle') }}</p>

        <el-form label-position="top" @submit.prevent="submit">
          <el-form-item :label="t('username')">
            <el-input v-model="form.username" size="large" autocomplete="username">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item :label="t('password')">
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              show-password
              autocomplete="current-password"
              @keyup.enter="submit"
            >
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" class="submit" :loading="submitting" @click="submit">
            {{ t('signIn') }}
          </el-button>
        </el-form>

        <div class="demo">
          <div class="demo-head">
            <span>{{ t('demoAccounts') }}</span>
            <span class="muted">{{ t('demoHint') }}</span>
          </div>
          <div class="demo-list">
            <el-tag
              v-for="item in demoAccounts"
              :key="item.username"
              class="demo-tag"
              effect="plain"
              round
              @click="fill(item.username, item.password)"
            >
              {{ item.username }} · {{ t(item.labelKey) }}
            </el-tag>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  height: 100vh;
  background: #fff;
}

.brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 44px 52px;
  color: #fff;
  background: radial-gradient(circle at 18% 22%, rgba(37, 244, 238, 0.35), transparent 45%),
    radial-gradient(circle at 82% 12%, rgba(254, 44, 85, 0.55), transparent 42%),
    linear-gradient(150deg, #14161c 0%, #241d29 55%, #3a1526 100%);
  overflow: hidden;
}

.brand-panel::after {
  content: '';
  position: absolute;
  inset: auto -120px -160px auto;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(254, 44, 85, 0.45), transparent 65%);
}

.brand-top {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.82);
}

.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: linear-gradient(135deg, #fe2c55, #25f4ee);
  font-weight: 800;
}

.headline {
  margin: 64px 0 14px;
  font-size: 40px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.tagline {
  margin: 0 0 44px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 15px;
}

.features {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.features li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 16px;
  border-left: 2px solid rgba(254, 44, 85, 0.75);
}

.features strong {
  font-size: 15px;
}

.features span {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.66);
  max-width: 420px;
}

.brand-footer {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.form-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.lang-switch {
  position: absolute;
  top: 24px;
  right: 32px;
}

.form-card {
  width: 100%;
  max-width: 388px;
}

.form-card h2 {
  margin: 0 0 6px;
  font-size: 26px;
}

.form-card .sub {
  margin: 0 0 28px;
  color: var(--ink-3);
  font-size: 13px;
}

.submit {
  width: 100%;
  margin-top: 6px;
  font-weight: 600;
  letter-spacing: 2px;
}

.demo {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px dashed var(--line);
}

.demo-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.demo-head .muted {
  font-weight: 400;
  font-size: 12px;
}

.demo-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.demo-tag {
  cursor: pointer;
}

@media (max-width: 1024px) {
  .login-page {
    grid-template-columns: 1fr;
  }
  .brand-panel {
    display: none;
  }
}
</style>
