<!-- PROTOTYPE — throwaway. Floating variant switcher + scenario controls. Dev only. -->
<script setup lang="ts">
const props = defineProps<{ variants: { key: string, name: string }[] }>()

const route = useRoute()
const router = useRouter()
const { state, scenario, defaultAccount, accounts } = usePrototypeOperator()

const current = computed(() => (route.query.variant as string) || props.variants[0]!.key)
const index = computed(() => Math.max(0, props.variants.findIndex(v => v.key === current.value)))
const label = computed(() => `${props.variants[index.value]!.key} · ${props.variants[index.value]!.name}`)

function go(step: number) {
  const n = props.variants.length
  const next = props.variants[(index.value + step + n) % n]!
  router.replace({ query: { ...route.query, variant: next.key } })
}

function setScenario(s: string) {
  router.replace({ query: { ...route.query, scenario: s === 'normal' ? undefined : s } })
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))) return
  if (e.key === 'ArrowLeft') go(-1)
  if (e.key === 'ArrowRight') go(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const isDev = import.meta.dev
</script>

<template>
  <div
    v-if="isDev"
    class="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-inverted p-1 text-inverted shadow-xl ring-2 ring-primary/60 sm:bottom-4"
  >
    <UButton
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      class="rounded-full text-inverted hover:bg-white/10"
      aria-label="Variante anterior"
      @click="go(-1)"
    />
    <span class="min-w-32 text-center text-sm font-semibold whitespace-nowrap">{{ label }}</span>
    <UButton
      icon="i-lucide-chevron-right"
      color="neutral"
      variant="ghost"
      class="rounded-full text-inverted hover:bg-white/10"
      aria-label="Próxima variante"
      @click="go(1)"
    />
    <UPopover :content="{ side: 'top', sideOffset: 12 }">
      <UButton
        icon="i-lucide-flask-conical"
        color="primary"
        variant="solid"
        class="rounded-full"
        aria-label="Cenário"
      />
      <template #content>
        <div class="w-72 space-y-4 p-4">
          <URadioGroup
            :model-value="scenario"
            legend="Cenário"
            :items="SCENARIOS"
            @update:model-value="setScenario($event as string)"
          />
          <URadioGroup
            v-model="state.checkOutcome"
            legend="Verificação de conta"
            :items="CHECK_OUTCOMES"
          />
          <USeparator />
          <dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <dt class="text-muted">
              Conta padrão
            </dt><dd>{{ defaultAccount?.name ?? '—' }}</dd>
            <dt class="text-muted">
              Contas ativas
            </dt><dd>{{ accounts.length }}</dd>
            <dt class="text-muted">
              Cobranças
            </dt><dd>{{ state.charges.length }}</dd>
          </dl>
          <p class="text-xs text-muted">
            ← → trocam a variante. Mudar o cenário recarrega os dados.
          </p>
        </div>
      </template>
    </UPopover>
  </div>
</template>
