<script setup lang="ts">
/** KPI 卡片：标签 + 主数值 + 可选说明（涨跌着色） */
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    trend?: 'up' | 'down' | 'flat';
    accent?: boolean;
  }>(),
  { hint: '', trend: 'flat', accent: false },
);
</script>

<template>
  <div class="card kpi" :class="{ accent }">
    <span class="label">{{ label }}</span>
    <span class="value">{{ value }}</span>
    <span v-if="hint" class="hint" :class="trend">{{ hint }}</span>
  </div>
</template>

<style scoped>
.accent {
  background: linear-gradient(135deg, rgba(254, 44, 85, 0.08), rgba(37, 244, 238, 0.08));
  border: 1px solid rgba(254, 44, 85, 0.16);
}
</style>
