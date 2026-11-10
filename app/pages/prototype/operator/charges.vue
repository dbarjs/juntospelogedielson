<!-- PROTOTYPE — throwaway. Three variants of the Operator's Charges page, switchable via ?variant=A|B|C
     (scenario via ?scenario=). Run `pnpm prototype` and open /prototype/operator/charges. -->
<script setup lang="ts">
const route = useRoute()
const variant = computed(() => (route.query.variant as string) || 'A')
usePrototypeOperator()
</script>

<template>
  <div>
    <PrototypeOperatorAShell
      v-if="variant === 'A'"
      page="charges"
    />
    <PrototypeOperatorBShell
      v-else-if="variant === 'B'"
      page="charges"
    />
    <PrototypeOperatorCShell
      v-else
      page="charges"
    />
    <PrototypeSwitcher :variants="PROTOTYPE_OPERATOR_VARIANTS" />
  </div>
</template>
