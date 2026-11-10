<!-- PROTOTYPE — throwaway. Drives the fake Provider and shows the full state. Not part of any design. -->
<script setup lang="ts">
import { activeFlow, brl, clockTime, mmss, useFakeServer, type CreateOutcome } from '~/composables/usePrototypePayment'

const server = useFakeServer()
const s = server.state

const flow = computed(() => activeFlow.value)
const charge = computed(() => flow.value?.charge.value ?? null)
const record = computed(() => (charge.value ? s.charges[charge.value.txid] : undefined))
const phase = computed(() => flow.value?.phase.value)
const pastExpiry = computed(() => !!charge.value && server.fakeNow.value >= charge.value.expiresAt)

const phaseLabel: Record<string, string> = {
  amount: 'Digitando o valor',
  creating: 'Gerando o Pix',
  pending: 'Aguardando pagamento',
  overtime: 'Prazo acabou; servidor ainda não registrou Expired',
  paid: 'Pago',
  expired: 'Expirou',
  cancelled: 'Cancelado'
}

const outcomes: { value: CreateOutcome, label: string }[] = [
  { value: 'ok', label: 'Funciona' },
  { value: 'provider-error', label: 'Banco devolve erro' },
  { value: 'timeout', label: 'Banco não responde (15 s)' },
  { value: 'blocked', label: 'Proteção contra robôs barra' }
]

const latencySeconds = computed({
  get: () => s.createLatencyMs / 1000,
  set: v => (s.createLatencyMs = v * 1000)
})

const offsetLabel = computed(() => {
  const min = Math.round(s.clockOffsetMs / 60000)
  return min ? ` (+${min} min)` : ''
})

function jump(msFromExpiry: number) {
  if (charge.value) server.setClockTo(charge.value.expiresAt + msFromExpiry)
}

function reload() {
  location.reload()
}

function resetAll() {
  server.reset()
  location.reload()
}
</script>

<template>
  <div class="space-y-6 text-sm">
    <div>
      <p class="text-xs font-semibold tracking-wide text-dimmed uppercase">
        Protótipo · controles
      </p>
      <p class="text-xs text-dimmed">
        Fora da página. Simula o banco e o Pagador.
      </p>
    </div>

    <section class="space-y-1.5 rounded-lg bg-elevated p-3">
      <h3 class="mb-2 font-semibold text-highlighted">
        Agora
      </h3>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Tela do Pagador</span><span class="text-end font-medium text-highlighted">{{ phase ? phaseLabel[phase] : '—' }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Cobrança</span><span class="font-mono">{{ charge ? `${charge.txid.slice(0, 8)}… · ${brl(charge.amountCents)}` : '—' }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Nosso banco de dados</span><span class="font-medium">{{ record?.status ?? '—' }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">No banco (Provider)</span><span class="font-mono">{{ record?.provider ?? '—' }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Relógio</span><span class="tabular-nums">{{ clockTime(server.fakeNow.value, true) }}{{ offsetLabel }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Prazo</span>
        <span class="tabular-nums">{{ charge ? (pastExpiry ? `acabou às ${clockTime(charge.expiresAt)}` : `faltam ${mmss(charge.expiresAt - server.fakeNow.value)}`) : '—' }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Página</span>
        <span>{{ server.pageVisible.value ? 'visível' : 'oculta' }} · {{ flow?.polling.value ? 'consultando a cada 3 s' : 'sem consultas' }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Consultas da tela / leituras no banco</span><span class="tabular-nums">{{ s.polls }} / {{ s.providerReads }}</span>
      </div>
      <div class="flex justify-between gap-3">
        <span class="text-muted">Guarda a cobrança</span>
        <span>{{ { browser: 'neste navegador', url: 'na URL', none: 'não guarda' }[flow?.opts.remember ?? 'none'] }}</span>
      </div>
    </section>

    <section class="space-y-2">
      <h3 class="font-semibold text-highlighted">
        O Pagador
      </h3>
      <UButton
        block
        icon="i-lucide-banknote"
        label="Paga no app do banco"
        :disabled="!record || record.provider !== 'ATIVA' || pastExpiry"
        @click="record && server.pay(record.txid)"
      />
      <UButton
        block
        :color="s.payerInBankApp ? 'warning' : 'neutral'"
        variant="soft"
        :icon="s.payerInBankApp ? 'i-lucide-arrow-left' : 'i-lucide-smartphone'"
        :label="s.payerInBankApp ? 'Volta para a página' : 'Vai para o app do banco (página oculta)'"
        @click="s.payerInBankApp = !s.payerInBankApp"
      />
      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-lucide-rotate-cw"
        label="Recarrega a página"
        @click="reload"
      />
    </section>

    <section class="space-y-3">
      <h3 class="font-semibold text-highlighted">
        O banco (Provider) e nosso servidor
      </h3>
      <URadioGroup
        v-model="s.createOutcome"
        legend="Ao gerar um Pix"
        :items="outcomes"
        size="sm"
      />
      <div>
        <p class="mb-1 text-muted">
          Demora para gerar: {{ latencySeconds.toFixed(1) }} s
        </p>
        <USlider
          v-model="latencySeconds"
          :min="0.2"
          :max="6"
          :step="0.2"
          size="sm"
        />
      </div>
      <USwitch
        v-model="s.providerReadsFail"
        label="Leituras no banco falham (pausa de 30 s)"
        size="sm"
      />
      <USwitch
        v-model="s.serverDown"
        label="Nosso servidor fora do ar (consultas da tela falham)"
        size="sm"
      />
      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-lucide-ban"
        label="Banco remove a cobrança"
        :disabled="!record || record.provider !== 'ATIVA'"
        @click="record && server.remove(record.txid)"
      />
      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-lucide-hourglass"
        label="Pagamento dos 59:58 aparece atrasado"
        :disabled="!record || record.provider !== 'ATIVA' || !pastExpiry"
        @click="record && server.payLate(record.txid)"
      />
    </section>

    <section class="space-y-2">
      <h3 class="font-semibold text-highlighted">
        Relógio (só avança)
      </h3>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          label="+5 min"
          @click="server.setClockTo(server.now() + 5 * 60000)"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          label="1 min antes do fim"
          :disabled="!charge"
          @click="jump(-60000)"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          label="5 s antes do fim"
          :disabled="!charge"
          @click="jump(-5000)"
        />
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          label="1 min depois do fim"
          :disabled="!charge"
          @click="jump(60000)"
        />
      </div>
    </section>

    <section>
      <h3 class="mb-2 font-semibold text-highlighted">
        Registro
      </h3>
      <ol class="max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
        <li
          v-for="(entry, i) in s.log"
          :key="i"
          class="flex gap-2"
        >
          <span class="shrink-0 text-dimmed tabular-nums">{{ clockTime(entry.at, true) }}</span>
          <span class="text-toned">{{ entry.text }}</span>
        </li>
        <li
          v-if="!s.log.length"
          class="text-dimmed"
        >
          Nada ainda.
        </li>
      </ol>
    </section>

    <UButton
      block
      color="error"
      variant="ghost"
      icon="i-lucide-trash-2"
      label="Zerar tudo"
      @click="resetAll"
    />
  </div>
</template>
