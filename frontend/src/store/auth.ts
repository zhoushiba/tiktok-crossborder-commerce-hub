import { defineStore } from 'pinia';
import { authApi, type LoginResult } from '@/api';

const TOKEN_KEY = 'tiktok-hub-token';
const USER_KEY = 'tiktok-hub-user';

export interface UserInfo {
  id: number;
  username: string;
  role: string;
  realName: string;
}

/**
 * 登录态：token 与用户信息同时落 localStorage，刷新不丢；
 * 退出时同时清理，避免残留 Bearer 造成 401 循环。
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    user: null as UserInfo | null,
    loading: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    role: (state) => state.user?.role ?? '',
    displayName: (state) => state.user?.realName || state.user?.username || '',
  },
  actions: {
    restore() {
      this.token = localStorage.getItem(TOKEN_KEY) || '';
      const rawUser = localStorage.getItem(USER_KEY);
      if (rawUser) {
        try {
          this.user = JSON.parse(rawUser) as UserInfo;
        } catch {
          this.user = null;
        }
      }
    },
    async login(username: string, password: string) {
      this.loading = true;
      try {
        const result: LoginResult = await authApi.login({ username, password });
        this.token = result.token;
        this.user = result.user;
        localStorage.setItem(TOKEN_KEY, result.token);
        localStorage.setItem(USER_KEY, JSON.stringify(result.user));
        return result;
      } finally {
        this.loading = false;
      }
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
  },
});
