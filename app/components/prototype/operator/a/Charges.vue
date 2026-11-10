<!-- PROTOTYPE — throwaway. Variant A Charges (the chosen one): stat tiles, filter toolbar with txid / end-to-end id
     search, numbered-page table (fewer columns on phones), slideover detail with a timeline. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Charge, ChargeStatus, Period } from '~/composables/usePrototypeOperator'

const { state, allAccounts, accountById, staleAccounts } = usePrototypeOperator()

const status = ref<'all' | ChargeStatus>('all')
const accountId = ref<string>('all')
const period = ref<Period>('30d')
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 20
watch([status, accountId, period, query], () => (page.value = 1))

const statusItems = [
  { label: 'Todos os status', value: 'all' },
  ...(Object.keys(STATUS) as ChargeStatus[]).map(s => ({ label: STATUS[s].label, value: s }))
]
const accountItems = computed(() => [
  { label: 'Todas as contas', value: 'all' },
  ...allAccounts.value.map(a => ({ label: a.removedAt ? `${a.name} (removida)` : a.name, value: a.id }))
])

const searching = computed(() => query.value.trim().length > 0)
const inScope = computed(() => state.charges.filter(c =>
  (accountId.value === 'all' || c.bankAccountId === accountId.value) && inPeriod(c.createdAt, period.value)
))
const filtered = computed(() => {
  const q = query.value.trim()
  // A search ignores the filters and looks through all history.
  if (q) return state.charges.filter(c => c.txid.includes(q) || c.payment?.endToEndId.includes(q))
  return inScope.value.filter(c => status.value === 'all' || c.status === status.value)
})
const pageRows = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const tiles = computed(() => {
  const by = (s: ChargeStatus) => inScope.value.filter(c => c.status === s).length
  return [
    { label: 'Recebido', value: fmtMoney(totalReceived(inScope.value)), hint: `${by('paid')} pagamentos`, icon: 'i-lucide-banknote', tone: 'text-success' },
    { label: 'Pendentes', value: String(by('pending')), hint: 'ainda podem ser pagas', icon: 'i-lucide-clock', tone: 'text-warning' },
    { label: 'Expiradas', value: String(by('expired')), hint: 'sem pagamento em 1 h', icon: 'i-lucide-hourglass', tone: 'text-muted' },
    { label: 'Canceladas', value: String(by('cancelled')), hint: 'removidas pelo banco', icon: 'i-lucide-ban', tone: 'text-error' }
  ]
})

const desktopOnly = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }
const StatusBadge = resolveComponent('PrototypeOperatorStatusBadge')
const columns: TableColumn<Charge>[] = [
  { accessorKey: 'createdAt', header: 'Criada em', cell: ({ row }) => fmtDateTime(row.original.createdAt) },
  { accessorKey: 'amount', header: () => h('div', { class: 'text-right' }, 'Valor'), cell: ({ row }) => h('div', { class: 'text-right font-medium tabular-nums' }, fmtMoney(row.original.amount)) },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => h(StatusBadge, { charge: row.original, size: 'sm' }) },
  { id: 'account', header: 'Conta', meta: desktopOnly, cell: ({ row }) => accountById(row.original.bankAccountId).name },
  { id: 'paidAt', header: 'Pago em', meta: desktopOnly, cell: ({ row }) => row.original.payment ? fmtDateTime(row.original.payment.paidAt) : '—' },
  { accessorKey: 'txid', header: 'txid', meta: desktopOnly, cell: ({ row }) => h('code', { class: 'font-mono text-xs text-muted' }, shortId(row.original.txid)) }
]

const selected = ref<Charge | null>(null)
const open = computed({
  get: () => !!selected.value,
  set: (v) => {
    if (!v) selected.value = null
  }
})

const refreshing = ref(false)
async function refresh() {
  refreshing.value = true
  await new Promise(r => setTimeout(r, 700))
  refreshing.value = false
}
</script>

<template>
  <UDashboardPanel id="a-charges">
    <template #header>
      <UDashboardNavbar title="Cobranças">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <span class="hidden text-xs text-muted sm:inline">Atualizado {{ fmtRelative(new Date(state.now)) }}</span>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="refreshing"
            aria-label="Atualizar"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
      <PrototypeOperatorAWarnings />
      <UDashboardToolbar>
        <template #left>
          <div class="flex w-full flex-wrap gap-2 py-1">
            <UInput
              v-model="query"
              icon="i-lucide-search"
              placeholder="Buscar txid ou end-to-end id"
              class="w-full sm:w-72"
            />
            <template v-if="!searching">
              <USelect
                v-model="period"
                :items="PERIODS"
                class="w-[calc(50%-0.25rem)] sm:w-40"
              />
              <USelect
                v-model="accountId"
                :items="accountItems"
                class="w-[calc(50%-0.25rem)] sm:w-44"
              />
              <USelect
                v-model="status"
                :items="statusItems"
                class="w-full sm:w-40"
              />
            </template>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UAlert
        v-for="a in staleAccounts"
        :key="a.id"
        color="warning"
        variant="outline"
        icon="i-lucide-wifi-off"
        :title="`${a.name} não respondeu`"
        :description="`Mostrando o que estava salvo. Última verificação ${fmtRelative(a.lastCheckedAt!)} (${fmtTime(a.lastCheckedAt!)}). Cobranças dessa conta podem estar desatualizadas.`"
        :actions="[{ label: 'Tentar de novo', color: 'warning', variant: 'soft', onClick: refresh }]"
      />

      <div
        v-if="!searching"
        class="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <UCard
          v-for="t in tiles"
          :key="t.label"
          :ui="{ body: 'p-4 sm:p-4' }"
        >
          <div class="flex items-center gap-2 text-sm text-muted">
            <UIcon
              :name="t.icon"
              :class="t.tone"
              class="size-4"
            />{{ t.label }}
          </div>
          <p class="mt-1 text-2xl font-semibold tabular-nums">
            {{ t.value }}
          </p>
          <p class="text-xs text-dimmed">
            {{ t.hint }}
          </p>
        </UCard>
      </div>
      <p
        v-else
        class="text-sm text-muted"
      >
        {{ filtered.length }} resultado(s) em todo o histórico, sem filtros.
      </p>

      <UTable
        :data="pageRows"
        :columns="columns"
        :loading="refreshing"
        sticky
        class="rounded-lg border border-default"
        :on-select="(_e: Event, row: any) => (selected = row.original)"
        :ui="{ tr: 'cursor-pointer' }"
      >
        <template #empty>
          <div class="py-10 text-center">
            <UIcon
              name="i-lucide-receipt-text"
              class="size-8 text-dimmed"
            />
            <p class="mt-2 text-sm text-muted">
              {{ searching ? 'Nenhuma cobrança com esse txid ou end-to-end id.' : 'Nenhuma cobrança neste filtro.' }}
            </p>
          </div>
        </template>
      </UTable>

      <div class="flex flex-wrap items-center justify-between gap-2 pb-16 sm:pb-0">
        <p class="text-sm text-muted">
          {{ filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} de ${filtered.length}` : '0 cobranças' }}
        </p>
        <UPagination
          v-model:page="page"
          :total="filtered.length"
          :items-per-page="PAGE_SIZE"
          :sibling-count="0"
        />
      </div>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="open"
    :title="selected ? fmtMoney(selected.amount) : ''"
    :description="selected ? accountById(selected.bankAccountId).name : ''"
  >
    <template #body>
      <div
        v-if="selected"
        class="space-y-6 text-sm"
      >
        <div class="flex flex-wrap items-center gap-2">
          <PrototypeOperatorStatusBadge :charge="selected" />
          <UBadge
            v-if="selected.payment && selected.payment.amountReceived !== selected.amount"
            color="warning"
            variant="subtle"
            :label="`Recebido ${fmtMoney(selected.payment.amountReceived)}: difere da cobrança`"
          />
        </div>

        <ol class="space-y-4">
          <li
            v-for="(t, i) in chargeTimeline(selected, accountById(selected.bankAccountId).name)"
            :key="i"
            class="flex gap-3"
          >
            <UIcon
              :name="t.icon"
              :class="t.tone"
              class="mt-0.5 size-4 shrink-0"
            />
            <div>
              <p>{{ t.label }}</p>
              <p class="text-xs text-muted">
                {{ fmtFull(t.at) }}
              </p>
            </div>
          </li>
        </ol>

        <dl class="space-y-3">
          <div>
            <dt class="text-muted">
              txid
            </dt>
            <dd><PrototypeOperatorCopyable :value="selected.txid" /></dd>
          </div>
          <div v-if="selected.payment">
            <dt class="text-muted">
              End-to-end id
            </dt>
            <dd><PrototypeOperatorCopyable :value="selected.payment.endToEndId" /></dd>
          </div>
          <div>
            <dt class="text-muted">
              Conta bancária
            </dt>
            <dd>
              {{ accountById(selected.bankAccountId).name }} · {{ PROVIDERS[accountById(selected.bankAccountId).provider].label }}
              <span class="block text-xs text-muted">Chave {{ accountById(selected.bankAccountId).pixKey }}</span>
            </dd>
          </div>
        </dl>
      </div>
    </template>
  </USlideover>
</template>
