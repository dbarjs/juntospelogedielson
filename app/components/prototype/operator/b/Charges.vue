<!-- PROTOTYPE — throwaway. Variant B Charges: a bank-statement feed. One month at a time, grouped by day
     with day totals, filter chips, rows expand in place, "load more" instead of page numbers. -->
<script setup lang="ts">
import type { Charge } from '~/composables/usePrototypeOperator'

const { state, allAccounts, accountById, staleAccounts } = usePrototypeOperator()

type Chip = 'all' | 'paid' | 'pending' | 'unpaid'
const chip = ref<Chip>('all')
const accountId = ref('all')
const monthOffset = ref(0)
const shown = ref(25)
watch([chip, accountId, monthOffset], () => (shown.value = 25))

const month = computed(() => {
  const d = new Date(state.now)
  return new Date(d.getFullYear(), d.getMonth() - monthOffset.value, 1)
})
const monthLabel = computed(() => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month.value))
const inMonth = computed(() => state.charges.filter((c) => {
  const end = new Date(month.value.getFullYear(), month.value.getMonth() + 1, 1)
  return c.createdAt >= month.value && c.createdAt < end
    && (accountId.value === 'all' || c.bankAccountId === accountId.value)
}))
const chips = computed(() => [
  { key: 'all' as Chip, label: 'Todas', n: inMonth.value.length },
  { key: 'paid' as Chip, label: 'Pagas', n: inMonth.value.filter(c => c.status === 'paid').length },
  { key: 'pending' as Chip, label: 'Pendentes', n: inMonth.value.filter(c => c.status === 'pending').length },
  { key: 'unpaid' as Chip, label: 'Não pagas', n: inMonth.value.filter(c => c.status === 'expired' || c.status === 'cancelled').length }
])
const filtered = computed(() => inMonth.value.filter(c =>
  chip.value === 'all' ? true : chip.value === 'unpaid' ? (c.status === 'expired' || c.status === 'cancelled') : c.status === chip.value
))
const groups = computed(() => {
  const out: { label: string, received: number, items: Charge[] }[] = []
  for (const c of filtered.value.slice(0, shown.value)) {
    const label = dayLabel(c.createdAt)
    let g = out[out.length - 1]
    if (!g || g.label !== label) out.push(g = { label, received: 0, items: [] })
    g.items.push(c)
    g.received += c.payment?.amountReceived ?? 0
  }
  return out
})

const accountItems = computed(() => [
  { label: 'Todas as contas', value: 'all' },
  ...allAccounts.value.map(a => ({ label: a.removedAt ? `${a.name} (removida)` : a.name, value: a.id }))
])

const expanded = ref<string | null>(null)
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-2xl bg-default p-4 shadow-xs ring ring-default">
      <div class="flex items-center justify-between">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          aria-label="Mês anterior"
          @click="monthOffset++"
        />
        <span class="text-sm font-medium first-letter:uppercase">{{ monthLabel }}</span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          aria-label="Próximo mês"
          :disabled="monthOffset === 0"
          @click="monthOffset--"
        />
      </div>
      <p class="mt-2 text-center text-xs text-muted uppercase">
        Recebido no mês
      </p>
      <p class="text-center text-4xl font-bold tabular-nums">
        {{ fmtMoney(totalReceived(inMonth)) }}
      </p>
      <p class="mt-1 text-center text-xs text-muted">
        {{ chips[1]!.n }} pagamentos · {{ chips[2]!.n }} pendentes
      </p>
    </section>

    <div
      v-for="a in staleAccounts"
      :key="a.id"
      class="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning"
    >
      <UIcon
        name="i-lucide-wifi-off"
        class="mt-0.5 size-4 shrink-0"
      />
      <span><b>{{ a.name }} não respondeu.</b> Mostrando o que estava salvo, verificado {{ fmtRelative(a.lastCheckedAt!) }}.</span>
    </div>

    <div class="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
      <UButton
        v-for="c in chips"
        :key="c.key"
        :label="`${c.label} ${c.n}`"
        size="sm"
        class="shrink-0 rounded-full"
        :color="chip === c.key ? 'primary' : 'neutral'"
        :variant="chip === c.key ? 'solid' : 'outline'"
        @click="chip = c.key"
      />
      <USelect
        v-model="accountId"
        :items="accountItems"
        size="sm"
        class="ml-auto w-40 shrink-0"
      />
    </div>

    <div
      v-if="!groups.length"
      class="py-16 text-center text-sm text-muted"
    >
      <UIcon
        name="i-lucide-receipt-text"
        class="size-8 text-dimmed"
      />
      <p class="mt-2">
        Nada em {{ monthLabel }}.
      </p>
    </div>

    <section
      v-for="g in groups"
      :key="g.label"
    >
      <div class="flex items-baseline justify-between px-1 pb-1">
        <h3 class="text-xs font-semibold text-muted uppercase">
          {{ g.label }}
        </h3>
        <span class="text-xs text-muted tabular-nums">{{ g.received ? `${fmtMoney(g.received)} recebidos` : '' }}</span>
      </div>
      <ul class="divide-y divide-default overflow-hidden rounded-2xl bg-default ring ring-default">
        <li
          v-for="c in g.items"
          :key="c.txid"
        >
          <button
            class="flex w-full items-center gap-3 px-4 py-3 text-left"
            @click="expanded = expanded === c.txid ? null : c.txid"
          >
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-full"
              :class="{ 'bg-success/15 text-success': c.status === 'paid', 'bg-warning/15 text-warning': c.status === 'pending', 'bg-elevated text-muted': c.status === 'expired', 'bg-error/10 text-error': c.status === 'cancelled' }"
            >
              <UIcon
                :name="STATUS[c.status].icon"
                class="size-5"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span
                class="block font-semibold tabular-nums"
                :class="c.status === 'paid' || c.status === 'pending' ? '' : 'text-muted line-through decoration-1'"
              >{{ fmtMoney(c.amount) }}</span>
              <span class="block truncate text-xs text-muted">{{ fmtTime(c.createdAt) }} · {{ accountById(c.bankAccountId).name }}</span>
            </span>
            <span
              class="text-xs font-medium"
              :class="{ 'text-success': c.status === 'paid', 'text-warning': c.status === 'pending', 'text-muted': c.status === 'expired', 'text-error': c.status === 'cancelled' }"
            >{{ STATUS[c.status].label }}</span>
          </button>
          <div
            v-if="expanded === c.txid"
            class="space-y-2 bg-elevated/50 px-4 py-3 text-xs"
          >
            <div class="flex justify-between gap-4">
              <span class="text-muted">txid</span><PrototypeOperatorCopyable
                :value="c.txid"
                short
              />
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-muted">Criada · vence</span><span>{{ fmtTime(c.createdAt) }} · {{ fmtTime(c.expiresAt) }}</span>
            </div>
            <template v-if="c.payment">
              <div class="flex justify-between gap-4">
                <span class="text-muted">Pago às</span><span>{{ fmtFull(c.payment.paidAt) }}</span>
              </div>
              <div class="flex justify-between gap-4">
                <span class="text-muted">Valor recebido</span><span class="font-medium">{{ fmtMoney(c.payment.amountReceived) }}</span>
              </div>
              <div class="flex justify-between gap-4">
                <span class="text-muted">End-to-end id</span><PrototypeOperatorCopyable
                  :value="c.payment.endToEndId"
                  short
                />
              </div>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <UButton
      v-if="filtered.length > shown"
      block
      color="neutral"
      variant="outline"
      :label="`Carregar mais (${filtered.length - shown})`"
      @click="shown += 25"
    />
  </div>
</template>
