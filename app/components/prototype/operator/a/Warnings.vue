<!-- PROTOTYPE — throwaway. Variant A (chosen): an always-on status line for the Default Account under the navbar
     on every page, plus an alert per warning. -->
<script setup lang="ts">
const route = useRoute()
const { warnings, defaultAccount, state } = usePrototypeOperator()
const lastCharge = computed(() => state.charges.find(c => c.bankAccountId === defaultAccount.value?.id))
const toAccounts = computed(() => ({ path: '/prototype/operator/bank-accounts', query: route.query }))
</script>

<template>
  <NuxtLink
    :to="toAccounts"
    class="flex items-center gap-2 border-b px-4 py-1.5 text-xs sm:px-6"
    :class="!defaultAccount ? 'border-error/30 bg-error/10 text-error' : 'border-default text-muted'"
  >
    <template v-if="!defaultAccount">
      <UIcon
        name="i-lucide-circle-x"
        class="size-4 shrink-0"
      />
      <span><b>Sem Conta padrão:</b> a página de doação não consegue criar cobranças. Cadastre uma conta.</span>
    </template>
    <template v-else>
      <span
        class="size-2 shrink-0 rounded-full"
        :class="warnings.some(w => w.kind === 'failure') ? 'bg-error' : warnings.length ? 'bg-warning' : 'bg-success'"
      />
      <span class="min-w-0 truncate">
        Recebendo em <b class="text-highlighted">{{ defaultAccount.name }}</b> · certificado até {{ fmtDate(defaultAccount.certExpiresAt) }}<span
          v-if="lastCharge"
          class="hidden sm:inline"
        > · última cobrança {{ fmtRelative(lastCharge.createdAt) }}</span>
      </span>
    </template>
  </NuxtLink>
  <div
    v-if="warnings.length"
    class="space-y-2 border-b border-default p-3"
  >
    <UAlert
      v-for="w in warnings"
      :key="w.kind"
      :color="w.kind === 'failure' ? 'error' : 'warning'"
      variant="subtle"
      :icon="w.kind === 'failure' ? 'i-lucide-octagon-alert' : 'i-lucide-shield-alert'"
      :title="w.title"
      :description="w.description"
      orientation="horizontal"
      :actions="[{ label: 'Abrir conta', color: 'neutral', variant: 'outline', to: toAccounts }]"
    />
  </div>
</template>
