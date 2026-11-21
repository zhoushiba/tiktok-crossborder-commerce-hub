import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { ElMessage } from 'element-plus';

/** 后端统一响应体（code=0 表示成功） */
export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data?: T;
  requestId?: string;
  timestamp?: string;
}

export interface PageData<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
}

/**
 * axios 封装：
 * - baseURL 默认 /api，截图/独立部署时可用 VITE_API_BASE_URL 覆盖
 * - 请求自动带 Bearer token
 * - 响应统一剥离 { code, message, data } 外壳，业务代码只拿到 data
 * - 401 清空登录态并跳回登录页，避免死循环请求
 */
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const instance: AxiosInstance = axios.create({ baseURL, timeout: 20000 });

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('tiktok-hub-token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

instance.interceptors.response.use(
  (response: AxiosResponse<ApiEnvelope<unknown>>) => {
    const body = response.data;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      ElMessage.error(body.message || '请求失败');
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body?.data as never;
  },
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.message || error.message || '网络异常';
    if (status === 401) {
      localStorage.removeItem('tiktok-hub-token');
      localStorage.removeItem('tiktok-hub-user');
      if (!window.location.hash.includes('/login')) {
        window.location.hash = '#/login';
      }
    }
    ElMessage.error(message);
    return Promise.reject(new Error(message));
  },
);

export function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return instance.get(url, { params }) as unknown as Promise<T>;
}

export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return instance.post(url, data, config) as unknown as Promise<T>;
}

export function patch<T>(url: string, data?: unknown): Promise<T> {
  return instance.patch(url, data) as unknown as Promise<T>;
}

export function del<T>(url: string): Promise<T> {
  return instance.delete(url) as unknown as Promise<T>;
}

/** 下载文件（CSV 导出），保留后端返回的 BOM */
export async function download(url: string, filename: string, params?: Record<string, unknown>): Promise<void> {
  const response = await instance.get(url, { params, responseType: 'text' });
  const text = response as unknown as string;
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
