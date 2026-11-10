<!--
  PROTOTYPE — throwaway. Variant A, "Uma tela por vez".
  Each step replaces the last. Amount typed like a banking app (digits fill from the cents).
  Copia e Cola first, QR code tucked away. Countdown in mm:ss. The Charge is remembered in this
  browser, so a reload brings it back. After the countdown ends: "Confirmando…" until the server
  records Expired. Each failure gets its own message.
-->
<script setup lang="ts">
import { brl, mmss, MIN_CENTS, copyText, usePaymentFlow } from '~/composables/usePrototypePayment'

const flow = usePaymentFlow({ remember: 'browser' })
const { phase, charge, amountCents, error, tooLow, pollFailing, msLeft } = flow

function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const digits = input.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9)
  flow.setAmount(Number(digits || 0))
  input.value = brl(amountCents.value)
}

const copied = ref(false)
async function copy() {
  if (!charge.value) return
  await copyText(charge.value.copiaECola)
  copied.value = true
  setTimeout(() => (copied.value = false), 2500)
}

const showQr = ref(false)

const errorText = computed(() => ({
  provider: { title: 'Não conseguimos gerar o Pix agora', body: 'O banco não respondeu como devia. Tente de novo em instantes.' },
  timeout: { title: 'O banco demorou demais', body: 'Nada foi cobrado. Tente de novo.' },
  blocked: { title: 'Não foi possível continuar', body: 'Tente novamente mais tarde.' }
})[error.value!])
</script>

<template>
  <div class="flex min-h-full flex-col px-5 pt-8 pb-24">
    <!-- 1. Amount -->
    <template v-if="phase === 'amount' || phase === 'creating'">
      <PrototypePaymentCampaignHeader />

      <label
        class="mt-10 block text-sm font-medium text-toned"
        for="amount-a"
      >Quanto você quer doar?</label>
      <input
        id="amount-a"
        :value="brl(amountCents)"
        inputmode="numeric"
        autocomplete="off"
        :disabled="phase === 'creating'"
        class="mt-2 w-full border-b-2 bg-transparent pb-2 text-4xl font-bold text-highlighted tabular-nums outline-none focus:border-primary"
        :class="tooLow ? 'border-error' : 'border-accented'"
        @input="onInput"
        @keydown.enter="flow.submit()"
      >
      <p
        class="mt-2 text-sm"
        :class="tooLow ? 'text-error' : 'text-muted'"
      >
        Valor mínimo: {{ brl(MIN_CENTS) }}
      </p>

      <UAlert
        v-if="errorText"
        class="mt-6"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorText.title"
        :description="errorText.body"
      />

      <div class="sticky bottom-0 mt-auto bg-default pt-6 pb-2">
        <UButton
          block
          size="xl"
          :loading="phase === 'creating'"
          :label="phase === 'creating' ? 'Gerando o Pix…' : 'Gerar Pix'"
          @click="flow.submit()"
        />
      </div>
    </template>

    <!-- 2. Pay -->
    <template v-else-if="(phase === 'pending' || phase === 'overtime') && charge">
      <PrototypePaymentCampaignHeader compact />

      <p class="mt-6 text-sm text-muted">
        Doação de
      </p>
      <p class="text-4xl font-bold text-highlighted tabular-nums">
        {{ brl(charge.amountCents) }}
      </p>

      <div class="mt-4 flex items-center gap-2 text-sm">
        <span class="relative flex size-2.5">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span class="relative inline-flex size-2.5 rounded-full bg-primary" />
        </span>
        <span class="text-toned">{{ phase === 'overtime' ? 'Confirmando o pagamento…' : 'Aguardando pagamento' }}</span>
        <span
          v-if="pollFailing"
          class="text-warning"
        >· sem conexão, tentando de novo</span>
      </div>

      <template v-if="phase === 'pending'">
        <p class="mt-8 font-medium text-highlighted">
          Copie o código e pague no app do seu banco, em Pix Copia e Cola.
        </p>
        <p class="mt-3 line-clamp-2 break-all rounded-md bg-elevated p-3 font-mono text-xs text-muted">
          {{ charge.copiaECola }}
        </p>
        <UButton
          class="mt-3"
          block
          size="xl"
          :color="copied ? 'success' : 'primary'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied ? 'Código copiado!' : 'Copiar código Pix'"
          @click="copy"
        />
        <p class="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-clock" />
          Expira em <span class="font-medium tabular-nums text-toned">{{ mmss(msLeft) }}</span>
        </p>

        <UButton
          class="mt-6 self-center"
          variant="link"
          color="neutral"
          :trailing-icon="showQr ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          label="Pagar com QR code, de outro aparelho"
          @click="showQr = !showQr"
        />
        <div
          v-if="showQr"
          class="mt-2 flex justify-center"
        >
          <PrototypePaymentQrCode
            :value="charge.copiaECola"
            :size="220"
          />
        </div>
      </template>

      <UAlert
        v-else
        class="mt-8"
        color="neutral"
        variant="subtle"
        icon="i-lucide-hourglass"
        title="O prazo para pagar acabou"
        description="Se você pagou agora há pouco, estamos confirmando com o banco. Isso leva até um minuto."
      />

      <UButton
        class="mt-auto self-center pt-8"
        variant="link"
        color="neutral"
        icon="i-lucide-arrow-left"
        label="Alterar valor"
        @click="flow.changeAmount()"
      />
    </template>

    <!-- 3a. Paid -->
    <div
      v-else-if="phase === 'paid' && charge"
      class="flex flex-1 flex-col items-center justify-center text-center"
    >
      <UIcon
        name="i-lucide-circle-check"
        class="size-20 text-success"
      />
      <h2 class="mt-4 text-2xl font-bold text-highlighted">
        Pagamento recebido
      </h2>
      <p class="mt-2 text-muted">
        Obrigado por doar {{ brl(charge.amountCents) }} para o Gedielson.
      </p>
      <UButton
        class="mt-10"
        variant="outline"
        color="neutral"
        size="lg"
        label="Fazer outra doação"
        @click="flow.startOver()"
      />
    </div>

    <!-- 3b. Expired or Cancelled -->
    <div
      v-else-if="charge"
      class="flex flex-1 flex-col items-center justify-center text-center"
    >
      <UIcon
        name="i-lucide-timer-off"
        class="size-16 text-muted"
      />
      <h2 class="mt-4 text-2xl font-bold text-highlighted">
        {{ phase === 'cancelled' ? 'Este Pix foi cancelado' : 'Este Pix expirou' }}
      </h2>
      <p class="mt-2 text-muted">
        Nada foi cobrado. Gere um novo Pix para doar.
      </p>
      <UButton
        class="mt-10"
        size="xl"
        block
        :label="`Gerar novo Pix de ${brl(charge.amountCents)}`"
        @click="flow.newChargeSameAmount()"
      />
      <UButton
        class="mt-3"
        variant="link"
        color="neutral"
        label="Alterar valor"
        @click="flow.changeAmount()"
      />
    </div>
  </div>
</template>
