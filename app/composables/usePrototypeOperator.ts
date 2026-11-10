// PROTOTYPE — throwaway. Fake, in-memory data for the Operator pages prototype
// (wayfinder ticket "How should the Operator pages look?"). Nothing here is
// production code: no persistence, no real Providers, no validation.

export type ChargeStatus = 'pending' | 'paid' | 'expired' | 'cancelled'
export type ProviderId = 'efi' | 'inter'

export interface BankAccount {
  id: string
  name: string
  provider: ProviderId
  pixKey: string
  isDefault: boolean
  removedAt: Date | null
  registeredAt: Date
  certExpiresAt: Date
  lastCheckedAt: Date | null
  lastCreationFailure: { at: Date, reason: string } | null
}

export interface Payment {
  endToEndId: string
  amountReceived: number // centavos
  paidAt: Date
}

export interface Charge {
  txid: string
  bankAccountId: string
  amount: number // centavos
  createdAt: Date
  expiresAt: Date
  status: ChargeStatus
  payment: Payment | null
}

export const PROTOTYPE_OPERATOR_VARIANTS = [
  { key: 'A', name: 'Painel' },
  { key: 'B', name: 'Extrato' },
  { key: 'C', name: 'Caixa' }
]

export type Scenario = 'normal' | 'cert' | 'failure' | 'stale' | 'empty'
export type CheckOutcome = 'pass' | 'token' | 'probe'
export type CheckStepState = 'idle' | 'running' | 'done' | 'failed'

export const SCENARIOS: { value: Scenario, label: string, description: string }[] = [
  { value: 'normal', label: 'Normal', description: 'Tudo funcionando' },
  { value: 'cert', label: 'Certificado vencendo', description: 'O certificado da Conta padrão vence em 12 dias' },
  { value: 'failure', label: 'Falha ao criar cobrança', description: 'A última criação de cobrança na Conta padrão falhou' },
  { value: 'stale', label: 'Banco sem resposta', description: 'Inter não respondeu em 5 s ao abrir Cobranças' },
  { value: 'empty', label: 'Primeiro acesso', description: 'Nenhuma conta bancária cadastrada' }
]

export const CHECK_OUTCOMES: { value: CheckOutcome, label: string }[] = [
  { value: 'pass', label: 'Verificação passa' },
  { value: 'token', label: 'Falha no token' },
  { value: 'probe', label: 'Falha na cobrança de teste' }
]

export const PROVIDERS: Record<ProviderId, { label: string, icon: string, certFiles: string }> = {
  efi: { label: 'Efí Bank', icon: 'i-lucide-landmark', certFiles: 'Certificado .p12' },
  inter: { label: 'Inter Empresas', icon: 'i-lucide-building-2', certFiles: 'Certificado .crt e chave .key' }
}

export const STATUS: Record<ChargeStatus, { label: string, color: 'success' | 'warning' | 'neutral' | 'error', icon: string }> = {
  pending: { label: 'Pendente', color: 'warning', icon: 'i-lucide-clock' },
  paid: { label: 'Paga', color: 'success', icon: 'i-lucide-circle-check' },
  expired: { label: 'Expirada', color: 'neutral', icon: 'i-lucide-hourglass' },
  cancelled: { label: 'Cancelada', color: 'error', icon: 'i-lucide-ban' }
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// ---------- deterministic fake data ----------

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function randomString(r: () => number, n: number, alphabet = ALNUM) {
  let s = ''
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(r() * alphabet.length)]
  return s
}

function endToEndId(r: () => number, at: Date, ispb: string) {
  const d = at.toISOString().replace(/\D/g, '').slice(0, 12)
  return `E${ispb}${d}${randomString(r, 11, 'abcdefghijklmnopqrstuvwxyz0123456789')}`
}

function seedAccounts(now: number): BankAccount[] {
  return [
    {
      id: 'ba_inter_pj',
      name: 'Inter PJ',
      provider: 'inter',
      pixKey: '12.345.678/0001-90',
      isDefault: true,
      removedAt: null,
      registeredAt: new Date(now - 12 * DAY),
      certExpiresAt: new Date(now + 287 * DAY),
      lastCheckedAt: new Date(now - 2 * MIN),
      lastCreationFailure: null
    },
    {
      id: 'ba_efi',
      name: 'Efí reserva',
      provider: 'efi',
      pixKey: '8f3c2a1e-5b7d-4e90-a1c2-7d6e5f4b3a21',
      isDefault: false,
      removedAt: null,
      registeredAt: new Date(now - 3 * DAY),
      certExpiresAt: new Date(now + 3 * 365 * DAY),
      lastCheckedAt: new Date(now - 6 * MIN),
      lastCreationFailure: null
    },
    {
      id: 'ba_inter_old',
      name: 'Inter antigo',
      provider: 'inter',
      pixKey: 'doacoes@exemplo.com.br',
      isDefault: false,
      removedAt: new Date(now - 11 * DAY),
      registeredAt: new Date(now - 40 * DAY),
      certExpiresAt: new Date(now + 200 * DAY),
      lastCheckedAt: new Date(now - 11 * DAY),
      lastCreationFailure: null
    }
  ]
}

const AMOUNTS = [1000, 2000, 5000, 5000, 10000, 2500, 3000, 20000, 100, 1500, 50000, 7500, 4000, 10000, 2000]

function seedCharges(now: number): Charge[] {
  const r = rng(17)
  const charges: Charge[] = []
  const push = (bankAccountId: string, createdAt: number, status: ChargeStatus, opts: { paidAfter?: number, received?: number } = {}) => {
    const amount = AMOUNTS[Math.floor(r() * AMOUNTS.length)]!
    const created = new Date(createdAt)
    const expiresAt = new Date(createdAt + HOUR)
    let payment: Payment | null = null
    if (status === 'paid') {
      const paidAt = new Date(createdAt + (opts.paidAfter ?? (30_000 + r() * 6 * MIN)))
      payment = {
        endToEndId: endToEndId(r, paidAt, bankAccountId === 'ba_efi' ? '09089356' : '00416968'),
        amountReceived: opts.received ?? amount,
        paidAt
      }
    }
    charges.push({ txid: randomString(r, 32), bankAccountId, amount, createdAt: created, expiresAt, status, payment })
  }

  // 30 days of history: "Inter antigo" until it was removed 11 days ago, then "Inter PJ".
  for (let day = 30; day >= 0; day--) {
    const perDay = day === 0 ? 5 : 2 + Math.floor(r() * 7)
    for (let i = 0; i < perDay; i++) {
      const createdAt = now - day * DAY - Math.floor(r() * (day === 0 ? 8 * HOUR : DAY)) - 70 * MIN
      const account = day > 11 ? 'ba_inter_old' : 'ba_inter_pj'
      const roll = r()
      const status: ChargeStatus = roll < 0.58 ? 'paid' : roll < 0.985 ? 'expired' : 'cancelled'
      push(account, createdAt, status)
    }
  }
  // Edge cases worth seeing on the page:
  push('ba_inter_pj', now - 3 * DAY, 'paid', { paidAfter: HOUR + 40_000 }) // paid after its hour ("Paid wins")
  push('ba_inter_pj', now - 5 * DAY, 'paid', { received: 4990 }) // amount received differs from the Charge's
  // A short stint on Efí today (Default switched there and back), one still Pending:
  push('ba_efi', now - 48 * MIN, 'paid')
  push('ba_efi', now - 26 * MIN, 'pending')
  // Pending on the Default Account right now:
  push('ba_inter_pj', now - 12 * MIN, 'pending')
  push('ba_inter_pj', now - 4 * MIN, 'pending')

  return charges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

// ---------- shared, in-memory store (client-only: /prototype/** has ssr: false) ----------

const state = reactive({
  now: Date.now(),
  accounts: [] as BankAccount[],
  charges: [] as Charge[],
  checkOutcome: 'pass' as CheckOutcome,
  loadedScenario: null as Scenario | null
})

function reset(scenario: Scenario) {
  state.now = Date.now()
  const now = state.now
  if (scenario === 'empty') {
    state.accounts = []
    state.charges = []
  } else {
    state.accounts = seedAccounts(now)
    state.charges = seedCharges(now)
  }
  const def = state.accounts.find(a => a.isDefault)
  if (def && scenario === 'cert') def.certExpiresAt = new Date(now + 12 * DAY)
  if (def && scenario === 'failure') {
    def.lastCreationFailure = { at: new Date(now - 7 * MIN), reason: 'Inter respondeu 403: o escopo cob.write não foi concedido a esta integração.' }
  }
  if (def && scenario === 'stale') {
    def.lastCheckedAt = new Date(now - 43 * MIN)
    // A Charge past its hour but not yet confirmed Expired, because Inter didn't answer.
    state.charges.unshift({
      txid: 'k3Jx9QpLm2VnR8sT4wYz6Ab1Cd5Ef7Gh',
      bankAccountId: def.id,
      amount: 3000,
      createdAt: new Date(now - 62 * MIN),
      expiresAt: new Date(now - 2 * MIN),
      status: 'pending',
      payment: null
    })
    state.charges.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }
  state.loadedScenario = scenario
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function usePrototypeOperator() {
  const route = useRoute()
  const scenario = computed<Scenario>(() => (route.query.scenario as Scenario) || 'normal')

  if (state.loadedScenario !== scenario.value) reset(scenario.value)
  watch(scenario, (s) => {
    if (state.loadedScenario !== s) reset(s)
  })

  const accounts = computed(() => state.accounts.filter(a => !a.removedAt))
  const allAccounts = computed(() => state.accounts)
  const defaultAccount = computed(() => state.accounts.find(a => a.isDefault) ?? null)
  const accountById = (id: string) => state.accounts.find(a => a.id === id)!

  const pendingCount = (accountId: string) =>
    state.charges.filter(c => c.bankAccountId === accountId && c.status === 'pending').length
  const lastPendingExpiry = (accountId: string) =>
    state.charges.filter(c => c.bankAccountId === accountId && c.status === 'pending')
      .map(c => c.expiresAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  const certWarnDays = 30
  const warnings = computed(() => {
    const def = defaultAccount.value
    if (!def) return []
    const list: { kind: 'cert' | 'failure', title: string, description: string }[] = []
    const days = Math.ceil((def.certExpiresAt.getTime() - state.now) / DAY)
    if (days <= certWarnDays) {
      list.push({
        kind: 'cert',
        title: `O certificado de ${def.name} vence em ${days} dias`,
        description: `Vence em ${fmtDate(def.certExpiresAt)}. Troque as credenciais antes disso, ou as doações param.`
      })
    }
    if (def.lastCreationFailure) {
      list.push({
        kind: 'failure',
        title: `A última cobrança em ${def.name} não pôde ser criada`,
        description: `${fmtRelative(def.lastCreationFailure.at)}: ${def.lastCreationFailure.reason}`
      })
    }
    return list
  })

  /** Bank Accounts whose read didn't answer within 5 s when the Charges page opened. */
  const staleAccounts = computed(() =>
    scenario.value === 'stale' && defaultAccount.value ? [defaultAccount.value] : []
  )

  function makeDefault(id: string) {
    for (const a of state.accounts) a.isDefault = a.id === id
  }

  function removeAccount(id: string) {
    const a = accountById(id)
    a.removedAt = new Date()
    a.isDefault = false
  }

  function rename(id: string, name: string) {
    accountById(id).name = name
  }

  /** The two-step check: token request, then a probe Charge. Fake timings and outcomes. */
  async function runCheck(steps: { token: CheckStepState, probe: CheckStepState, error: string | null }, provider: ProviderId) {
    steps.token = 'running'
    steps.probe = 'idle'
    steps.error = null
    await sleep(900)
    if (state.checkOutcome === 'token') {
      steps.token = 'failed'
      steps.error = provider === 'inter'
        ? 'Inter recusou o token: o certificado não corresponde a este Client ID.'
        : 'Efí recusou o token: Client Secret inválido.'
      return false
    }
    steps.token = 'done'
    steps.probe = 'running'
    await sleep(1300)
    if (state.checkOutcome === 'probe') {
      steps.probe = 'failed'
      steps.error = 'A cobrança de teste foi recusada: a chave Pix não pertence a esta conta.'
      return false
    }
    steps.probe = 'done'
    return true
  }

  function register(input: { name: string, provider: ProviderId, pixKey: string }) {
    const first = accounts.value.length === 0
    const account: BankAccount = {
      id: `ba_${Math.random().toString(36).slice(2, 8)}`,
      name: input.name || (input.provider === 'efi' ? 'Efí' : 'Inter'),
      provider: input.provider,
      pixKey: input.pixKey || 'contato@exemplo.com.br',
      isDefault: first,
      removedAt: null,
      registeredAt: new Date(),
      certExpiresAt: new Date(Date.now() + (input.provider === 'inter' ? 365 : 3 * 365) * DAY),
      lastCheckedAt: null,
      lastCreationFailure: null
    }
    state.accounts.push(account)
    return account
  }

  function replaceCredentials(id: string) {
    const a = accountById(id)
    a.certExpiresAt = new Date(Date.now() + (a.provider === 'inter' ? 365 : 3 * 365) * DAY)
    a.lastCreationFailure = null
  }

  return {
    state,
    scenario,
    accounts,
    allAccounts,
    defaultAccount,
    accountById,
    pendingCount,
    lastPendingExpiry,
    warnings,
    staleAccounts,
    makeDefault,
    removeAccount,
    rename,
    runCheck,
    register,
    replaceCredentials
  }
}

// ---------- filtering ----------

export type Period = 'today' | '7d' | '30d' | 'month' | 'all'
export const PERIODS: { value: Period, label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'all', label: 'Desde o início' }
]

export function inPeriod(d: Date, period: Period, now = Date.now()) {
  const t = d.getTime()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  switch (period) {
    case 'today': return t >= startOfToday.getTime()
    case '7d': return t >= now - 7 * DAY
    case '30d': return t >= now - 30 * DAY
    case 'month': return t >= new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime()
    default: return true
  }
}

export function totalReceived(charges: Charge[]) {
  return charges.reduce((sum, c) => sum + (c.payment?.amountReceived ?? 0), 0)
}

// ---------- formatting ----------

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtMoney = (centavos: number) => brl.format(centavos / 100)

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const fmtDate = (d: Date) => dateFmt.format(d)
export const fmtDateTime = (d: Date) => dateTimeFmt.format(d)
export const fmtTime = (d: Date) => timeFmt.format(d)
export const fmtFull = (d: Date) => fullFmt.format(d)

export function fmtRelative(d: Date, now = Date.now()) {
  const diff = d.getTime() - now
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  if (abs < MIN) return 'agora'
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute')
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour')
  return rtf.format(Math.round(diff / DAY), 'day')
}

export function daysUntil(d: Date, now = Date.now()) {
  return Math.ceil((d.getTime() - now) / DAY)
}

export function dayLabel(d: Date, now = Date.now()) {
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / DAY)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(d)
}

export const shortId = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`
