<!-- PROTOTYPE — throwaway. Variant B "Extrato": phone-first, one narrow column, bottom tab bar on phones,
     a coloured warning strip pinned to the top of every page. -->
<script setup lang="ts">
const props = defineProps<{ page: 'charges' | 'bank-accounts' }>()
const route = useRoute()
const { warnings } = usePrototypeOperator()

const tabs = computed(() => [
  { key: 'charges', label: 'Cobranças', icon: 'i-lucide-receipt-text', to: { path: '/prototype/operator/charges', query: route.query } },
  { key: 'bank-accounts', label: 'Contas', icon: 'i-lucide-landmark', to: { path: '/prototype/operator/bank-accounts', query: route.query } }
])
</script>

<template>
  <div class="min-h-dvh bg-muted pb-24 sm:pb-8">
    <NuxtLink
      v-for="w in warnings"
      :key="w.kind"
      :to="{ path: '/prototype/operator/bank-accounts', query: route.query }"
      class="flex items-start gap-2 px-4 py-2 text-sm"
      :class="w.kind === 'failure' ? 'bg-error text-inverted' : 'bg-warning text-inverted'"
    >
      <UIcon
        :name="w.kind === 'failure' ? 'i-lucide-octagon-alert' : 'i-lucide-shield-alert'"
        class="mt-0.5 size-4 shrink-0"
      />
      <span class="min-w-0 flex-1"><b>{{ w.title }}.</b> <span class="opacity-90">{{ w.description }}</span></span>
      <UIcon
        name="i-lucide-chevron-right"
        class="mt-0.5 size-4 shrink-0"
      />
    </NuxtLink>

    <header class="sticky top-0 z-10 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
        <UIcon
          name="i-lucide-heart-handshake"
          class="size-6 text-primary"
        />
        <span class="text-sm font-semibold">Juntos pelo Gedielson</span>
        <nav class="ml-auto hidden gap-1 rounded-full bg-elevated p-1 sm:flex">
          <UButton
            v-for="t in tabs"
            :key="t.key"
            :to="t.to"
            :icon="t.icon"
            :label="t.label"
            size="sm"
            class="rounded-full"
            :color="props.page === t.key ? 'primary' : 'neutral'"
            :variant="props.page === t.key ? 'solid' : 'ghost'"
          />
        </nav>
        <UDropdownMenu :items="[[{ label: 'Abrir a página de doação', icon: 'i-lucide-external-link' }], [{ label: 'Sair', icon: 'i-lucide-log-out' }]]">
          <UAvatar
            icon="i-simple-icons-github"
            size="sm"
            class="ml-auto cursor-pointer sm:ml-0"
          />
        </UDropdownMenu>
      </div>
    </header>

    <main class="mx-auto max-w-2xl px-4 pt-4">
      <PrototypeOperatorBCharges v-if="page === 'charges'" />
      <PrototypeOperatorBBankAccounts v-else />
    </main>

    <nav class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] sm:hidden">
      <NuxtLink
        v-for="t in tabs"
        :key="t.key"
        :to="t.to"
        class="relative flex flex-col items-center gap-0.5 py-2 text-xs"
        :class="props.page === t.key ? 'text-primary' : 'text-muted'"
      >
        <UIcon
          :name="t.icon"
          class="size-6"
        />
        {{ t.label }}
        <span
          v-if="t.key === 'bank-accounts' && warnings.length"
          class="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-error"
        />
      </NuxtLink>
    </nav>
  </div>
</template>
