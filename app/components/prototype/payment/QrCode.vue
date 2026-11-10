<!-- PROTOTYPE — throwaway. The QR code is drawn in the browser from the Copia e Cola (Inter's cob returns no image). -->
<script setup lang="ts">
import { renderSVG } from 'uqr'

const props = withDefaults(defineProps<{ value: string, size?: number, faded?: boolean }>(), { size: 200, faded: false })
const svg = computed(() => renderSVG(props.value, { border: 1 }))
</script>

<template>
  <div
    class="rounded-lg bg-white p-1 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
    :class="faded && 'opacity-20 grayscale'"
    :style="{ width: `${size}px` }"
    v-html="svg"
  />
</template>
