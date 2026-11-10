<!--
  PROTOTYPE — throwaway. Variant C, "Teclado na tela + folha".
  The amount is typed on the page's own keypad (no system keyboard covering the button). The Pix
  opens in a bottom sheet: a big copy button, a small QR code, no countdown, only "válido por
  1 hora". The Charge lives in the URL (?pix=…), so a reload or a shared link reopens it. Nothing
  changes at the end of the hour until the server records Expired. Every failure shows the same
  message in the sheet.
-->
<script setup lang="ts">
import { brl, copyText, MIN_CENTS, usePaymentFlow } from '~/composables/usePrototypePayment'

const flow = usePaymentFlow({ remember: 'url' })
const { phase, charge, amountCents, error, pollFailing } = flow

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']
function press(key: string) {
  if (key === 'back') flow.setAmount(Math.floor(amountCents.value / 10))
  else if (String(amountCents.value).length < 9) flow.setAmount(amountCents.value * 10 + Number(key))
}

const sheetOpen = computed({
  get: () => phase.value !== 'amount' || !!error.value,
  set: (open) => {
    if (open) return
    if (phase.value === 'paid') flow.startOver()
    else flow.changeAmount()
  }
})

const copied = ref(false)
async function copy() {
  if (!charge.value) return
  await copyText(charge.value.copiaECola)
  copied.value = true
  setTimeout(() => (copied.value = false), 2500)
}
</script>

<template>
  <div class="flex h-full flex-col px-5 pt-8 pb-20">
    <PrototypePaymentCampaignHeader center />

    <div class="flex flex-1 flex-col items-center justify-center">
      <p class="text-sm text-muted">
        Valor da doação
      </p>
      <p
        class="mt-1 text-5xl font-bold tabular-nums"
        :class="amountCents ? 'text-highlighted' : 'text-dimmed'"
      >
        {{ brl(amountCents) }}
      </p>
      <p
        class="mt-2 text-sm"
        :class="amountCents > 0 && amountCents < MIN_CENTS ? 'text-error' : 'text-muted'"
      >
        mínimo {{ brl(MIN_CENTS) }}
      </p>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <template
        v-for="key in keys"
        :key="key"
      >
        <span v-if="!key" />
        <UButton
          v-else
          color="neutral"
          variant="soft"
          size="xl"
          class="h-14 justify-center text-2xl font-semibold"
          :icon="key === 'back' ? 'i-lucide-delete' : undefined"
          :label="key === 'back' ? undefined : key"
          :aria-label="key === 'back' ? 'Apagar' : key"
          @click="press(key)"
        />
      </template>
    </div>

    <UButton
      class="mt-4"
      block
      size="xl"
      :disabled="amountCents < MIN_CENTS"
      :label="amountCents >= MIN_CENTS ? `Doar ${brl(amountCents)}` : 'Digite o valor'"
      @click="flow.submit()"
    />

    <UDrawer
      v-model:open="sheetOpen"
      portal="#phone-screen"
      :dismissible="phase !== 'creating'"
      :should-scale-background="false"
      :modal="false"
      :content="{ onInteractOutside: (e: Event) => e.preventDefault() }"
      :ui="{ content: 'max-h-[92%]', body: 'px-5 pb-8' }"
    >
      <template #body>
        <!-- Creating -->
        <div
          v-if="phase === 'creating'"
          class="flex flex-col items-center py-10 text-center"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="size-10 animate-spin text-primary"
          />
          <p class="mt-4 font-medium text-highlighted">
            Gerando seu Pix de {{ brl(amountCents) }}…
          </p>
        </div>

        <!-- Any failure: one message -->
        <div
          v-else-if="error"
          class="flex flex-col items-center py-8 text-center"
        >
          <UIcon
            name="i-lucide-cloud-alert"
            class="size-12 text-error"
          />
          <p class="mt-4 text-lg font-semibold text-highlighted">
            Não deu para gerar o Pix agora
          </p>
          <p class="mt-1 text-muted">
            Nada foi cobrado. Tente de novo em alguns instantes.
          </p>
          <UButton
            class="mt-6"
            block
            size="xl"
            label="Tentar de novo"
            @click="flow.submit()"
          />
          <UButton
            class="mt-2"
            block
            variant="ghost"
            color="neutral"
            label="Fechar"
            @click="flow.changeAmount()"
          />
        </div>

        <!-- Waiting for payment (the end of the hour changes nothing here) -->
        <div
          v-else-if="(phase === 'pending' || phase === 'overtime') && charge"
          class="flex flex-col items-center text-center"
        >
          <p class="text-sm text-muted">
            Pix de
          </p>
          <p class="text-3xl font-bold tabular-nums text-highlighted">
            {{ brl(charge.amountCents) }}
          </p>
          <UButton
            class="mt-6"
            block
            size="xl"
            :color="copied ? 'success' : 'primary'"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Código copiado!' : 'Copiar código Pix'"
            @click="copy"
          />
          <p class="mt-3 text-sm text-muted">
            Depois de copiar, abra o app do seu banco e escolha <strong class="text-toned">Pix Copia e Cola</strong>.
          </p>
          <div class="mt-6 flex items-center gap-4 rounded-lg bg-elevated p-3 text-start">
            <PrototypePaymentQrCode
              :value="charge.copiaECola"
              :size="96"
            />
            <p class="text-sm text-muted">
              Ou escaneie este QR code com o app do banco em outro aparelho.
            </p>
          </div>
          <div class="mt-6 flex items-center gap-2 text-sm text-muted">
            <UIcon
              name="i-lucide-loader-circle"
              class="animate-spin text-primary"
            />
            Aguardando pagamento · válido por 1 hora
          </div>
          <p
            v-if="pollFailing"
            class="mt-1 text-sm text-warning"
          >
            Sem conexão. Tentando de novo…
          </p>
          <UButton
            class="mt-4"
            variant="link"
            color="neutral"
            icon="i-lucide-arrow-left"
            label="Alterar valor"
            @click="flow.changeAmount()"
          />
        </div>

        <!-- Paid -->
        <div
          v-else-if="phase === 'paid' && charge"
          class="flex flex-col items-center py-8 text-center"
        >
          <div class="flex size-20 items-center justify-center rounded-full bg-success/15">
            <UIcon
              name="i-lucide-heart-handshake"
              class="size-10 text-success"
            />
          </div>
          <p class="mt-4 text-2xl font-bold text-highlighted">
            Recebemos sua doação!
          </p>
          <p class="mt-1 text-muted">
            {{ brl(charge.amountCents) }} para o Gedielson. Muito obrigado.
          </p>
          <UButton
            class="mt-8"
            block
            size="lg"
            variant="outline"
            color="neutral"
            label="Fechar"
            @click="flow.startOver()"
          />
        </div>

        <!-- Expired / Cancelled -->
        <div
          v-else-if="charge"
          class="flex flex-col items-center py-8 text-center"
        >
          <UIcon
            name="i-lucide-timer-off"
            class="size-12 text-muted"
          />
          <p class="mt-4 text-lg font-semibold text-highlighted">
            Este Pix não vale mais
          </p>
          <p class="mt-1 text-muted">
            {{ phase === 'cancelled' ? 'O banco cancelou este Pix.' : 'Passou 1 hora sem pagamento.' }} Nada foi cobrado.
          </p>
          <UButton
            class="mt-6"
            block
            size="xl"
            :label="`Gerar outro Pix de ${brl(charge.amountCents)}`"
            @click="flow.newChargeSameAmount()"
          />
          <UButton
            class="mt-2"
            block
            variant="ghost"
            color="neutral"
            label="Alterar valor"
            @click="flow.changeAmount()"
          />
        </div>
      </template>
    </UDrawer>
  </div>
</template>
