<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';

/**
 * ECharts 轻封装：负责实例生命周期与容器缩放，
 * 页面只关心 option 数据本身。
 */
const props = withDefaults(defineProps<{ option: echarts.EChartsOption; height?: number }>(), { height: 300 });

const el = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

function render() {
  if (!el.value) return;
  if (!chart) chart = echarts.init(el.value);
  chart.setOption(props.option, true);
}

function resize() {
  chart?.resize();
}

onMounted(() => {
  render();
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
  chart = null;
});

watch(() => props.option, render, { deep: true });
</script>

<template>
  <div ref="el" :style="{ width: '100%', height: `${height}px` }" />
</template>
