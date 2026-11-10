<!-- PROTOTYPE — throwaway. -->
<script setup lang="ts">
const props = defineProps<{ value: string, short?: boolean }>()
const toast = useToast()
function copy() {
  navigator.clipboard?.writeText(props.value)
  toast.add({ title: 'Copiado', description: props.value, icon: 'i-lucide-copy', duration: 1500 })
}
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1">
    <code class="truncate font-mono text-xs text-toned">{{ short ? shortId(value) : value }}</code>
    <UButton
      icon="i-lucide-copy"
      size="xs"
      color="neutral"
      variant="ghost"
      aria-label="Copiar"
      @click.stop="copy"
    />
  </span>
</template>
