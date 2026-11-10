<!-- PROTOTYPE — throwaway. Floating bar that cycles ?variant= (← → keys too). Dev builds only. -->
<script setup lang="ts">
const props = defineProps<{ variants: { key: string, name: string }[] }>()

const isDev = import.meta.dev
const route = useRoute()
const router = useRouter()

const index = computed(() => Math.max(0, props.variants.findIndex(v => v.key === route.query.variant)))
const current = computed(() => props.variants[index.value]!)

function go(delta: number) {
  const next = props.variants[(index.value + delta + props.variants.length) % props.variants.length]!
  router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el?.closest('input, textarea, [contenteditable]')) return
  if (e.key === 'ArrowLeft') go(-1)
  if (e.key === 'ArrowRight') go(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    v-if="isDev"
    class="fixed bottom-3 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-1 rounded-full bg-inverted p-1 text-sm text-inverted shadow-xl ring-2 ring-primary"
  >
    <button
      class="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
      aria-label="Variante anterior"
      @click="go(-1)"
    >
      <UIcon
        name="i-lucide-chevron-left"
        class="size-5"
      />
    </button>
    <span class="px-2 font-medium whitespace-nowrap">{{ current.key }} · {{ current.name }}</span>
    <button
      class="flex size-8 items-center justify-center rounded-full hover:bg-white/15"
      aria-label="Próxima variante"
      @click="go(1)"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="size-5"
      />
    </button>
    <slot />
  </div>
</template>
