<!-- PROTOTYPE — throwaway. Variant B Bank Accounts: one card per account with a certificate countdown;
     registration is a full-page step-by-step flow; confirmations are bottom sheets. -->
<script setup lang="ts">
import type { BankAccount, CheckStepState, ProviderId } from '~/composables/usePrototypeOperator'

const { accounts, pendingCount, lastPendingExpiry, makeDefault, removeAccount, rename, runCheck, register, replaceCredentials } = usePrototypeOperator()
const toast = useToast()

const sorted = computed(() => [...accounts.value].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)))

// ----- step-by-step flow (register, or replace credentials starting at step 3) -----
const flow = ref<null | { editing: BankAccount | null }>(null)
const step = ref(0)
const form = reactive({ name: '', provider: 'inter' as ProviderId, pixKey: '' })
const steps = reactive({ token: 'idle' as CheckStepState, probe: 'idle' as CheckStepState, error: null as string | null })
const stepperItems = computed(() => flow.value?.editing
  ? [{ title: 'Credenciais', icon: 'i-lucide-key-round' }, { title: 'Verificação', icon: 'i-lucide-shield-check' }]
  : [{ title: 'Banco', icon: 'i-lucide-landmark' }, { title: 'Conta', icon: 'i-lucide-at-sign' }, { title: 'Credenciais', icon: 'i-lucide-key-round' }, { title: 'Verificação', icon: 'i-lucide-shield-check' }])
const lastStep = computed(() => stepperItems.value.length - 1)
const provider = computed(() => flow.value?.editing?.provider ?? form.provider)

function startFlow(editing: BankAccount | null) {
  flow.value = { editing }
  step.value = 0
  Object.assign(form, { name: '', provider: editing?.provider ?? 'inter', pixKey: '' })
  Object.assign(steps, { token: 'idle', probe: 'idle', error: null })
}
async function next() {
  step.value++
  if (step.value === lastStep.value) await check()
}
async function check() {
  const ok = await runCheck(steps, provider.value)
  if (!ok) return
  const editing = flow.value!.editing
  if (editing) replaceCredentials(editing.id)
  else register(form)
}
function finish() {
  toast.add({ title: flow.value?.editing ? 'Credenciais trocadas' : 'Conta cadastrada', color: 'success' })
  flow.value = null
}

// ----- bottom sheets -----
const sheet = ref<null | { kind: 'default' | 'remove' | 'rename', account: BankAccount }>(null)
const sheetOpen = computed({
  get: () => !!sheet.value,
  set: (v) => {
    if (!v) sheet.value = null
  }
})
const defaultSteps = reactive({ token: 'idle' as CheckStepState, probe: 'idle' as CheckStepState, error: null as string | null })
const newName = ref('')
function openSheet(kind: 'default' | 'remove' | 'rename', account: BankAccount) {
  Object.assign(defaultSteps, { token: 'idle', probe: 'idle', error: null })
  newName.value = account.name
  sheet.value = { kind, account }
}
async function confirmDefault() {
  const a = sheet.value!.account
  if (await runCheck(defaultSteps, a.provider)) {
    makeDefault(a.id)
    sheet.value = null
    toast.add({ title: `${a.name} é a Conta padrão`, color: 'success' })
  }
}

function certProgress(a: BankAccount) {
  return Math.max(0, Math.min(100, (daysUntil(a.certExpiresAt) / 365) * 100))
}
</script>

<template>
  <!-- Full-page flow -->
  <div
    v-if="flow"
    class="space-y-6"
  >
    <div class="flex items-center gap-2">
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Cancelar"
        @click="flow = null"
      />
      <h2 class="font-semibold">
        {{ flow.editing ? `Trocar credenciais · ${flow.editing.name}` : 'Cadastrar conta bancária' }}
      </h2>
    </div>
    <UStepper
      v-model="step"
      :items="stepperItems"
      size="sm"
      disabled
    />

    <div class="rounded-2xl bg-default p-4 ring ring-default">
      <template v-if="!flow.editing && step === 0">
        <p class="mb-3 text-sm text-muted">
          Em qual banco está a conta?
        </p>
        <div class="grid gap-3">
          <button
            v-for="p in (['inter', 'efi'] as ProviderId[])"
            :key="p"
            class="flex items-center gap-3 rounded-xl p-4 text-left ring"
            :class="form.provider === p ? 'bg-primary/10 ring-primary' : 'ring-default'"
            @click="form.provider = p"
          >
            <UIcon
              :name="PROVIDERS[p].icon"
              class="size-7 text-primary"
            />
            <span><b class="block">{{ PROVIDERS[p].label }}</b><span class="text-xs text-muted">Client ID, Client Secret e {{ PROVIDERS[p].certFiles }}</span></span>
          </button>
        </div>
      </template>
      <div
        v-else-if="!flow.editing && step === 1"
        class="space-y-4"
      >
        <UFormField
          label="Nome"
          description="Como a conta aparece nas páginas."
        >
          <UInput
            v-model="form.name"
            placeholder="Inter PJ"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UFormField
          label="Chave Pix"
          description="Não pode ser trocada depois."
        >
          <UInput
            v-model="form.pixKey"
            placeholder="CNPJ, e-mail, telefone ou aleatória"
            class="w-full"
            size="lg"
          />
        </UFormField>
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          description="Prefira uma chave que nenhum outro sistema use."
        />
      </div>
      <template v-else-if="step === lastStep">
        <PrototypeOperatorCheckProgress :steps="steps" />
      </template>
      <template v-else>
        <p
          v-if="flow.editing"
          class="mb-4 text-sm text-muted"
        >
          {{ PROVIDERS[flow.editing.provider].label }} · chave {{ flow.editing.pixKey }}. Os três itens são trocados juntos.
        </p>
        <PrototypeOperatorProviderFields :provider="provider" />
      </template>
    </div>

    <div class="flex gap-2">
      <UButton
        v-if="step > 0 && step < lastStep"
        label="Voltar"
        color="neutral"
        variant="outline"
        size="lg"
        @click="step--"
      />
      <UButton
        v-if="step < lastStep - 1"
        label="Continuar"
        size="lg"
        class="flex-1 justify-center"
        @click="step++"
      />
      <UButton
        v-else-if="step === lastStep - 1"
        label="Verificar"
        icon="i-lucide-shield-check"
        size="lg"
        class="flex-1 justify-center"
        @click="next"
      />
      <template v-else>
        <UButton
          v-if="steps.error"
          label="Corrigir credenciais"
          color="neutral"
          variant="outline"
          size="lg"
          class="flex-1 justify-center"
          @click="step--"
        />
        <UButton
          v-if="steps.probe === 'done'"
          label="Concluir"
          icon="i-lucide-check"
          size="lg"
          class="flex-1 justify-center"
          @click="finish"
        />
      </template>
    </div>
  </div>

  <!-- Card stack -->
  <div
    v-else
    class="space-y-3"
  >
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">
        Contas bancárias
      </h2>
      <UButton
        icon="i-lucide-plus"
        label="Cadastrar"
        size="sm"
        @click="startFlow(null)"
      />
    </div>

    <div
      v-if="!sorted.length"
      class="rounded-2xl bg-default p-8 text-center ring ring-default"
    >
      <UIcon
        name="i-lucide-landmark"
        class="size-10 text-primary"
      />
      <p class="mt-3 font-medium">
        Cadastre a conta que vai receber as doações
      </p>
      <p class="mt-1 text-sm text-muted">
        A primeira conta vira a Conta padrão. Até lá, a página de doação não cria cobranças.
      </p>
      <UButton
        class="mt-4"
        size="lg"
        label="Cadastrar conta"
        @click="startFlow(null)"
      />
    </div>

    <article
      v-for="a in sorted"
      :key="a.id"
      class="rounded-2xl bg-default p-4 ring"
      :class="a.isDefault ? 'ring-2 ring-primary' : 'ring-default'"
    >
      <div class="flex items-start gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated"><UIcon
          :name="PROVIDERS[a.provider].icon"
          class="size-6"
        /></span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold">
              {{ a.name }}
            </h3>
            <UBadge
              v-if="a.isDefault"
              label="Padrão"
              size="sm"
            />
          </div>
          <p class="truncate text-xs text-muted">
            {{ PROVIDERS[a.provider].label }} · {{ a.pixKey }}
          </p>
        </div>
        <UDropdownMenu
          :items="[[{ label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => openSheet('rename', a) }], [{ label: 'Remover', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openSheet('remove', a) }]]"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            aria-label="Mais"
          />
        </UDropdownMenu>
      </div>

      <p
        v-if="a.isDefault"
        class="mt-3 text-xs text-primary"
      >
        Recebe as novas doações.
      </p>

      <div class="mt-3 space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-muted">Certificado</span>
          <span :class="daysUntil(a.certExpiresAt) <= 30 ? 'font-semibold text-warning' : ''">vence em {{ daysUntil(a.certExpiresAt) }} dias · {{ fmtDate(a.certExpiresAt) }}</span>
        </div>
        <UProgress
          :model-value="certProgress(a)"
          size="xs"
          :color="daysUntil(a.certExpiresAt) <= 30 ? 'warning' : 'primary'"
        />
      </div>
      <div class="mt-2 flex justify-between text-xs text-muted">
        <span>{{ pendingCount(a.id) }} pendente(s)</span>
        <span>verificada {{ a.lastCheckedAt ? fmtRelative(a.lastCheckedAt) : 'nunca' }}</span>
      </div>
      <p
        v-if="a.lastCreationFailure"
        class="mt-2 rounded-lg bg-error/10 p-2 text-xs text-error"
      >
        {{ a.lastCreationFailure.reason }}
      </p>

      <div class="mt-4 flex gap-2">
        <UButton
          v-if="!a.isDefault"
          label="Tornar padrão"
          icon="i-lucide-star"
          color="neutral"
          variant="outline"
          size="sm"
          @click="openSheet('default', a)"
        />
        <UButton
          label="Trocar credenciais"
          icon="i-lucide-key-round"
          color="neutral"
          variant="outline"
          size="sm"
          @click="startFlow(a)"
        />
      </div>
    </article>
  </div>

  <UDrawer
    v-model:open="sheetOpen"
    :title="sheet?.kind === 'default' ? `Tornar ${sheet.account.name} a Conta padrão?` : sheet?.kind === 'remove' ? `Remover ${sheet?.account.name}?` : 'Renomear'"
  >
    <template #body>
      <div
        v-if="sheet"
        class="space-y-4 pb-4 text-sm"
      >
        <template v-if="sheet.kind === 'default'">
          <p>Novas cobranças passam a ser criadas nela. As pendentes nas outras contas continuam valendo até vencer.</p>
          <PrototypeOperatorCheckProgress
            v-if="defaultSteps.token !== 'idle'"
            :steps="defaultSteps"
          />
          <UButton
            block
            size="lg"
            label="Verificar e tornar padrão"
            :loading="defaultSteps.token === 'running' || defaultSteps.probe === 'running'"
            @click="confirmDefault"
          />
        </template>
        <template v-else-if="sheet.kind === 'remove'">
          <template v-if="sheet.account.isDefault">
            <p>Esta é a Conta padrão. Torne outra conta padrão antes de removê-la.</p>
          </template>
          <template v-else>
            <p>Credenciais e certificado são apagados; as cobranças da conta continuam em Cobranças. Não dá para desfazer.</p>
            <p
              v-if="pendingCount(sheet.account.id)"
              class="rounded-lg bg-warning/10 p-3 text-warning"
            >
              {{ pendingCount(sheet.account.id) }} cobrança(s) ainda podem ser pagas. Libera às {{ fmtTime(lastPendingExpiry(sheet.account.id)!) }}.
            </p>
            <UButton
              block
              size="lg"
              color="error"
              label="Remover conta"
              :disabled="pendingCount(sheet.account.id) > 0"
              @click="removeAccount(sheet.account.id); sheet = null"
            />
          </template>
        </template>
        <template v-else>
          <UInput
            v-model="newName"
            size="lg"
            class="w-full"
          />
          <UButton
            block
            size="lg"
            label="Salvar"
            @click="rename(sheet.account.id, newName); sheet = null"
          />
        </template>
      </div>
    </template>
  </UDrawer>
</template>
