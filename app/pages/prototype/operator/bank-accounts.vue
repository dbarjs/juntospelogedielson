<!-- PROTOTYPE — throwaway. Three variants of the Operator's Bank Accounts page, switchable via ?variant=A|B|C
     (scenario via ?scenario=). Run `pnpm prototype` and open /prototype/operator/bank-accounts. -->
<script setup lang="ts">
const route = useRoute()
const variant = computed(() => (route.query.variant as string) || 'A')
usePrototypeOperator()
</script>

<template>
  <div>
    <PrototypeOperatorAShell
      v-if="variant === 'A'"
      page="bank-accounts"
    />
    <PrototypeOperatorBShell
      v-else-if="variant === 'B'"
      page="bank-accounts"
    />
    <PrototypeOperatorCShell
      v-else
      page="bank-accounts"
    />
    <PrototypeSwitcher :variants="PROTOTYPE_OPERATOR_VARIANTS" />
  </div>
</template>
