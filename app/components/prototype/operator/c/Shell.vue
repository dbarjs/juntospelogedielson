<!-- PROTOTYPE — throwaway. Variant C "Caixa": top navigation, an always-on status line for the Default Account
     (the warning is that line turning amber/red), and list + inspector panes. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const props = defineProps<{ page: 'charges' | 'bank-accounts' }>()
const route = useRoute()
const { warnings, defaultAccount, state } = usePrototypeOperator()

const items = computed<NavigationMenuItem[]>(() => [
  { label: 'Cobranças', icon: 'i-lucide-receipt-text', to: { path: '/prototype/operator/charges', query: route.query }, active: props.page === 'charges' },
  { label: 'Contas', icon: 'i-lucide-landmark', to: { path: '/prototype/operator/bank-accounts', query: route.query }, active: props.page === 'bank-accounts' }
])

const tone = computed(() => !defaultAccount.value || warnings.value.some(w => w.kind === 'failure')
  ? 'bg-error/10 text-error border-error/30'
  : warnings.value.length ? 'bg-warning/10 text-warning border-warning/30' : 'bg-success/5 text-toned border-default')
const lastCharge = computed(() => state.charges.find(c => c.bankAccountId === defaultAccount.value?.id))
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-default px-3">
      <UIcon
        name="i-lucide-heart-handshake"
        class="size-5 text-primary"
      />
      <UNavigationMenu
        :items="items"
        class="min-w-0"
        :ui="{ link: 'px-2' }"
      />
      <UDropdownMenu :items="[[{ label: 'Abrir a página de doação', icon: 'i-lucide-external-link' }], [{ label: 'Sair', icon: 'i-lucide-log-out' }]]">
        <UAvatar
          icon="i-simple-icons-github"
          size="xs"
          class="ml-auto cursor-pointer"
        />
      </UDropdownMenu>
    </header>

    <NuxtLink
      :to="{ path: '/prototype/operator/bank-accounts', query: route.query }"
      class="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs"
      :class="tone"
    >
      <template v-if="!defaultAccount">
        <UIcon
          name="i-lucide-circle-x"
          class="size-4 shrink-0"
        />
        <span><b>Sem Conta padrão:</b> a página de doação não consegue criar cobranças.</span>
      </template>
      <template v-else-if="warnings.length">
        <UIcon
          name="i-lucide-triangle-alert"
          class="size-4 shrink-0"
        />
        <span class="min-w-0 flex-1 truncate"><b>{{ warnings[0]!.title }}.</b> {{ warnings[0]!.description }}</span>
        <UBadge
          v-if="warnings.length > 1"
          :label="`+${warnings.length - 1}`"
          size="sm"
          color="error"
        />
      </template>
      <template v-else>
        <span class="size-2 shrink-0 rounded-full bg-success" />
        <span class="min-w-0 truncate">Recebendo em <b>{{ defaultAccount.name }}</b> · certificado até {{ fmtDate(defaultAccount.certExpiresAt) }}<span
          v-if="lastCharge"
          class="hidden sm:inline"
        > · última cobrança {{ fmtRelative(lastCharge.createdAt) }}</span></span>
      </template>
    </NuxtLink>

    <div class="flex min-h-0 flex-1">
      <PrototypeOperatorCCharges v-if="page === 'charges'" />
      <PrototypeOperatorCBankAccounts v-else />
    </div>
  </div>
</template>
