<!-- PROTOTYPE — throwaway. Variant A "Painel": admin dashboard, sidebar navigation, dense tables. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const props = defineProps<{ page: 'charges' | 'bank-accounts' }>()
const route = useRoute()
const { warnings } = usePrototypeOperator()

const items = computed<NavigationMenuItem[]>(() => [{
  label: 'Cobranças',
  icon: 'i-lucide-receipt-text',
  to: { path: '/prototype/operator/charges', query: route.query },
  active: props.page === 'charges'
}, {
  label: 'Contas bancárias',
  icon: 'i-lucide-landmark',
  to: { path: '/prototype/operator/bank-accounts', query: route.query },
  active: props.page === 'bank-accounts',
  badge: warnings.value.length ? { label: String(warnings.value.length), color: 'warning' as const } : undefined
}])
</script>

<template>
  <UDashboardGroup
    storage-key="prototype-operator-a"
    :persistent="false"
  >
    <UDashboardSidebar
      collapsible
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-heart-handshake"
            class="size-6 shrink-0 text-primary"
          />
          <span
            v-if="!collapsed"
            class="truncate text-sm font-semibold"
          >Juntos pelo Gedielson</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="items"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="[[{ label: 'Abrir a página de doação', icon: 'i-lucide-external-link' }], [{ label: 'Sair', icon: 'i-lucide-log-out' }]]">
          <UButton
            :avatar="{ icon: 'i-simple-icons-github' }"
            :label="collapsed ? undefined : 'Operador'"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            trailing-icon="i-lucide-chevrons-up-down"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <PrototypeOperatorACharges v-if="page === 'charges'" />
    <PrototypeOperatorABankAccounts v-else />
  </UDashboardGroup>
</template>
