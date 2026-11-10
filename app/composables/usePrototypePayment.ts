// PROTOTYPE — throwaway, lives only on the `prototype/payment-page` branch. Never merge.
//
// Answers "How should the payment page behave, step by step?"
// (https://github.com/dbarjs/juntospelogedielson/issues/14).
//
// Two parts:
// - `useFakeServer()`: our server and the Provider, faked in the browser. It follows the rules
//   settled in "How does the system learn a Charge was paid?" (issue #11): one Provider read per
//   Bank Account at most every 3 s, a 30 s pause after a failed read, and Expired recorded only by
//   a read made at least 1 minute after the Charge's hour is up.
// - `usePaymentFlow()`: the Payer's side, the logic a variant renders. Polls every 3 s while the
//   page is visible, pauses while hidden, asks at once on return, stops at Paid / Expired / Cancelled.
//
// State survives a real browser reload (sessionStorage), so reload behaviour can be tried for real.

export type ServerStatus = 'Pending' | 'Paid' | 'Expired' | 'Cancelled'
export type ProviderStatus = 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_PSP'
export type CreateOutcome = 'ok' | 'provider-error' | 'timeout' | 'blocked'
export type CreateError = 'provider' | 'timeout' | 'blocked'
export type Phase = 'amount' | 'creating' | 'pending' | 'overtime' | 'paid' | 'expired' | 'cancelled'
export type Remember = 'browser' | 'url' | 'none'

export const MIN_CENTS = 100
export const CHARGE_TTL_MS = 60 * 60 * 1000
const EXPIRED_AFTER_MS = 60 * 1000
const PROVIDER_READ_EVERY_MS = 3000
const PROVIDER_BACKOFF_MS = 30 * 1000
const POLL_EVERY_MS = 3000
export const CREATE_TIMEOUT_MS = 15 * 1000

const SERVER_KEY = 'PROTOTYPE-payment-fake-server'
const REMEMBER_KEY = 'PROTOTYPE-payment-remembered-charge'

interface FakeCharge {
  txid: string
  amountCents: number
  copiaECola: string
  createdAt: number
  expiresAt: number
  provider: ProviderStatus
  paidAt: number | null
  status: ServerStatus
}

export interface PublicCharge {
  txid: string
  amountCents: number
  copiaECola: string
  expiresAt: number
}

interface FakeServerState {
  clockOffsetMs: number
  charges: Record<string, FakeCharge>
  lastProviderReadAt: number | null
  backoffUntil: number | null
  createOutcome: CreateOutcome
  createLatencyMs: number
  providerReadsFail: boolean
  serverDown: boolean
  payerInBankApp: boolean
  polls: number
  providerReads: number
  log: { at: number, text: string }[]
}

class FlowError extends Error {
  constructor(public code: CreateError | 'network' | 'not-found') {
    super(code)
  }
}

function initialState(): FakeServerState {
  return {
    clockOffsetMs: 0,
    charges: {},
    lastProviderReadAt: null,
    backoffUntil: null,
    createOutcome: 'ok',
    createLatencyMs: 1200,
    providerReadsFail: false,
    serverDown: false,
    payerInBankApp: false,
    polls: 0,
    providerReads: 0,
    log: []
  }
}

export const brl = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)

export const clockTime = (ms: number, seconds = false) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(new Date(ms))

export const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function randomTxid() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => chars[b % chars.length]).join('')
}

// A BR Code shaped like a real dynamic one, pointing at a `.invalid` host so no bank app can pay it.
function fakeCopiaECola(txid: string) {
  const f = (id: string, v: string) => id + String(v.length).padStart(2, '0') + v
  const body = f('00', '01') + f('01', '12')
    + f('26', f('00', 'br.gov.bcb.pix') + f('25', `pix.prototipo.invalid/qr/v2/${txid}`))
    + f('52', '0000') + f('53', '986') + f('58', 'BR') + f('59', 'JUNTOS PELO GEDIELSON')
    + f('60', 'SAO PAULO') + f('62', f('05', '***')) + '6304'
  let crc = 0xFFFF
  for (const ch of body) {
    crc ^= ch.charCodeAt(0) << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF
  }
  return body + crc.toString(16).toUpperCase().padStart(4, '0')
}

let server: ReturnType<typeof makeServer> | undefined

function makeServer() {
  let saved: FakeServerState | null = null
  try {
    saved = JSON.parse(sessionStorage.getItem(SERVER_KEY) ?? 'null')
  } catch { /* fresh start */ }
  const s = reactive<FakeServerState>({ ...initialState(), ...saved })
  watch(s, v => sessionStorage.setItem(SERVER_KEY, JSON.stringify(v)), { deep: true })

  const realNow = ref(Date.now())
  setInterval(() => (realNow.value = Date.now()), 250)
  const fakeNow = computed(() => realNow.value + s.clockOffsetMs)
  const now = () => Date.now() + s.clockOffsetMs

  const docVisible = ref(document.visibilityState === 'visible')
  document.addEventListener('visibilitychange', () => (docVisible.value = document.visibilityState === 'visible'))
  const pageVisible = computed(() => docVisible.value && !s.payerInBankApp)

  function log(text: string) {
    s.log.unshift({ at: now(), text })
    s.log.splice(40)
  }

  const toPublic = (c: FakeCharge): PublicCharge =>
    ({ txid: c.txid, amountCents: c.amountCents, copiaECola: c.copiaECola, expiresAt: c.expiresAt })

  // POST /api/charges
  async function createCharge(amountCents: number): Promise<PublicCharge> {
    log(`Tela pediu um Pix de ${brl(amountCents)}`)
    if (s.createOutcome === 'blocked') {
      await sleep(400)
      log('Proteção contra robôs barrou o pedido')
      throw new FlowError('blocked')
    }
    if (s.createOutcome === 'timeout') {
      await sleep(CREATE_TIMEOUT_MS)
      log(`Banco não respondeu em ${CREATE_TIMEOUT_MS / 1000} s; tela desistiu`)
      throw new FlowError('timeout')
    }
    await sleep(s.createLatencyMs)
    if (s.createOutcome === 'provider-error') {
      log('Banco recusou a cobrança (erro do Provider)')
      throw new FlowError('provider')
    }
    const txid = randomTxid()
    const createdAt = now()
    const charge: FakeCharge = {
      txid,
      amountCents,
      copiaECola: fakeCopiaECola(txid),
      createdAt,
      expiresAt: createdAt + CHARGE_TTL_MS,
      provider: 'ATIVA',
      paidAt: null,
      status: 'Pending'
    }
    s.charges[txid] = charge
    log(`Cobrança ${txid.slice(0, 6)}… criada no banco e registrada (Pending)`)
    return toPublic(charge)
  }

  // One shared Provider read for the Bank Account: at most every 3 s, paused 30 s after a failure.
  async function maybeReadProvider() {
    const t = now()
    if (s.lastProviderReadAt !== null && t - s.lastProviderReadAt < PROVIDER_READ_EVERY_MS) return
    if (s.backoffUntil !== null && t < s.backoffUntil) return
    s.lastProviderReadAt = t
    s.providerReads++
    await sleep(300)
    if (s.providerReadsFail) {
      s.backoffUntil = t + PROVIDER_BACKOFF_MS
      log('Leitura no banco falhou; sem leituras por 30 s')
      return
    }
    for (const c of Object.values(s.charges)) {
      if (c.status === 'Paid') continue
      if (c.provider === 'CONCLUIDA') {
        log(`Leitura no banco: ${c.txid.slice(0, 6)}… foi paga → Paid`)
        c.status = 'Paid'
      } else if (c.status === 'Pending' && c.provider === 'REMOVIDA_PELO_PSP') {
        log(`Leitura no banco: ${c.txid.slice(0, 6)}… removida pelo banco → Cancelled`)
        c.status = 'Cancelled'
      } else if (c.status === 'Pending' && t >= c.expiresAt + EXPIRED_AFTER_MS) {
        log(`Leitura no banco: ${c.txid.slice(0, 6)}… sem pagamento 1 min após o prazo → Expired`)
        c.status = 'Expired'
      }
    }
  }

  // GET /api/charges/:txid
  async function getCharge(txid: string): Promise<PublicCharge & { status: ServerStatus }> {
    s.polls++
    await sleep(150)
    if (s.serverDown) throw new FlowError('network')
    await maybeReadProvider()
    const c = s.charges[txid]
    if (!c) throw new FlowError('not-found')
    return { ...toPublic(c), status: c.status }
  }

  // ---- The Provider side, driven from the controls panel ----

  function pay(txid: string) {
    const c = s.charges[txid]
    if (!c || c.provider !== 'ATIVA' || now() >= c.expiresAt) return
    c.provider = 'CONCLUIDA'
    c.paidAt = now()
    log(`Pagador pagou ${c.txid.slice(0, 6)}… no app do banco`)
  }

  function payLate(txid: string) {
    const c = s.charges[txid]
    if (!c || c.provider !== 'ATIVA') return
    c.provider = 'CONCLUIDA'
    c.paidAt = c.expiresAt - 2000
    log(`Pagamento feito aos 59:58 só agora aparece no banco (${c.txid.slice(0, 6)}…)`)
  }

  function remove(txid: string) {
    const c = s.charges[txid]
    if (!c || c.provider !== 'ATIVA') return
    c.provider = 'REMOVIDA_PELO_PSP'
    log(`Banco removeu ${c.txid.slice(0, 6)}… (REMOVIDA_PELO_PSP)`)
  }

  function setClockTo(fakeTime: number) {
    s.clockOffsetMs = Math.max(s.clockOffsetMs, fakeTime - Date.now())
    log(`Relógio adiantado para ${clockTime(now(), true)}`)
  }

  function reset() {
    Object.assign(s, initialState())
    localStorage.removeItem(REMEMBER_KEY)
  }

  return { state: s, fakeNow, now, pageVisible, createCharge, getCharge, pay, payLate, remove, setClockTo, reset }
}

export function useFakeServer() {
  server ??= makeServer()
  return server
}

// The flow of the variant currently on screen, so the controls panel can read it.
export const activeFlow = shallowRef<ReturnType<typeof usePaymentFlow> | null>(null)

export function usePaymentFlow(opts: { remember: Remember }) {
  const server = useFakeServer()
  const route = useRoute()
  const router = useRouter()

  const amountCents = ref(0)
  const charge = ref<PublicCharge | null>(null)
  const status = ref<ServerStatus | null>(null)
  const creating = ref(false)
  const error = ref<CreateError | null>(null)
  const tooLow = ref(false)
  const pollFailing = ref(false)
  const lastPollAt = ref<number | null>(null)

  const phase = computed<Phase>(() => {
    if (creating.value) return 'creating'
    if (!charge.value) return 'amount'
    if (status.value === 'Paid') return 'paid'
    if (status.value === 'Expired') return 'expired'
    if (status.value === 'Cancelled') return 'cancelled'
    return server.fakeNow.value >= charge.value.expiresAt ? 'overtime' : 'pending'
  })
  const msLeft = computed(() => (charge.value ? Math.max(0, charge.value.expiresAt - server.fakeNow.value) : 0))
  const polling = computed(() => (phase.value === 'pending' || phase.value === 'overtime') && server.pageVisible.value)

  function remember(txid: string | null) {
    if (opts.remember === 'browser') {
      if (txid) localStorage.setItem(REMEMBER_KEY, txid)
      else localStorage.removeItem(REMEMBER_KEY)
    }
    if (opts.remember === 'url') {
      const { pix: _, ...rest } = route.query
      router.replace({ query: txid ? { ...rest, pix: txid } : rest })
    }
  }

  async function submit() {
    if (creating.value) return
    error.value = null
    if (amountCents.value < MIN_CENTS) {
      tooLow.value = true
      return
    }
    tooLow.value = false
    creating.value = true
    try {
      charge.value = await server.createCharge(amountCents.value)
      status.value = 'Pending'
      lastPollAt.value = performance.now()
      remember(charge.value.txid)
    } catch (e) {
      error.value = (e as FlowError).code as CreateError
    } finally {
      creating.value = false
    }
  }

  // Leaves the Charge to expire on its own: we never cancel.
  function changeAmount() {
    charge.value = null
    status.value = null
    error.value = null
    pollFailing.value = false
    remember(null)
  }

  function newChargeSameAmount() {
    changeAmount()
    return submit()
  }

  function startOver() {
    changeAmount()
    amountCents.value = 0
    tooLow.value = false
  }

  function setAmount(cents: number) {
    amountCents.value = cents
    if (cents >= MIN_CENTS) tooLow.value = false
    error.value = null
  }

  let inFlight = false
  async function poll() {
    const txid = charge.value?.txid
    if (!txid || inFlight) return
    inFlight = true
    lastPollAt.value = performance.now()
    try {
      const r = await server.getCharge(txid)
      if (charge.value?.txid === txid) status.value = r.status
      pollFailing.value = false
    } catch {
      pollFailing.value = true
    } finally {
      inFlight = false
    }
  }

  const timer = setInterval(() => {
    if (polling.value && performance.now() - (lastPollAt.value ?? 0) >= POLL_EVERY_MS) poll()
  }, 250)
  watch(server.pageVisible, (visible) => {
    if (visible && polling.value) poll()
  })

  onMounted(async () => {
    const txid = opts.remember === 'browser'
      ? localStorage.getItem(REMEMBER_KEY)
      : opts.remember === 'url' ? (route.query.pix as string | undefined) : null
    if (!txid) return
    try {
      const r = await server.getCharge(txid)
      charge.value = r
      status.value = r.status
      amountCents.value = r.amountCents
      lastPollAt.value = performance.now()
    } catch {
      remember(null)
    }
  })

  const flow = {
    opts,
    amountCents,
    charge,
    status,
    phase,
    msLeft,
    error,
    tooLow,
    pollFailing,
    polling,
    setAmount,
    submit,
    changeAmount,
    newChargeSameAmount,
    startOver
  }
  activeFlow.value = flow
  onBeforeUnmount(() => {
    clearInterval(timer)
    if (activeFlow.value === flow) activeFlow.value = null
  })
  return flow
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
}
