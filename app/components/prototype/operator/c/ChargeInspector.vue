<!-- PROTOTYPE — throwaway. Variant C: one Charge in full, with its timeline. -->
<script setup lang="ts">
import type { Charge } from '~/composables/usePrototypeOperator'

defineProps<{ charge: Charge, timeline: { at: Date, label: string, icon: string, tone: string }[] }>()
const { accountById } = usePrototypeOperator()
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6">
    <div>
      <PrototypeOperatorStatusBadge :charge="charge" />
      <p class="mt-2 text-4xl font-bold tabular-nums">
        {{ fmtMoney(charge.amount) }}
      </p>
      <p
        v-if="charge.payment && charge.payment.amountReceived !== charge.amount"
        class="text-sm text-warning"
      >
        Recebido: {{ fmtMoney(charge.payment.amountReceived) }} (diferente do valor da cobrança)
      </p>
    </div>

    <ol class="space-y-3 border-l border-default pl-4">
      <li
        v-for="(t, i) in timeline"
        :key="i"
        class="relative"
      >
        <UIcon
          :name="t.icon"
          :class="t.tone"
          class="absolute top-0.5 -left-[1.4rem] size-3.5 bg-default"
        />
        <p class="text-sm">
          {{ t.label }}
        </p>
        <p class="text-xs text-muted">
          {{ fmtFull(t.at) }}
        </p>
      </li>
    </ol>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt class="text-muted">
        txid
      </dt>
      <dd class="min-w-0">
        <PrototypeOperatorCopyable :value="charge.txid" />
      </dd>
      <template v-if="charge.payment">
        <dt class="text-muted">
          End-to-end id
        </dt>
        <dd class="min-w-0">
          <PrototypeOperatorCopyable :value="charge.payment.endToEndId" />
        </dd>
      </template>
      <dt class="text-muted">
        Conta
      </dt>
      <dd>{{ accountById(charge.bankAccountId).name }} · {{ PROVIDERS[accountById(charge.bankAccountId).provider].label }}</dd>
      <dt class="text-muted">
        Chave Pix
      </dt>
      <dd class="truncate">
        {{ accountById(charge.bankAccountId).pixKey }}
      </dd>
    </dl>
    <p class="text-xs text-muted">
      O txid e o end-to-end id aparecem no app do banco e no extrato, para conferir um pagamento.
    </p>
  </div>
</template>
