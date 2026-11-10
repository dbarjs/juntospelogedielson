<!-- PROTOTYPE — throwaway. Variant C Bank Accounts: account list + a settings-style detail pane
     (overview, certificate with inline credential replacement, Default Account, danger zone).
     Registration in a modal with a tab per Provider. -->
<script setup lang="ts">
import type { BankAccount, CheckStepState, ProviderId } from '~/composables/usePrototypeOperator'

const { accounts, pendingCount, lastPendingExpiry, makeDefault, removeAccount, rename, runCheck, register, replaceCredentials } = usePrototypeOperator()
const toast = useToast()

const selectedId = ref<string | null>(null)
const selected = computed(() => accounts.value.find(a => a.id === selectedId.value) ?? null)
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches
watchEffect(() => {
  if (!selected.value && accounts.value[0] && isDesktop()) selectedId.value = accounts.value.find(a => a.isDefault)?.id ?? accounts.value[0].id
})

const nameDraft = ref('')
watch(selected, a => (nameDraft.value = a?.name ?? ''), { immediate: true })

const mkSteps = () => reactive({ token: 'idle' as CheckStepState, probe: 'idle' as CheckStepState, error: null as string | null })

// ----- replace credentials inline -----
const replacing = ref(false)
const replaceSteps = mkSteps()
async function doReplace(a: BankAccount) {
  if (await runCheck(replaceSteps, a.provider)) {
    replaceCredentials(a.id)
    replacing.value = false
    Object.assign(replaceSteps, { token: 'idle', probe: 'idle', error: null })
    toast.add({ title: 'Credenciais trocadas', color: 'success' })
  }
}

// ----- make default inline -----
const defaultSteps = mkSteps()
async function doDefault(a: BankAccount) {
  if (await runCheck(defaultSteps, a.provider)) {
    makeDefault(a.id)
    Object.assign(defaultSteps, { token: 'idle', probe: 'idle', error: null })
    toast.add({ title: `${a.name} é a Conta padrão`, color: 'success' })
  }
}

// ----- remove: type the name to confirm -----
const confirmName = ref('')
function doRemove(a: BankAccount) {
  removeAccount(a.id)
  selectedId.value = null
  confirmName.value = ''
}

// ----- register modal -----
const modalOpen = ref(false)
const tab = ref<ProviderId>('inter')
const form = reactive({ name: '', pixKey: '' })
const regSteps = mkSteps()
const checking = ref(false)
function openModal() {
  Object.assign(form, { name: '', pixKey: '' })
  Object.assign(regSteps, { token: 'idle', probe: 'idle', error: null })
  modalOpen.value = true
}
async function doRegister() {
  checking.value = true
  const ok = await runCheck(regSteps, tab.value)
  checking.value = false
  if (!ok) return
  const a = register({ ...form, provider: tab.value })
  modalOpen.value = false
  selectedId.value = a.id
}
</script>

<template>
  <section
    class="w-full border-default lg:w-80 lg:shrink-0 lg:border-r"
    :class="selected ? 'hidden lg:block' : ''"
  >
    <div class="flex items-center justify-between border-b border-default p-3">
      <h2 class="text-sm font-semibold">
        Contas bancárias
      </h2>
      <UButton
        icon="i-lucide-plus"
        label="Nova"
        size="sm"
        @click="openModal"
      />
    </div>
    <ul class="divide-y divide-default">
      <li
        v-for="a in accounts"
        :key="a.id"
      >
        <button
          class="flex w-full items-center gap-3 p-3 text-left hover:bg-elevated/50"
          :class="selectedId === a.id ? 'bg-elevated' : ''"
          @click="selectedId = a.id"
        >
          <UIcon
            :name="PROVIDERS[a.provider].icon"
            class="size-5 text-muted"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2 text-sm font-medium">{{ a.name }}<UBadge
              v-if="a.isDefault"
              label="Padrão"
              size="sm"
              variant="subtle"
            /></span>
            <span class="block truncate text-xs text-muted">{{ a.pixKey }}</span>
          </span>
          <UIcon
            v-if="daysUntil(a.certExpiresAt) <= 30 || a.lastCreationFailure"
            name="i-lucide-triangle-alert"
            class="size-4 text-warning"
          />
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 text-dimmed lg:hidden"
          />
        </button>
      </li>
      <li
        v-if="!accounts.length"
        class="p-6 text-center text-sm text-muted"
      >
        Nenhuma conta. A primeira vira a Conta padrão.
      </li>
    </ul>
  </section>

  <section
    v-if="selected"
    class="min-w-0 flex-1 overflow-y-auto p-4 pb-24 lg:p-8"
  >
    <div class="mx-auto max-w-2xl space-y-8">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          class="lg:hidden"
          aria-label="Voltar"
          @click="selectedId = null"
        />
        <h1 class="text-xl font-semibold">
          {{ selected.name }}
        </h1>
        <UBadge
          v-if="selected.isDefault"
          label="Conta padrão"
        />
      </div>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold">
          Visão geral
        </h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Nome">
            <UFieldGroup class="w-full">
              <UInput
                v-model="nameDraft"
                class="w-full"
              />
              <UButton
                label="Salvar"
                color="neutral"
                variant="outline"
                :disabled="nameDraft === selected.name"
                @click="rename(selected.id, nameDraft)"
              />
            </UFieldGroup>
          </UFormField>
          <UFormField label="Banco">
            <p class="py-1.5 text-sm">
              {{ PROVIDERS[selected.provider].label }}
            </p>
          </UFormField>
          <UFormField
            label="Chave Pix"
            hint="fixa"
          >
            <p class="py-1.5 font-mono text-sm">
              {{ selected.pixKey }}
            </p>
          </UFormField>
          <UFormField label="Última consulta ao banco">
            <p class="py-1.5 text-sm">
              {{ selected.lastCheckedAt ? fmtRelative(selected.lastCheckedAt) : 'nunca' }}
            </p>
          </UFormField>
        </div>
        <UAlert
          v-if="selected.lastCreationFailure"
          color="error"
          variant="subtle"
          icon="i-lucide-octagon-alert"
          :title="`Falha ao criar cobrança ${fmtRelative(selected.lastCreationFailure.at)}`"
          :description="selected.lastCreationFailure.reason"
        />
      </section>

      <USeparator />

      <section class="space-y-3">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-sm font-semibold">
              Certificado e credenciais
            </h3>
            <p
              class="text-sm"
              :class="daysUntil(selected.certExpiresAt) <= 30 ? 'font-medium text-warning' : 'text-muted'"
            >
              Vence em {{ fmtDate(selected.certExpiresAt) }} ({{ daysUntil(selected.certExpiresAt) }} dias). Anote no calendário: o app só avisa aqui.
            </p>
          </div>
          <UButton
            v-if="!replacing"
            label="Trocar"
            color="neutral"
            variant="outline"
            @click="replacing = true"
          />
        </div>
        <UCard v-if="replacing">
          <PrototypeOperatorProviderFields :provider="selected.provider" />
          <PrototypeOperatorCheckProgress
            v-if="replaceSteps.token !== 'idle'"
            :steps="replaceSteps"
            class="mt-4"
          />
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                label="Cancelar"
                color="neutral"
                variant="ghost"
                @click="replacing = false"
              />
              <UButton
                label="Verificar e trocar"
                icon="i-lucide-shield-check"
                :loading="replaceSteps.token === 'running' || replaceSteps.probe === 'running'"
                @click="doReplace(selected)"
              />
            </div>
          </template>
        </UCard>
      </section>

      <USeparator />

      <section class="space-y-3">
        <h3 class="text-sm font-semibold">
          Conta padrão
        </h3>
        <p
          v-if="selected.isDefault"
          class="text-sm text-muted"
        >
          Novas cobranças são criadas nesta conta.
        </p>
        <template v-else>
          <div class="flex items-start justify-between gap-4">
            <p class="text-sm text-muted">
              Passa a receber as novas cobranças. As pendentes em outras contas continuam valendo até vencer.
            </p>
            <UButton
              label="Tornar padrão"
              icon="i-lucide-star"
              :loading="defaultSteps.token === 'running' || defaultSteps.probe === 'running'"
              @click="doDefault(selected)"
            />
          </div>
          <PrototypeOperatorCheckProgress
            v-if="defaultSteps.token !== 'idle'"
            :steps="defaultSteps"
          />
        </template>
      </section>

      <USeparator />

      <section class="space-y-3 rounded-lg border border-error/40 p-4">
        <h3 class="text-sm font-semibold text-error">
          Remover conta
        </h3>
        <p
          v-if="selected.isDefault"
          class="text-sm text-muted"
        >
          A Conta padrão não pode ser removida. Torne outra conta padrão primeiro.
        </p>
        <template v-else>
          <p class="text-sm text-muted">
            Apaga as credenciais e o certificado. As cobranças continuam em Cobranças com o nome da conta. Não dá para desfazer.
          </p>
          <p
            v-if="pendingCount(selected.id)"
            class="text-sm text-warning"
          >
            Aguardando {{ pendingCount(selected.id) }} cobrança(s) pendente(s), até {{ fmtTime(lastPendingExpiry(selected.id)!) }}.
          </p>
          <UFieldGroup
            v-else
            class="w-full"
          >
            <UInput
              v-model="confirmName"
              :placeholder="`Digite ${selected.name} para confirmar`"
              class="w-full"
            />
            <UButton
              label="Remover"
              color="error"
              :disabled="confirmName !== selected.name"
              @click="doRemove(selected)"
            />
          </UFieldGroup>
        </template>
      </section>
    </div>
  </section>
  <section
    v-else
    class="hidden flex-1 items-center justify-center text-sm text-muted lg:flex"
  >
    Escolha uma conta.
  </section>

  <UModal
    v-model:open="modalOpen"
    title="Nova conta bancária"
    :dismissible="!checking"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <UTabs
          v-model="tab"
          :items="[{ label: 'Inter Empresas', value: 'inter', icon: PROVIDERS.inter.icon }, { label: 'Efí Bank', value: 'efi', icon: PROVIDERS.efi.icon }]"
          :content="false"
          class="w-full"
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Nome"
            required
          >
            <UInput
              v-model="form.name"
              placeholder="Inter PJ"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Chave Pix"
            required
            hint="não muda depois"
          >
            <UInput
              v-model="form.pixKey"
              placeholder="CNPJ, e-mail, telefone…"
              class="w-full"
            />
          </UFormField>
        </div>
        <PrototypeOperatorProviderFields
          :key="tab"
          :provider="tab"
        />
        <PrototypeOperatorCheckProgress
          v-if="regSteps.token !== 'idle'"
          :steps="regSteps"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="ghost"
          :disabled="checking"
          @click="modalOpen = false"
        />
        <UButton
          label="Verificar e salvar"
          icon="i-lucide-shield-check"
          :loading="checking"
          @click="doRegister"
        />
      </div>
    </template>
  </UModal>
</template>
