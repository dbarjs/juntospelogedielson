<!-- PROTOTYPE — throwaway. -->
<script setup lang="ts">
import type { Charge } from '~/composables/usePrototypeOperator'

const props = defineProps<{ charge: Charge, size?: 'sm' | 'md' | 'lg' }>()
const s = computed(() => STATUS[props.charge.status])
const overdue = computed(() => props.charge.status === 'pending' && props.charge.expiresAt.getTime() < Date.now())
</script>

<template>
  <UTooltip
    :text="overdue ? 'Passou da hora; aguardando o banco confirmar que não foi paga' : undefined"
    :disabled="!overdue"
  >
    <UBadge
      :color="s.color"
      :icon="overdue ? 'i-lucide-circle-help' : s.icon"
      :label="overdue ? 'Pendente (vencida)' : s.label"
      variant="subtle"
      :size="size ?? 'md'"
    />
  </UTooltip>
</template>
