<!-- PROTOTYPE — throwaway. Variant A Bank Accounts: table + row actions menu; forms in a slideover; confirms in modals. -->
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { BankAccount, CheckStepState, ProviderId } from '~/composables/usePrototypeOperator'

const { accounts, pendingCount, lastPendingExpiry, makeDefault, removeAccount, rename, runCheck, register, replaceCredentials } = usePrototypeOperator()
const toast = useToast()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const columns: TableColumn<BankAccount>[] = [
  {
    accessorKey: 'name',
    header: 'Nome',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', { class: 'font-medium' }, row.original.name),
      row.original.isDefault ? h(UBadge, { label: 'Padrão', color: 'primary', variant: 'subtle', size: 'sm' }) : null
    ])
  },
  { id: 'provider', header: 'Banco', cell: ({ row }) => PROVIDERS[row.original.provider].label },
  { accessorKey: 'pixKey', header: 'Chave Pix', cell: ({ row }) => h('code', { class: 'font-mono text-xs' }, row.original.pixKey) },
  {
    id: 'cert',
    header: 'Certificado vence',
    cell: ({ row }) => {
      const d = daysUntil(row.original.certExpiresAt)
      return h('div', {}, [
        h('span', {}, fmtDate(row.original.certExpiresAt)),
        h('span', { class: ['block text-xs', d <= 30 ? 'text-warning font-medium' : 'text-muted'] }, `em ${d} dias`)
      ])
    }
  },
  { id: 'pending', header: 'Pendentes', cell: ({ row }) => String(pendingCount(row.original.id)) },
  {
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'text-right' }, h(UDropdownMenu, { items: actions(row.original), content: { align: 'end' } }, () =>
      h(UButton, { 'icon': 'i-lucide-ellipsis-vertical', 'color': 'neutral', 'variant': 'ghost', 'aria-label': 'Ações' })))
  }
]

function actions(a: BankAccount) {
  return [
    [
      { label: 'Tornar padrão', icon: 'i-lucide-star', disabled: a.isDefault, onSelect: () => openDefault(a) },
      { label: 'Trocar credenciais', icon: 'i-lucide-key-round', onSelect: () => openForm(a) },
      { label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => openRename(a) }
    ],
    [{ label: a.isDefault ? 'Remover (é a padrão)' : 'Remover', icon: 'i-lucide-trash-2', color: 'error' as const, disabled: a.isDefault, onSelect: () => (removing.value = a) }]
  ]
}

// ----- register / replace credentials (slideover) -----
const formOpen = ref(false)
const editing = ref<BankAccount | null>(null)
const form = reactive({ name: '', provider: 'inter' as ProviderId, pixKey: '' })
const steps = reactive({ token: 'idle' as CheckStepState, probe: 'idle' as CheckStepState, error: null as string | null })
const checking = ref(false)
const providerItems = [
  { label: 'Inter Empresas', value: 'inter', description: 'Client ID, Secret, .crt e .key' },
  { label: 'Efí Bank', value: 'efi', description: 'Client ID, Secret e .p12' }
]

function openForm(a: BankAccount | null) {
  editing.value = a
  Object.assign(form, { name: '', provider: a?.provider ?? 'inter', pixKey: '' })
  Object.assign(steps, { token: 'idle', probe: 'idle', error: null })
  formOpen.value = true
}

async function submit() {
  checking.value = true
  const ok = await runCheck(steps, editing.value?.provider ?? form.provider)
  checking.value = false
  if (!ok) return
  if (editing.value) {
    replaceCredentials(editing.value.id)
    toast.add({ title: 'Credenciais trocadas', description: `${editing.value.name}: certificado vence ${fmtDate(editing.value.certExpiresAt)}`, color: 'success' })
  } else {
    const a = register(form)
    toast.add({ title: 'Conta cadastrada', description: a.isDefault ? `${a.name} é a Conta padrão.` : a.name, color: 'success' })
  }
  formOpen.value = false
}

// ----- make default (modal, runs the check) -----
const defaulting = ref<BankAccount | null>(null)
const defaultSteps = reactive({ token: 'idle' as CheckStepState, probe: 'idle' as CheckStepState, error: null as string | null })
function openDefault(a: BankAccount) {
  defaulting.value = a
  Object.assign(defaultSteps, { token: 'idle', probe: 'idle', error: null })
}
async function confirmDefault() {
  const a = defaulting.value!
  if (await runCheck(defaultSteps, a.provider)) {
    makeDefault(a.id)
    toast.add({ title: `${a.name} é a Conta padrão`, description: 'Novas cobranças são criadas nela.', color: 'success' })
    defaulting.value = null
  }
}

// ----- rename -----
const renaming = ref<BankAccount | null>(null)
const newName = ref('')
function openRename(a: BankAccount) {
  renaming.value = a
  newName.value = a.name
}

// ----- remove -----
const removing = ref<BankAccount | null>(null)
</script>

<template>
  <UDashboardPanel id="a-bank-accounts">
    <template #header>
      <UDashboardNavbar title="Contas bancárias">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Nova conta"
            @click="openForm(null)"
          />
        </template>
      </UDashboardNavbar>
      <PrototypeOperatorAWarnings />
    </template>

    <template #body>
      <UTable
        :data="accounts"
        :columns="columns"
        class="rounded-lg border border-default"
      >
        <template #empty>
          <div class="py-10 text-center">
            <UIcon
              name="i-lucide-landmark"
              class="size-8 text-dimmed"
            />
            <p class="mt-2 text-sm text-muted">
              Nenhuma conta bancária. A primeira que você cadastrar vira a Conta padrão.
            </p>
            <UButton
              class="mt-4"
              icon="i-lucide-plus"
              label="Cadastrar conta"
              @click="openForm(null)"
            />
          </div>
        </template>
      </UTable>
      <p class="text-xs text-muted">
        Contas removidas somem desta lista; suas cobranças continuam em Cobranças com o nome da conta.
      </p>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="formOpen"
    :title="editing ? `Trocar credenciais · ${editing.name}` : 'Nova conta bancária'"
    :description="editing ? 'Client ID, Secret e certificado são trocados juntos e verificados de novo.' : 'Salva só depois de passar na verificação.'"
    :dismissible="!checking"
  >
    <template #body>
      <div class="space-y-5">
        <template v-if="!editing">
          <UFormField
            label="Banco"
            required
          >
            <URadioGroup
              v-model="form.provider"
              :items="providerItems"
              variant="card"
            />
          </UFormField>
          <UFormField
            label="Nome"
            description="Como a conta aparece nas páginas."
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
            description="Use uma chave que nenhum outro sistema use. Não pode ser trocada depois."
            required
          >
            <UInput
              v-model="form.pixKey"
              placeholder="CNPJ, e-mail, telefone ou chave aleatória"
              class="w-full"
            />
          </UFormField>
        </template>
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          :title="`${PROVIDERS[editing.provider].label} · chave ${editing.pixKey}`"
          description="Banco e chave Pix não mudam. Para outra chave, cadastre uma nova conta."
        />
        <PrototypeOperatorProviderFields :provider="editing?.provider ?? form.provider" />
        <USeparator
          v-if="steps.token !== 'idle'"
          label="Verificação"
        />
        <PrototypeOperatorCheckProgress
          v-if="steps.token !== 'idle'"
          :steps="steps"
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
          @click="formOpen = false"
        />
        <UButton
          :label="editing ? 'Verificar e trocar' : 'Verificar e salvar'"
          icon="i-lucide-shield-check"
          :loading="checking"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>

  <UModal
    :open="!!defaulting"
    :title="`Tornar ${defaulting?.name} a Conta padrão?`"
    @update:open="v => !v && (defaulting = null)"
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <p>Novas cobranças passam a ser criadas em <b>{{ defaulting?.name }}</b>. As pendentes nas outras contas continuam valendo até vencer.</p>
        <PrototypeOperatorCheckProgress
          v-if="defaultSteps.token !== 'idle'"
          :steps="defaultSteps"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="ghost"
          @click="defaulting = null"
        />
        <UButton
          label="Verificar e tornar padrão"
          icon="i-lucide-star"
          :loading="defaultSteps.token === 'running' || defaultSteps.probe === 'running'"
          @click="confirmDefault"
        />
      </div>
    </template>
  </UModal>

  <UModal
    :open="!!renaming"
    title="Renomear conta"
    @update:open="v => !v && (renaming = null)"
  >
    <template #body>
      <UInput
        v-model="newName"
        class="w-full"
        autofocus
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="ghost"
          @click="renaming = null"
        />
        <UButton
          label="Salvar"
          @click="rename(renaming!.id, newName); renaming = null"
        />
      </div>
    </template>
  </UModal>

  <UModal
    :open="!!removing"
    :title="`Remover ${removing?.name}?`"
    @update:open="v => !v && (removing = null)"
  >
    <template #body>
      <div
        v-if="removing"
        class="space-y-3 text-sm"
      >
        <UAlert
          v-if="pendingCount(removing.id)"
          color="warning"
          variant="subtle"
          icon="i-lucide-clock"
          :title="`Aguardando ${pendingCount(removing.id)} cobrança(s) pendente(s)`"
          :description="`A remoção fica disponível quando elas forem pagas ou vencerem, até ${fmtTime(lastPendingExpiry(removing.id)!)}.`"
        />
        <p>As credenciais e o certificado são apagados. A conta some desta lista, mas suas cobranças continuam em Cobranças com o nome dela.</p>
        <p class="text-muted">
          Não dá para desfazer: para usar a conta de novo, cadastre-a outra vez.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="ghost"
          @click="removing = null"
        />
        <UButton
          label="Remover"
          color="error"
          :disabled="!!removing && pendingCount(removing.id) > 0"
          @click="removeAccount(removing!.id); removing = null"
        />
      </div>
    </template>
  </UModal>
</template>
