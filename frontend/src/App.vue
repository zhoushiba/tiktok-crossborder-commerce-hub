<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MainLayout from './layouts/MainLayout.vue';

const route = useRoute();
/** 登录页不套用后台框架，其余页面统一使用侧边栏布局 */
const isBlank = computed(() => route.meta.layout === 'blank');
</script>

<template>
  <router-view v-if="isBlank" />
  <MainLayout v-else />
</template>
