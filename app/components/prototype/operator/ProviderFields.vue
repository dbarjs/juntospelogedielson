<!-- PROTOTYPE — throwaway. The credentials a Provider needs; values are never sent anywhere. -->
<script setup lang="ts">
import type { ProviderId } from '~/composables/usePrototypeOperator'

defineProps<{ provider: ProviderId }>()
const clientId = ref('')
const clientSecret = ref('')
const p12 = ref<File | null>(null)
const crt = ref<File | null>(null)
const key = ref<File | null>(null)
</script>

<template>
  <div class="space-y-4">
    <UFormField
      label="Client ID"
      required
    >
      <UInput
        v-model="clientId"
        class="w-full"
        placeholder="Client_Id_…"
      />
    </UFormField>
    <UFormField
      label="Client Secret"
      required
    >
      <UInput
        v-model="clientSecret"
        class="w-full"
        type="password"
        placeholder="••••••••"
      />
    </UFormField>
    <UFormField
      v-if="provider === 'efi'"
      label="Certificado (.p12)"
      required
      hint="Sem senha"
      description="Gerado na área de API da conta Efí."
    >
      <UFileUpload
        v-model="p12"
        accept=".p12"
        label="Solte o .p12 aqui"
        icon="i-lucide-file-key"
        class="min-h-24 w-full"
      />
    </UFormField>
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Certificado (.crt)"
          required
        >
          <UFileUpload
            v-model="crt"
            accept=".crt"
            label=".crt"
            icon="i-lucide-file-badge"
            class="min-h-24 w-full"
          />
        </UFormField>
        <UFormField
          label="Chave (.key)"
          required
        >
          <UFileUpload
            v-model="key"
            accept=".key"
            label=".key"
            icon="i-lucide-file-key"
            class="min-h-24 w-full"
          />
        </UFormField>
      </div>
      <p class="text-xs text-muted">
        Baixados ao criar a integração no Internet Banking do Inter Empresas.
      </p>
    </template>
  </div>
</template>
