#!/usr/bin/env node
// Efí sandbox access check, for the "Set up Efí sandbox access" ticket.
// Prints only facts that are safe for a public issue: never the Client_Id, the
// Client_Secret, the token, the Pix key, the Copia e Cola or the certificate's subject.
//
// Usage:  node efi-sandbox-check.mjs <dir> [--charge]
//
//   <dir> holds, outside any git repo:
//     homologacao.p12   the Homologação certificate, exactly as Efí issued it
//     credentials.env   EFI_CLIENT_ID=...  EFI_CLIENT_SECRET=...  EFI_PIX_KEY=... (key only needed for --charge)
//
//   --charge  also creates one R$ 1,00 sandbox Charge, polls it until CONCLUIDA,
//             re-PUTs its txid and GETs an unknown txid (docs-vs-reality checks).
//
// EFI_BASE_URL overrides https://pix-h.api.efipay.com.br (for local testing only).

import { execFileSync } from "node:child_process"
import { randomBytes, X509Certificate } from "node:crypto"
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
import https from "node:https"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import tls from "node:tls"

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith("--"))
const wantCharge = args.includes("--charge")
if (!dir) {
  console.error("usage: node efi-sandbox-check.mjs <dir> [--charge]")
  process.exit(2)
}

const BASE = new URL(process.env.EFI_BASE_URL ?? "https://pix-h.api.efipay.com.br")
const p12Path = resolve(dir, "homologacao.p12")
const envPath = resolve(dir, "credentials.env")

const line = (label, value) => console.log(`${label.padEnd(30)} ${value}`)
const section = (title) => console.log(`\n== ${title}`)

// ---------------------------------------------------------------- files
section("Files")
for (const p of [p12Path, envPath]) {
  if (!existsSync(p)) {
    console.error(`missing: ${p}`)
    process.exit(2)
  }
}
const insideGitRepo = (p) => {
  let d = dirname(realpathSync(p))
  while (true) {
    if (existsSync(join(d, ".git"))) return d
    const up = dirname(d)
    if (up === d) return null
    d = up
  }
}
for (const p of [p12Path, envPath]) {
  const repo = insideGitRepo(p)
  const mode = (statSync(p).mode & 0o777).toString(8)
  line(p.split("/").pop(), `mode ${mode}${repo ? `  ⚠ INSIDE GIT REPO ${repo}, move it out` : ""}`)
}

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    }),
)
for (const k of ["EFI_CLIENT_ID", "EFI_CLIENT_SECRET"]) {
  if (!env[k]) {
    console.error(`credentials.env lacks ${k}`)
    process.exit(2)
  }
}
const pfx = readFileSync(p12Path)

// ---------------------------------------------------------------- certificate
section("Certificate (.p12 as issued)")
const openssl = (extra, input) =>
  execFileSync("openssl", ["pkcs12", "-in", p12Path, "-passin", "pass:", ...extra], {
    input,
    stdio: ["pipe", "pipe", "pipe"],
  })
const opensslInfo = (legacy) => {
  try {
    // -info writes the algorithms to stderr; -nokeys -nocerts keeps key and certs out of stdout
    const r = execFileSync(
      "sh",
      ["-c", `openssl pkcs12 -in "$1" -passin pass: -info -nokeys -nocerts ${legacy ? "-legacy" : ""} 2>&1 >/dev/null`, "sh", p12Path],
      { encoding: "utf8" },
    )
    return { ok: true, out: r }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}
let info = opensslInfo(false)
let opensslNeedsLegacy = false
if (!info.ok) {
  const legacy = opensslInfo(true)
  if (legacy.ok) {
    opensslNeedsLegacy = true
    info = legacy
  }
}
line("OpenSSL reads it", info.ok ? (opensslNeedsLegacy ? "only with -legacy" : "yes, no -legacy needed") : "NO")
for (const l of info.out.split("\n")) {
  if (/MAC:|Encrypted data|Keybag|PBES2|PBKDF2|pbeWith|Certificate bag/i.test(l)) line("  algorithm", l.trim())
}
if (!info.ok) line("  openssl said", info.out.split("\n").find((l) => l.trim()) ?? "(nothing)")

let certPem
try {
  certPem = openssl(["-nokeys", "-clcerts", ...(opensslNeedsLegacy ? ["-legacy"] : [])]).toString()
  const x = new X509Certificate(certPem)
  line("valid from", x.validFrom)
  line("valid to (notAfter)", x.validTo)
  const days = Math.round((Date.parse(x.validTo) - Date.parse(x.validFrom)) / 86_400_000)
  line("lifetime", `${days} days`)
  line("key", `${x.publicKey.asymmetricKeyType} ${x.publicKey.asymmetricKeyDetails?.modulusLength ?? ""}`.trim())
} catch (e) {
  line("cert details", `could not read: ${e.message.split("\n")[0]}`)
}

// ---------------------------------------------------------------- node
section(`Node ${process.version} / OpenSSL ${process.versions.openssl}`)
let nodeLoadsP12 = false
try {
  tls.createSecureContext({ pfx, passphrase: "" })
  nodeLoadsP12 = true
  line("tls.createSecureContext(pfx)", "OK, loads as issued")
} catch (e) {
  line("tls.createSecureContext(pfx)", `FAILS: ${e.message}`)
}

// PEM fallback, in memory only, never written to disk
let pemPair
if (!nodeLoadsP12) {
  try {
    const legacy = opensslNeedsLegacy ? ["-legacy"] : []
    const key = openssl(["-nocerts", "-nodes", ...legacy])
    const cert = openssl(["-nokeys", "-clcerts", ...legacy])
    tls.createSecureContext({ key, cert })
    pemPair = { key, cert }
    line("PEM conversion (in memory)", "OK, Node loads the converted pair")
  } catch (e) {
    line("PEM conversion (in memory)", `FAILS: ${e.message.split("\n")[0]}`)
  }
}
const clientCert = nodeLoadsP12 ? { pfx, passphrase: "" } : pemPair
if (!clientCert) {
  console.log("\nNo usable client certificate; stopping before any request.")
  process.exit(1)
}

// ---------------------------------------------------------------- http
const request = (method, path, { headers = {}, body } = {}) =>
  new Promise((ok, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = https.request(
      {
        method,
        host: BASE.hostname,
        port: BASE.port || 443,
        path,
        ...clientCert,
        ...(process.env.EFI_BASE_URL ? { rejectUnauthorized: false } : {}),
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        timeout: 20_000,
      },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString()
          let json
          try {
            json = JSON.parse(text)
          } catch {}
          ok({ status: res.statusCode, json, text, alpn: res.socket?.alpnProtocol })
        })
      },
    )
    req.on("timeout", () => req.destroy(new Error("timeout after 20 s")))
    req.on("error", fail)
    if (payload) req.write(payload)
    req.end()
  })

// Only these fields of an error body are echoed: Efí's are {nome, mensagem} or {error, error_description}.
const errorGist = (r) => {
  const j = r.json ?? {}
  const parts = [j.nome, j.mensagem, j.error, j.error_description, j.title, j.detail].filter(Boolean)
  return parts.length ? parts.join(" | ") : r.text.slice(0, 120).replace(/\s+/g, " ")
}

section(`Token request (${BASE.host}, via ${nodeLoadsP12 ? ".p12 as issued" : "PEM conversion"})`)
let token
try {
  const basic = Buffer.from(`${env.EFI_CLIENT_ID}:${env.EFI_CLIENT_SECRET}`).toString("base64")
  const t0 = Date.now()
  const r = await request("POST", "/oauth/token", {
    headers: { Authorization: `Basic ${basic}` },
    body: { grant_type: "client_credentials" },
  })
  line("HTTP status", `${r.status} (${Date.now() - t0} ms)`)
  if (r.status === 200 && r.json?.access_token) {
    token = r.json.access_token
    line("token_type", r.json.token_type)
    line("expires_in", `${r.json.expires_in} (${typeof r.json.expires_in})`)
    line("scope", r.json.scope ?? "(none listed)")
  } else {
    line("error", errorGist(r))
  }
} catch (e) {
  line("request failed", e.message)
}
if (!token) {
  console.log("\nResult: no sandbox token. See the checklist's step 7 notes (401 = homologação/produção mix-up).")
  process.exit(1)
}

// ---------------------------------------------------------------- optional charge
if (wantCharge) {
  section("Sandbox Charge (R$ 1,00)")
  if (!env.EFI_PIX_KEY) {
    line("skipped", "credentials.env lacks EFI_PIX_KEY")
  } else {
    const auth = { Authorization: `Bearer ${token}` }
    const alnum = () => {
      const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
      return Array.from(randomBytes(32), (b) => abc[b % abc.length]).join("")
    }
    const txid = alnum()
    const body = { calendario: { expiracao: 3600 }, valor: { original: "1.00" }, chave: env.EFI_PIX_KEY }
    const t0 = Date.now()
    const put = await request("PUT", `/v2/cob/${txid}`, { headers: auth, body })
    line("PUT /v2/cob/{txid}", `${put.status} (${Date.now() - t0} ms)`)
    if (put.status !== 201) {
      line("error", errorGist(put))
      if (put.json?.nome === "chave_invalida" || /chave/i.test(put.text))
        line("hint", "sandbox rejects this key; try a random key from POST /v2/gn/evp (needs gn.pix.evp.write)")
    } else {
      const c = put.json
      line("status", c.status)
      line("calendario.expiracao", `${JSON.stringify(c.calendario?.expiracao)} (${typeof c.calendario?.expiracao})`)
      line("calendario.criacao", c.calendario?.criacao)
      line("pixCopiaECola present", String(Boolean(c.pixCopiaECola)))
      line("loc.id / location present", `${c.loc?.id !== undefined} / ${Boolean(c.location)}`)
      line("response keys", Object.keys(c).sort().join(", "))

      // poll until CONCLUIDA
      let last
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        const g = await request("GET", `/v2/cob/${txid}`, { headers: auth })
        last = g
        if (g.status === 200 && g.json?.status === "CONCLUIDA") break
        await new Promise((r) => setTimeout(r, 2_000))
      }
      line("GET /v2/cob/{txid}", `${last.status}, status ${last.json?.status}, after ${((Date.now() - t0) / 1000).toFixed(1)} s`)
      if (last.json?.status === "CONCLUIDA") {
        const p = last.json.pix?.[0] ?? {}
        line("pix[] entries", String(last.json.pix?.length ?? 0))
        line("pix[0] keys", Object.keys(p).sort().join(", "))
        line("pix[0].valor", `${JSON.stringify(p.valor)} (${typeof p.valor})`)
        line("pix[0].endToEndId length", String(p.endToEndId?.length))
        line("pix[0].horario", p.horario)
      }

      const dup = await request("PUT", `/v2/cob/${txid}`, { headers: auth, body })
      line("re-PUT same txid", `${dup.status} ${errorGist(dup)}`)
    }
    const unknown = await request("GET", `/v2/cob/${alnum()}`, { headers: auth })
    line("GET unknown txid", `${unknown.status} ${errorGist(unknown)}`)
  }
}

console.log(
  `\nResult: sandbox token OK. Node ${nodeLoadsP12 ? "loads the .p12 as issued" : "REJECTS the .p12 as issued; PEM conversion works"}.`,
)
