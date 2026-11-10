<!--
  PROTOTYPE — throwaway, branch `prototype/payment-page`. Never merge.
  Three variants of the Payer's payment page, switchable via ?variant=A|B|C, on a fake Provider:
  https://github.com/dbarjs/juntospelogedielson/issues/14
-->
<script setup lang="ts">
import VariantA from '~/components/prototype/payment/VariantA.vue'
import VariantB from '~/components/prototype/payment/VariantB.vue'
import VariantC from '~/components/prototype/payment/VariantC.vue'
import { useFakeServer } from '~/composables/usePrototypePayment'

const variants = [
  { key: 'A', name: 'Uma tela por vez', component: VariantA },
  { key: 'B', name: 'Página única com etapas', component: VariantB },
  { key: 'C', name: 'Teclado na tela + folha', component: VariantC }
]

const route = useRoute()
const current = computed(() => variants.find(v => v.key === route.query.variant) ?? variants[0]!)
const server = useFakeServer()
const controlsOpen = ref(false)

useHead({ title: () => `Protótipo ${current.value.key} · página de pagamento`, htmlAttrs: { lang: 'pt-BR' } })
</script>

<template>
  <div class="flex min-h-dvh items-start justify-center gap-10 bg-muted lg:p-8 lg:pb-20">
    <!-- The phone. The transform makes it the containing block for fixed children (the drawer). -->
    <div class="relative h-dvh w-full [transform:translateZ(0)] overflow-hidden bg-default lg:h-[800px] lg:w-[390px] lg:shrink-0 lg:rounded-[2.75rem] lg:border-[10px] lg:border-inverted lg:shadow-2xl">
      <div
        id="phone-screen"
        class="h-full overflow-y-auto"
      >
        <component
          :is="current.component"
          :key="current.key"
        />
      </div>

      <div
        v-if="server.state.payerInBankApp"
        class="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-inverted/90 p-8 text-center text-inverted"
      >
        <UIcon
          name="i-lucide-landmark"
          class="size-12"
        />
        <p class="font-semibold">
          O Pagador está no app do banco.
        </p>
        <p class="text-sm opacity-80">
          A página está oculta, então não consulta nada.
        </p>
        <UButton
          color="neutral"
          variant="solid"
          label="Voltar para a página"
          @click="server.state.payerInBankApp = false"
        />
      </div>
    </div>

    <aside class="hidden max-h-[800px] w-[360px] shrink-0 overflow-y-auto rounded-xl bg-default p-5 shadow-sm lg:block">
      <PrototypePaymentControls />
    </aside>

    <USlideover
      v-model:open="controlsOpen"
      title="Controles do protótipo"
      side="right"
      class="lg:hidden"
    >
      <template #body>
        <PrototypePaymentControls />
      </template>
    </USlideover>

    <PrototypeSwitcher :variants="variants">
      <button
        class="flex size-8 items-center justify-center rounded-full hover:bg-white/15 lg:hidden"
        aria-label="Controles"
        @click="controlsOpen = true"
      >
        <UIcon
          name="i-lucide-sliders-horizontal"
          class="size-5"
        />
      </button>
    </PrototypeSwitcher>
  </div>
</template>
