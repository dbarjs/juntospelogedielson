<!-- PROTOTYPE — throwaway. Variant C Charges: list + inspector. Shows Payments received by default ("Pagas"),
     search by txid or end-to-end id, keyset paging (newer/older), a timeline in the inspector. -->
<script setup lang="ts">
import type { Charge, Period } from '~/composables/usePrototypeOperator'

const { state, allAccounts, accountById, staleAccounts } = usePrototypeOperator()

const view = ref<'paid' | 'all'>('paid')
const query = ref('')
const period = ref<Period>('month')
const accountId = ref('all')
const offset = ref(0)
const PAGE = 30
watch([view, query, period, accountId], () => (offset.value = 0))

const scoped = computed(() => state.charges.filter(c =>
  inPeriod(c.createdAt, period.value)
  && (accountId.value === 'all' || c.bankAccountId === accountId.value)
))
const filtered = computed(() => {
  const q = query.value.trim()
  if (q) return state.charges.filter(c => c.txid.includes(q) || c.payment?.endToEndId.includes(q))
  return scoped.value.filter(c => view.value === 'all' || c.status === 'paid')
})
const visible = computed(() => filtered.value.slice(offset.value, offset.value + PAGE))

const selected = ref<Charge | null>(null)
watchEffect(() => {
  if (!selected.value && visible.value[0] && window.matchMedia('(min-width: 1024px)').matches) selected.value = visible.value[0]
})
const drawerOpen = ref(false)
function pick(c: Charge) {
  selected.value = c
  if (!window.matchMedia('(min-width: 1024px)').matches) drawerOpen.value = true
}

const accountItems = computed(() => [
  { label: 'Todas as contas', value: 'all' },
  ...allAccounts.value.map(a => ({ label: a.removedAt ? `${a.name} (removida)` : a.name, value: a.id }))
])

function timeline(c: Charge) {
  const t: { at: Date, label: string, icon: string, tone: string }[] = [
    { at: c.createdAt, label: `Criada em ${accountById(c.bankAccountId).name}`, icon: 'i-lucide-plus', tone: 'text-muted' }
  ]
  if (c.payment) t.push({ at: c.payment.paidAt, label: `Paga · ${fmtMoney(c.payment.amountReceived)} recebidos`, icon: 'i-lucide-circle-check', tone: 'text-success' })
  if (!c.payment && c.status === 'expired') t.push({ at: c.expiresAt, label: 'Expirou sem pagamento', icon: 'i-lucide-hourglass', tone: 'text-muted' })
  if (c.status === 'cancelled') t.push({ at: c.expiresAt, label: 'Cancelada pelo banco', icon: 'i-lucide-ban', tone: 'text-error' })
  if (c.status === 'pending') t.push({ at: c.expiresAt, label: c.expiresAt.getTime() < Date.now() ? 'Venceu; aguardando o banco confirmar' : `Vence ${fmtRelative(c.expiresAt)}`, icon: 'i-lucide-clock', tone: 'text-warning' })
  return t.sort((a, b) => a.at.getTime() - b.at.getTime())
}
</script>

<template>
  <section class="flex w-full flex-col border-default lg:w-[26rem] lg:shrink-0 lg:border-r">
    <div class="space-y-2 border-b border-default p-3">
      <UInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="Buscar por txid ou end-to-end id"
        class="w-full"
      />
      <div class="flex items-center gap-2">
        <UTabs
          v-model="view"
          :items="[{ label: 'Pagas', value: 'paid' }, { label: 'Todas', value: 'all' }]"
          :content="false"
          size="xs"
          class="w-36"
        />
        <UPopover>
          <UButton
            icon="i-lucide-sliders-horizontal"
            :label="PERIODS.find(p => p.value === period)!.label"
            color="neutral"
            variant="outline"
            size="sm"
            class="ml-auto"
          />
          <template #content>
            <div class="w-60 space-y-3 p-3">
              <UFormField label="Período">
                <USelect
                  v-model="period"
                  :items="PERIODS"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Conta">
                <USelect
                  v-model="accountId"
                  :items="accountItems"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>
        </UPopover>
      </div>
      <p
        v-if="!query"
        class="text-xs text-muted"
      >
        <b class="text-highlighted">{{ fmtMoney(totalReceived(scoped)) }}</b> recebidos em {{ scoped.filter(c => c.payment).length }} pagamentos
        <span v-if="view === 'all'"> · {{ scoped.length }} cobranças</span>
      </p>
      <p
        v-else
        class="text-xs text-muted"
      >
        {{ filtered.length }} resultado(s) em todo o histórico
      </p>
    </div>

    <div
      v-for="a in staleAccounts"
      :key="a.id"
      class="flex gap-2 border-b border-default bg-warning/10 px-3 py-2 text-xs text-warning"
    >
      <UIcon
        name="i-lucide-wifi-off"
        class="mt-0.5 size-3.5 shrink-0"
      />
      <span>{{ a.name }} não respondeu; mostrando dados salvos ({{ fmtRelative(a.lastCheckedAt!) }}).</span>
    </div>

    <ul class="min-h-0 flex-1 divide-y divide-default overflow-y-auto">
      <li
        v-for="c in visible"
        :key="c.txid"
      >
        <button
          class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-elevated/50"
          :class="selected?.txid === c.txid ? 'bg-elevated' : ''"
          @click="pick(c)"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="{ 'bg-success': c.status === 'paid', 'bg-warning': c.status === 'pending', 'bg-(--ui-text-dimmed)': c.status === 'expired', 'bg-error': c.status === 'cancelled' }"
          />
          <span class="flex-1 font-medium tabular-nums">{{ fmtMoney(c.payment?.amountReceived ?? c.amount) }}</span>
          <span class="text-xs text-muted">{{ fmtDateTime(c.payment?.paidAt ?? c.createdAt) }}</span>
        </button>
      </li>
      <li
        v-if="!visible.length"
        class="p-8 text-center text-sm text-muted"
      >
        {{ view === 'paid' ? 'Nenhum pagamento neste período.' : 'Nenhuma cobrança neste período.' }}
      </li>
    </ul>

    <div class="flex items-center justify-between border-t border-default p-2 pb-16 sm:pb-2">
      <UButton
        icon="i-lucide-chevron-left"
        label="Mais recentes"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="offset === 0"
        @click="offset -= PAGE"
      />
      <UButton
        trailing-icon="i-lucide-chevron-right"
        label="Mais antigas"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="offset + PAGE >= filtered.length"
        @click="offset += PAGE"
      />
    </div>
  </section>

  <section class="hidden min-w-0 flex-1 overflow-y-auto p-6 lg:block">
    <PrototypeOperatorCChargeInspector
      v-if="selected"
      :charge="selected"
      :timeline="timeline(selected)"
    />
  </section>

  <UDrawer v-model:open="drawerOpen">
    <template #body>
      <PrototypeOperatorCChargeInspector
        v-if="selected"
        :charge="selected"
        :timeline="timeline(selected)"
        class="pb-6"
      />
    </template>
  </UDrawer>
</template>
