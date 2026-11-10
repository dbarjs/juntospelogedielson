<!-- PROTOTYPE — throwaway. Variant A: warnings as a strip under the navbar on every page. -->
<script setup lang="ts">
const route = useRoute()
const { warnings } = usePrototypeOperator()
</script>

<template>
  <div
    v-if="warnings.length"
    class="space-y-2 border-b border-default p-3"
  >
    <UAlert
      v-for="w in warnings"
      :key="w.kind"
      :color="w.kind === 'failure' ? 'error' : 'warning'"
      variant="subtle"
      :icon="w.kind === 'failure' ? 'i-lucide-octagon-alert' : 'i-lucide-shield-alert'"
      :title="w.title"
      :description="w.description"
      orientation="horizontal"
      :actions="[{ label: 'Abrir conta', color: 'neutral', variant: 'outline', to: { path: '/prototype/operator/bank-accounts', query: route.query } }]"
    />
  </div>
</template>
