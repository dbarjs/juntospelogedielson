<!--
  PROTOTYPE — throwaway. Variant B, "Página única com etapas".
  One scrolling page with three numbered steps that fill in as the Payer goes. Amount typed freely
  into a currency field, checked on submit. QR code first, Copia e Cola in a field with a copy icon.
  Time shown as a draining bar and "válido até 14:32". No memory: a reload starts over. When the
  hour ends the Pix is shown as expired straight away, while the screen keeps checking quietly
  until the server records Expired. Failures show in the step, with a retry.
-->
<script setup lang="ts">
import { brl, clockTime, copyText, CHARGE_TTL_MS, MIN_CENTS, usePaymentFlow } from '~/composables/usePrototypePayment'

const flow = usePaymentFlow({ remember: 'none' })
const { phase, charge, amountCents, error, tooLow, pollFailing, msLeft } = flow

const reais = computed({
  get: () => (amountCents.value ? amountCents.value / 100 : undefined),
  set: v => flow.setAmount(Math.round((v ?? 0) * 100))
})

const hasCharge = computed(() => !!charge.value)
const looksExpired = computed(() => phase.value === 'overtime' || phase.value === 'expired' || phase.value === 'cancelled')

const copied = ref(false)
async function copy() {
  if (!charge.value) return
  await copyText(charge.value.copiaECola)
  copied.value = true
  setTimeout(() => (copied.value = false), 2500)
}

const errorText = computed(() => ({
  provider: 'O banco não conseguiu gerar o Pix.',
  timeout: 'O banco demorou demais para responder.',
  blocked: 'Não foi possível gerar o Pix agora.'
})[error.value!])
</script>

<template>
  <div class="min-h-full bg-muted pb-24">
    <div class="bg-default px-5 pt-8 pb-6">
      <PrototypePaymentCampaignHeader center />
    </div>

    <div class="space-y-3 p-3">
      <!-- Step 1 -->
      <section class="rounded-xl bg-default p-4">
        <div class="flex items-center gap-3">
          <span
            class="flex size-7 items-center justify-center rounded-full text-sm font-bold"
            :class="hasCharge ? 'bg-success text-inverted' : 'bg-primary text-inverted'"
          >
            <UIcon
              v-if="hasCharge"
              name="i-lucide-check"
            />
            <template v-else>1</template>
          </span>
          <h2 class="font-semibold text-highlighted">
            Valor
          </h2>
          <template v-if="hasCharge && charge">
            <span class="ms-auto font-semibold tabular-nums text-highlighted">{{ brl(charge.amountCents) }}</span>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              label="Alterar"
              @click="flow.changeAmount()"
            />
          </template>
        </div>

        <div
          v-if="!hasCharge"
          class="mt-4"
        >
          <UFormField :error="tooLow ? `O valor mínimo é ${brl(MIN_CENTS)}` : undefined">
            <UInputNumber
              v-model="reais"
              locale="pt-BR"
              :format-options="{ style: 'currency', currency: 'BRL' }"
              :increment="false"
              :decrement="false"
              placeholder="R$ 0,00"
              size="xl"
              class="w-full"
              :disabled="phase === 'creating'"
              :ui="{ base: 'text-2xl font-semibold text-center' }"
            />
          </UFormField>
          <UButton
            class="mt-4"
            block
            size="xl"
            :loading="phase === 'creating'"
            label="Continuar para o Pix"
            @click="flow.submit()"
          />
        </div>
      </section>

      <!-- Step 2 -->
      <section
        class="rounded-xl bg-default p-4"
        :class="!hasCharge && phase !== 'creating' && !error && 'opacity-50'"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex size-7 items-center justify-center rounded-full text-sm font-bold"
            :class="phase === 'paid' ? 'bg-success text-inverted' : hasCharge && !looksExpired ? 'bg-primary text-inverted' : 'bg-accented text-muted'"
          >
            <UIcon
              v-if="phase === 'paid'"
              name="i-lucide-check"
            />
            <template v-else>2</template>
          </span>
          <h2 class="font-semibold text-highlighted">
            Pague com Pix
          </h2>
        </div>

        <UAlert
          v-if="error"
          class="mt-4"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorText"
          description="Nada foi cobrado."
          :actions="[{ label: 'Tentar de novo', color: 'error', variant: 'solid', onClick: () => flow.submit() }]"
        />

        <div
          v-else-if="phase === 'creating'"
          class="mt-4 flex flex-col items-center gap-3"
        >
          <USkeleton class="size-[220px] rounded-lg" />
          <USkeleton class="h-10 w-full" />
        </div>

        <div
          v-else-if="charge && phase !== 'paid'"
          class="mt-4 flex flex-col items-center"
        >
          <PrototypePaymentQrCode
            :value="charge.copiaECola"
            :size="220"
            :faded="looksExpired"
          />

          <template v-if="!looksExpired">
            <p class="mt-4 text-sm text-muted">
              Escaneie no app do seu banco, ou copie o código:
            </p>
            <UFieldGroup class="mt-2 w-full">
              <UInput
                :model-value="charge.copiaECola"
                readonly
                class="flex-1"
                :ui="{ base: 'font-mono text-xs' }"
              />
              <UButton
                :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                :color="copied ? 'success' : 'neutral'"
                variant="subtle"
                :aria-label="copied ? 'Copiado' : 'Copiar código'"
                @click="copy"
              />
            </UFieldGroup>
            <p
              v-if="copied"
              class="mt-1 self-start text-xs text-success"
            >
              Código copiado
            </p>
            <UProgress
              class="mt-5"
              size="sm"
              :model-value="msLeft"
              :max="CHARGE_TTL_MS"
            />
            <p class="mt-2 self-start text-sm text-muted">
              Válido até {{ clockTime(charge.expiresAt) }}
            </p>
          </template>

          <template v-else>
            <p class="mt-4 font-medium text-highlighted">
              {{ phase === 'cancelled' ? 'Este Pix foi cancelado pelo banco.' : `Este Pix expirou às ${clockTime(charge.expiresAt)}.` }}
            </p>
            <UButton
              class="mt-4"
              block
              size="lg"
              :label="`Gerar novo Pix de ${brl(charge.amountCents)}`"
              @click="flow.newChargeSameAmount()"
            />
          </template>
        </div>

        <p
          v-else-if="phase === 'paid'"
          class="mt-2 text-sm text-muted"
        >
          Pago com Pix.
        </p>
      </section>

      <!-- Step 3 -->
      <section
        class="rounded-xl bg-default p-4"
        :class="!hasCharge && 'opacity-50'"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex size-7 items-center justify-center rounded-full text-sm font-bold"
            :class="phase === 'paid' ? 'bg-success text-inverted' : 'bg-accented text-muted'"
          >
            <UIcon
              v-if="phase === 'paid'"
              name="i-lucide-check"
            />
            <template v-else>3</template>
          </span>
          <h2 class="font-semibold text-highlighted">
            Confirmação
          </h2>
        </div>

        <div
          v-if="phase === 'pending'"
          class="mt-3 flex items-start gap-3 text-sm text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="mt-0.5 size-5 shrink-0 animate-spin text-primary"
          />
          <p>
            Assim que o pagamento cair, esta etapa confirma sozinha. Pode deixar esta página aberta.
            <span
              v-if="pollFailing"
              class="block text-warning"
            >Sem conexão. Tentando de novo…</span>
          </p>
        </div>

        <div
          v-else-if="phase === 'paid' && charge"
          class="mt-4 flex flex-col items-center py-4 text-center"
        >
          <UIcon
            name="i-lucide-party-popper"
            class="size-14 text-success"
          />
          <p class="mt-3 text-xl font-bold text-highlighted">
            Pagamento recebido. Obrigado!
          </p>
          <p class="mt-1 text-muted">
            Sua doação de {{ brl(charge.amountCents) }} chegou.
          </p>
          <UButton
            class="mt-6"
            variant="outline"
            color="neutral"
            label="Fazer outra doação"
            @click="flow.startOver()"
          />
        </div>
      </section>
    </div>
  </div>
</template>
