<!-- PROTOTYPE — throwaway. Campaign name and the one line of text; real wording is supplied at build time. -->
<script setup lang="ts">
defineProps<{ compact?: boolean, center?: boolean }>()
</script>

<template>
  <div :class="center && 'text-center'">
    <h1
      class="font-bold text-highlighted"
      :class="compact ? 'text-base' : 'text-2xl'"
    >
      Juntos pelo Gedielson
    </h1>
    <p
      v-if="!compact"
      class="mt-1 text-muted"
    >
      Qualquer valor ajuda. Doe pelo Pix. <span class="text-dimmed">(texto provisório)</span>
    </p>
  </div>
</template>
