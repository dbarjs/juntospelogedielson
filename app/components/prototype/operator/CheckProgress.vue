<!-- PROTOTYPE — throwaway. The Bank Account check: token, then probe Charge. -->
<script setup lang="ts">
import type { CheckStepState } from '~/composables/usePrototypeOperator'

defineProps<{ steps: { token: CheckStepState, probe: CheckStepState, error: string | null } }>()

const icon = (s: CheckStepState) => ({
  idle: 'i-lucide-circle',
  running: 'i-lucide-loader-circle',
  done: 'i-lucide-circle-check',
  failed: 'i-lucide-circle-x'
})[s]
const tone = (s: CheckStepState) => ({
  idle: 'text-dimmed',
  running: 'text-primary animate-spin',
  done: 'text-success',
  failed: 'text-error'
})[s]
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-start gap-2 text-sm">
      <UIcon
        :name="icon(steps.token)"
        :class="tone(steps.token)"
        class="mt-0.5 size-4 shrink-0"
      />
      <div>
        <p class="font-medium">
          Pedir um token ao banco
        </p>
        <p class="text-xs text-muted">
          Confere credenciais, certificado e escopos.
        </p>
      </div>
    </div>
    <div class="flex items-start gap-2 text-sm">
      <UIcon
        :name="icon(steps.probe)"
        :class="tone(steps.probe)"
        class="mt-0.5 size-4 shrink-0"
      />
      <div>
        <p class="font-medium">
          Criar uma cobrança de teste de R$ 1,00
        </p>
        <p class="text-xs text-muted">
          Confere que a chave Pix é desta conta. Vence em 60 s e não aparece em Cobranças.
        </p>
      </div>
    </div>
    <UAlert
      v-if="steps.error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-x"
      title="Nada foi salvo"
      :description="steps.error"
    />
  </div>
</template>
