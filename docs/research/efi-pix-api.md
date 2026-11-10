# How does Efí's PIX API work for us?

Research for the ticket of the same name on the wayfinder map. Read on 2026-11-10 from Efí's developer docs (each page's own "Última atualização" date is given in [Sources](#sources)), Efí's help center and pricing pages, Efí's official Node SDK at tag `2.0.1` (2026-07-31), the Central Bank's API Pix spec `2.10.0` (2026-08-19) with its `2.11.0-rc1` changelog, and the Central Bank's _Manual de Padrões para Iniciação do Pix_ v2.10.0. Nothing was called against Efí and no credentials were used: every behaviour below is as documented, still to be confirmed by the "Set up Efí sandbox access" task.

"Bacen" below means the Central Bank's API Pix spec or manual; Efí's API is an implementation of that spec plus Efí-only endpoints under `/v2/gn/`.

## Answer

- **Account type.** Efí ships its APIs ("Efí Pay") with the **Efí Pro** account (a PF account for people without a CNPJ) and the **Efí Empresas** account (PJ). The personal **Efí Para você** account isn't listed for them ([help: Efí Pay](https://sejaefi.com.br/central-de-ajuda/efi-pay/o-que-e-efi-pay), [help: account types](https://sejaefi.com.br/central-de-ajuda/efi-bank/quais-sao-os-tipos-de-conta-da-efi-bank)). In the web dashboard (API → Aplicações) the Operator creates an application with API Pix enabled. Each application gets two Client_Id/Client_Secret pairs, one for production and one for the sandbox ("Homologação"), and its scopes are chosen per environment ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
- **Secrets per Bank Account.** Each Bank Account needs:
  - a Client_Id and a Client_Secret;
  - a `.p12` client certificate with an empty password, created per environment under API → Meus Certificados. It can be downloaded only once, at creation, and at most 5 can exist at a time.

  The certificate is required on every call, the token request included. Efí documents no expiry or rotation for any of these, so renewing means issuing a new certificate and swapping it in ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais), [help: certificate](https://sejaefi.com.br/central-de-ajuda/api/como-gerar-o-certificado-para-usar-a-api-pix)).
- **Auth.** The app sends `POST /oauth/token` over mTLS, with HTTP Basic `client_id:client_secret` and the body `{"grant_type":"client_credentials"}`. It gets back a Bearer token with `expires_in: 3600`. The base URLs are `https://pix.api.efipay.com.br` (production) and `https://pix-h.api.efipay.com.br` (sandbox). Efí documents no limit on token requests; its SDK caches each token and renews it 30 s before expiry ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais), [SDK `wrapper.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/wrapper.ts)).
- **No IP allowlisting for our calls.** Efí authenticates each call by the client certificate plus the OAuth token, and nothing asks for the caller's IP to be registered. Neither the API Pix docs (searched with the docs site's own search), the help center, nor Bacen's mandatory security requirements mention it ([Bacen manual, Anexo II §3.1](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)). The only IPs Efí documents are the ones its webhooks come from. A static egress IP is not needed for Efí.
- **Creating a Charge.** The app calls `PUT /v2/cob/{txid}` (scope `cob.write`) with `calendario.expiracao: 3600`, `valor.original` (a string with 2 decimals) and `chave`, which must be a Pix key of that account. The payer fields (`devedor`) are optional. Efí answers 201 with `status: "ATIVA"`, `loc.id`, `location` and `pixCopiaECola`.
  - The txid must match `^[a-zA-Z0-9]{26,35}$` and be unique per account holder ([docs: Glossário](https://dev.efipay.com.br/docs/api-pix/glossario)).
  - Reusing a txid gets `409 txid_duplicado`, unlike Bacen's spec, where a PUT may revise an `ATIVA` Charge. So after a timed-out PUT, a GET is the way to find out whether the Charge exists ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)).
- **Status.** A Charge's status is `ATIVA`, `CONCLUIDA`, `REMOVIDA_PELO_USUARIO_RECEBEDOR` or `REMOVIDA_PELO_PSP` ([docs: Status](https://dev.efipay.com.br/docs/api-pix/status)).
  - There is no expired status. Bacen says the status does not track expiry, so the app has to derive Expired from `calendario.criacao + calendario.expiracao` ([Bacen `CobStatus`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
  - A paid Charge carries its Payment in `pix[]`: `endToEndId`, `valor`, `horario` and an optional `infoPagador`.
  - `GET /v2/cob?inicio=…&fim=…` lists Charges by creation time, page by page.
- **Webhooks require mTLS on our side, and the way to skip it is no longer documented.** `PUT /v2/webhook/{chave}` registers one HTTPS URL per Pix key ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)).
  - Efí POSTs `{"pix":[…]}` to that URL plus `/pix`. A `?ignorar=` query keeps `/pix` off the path.
  - Each delivery times out after 60 s. Efí retries over about 5 h 25 min; after that only a manual resend works (up to 30 days, not in the sandbox).
  - Registration succeeds only if our server *refuses* a request that has no client certificate and then completes the handshake with Efí's certificate (mTLS, TLS 1.2 or later). This is a Bacen rule. A host that can't verify client certificates therefore can't receive Efí webhooks directly.
  - The one documented exception was the header `x-skip-mtls-checking: true` on registration ([docs: Webhooks EN](https://dev.efipay.com.br/en/docs/api-pix/webhooks)). The Portuguese docs dropped it in June 2026, though the English page and Efí's SDKs still have it. Whether Efí still honours it is unknown until tried.
  - Efí does publish where webhooks come from: `34.193.116.226` on the Pix page, and 28 "Callbacks" addresses in its help center, a list that dates itself 2017 ([help: IPs](https://sejaefi.com.br/central-de-ajuda/api/quais-enderecos-de-ip-gerencianet-utiliza)). It also suggests putting a secret in the URL. Payloads are not signed.
  - Reading the Charge with `GET /v2/cob/{txid}` needs neither webhooks nor mTLS on our side.
- **QR image.** The create response has no image. `GET /v2/loc/{loc.id}/qrcode` (scope `payloadlocation.read`) returns the Copia e Cola again, a base64 data-URI image (SVG in the current example), and a hosted payment link that only works in production. The alternative is to render the QR code from `pixCopiaECola` ([docs: Payload Locations](https://dev.efipay.com.br/docs/api-pix/payload-locations)).
- **Limits.** Every PUT/POST endpoint, Charge creation included, is limited to 500 requests per second and answers 429 beyond that. No limit is documented for GET endpoints or the token endpoint ([docs: Limites de Consumo](https://dev.efipay.com.br/docs/api-pix/limites-de-consumo)).
- **Cost.** Efí keeps 1.19% of each Payment received through a Charge created by API. There is no monthly fee, and creating or cancelling Charges is free. The 30 free Pix per month don't apply to keys used by the API or a webhook ([Efí tarifas](https://sejaefi.com.br/tarifas), [help: fees](https://sejaefi.com.br/central-de-ajuda/tarifas-e-prazos/tarifas-cobradas-pela-gerencianet)).
- **Sandbox.** The sandbox uses the Homologação credentials and a Homologação certificate against `pix-h`. Charges of R$ 0,01 to R$ 10,00 are confirmed automatically (`CONCLUIDA` plus a webhook); larger ones stay `ATIVA` ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)). The docs don't say which Pix key the sandbox accepts in `chave`.

## Access and credentials

### Which accounts can use it

- Efí has three account types: **Efí Para você** (personal PF account), **Efí Pro** ("Conta Digital para quem empreende e ainda não tem CNPJ") and **Efí Empresas** (PJ) ([help: account types](https://sejaefi.com.br/central-de-ajuda/efi-bank/quais-sao-os-tipos-de-conta-da-efi-bank), updated 2026-03-17). Efí Pro is a PF account ([help: Efí Pro PF ou PJ](https://sejaefi.com.br/central-de-ajuda/efi-bank/efi-pro-e-uma-conta-digital-pf-ou-pj)).
- "A Efí Pay é um ecossistema completo de meios de pagamento, disponível nas modalidades de conta Efí Pro e Efí Empresas … As funcionalidades do Efí Pay podem ser integradas por meio das APIs" ([help: Efí Pay](https://sejaefi.com.br/central-de-ajuda/efi-pay/o-que-e-efi-pay)). To use it, "basta abrir uma conta Efí Pro (empreendedor sem CNPJ) ou Efí Empresas (conta PJ) para … iniciar a integração das nossas APIs" ([help: contratar Efí Pay](https://sejaefi.com.br/central-de-ajuda/efi-pay/como-contratar-as-solucoes-da-efi-pay)). Efí Pro's feature list includes "emissão de cobranças pela conta e automatização por APIs" ([help: Efí Pro](https://sejaefi.com.br/central-de-ajuda/efi-bank/o-que-tem-na-conta-digital-efi-pro)).
- The [tarifas page](https://sejaefi.com.br/tarifas) shows the Pix-by-API prices only on its Efí Empresas and Efí Pro tabs; the Efí Para você tab has no Pix receiving section (read from the page's script `/_nuxt/tarifas.*.js` on 2026-11-10).
- **Inference, not stated anywhere:** an Efí Para você account cannot create API applications. No page says so outright, and the developer docs only require "uma Conta Digital Efí" ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
- Bacen requires the Client_Id to be "vinculada ao CNPJ ou CPF do usuário recebedor" and to reach only that holder's accounts ([Bacen manual, Anexo II §3.1 item 8](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)).
- Pix keys: Bacen allows at most 5 keys on a PF account and 20 on a PJ account ([help: chaves](https://sejaefi.com.br/central-de-ajuda/pix/posso-ter-mais-de-uma-chave-de-enderecamento-em-uma-mesma-conta-gerencianet)). Keys are registered in the app or web dashboard under Menu → Pix → Minhas chaves ([help: cadastrar chaves](https://sejaefi.com.br/central-de-ajuda/pix/como-cadastrar-chaves-pix)), or by API with `POST /v2/gn/evp`, which creates random (EVP) keys only ([docs: Endpoints exclusivos](https://dev.efipay.com.br/docs/api-pix/endpoints-exclusivos-efi)).

### Applications and scopes

- Applications are created in the web dashboard: "API" (bottom of the left menu) → "Criar aplicação" → enable API Pix → pick the scopes for Produção and Homologação → "Continuar". An existing application is edited under API → Aplicações → ⋯ → Configurações. Scopes can be changed later ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais), [help: alterar aplicação](https://sejaefi.com.br/central-de-ajuda/api/como-alterar-uma-aplicacao-existente-para-uso-da-api-pix)).
- The help center says an active certificate must exist before an application can use API Pix: "Para utilizar a API Pix, é necessário ter pelo menos um certificado ativo" ([help: criar aplicação](https://sejaefi.com.br/central-de-ajuda/api/como-criar-uma-nova-aplicacao-para-usar-a-api-pix)).
- "Um integrador pode criar quantas aplicações desejar. Para cada aplicação são gerados 2 pares de chaves `Client_Id` e `Client_Secret`, sendo um par para … Produção e outro para Homologação" ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)). They appear under API → Aplicações → (app), on the "Produção" and "Homologação" tabs ([help: Client Id/Secret](https://sejaefi.com.br/central-de-ajuda/api/como-obter-chaves-client-id-e-client-secret-na-api)).
- The scopes relevant to creating and tracking Charges ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)):

| Scope | Efí's description | Used by |
| --- | --- | --- |
| `cob.write` | Alterar cobranças | `PUT/POST /v2/cob`, `PATCH /v2/cob/{txid}` |
| `cob.read` | Consultar cobranças | `GET /v2/cob/{txid}`, `GET /v2/cob` |
| `pix.read` | Consultar Pix | `GET /v2/pix/{e2eId}`, `GET /v2/pix` |
| `webhook.write` / `webhook.read` | Alterar / Consultar Webhooks | `PUT/DELETE` and `GET /v2/webhook…`, resend |
| `payloadlocation.read` | Consultar Payloads | `GET /v2/loc/{id}/qrcode` |
| `gn.settings.write` / `gn.settings.read` | Alterar / Consultar Configurações da API | `PUT/GET /v2/gn/config` (webhook extras, see below) |
| `gn.pix.evp.write` / `gn.pix.evp.read` | Alterar / Consultar Chaves aleatórias | `POST/GET /v2/gn/evp` |

### Certificate

- "Todas as requisições devem conter um certificado de segurança que será fornecido pela Efí dentro da sua conta, no formato `PFX(.p12)`." Efí says this requirement comes from Bacen's security manual ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)). Bacen allows client certificates issued by the bank itself or by an external CA, never self-signed ones ([Bacen manual, Anexo II §3.1 item 2a](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)).
- **Issuance.** API → Meus Certificados → choose the environment (Produção or Homologação) → "Novo Certificado" → give it a description → confirm → download ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
  - The file can be downloaded only at creation: "Não será possível realizar o download do mesmo certificado em outro momento".
  - One certificate can serve several applications in the same account.
  - Certificates are per environment: switching to production means switching the Client_Id/Client_Secret pair and the certificate ([help: Unauthorized](https://sejaefi.com.br/central-de-ajuda/api/estou-deparando-com-mensagem-de-unauthorized-sem-autorizacao-por-que)).
- **How many.** The docs allow "até cinco certificados para cada ambiente". The help center says "um limite máximo de 5 certificados simultâneos em sua conta" and that inactive ones can be deleted ([help: certificate](https://sejaefi.com.br/central-de-ajuda/api/como-gerar-o-certificado-para-usar-a-api-pix)). The two disagree on whether the limit is per environment or per account.
- **Passphrase.** None. All of Efí's samples use an empty passphrase (`passphrase: ""`, `-password pass:""`), and the docs say to "informe vazio" if a converter asks. The official Node SDK always builds `new https.Agent({ pfx, passphrase: '' })`, or `{ cert, key }` for PEM; it also accepts base64-encoded files ([SDK `httpClient.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/httpClient.ts)).
- **PEM conversion.** Some stacks need PEM: `openssl pkcs12 -in certificado.p12 -out certificado.pem -nodes -password pass:""` writes the certificate and key to one file; `-clcerts -nokeys` and `-nocerts -nodes` split them ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
- **Expiry and renewal.** Neither the docs nor the help center give a validity period or a renewal procedure for certificates, and nothing says whether a Client_Secret can be regenerated. Every X.509 certificate carries a `notAfter` date ([RFC 5280 §4.1.2.5](https://www.rfc-editor.org/rfc/rfc5280#section-4.1.2.5)), so the real expiry can be read from the file Efí issues. Renewing, as far as the docs go, means creating a new certificate, swapping it in, and deleting the old one.

> **Implications for "What exactly is a Bank Account?"** For Efí, a Bank Account needs:
>
> - its environment (sandbox or production), which picks the base URL;
> - a Client_Id and a Client_Secret;
> - the `.p12` bytes (empty passphrase);
> - the Pix key (`chave`) its Charges are created on. The key must belong to the same account, or Efí answers `chave_invalida`.
>
> Scopes live in Efí's dashboard, not in the app. The token response's `scope` field lists the granted scopes, so the app can check a newly registered Bank Account by requesting a token. The certificate's own `notAfter` is the only expiry date available.

## Auth

| Environment | Base URL ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais), [SDK `endpoints.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/constants/endpoints.ts)) |
| --- | --- |
| Production | `https://pix.api.efipay.com.br` |
| Sandbox (Homologação) | `https://pix-h.api.efipay.com.br` |

- **Token request.** `POST /oauth/token` with these headers ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)):
  - `Authorization: Basic base64(Client_Id:Client_Secret)`
  - `Content-Type: application/json`
  - body `{"grant_type": "client_credentials"}`

  The response is `{"access_token": "…", "token_type": "Bearer", "expires_in": 3600, "scope": "cob.read cob.write …"}`. `expires_in` is in seconds and defaults to 3600; `scope` is space-separated. Every other call sends `Authorization: Bearer <access_token>`.
- **mTLS on every call.** "O Certificado P12/PEM … é obrigatório em todas as requisições feitas à API Pix, inclusive na requisição de autorização" ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
  - Bacen requires OAuth 2.0 client credentials with mTLS ([RFC 8705](https://www.rfc-editor.org/rfc/rfc8705)), tokens bound to the client certificate, and a server-side check that the token's certificate thumbprint matches the TLS one ([Bacen manual, Anexo II §3.1 item 2](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)). So a token works only together with the certificate it was issued for.
  - Bacen also requires TLS 1.2 or later ([Bacen manual, Anexo II §3.1 item 1](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)).
  - Efí doesn't document whether it enforces the thumbprint binding.
- **Limits on token requests.** None documented. `/oauth/token` is a POST but is not in the 500 req/s table ([docs: Limites de Consumo](https://dev.efipay.com.br/docs/api-pix/limites-de-consumo)).
  - The official SDK caches the token per base URL, treats it as expired 30 s early (`TOKEN_EXPIRATION_MARGIN_SECONDS = 30`), and shares one in-flight token request among concurrent callers ([SDK `wrapper.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/wrapper.ts)).
- **`Accept-Encoding`.** With `gzip`, bodies of 1000 bytes or more come back compressed and chunked, without `Content-Length`. With `*` or `identity`, `Content-Length` is always present ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
- **Caller IPs: no allowlisting.** Efí doesn't require our calls to come from pre-registered IPs.
  - No Efí page asks to register or allowlist the caller's IP. That covers the API Pix pages read here, a search of the whole docs site for IP terms ("IP", "IPs autorizados", "lista de IPs", "IP fixo", "whitelist", "allowlist", "restringir IP"), and the help center.
  - Every IP that Efí documents is a source address of its own webhooks and callbacks ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks), [help: IPs](https://sejaefi.com.br/central-de-ajuda/api/quais-enderecos-de-ip-gerencianet-utiliza)).
  - Bacen's mandatory security requirements for the API are TLS 1.2 or later, OAuth 2.0 with mTLS, certificate-bound tokens, and credentials tied to the holder's CPF/CNPJ. None of them involves IPs ([Bacen manual, Anexo II §3.1](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)).
  - Authentication is therefore the certificate plus the token, and a static egress IP is not needed for Efí.
- **Request log.** The dashboard keeps a per-application, per-environment request log: API → Aplicações → (app) → environment → "Histórico de Requisições" ([docs: Interpretando erros](https://dev.efipay.com.br/docs/erros/introducao)).

## Creating a Charge

`PUT /v2/cob/{txid}` with scope `cob.write` ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)). `POST /v2/cob` does the same but lets Efí pick the txid. That is standard Bacen behaviour (`POST /cob`: "o txid deve ser definido pelo PSP"), even though Efí's page calls it an exception ([Bacen spec](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).

Minimal body for our case: no payer fields, since we never ask who the Payer is.

```json
{
  "calendario": { "expiracao": 3600 },
  "valor": { "original": "25.00" },
  "chave": "<a Pix key registered on the same Efí account>"
}
```

Field rules (Bacen schemas `CobSolicitada`, `CobValor`, `CobBase`, `CobExpiracao` in the [spec](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml); Efí's validation messages from [docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)):

| Field | Rule |
| --- | --- |
| `calendario.expiracao` | Integer seconds from `calendario.criacao`. Bacen: "duração que indica limite … para que o pagamento da cobrança possa ser realizado" ([manual §2.7.1.1](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)). Optional, default 86400. Efí rejects values ≤ 0 on create and < 1 on PATCH. |
| `valor.original` | String matching `\d{1,10}\.\d{2}`, greater than zero. Without `valor.modalidadeAlteracao`, the Payer can't change the amount (Bacen default 0). |
| `chave` | Required. A DICT key, max 77 chars, that must belong to the authenticated account (`chave_invalida`, 400). |
| `devedor` | Optional. Either `cpf` or `cnpj`, plus `nome`. The Efí SDK types it as optional too ([SDK `types/pix.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/types/pix.ts)). |
| `solicitacaoPagador` | Optional. Text shown to the Payer inviting a free-text reply, max 140 chars. |
| `infoAdicionais` | Optional. Up to 50 `{nome ≤ 50, valor ≤ 200}` pairs shown to the Payer. |
| `loc.id` | Optional. Reuses a pre-created location (`POST /v2/loc`). Not needed for one-off Charges. |

txid rules:

- Regex `^[a-zA-Z0-9]{26,35}$`, "único por CPF/CNPJ da pessoa usuária recebedora" ([docs: Glossário](https://dev.efipay.com.br/docs/api-pix/glossario)). Bacen: "O txid é criado exclusivamente pelo usuário recebedor … Cabe ao PSP recebedor validar essa regra" ([spec `TxId`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- 32 hex characters, a UUID without hyphens, fit the rule. Efí's own `POST /v2/cob` example txids have that shape, though some older response examples show hyphenated txids that don't match the regex.

Response `201` ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas), shortened):

```json
{
  "calendario": { "criacao": "2020-09-09T20:15:00.358Z", "expiracao": 3600 },
  "txid": "7978c0c97ea847e78e8849634473c1f1",
  "revisao": 0,
  "loc": { "id": 789, "location": "pix.example.com/qr/v2/9d36b84fc70b478fb95c12729b90ca25", "tipoCob": "cob" },
  "location": "pix.example.com/qr/v2/9d36b84fc70b478fb95c12729b90ca25",
  "status": "ATIVA",
  "valor": { "original": "567.89" },
  "chave": "a1f4102e-a446-4a57-bcce-6fa48899c1d1",
  "pixCopiaECola": "00020101021226830014BR.GOV.BCB.PIX2561qrcodespix.sejaefi.com.br/v2/…"
}
```

- `pixCopiaECola` is the Copia e Cola: Bacen defines it as "a sequência de caracteres que representa o BR Code", max 512 chars ([spec `CobBaseCopiaCola`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). A QR code that encodes this string is the Charge's QR code.
- `location` is the capability URL the Payer's banking app fetches the Charge payload from ([docs: Glossário](https://dev.efipay.com.br/docs/api-pix/glossario)).
- Bacen also marks `loc.criacao` as returned, and Efí's SDK types it as present ([SDK `types/pix.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/types/pix.ts)).

**QR image (Efí-only).** `GET /v2/loc/{id}/qrcode`, scope `payloadlocation.read`, takes the `loc.id` from the create response and returns ([docs: Payload Locations](https://dev.efipay.com.br/docs/api-pix/payload-locations)):

- `qrcode`: the BR Code, i.e. the Copia e Cola;
- `imagemQrcode`: a base64 data URI, `data:image/svg+xml;base64,…` in the current example, so don't assume PNG;
- `linkVisualizacao`: an Efí-hosted payment page that "funciona apenas para cobranças Pix emitidas em ambiente de produção".

The only error documented is `location_nao_encontrada` (400). Bacen's spec has no QR-image endpoint.

**Errors on create** ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)):

| Status | `nome` | Meaning |
| --- | --- | --- |
| 400 | `documento_bloqueado` | The account's document has blocks that prevent issuing. |
| 400 | `chave_invalida` | Key not on the authenticated account. |
| 400 | `valor_invalido` | Bad `valor.original`, `calendario.expiracao`, CPF or CNPJ. |
| 409 | `txid_duplicado` | "Campo txid informado já foi utilizado em outra cobrança". |
| 429 | `Limite de Requisições Excedido` | "Aguarde um momento e tente novamente". |
| 500 | `erro_aplicacao` | e.g. "Ocorreu um erro ao validar a chave". |

**Changing or removing a Charge.** `PATCH /v2/cob/{txid}` (scope `cob.write`) revises an `ATIVA` Charge and returns 200 with `revisao` incremented. The body `{"status": "REMOVIDA_PELO_USUARIO_RECEBEDOR"}` removes it ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)). Bacen forbids combining that removal with other changes, and forbids patching a Charge that is no longer `ATIVA` ([spec, `CobOperacaoInvalida`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). Efí's error for the latter is `status_cobranca_invalido`.

> **Implications for "What is a Charge's full lifecycle?"**
>
> - The txid is ours, so it can be generated and stored before the call.
> - A retried `PUT /v2/cob/{txid}` gets 409 if the first attempt succeeded. "Did the create land?" is answered with `GET /v2/cob/{txid}`, not by re-sending.
> - Efí can also end a Pending Charge early (`REMOVIDA_PELO_USUARIO_RECEBEDOR`), if the lifecycle wants that.

## Tracking

- **One Charge.** `GET /v2/cob/{txid}` (scope `cob.read`) returns the latest revision; `?revisao=n` returns an older one ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)). An unknown txid is documented as **400** `cobranca_nao_encontrada`, where Bacen says 404 `CobNaoEncontrado` ([spec](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **Charges by period.** `GET /v2/cob?inicio=<RFC 3339>&fim=<RFC 3339>` (scope `cob.read`). `inicio` and `fim` are required.
  - Bacen filters on creation time and defines the optional `cpf`, `cnpj`, `status`, `locationPresente`, `paginacao.paginaAtual` (default 0) and `paginacao.itensPorPagina` (default 100, max 1000) ([spec `GET /cob`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
  - Efí's page only says CPF/CNPJ and status filters exist. Its SDK types `cpf`, `cnpj`, `status`, `paginacao.paginaAtual` and `paginacao.itensPorPagina` ([SDK `types/pix.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/types/pix.ts)).
  - The response is `{"parametros": {inicio, fim, paginacao: {paginaAtual, itensPorPagina, quantidadeDePaginas, quantidadeTotalDeItens}}, "cobs": [...]}`.
  - Efí documents no maximum `inicio`–`fim` window.
- **Status values and transitions** ([docs: Status](https://dev.efipay.com.br/docs/api-pix/status), [spec `CobStatus`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)):

| Status | Meaning (Bacen) | Reached by |
| --- | --- | --- |
| `ATIVA` | Created, neither paid nor removed. | Create |
| `CONCLUIDA` | Paid; "não pode acolher outro pagamento". | A Payment settles |
| `REMOVIDA_PELO_USUARIO_RECEBEDOR` | The account holder removed it. | `PATCH` with that status |
| `REMOVIDA_PELO_PSP` | The bank removed it. | Not documented when |

  - Only `ATIVA` can move, to any of the other three, which are final (Bacen allows changes only while `ATIVA`).
  - **Expiry is not a status.** Bacen: "Estado do registro da cobrança. Não se confunde com o estado da cobrança em si, ou seja, não guarda relação com o fato de a cobrança encontrar-se vencida ou expirada". An unpaid Charge whose hour has passed still reads `ATIVA`.
  - After expiry, Efí may keep serving the payload at `location` or answer 404/410; Bacen leaves that to the bank ([spec, `CobPayloadNaoEncontrado`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **The settling Payment.** On a `CONCLUIDA` Charge, `pix[]` holds the Payment ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas), [spec `Pix`](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)):
  - `endToEndId`: 32 alphanumeric chars, the Payment's end-to-end id;
  - `txid`;
  - `valor`: string, 2 decimals;
  - `horario`: RFC 3339, "Horário em que o Pix foi processado no PSP";
  - `infoPagador`: optional free text from the Payer, ≤ 140 chars;
  - `devolucoes[]`: refunds with `id`, `rtrId`, `valor`, `horario.solicitacao` / `horario.liquidacao` and a status of `EM_PROCESSAMENTO`, `DEVOLVIDO` or `NAO_REALIZADO`.

  Efí's own example shows a `valor` of 110.00 on a 100.00 Charge, which a fixed-amount Charge shouldn't allow; read it as a sloppy example.
- **Payments directly.** `GET /v2/pix/{e2eId}` and `GET /v2/pix?inicio=…&fim=…` (scope `pix.read`) return the same Payment fields, with `chave` in the list and Efí's `pagador` extra ([docs: Gestão de Pix](https://dev.efipay.com.br/docs/api-pix/gestao-de-pix)). Bacen's `GET /pix` also defines a `txid` filter; Efí's page doesn't mention it.
- **Payer fields.**
  - Bacen's `Pix` object has no payer identity at all.
  - Efí adds a `pagador` object: `pagador.contaBanco.codigoBanco` on `GET /v2/pix…` (with `?exibirCodigoBanco=true`), and `pix[].pagador {cnpj, nome}` in its `GET /v2/cob` list example.
  - In webhooks Efí adds `gnExtras.pagador`: name, CPF (masked in the example) or CNPJ, bank code, and sometimes the bank account. It does so only when `webhook.notificacao.pagador: true` is set for the key through `PUT /v2/gn/config` ([docs: Endpoints exclusivos](https://dev.efipay.com.br/docs/api-pix/endpoints-exclusivos-efi), [docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)).
  - `infoPagador` is the Payer's free text; Bacen ties it to the `solicitacaoPagador` prompt.
- **Decoding caveat.** Efí's examples give `calendario.expiracao` as a number on create (`3600`) but as a string (`"3600"`) on GET and list ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)). Bacen types it as an integer. The sandbox will show which is real.

> **Implications for "What is a Charge's full lifecycle?"**
>
> - Paid maps to `CONCLUIDA`.
> - Expired has to be computed by the app from `calendario.criacao` + `expiracao`; Efí will keep saying `ATIVA`.
> - A refund done in Efí's own app later shows up under `pix[].devolucoes`. Refunds are out of scope, but such a Charge stays `CONCLUIDA`.
> - Payer data (`pagador`, `infoPagador`, `gnExtras.pagador`) can arrive without being asked for. Collecting it is out of scope, so the app can ignore it. The `gnExtras.pagador` extra is opt-in per key and can simply stay off.

## Webhooks

**Registration** ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)):

- `PUT /v2/webhook/{chave}` (scope `webhook.write`) with `{"webhookUrl": "https://…"}`. Efí documents a 201 response; Bacen says 200.
  - "Uma URL de webhook pode estar associada a várias chaves Pix. Por outro lado, uma chave Pix só pode estar vinculada a uma única URL de webhook."
  - Notifications cover Pix "associados a um `txid`", plus refunds of those Pix reaching a final status ([spec, callback](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
  - The key must belong to the account.
- `GET /v2/webhook/{chave}` returns `webhookUrl`, `chave` and `criacao`. `GET /v2/webhook?inicio=…&fim=…` lists webhooks, and `DELETE /v2/webhook/{chave}` (204) cancels one. The read uses `webhook.read`, the delete `webhook.write`.
- Registration errors include:
  - `valor_invalido` "A URL do webhook deve usar o protocolo HTTPS";
  - `webhook_invalido` "A autenticação de TLS mútuo não está configurada na URL informada";
  - "A URL informada está inacessível";
  - "… atingiu o tempo limite de resposta";
  - "… respondeu com o código HTTP {{httpStatus}}".

**mTLS on the receiving side** ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)):

- "Por norma do Banco Central, será necessário a inserção de uma chave pública da Efí em seu servidor para que a comunicação obedeça o padrão mTLS." Bacen: "as notificações oriundas do PSP recebedor ao usuário recebedor trafegarão utilizando um canal mTLS" ([manual, Anexo II §3.1 item 9](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)).
- At registration Efí makes **two requests**. The first has no client certificate, and the server must refuse it. Then a second one completes the handshake with Efí's certificate. The server needs TLS 1.2 or later and a `POST` route that answers 200.
- Efí's Node sample uses `requestCert: true`, `rejectUnauthorized: true` and `ca: <Efí chain>` and checks `request.socket.authorized`.
- The chains to trust:
  - production: `https://certificados.efipay.com.br/webhooks/certificate-chain-prod.crt`
  - sandbox: `https://certificados.efipay.com.br/webhooks/certificate-chain-homolog.crt`
- Efí recommends "um servidor dedicado". It also publishes an Nginx container that terminates the mTLS and forwards to the app ([efipay/mtls-webhook](https://github.com/efipay/mtls-webhook)).
- Whether our hosting can require client certificates belongs to the "What do Vercel's plans and platform allow for this app?" research. Per that research, Vercel Functions can't verify inbound client certificates on any plan, so the normal registration can't pass on Vercel alone.

**The documented way to skip mTLS, and its uncertain status:**

- Efí's English page, last updated 2025-09-04, has a "Skip-mTLS" section ([docs: Webhooks EN](https://dev.efipay.com.br/en/docs/api-pix/webhooks)). It is meant for shared hosting that can't install Efí's CA: "pass the parameter `x-skip-mtls-checking` in the request header with the value `true` or `false`" on the webhook-registration call.
  - Efí "will always send the certificate in webhooks", but with skip-mTLS "you … are responsible for validating our certificate".
  - The integrator should then check the source IP and add a secret to the URL.
- The Portuguese page carried the same section up to its 2025-09-04 revision ([archived 2026-04-20](https://web.archive.org/web/20260420010759/https://dev.efipay.com.br/docs/api-pix/webhooks/)). The revision of 2026-06-02 replaced it with "Camada adicional de segurança": IP check plus a secret in the URL, presented as layers *on top of* mTLS ([archived 2026-08-07](https://web.archive.org/web/20260807203426/https://dev.efipay.com.br/docs/api-pix/webhooks/)). The current revision, 2026-10-22, has no mention of skipping ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)).
- Efí's SDKs still implement the header. The Node SDK 2.0.1, released 2026-07-31 after that docs change, has an option `validateMtls: false` ("Use `false` somente ao configurar webhooks sem validação mTLS"). It makes the SDK send `x-skip-mtls-checking: true` on the webhook-configuration endpoints only ([SDK README](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/README.md), [SDK `wrapper.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/wrapper.ts), [SDK `httpClient.ts`](https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/httpClient.ts)). The TypeScript, PHP, Python, Ruby, .NET, Java and Dart SDKs also handle or send it: [TypeScript](https://github.com/efipay/sdk-typescript-apis-efi/blob/main/src/lib/endpoints.js), [PHP](https://github.com/efipay/sdk-php-apis-efi/blob/main/src/Efi/Request.php), [Python example](https://github.com/efipay/sdk-python-apis-efi/blob/main/examples/pix/webhooks/cob-cobv/pix_config_webhook.py), [Ruby](https://github.com/efipay/sdk-ruby-apis-efi/blob/main/lib/sdk_ruby_apis_efi/endpoints.rb), [.NET](https://github.com/efipay/sdk-dotnet-apis-efi/blob/main/Efipay/EfiPay.cs), [Java](https://github.com/efipay/sdk-java-apis-efi/blob/main/src/main/java/br/com/efi/efisdk/Config.java), [Dart example](https://github.com/efipay/sdk-dart-apis-efi/blob/main/example/pix/webhooks/cob-cobv/pixConfigWebhook.dart). A GitHub code search found no match in the Go and Delphi SDKs.
- So: documented until mid-2026, still sent by Efí's own SDKs, now absent from the canonical Portuguese docs. Whether Efí still accepts it is unknown until tried.

**URL suffix behaviour** ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)):

- The test notification at registration goes to the URL as registered. Real notifications go to the URL with `/pix` appended. That much is standard: Bacen's callback is `{webhookUrl}/pix` ([spec](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- Registering `https://host/path?ignorar=` keeps `/pix` off the path, so one route serves both. The docs don't show the exact resulting URL.
- The "secret in the URL" pattern is documented as `https://seu_dominio.com.br/webhook?hmac=xyz&ignorar=`.

**Delivery** ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)):

- A `POST` with JSON. For a received Pix:

  ```json
  { "pix": [ { "endToEndId": "E…", "txid": "…", "chave": "…", "valor": "0.01", "horario": "2020-12-21T13:40:34.000Z", "infoPagador": "…" } ] }
  ```

  - The array can hold several Payments: Bacen lets the bank group Pix of the same key ([spec](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
  - The same URL also receives refund updates (`pix[].devolucoes`) and "Recebimento recusado" notices, added in the 2026-10-22 revision: `{"info": [{chave, pagador, valor, status: "RECEBIMENTO_RECUSADO", motivo, recusadoEm}]}`, a Pix refused for security reasons. That notice has no `txid` in the example.
  - Optional extras appear under `gnExtras` (`pagador`, `tarifa`, `split`) when configured.
- Efí sends a notification for every txid-bearing Pix on the key, whether or not our app created the Charge.
- No signature or HMAC header is documented. Authenticity rests on mTLS, or on the IP check and URL secret.
- Each attempt times out after 60 s. Efí expects any `2XX`; otherwise it retries "até 9 novas tentativas" on this table:

| Attempt | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wait | immediate | 5 min | 5 min | 5 min | 10 min | 20 min | 40 min | 80 min | 160 min |

  If the waits are intervals, which the docs don't say, the last attempt comes about 5 h 25 min after the first. The text says "9 novas tentativas", but the table has 9 rows including the first.
- **Resend.** `POST /v2/gn/webhook/reenviar` (scope `webhook.write`) with `{"tipo": "PIX_RECEBIDO", "e2eids": ["E…"]}`. It takes 1 to 1000 ids, works for Payments up to 30 days old, and makes a single attempt with no rescheduling. In the sandbox it answers 500 "Funcionalidade desabilitada em ambiente de homologação".
- **Source IPs.** The Pix webhooks page gives one address: "IP atualmente utilizado nas comunicações: 34.193.116.226", documented as *current* ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)).
  - The help article "Quais endereços de IP a Efí utiliza?" (`updatedAt` 2025-06-03; its body says "Última atualização: 13 de Fevereiro de 2017") lists 28 "Callbacks" addresses, all `/32`, which include that one ([help: IPs](https://sejaefi.com.br/central-de-ajuda/api/quais-enderecos-de-ip-gerencianet-utiliza)):
    - 15 in `52.67.0.0/16`: `52.67.22.130`, `52.67.133.213`, `52.67.128.220`, `52.67.210.55`, `52.67.87.232`, `52.67.201.12`, `52.67.90.164`, `52.67.189.75`, `52.67.35.112`, `52.67.188.36`, `52.67.196.17`, `52.67.183.243`, `52.67.169.217`, `52.67.182.245`, `52.67.79.91`;
    - 13 in `34.192`–`34.199`: `34.199.187.141`, `34.199.194.54`, `34.192.27.251`, `34.199.165.182`, `34.192.243.178`, `34.199.226.208`, `34.193.116.226`, `34.199.226.102`, `34.199.188.192`, `34.199.214.108`, `34.199.222.108`, `34.199.188.181`, `34.199.219.73`.
  - The article doesn't say which product's callbacks the list covers, and the API Cobranças notifications page links to it ([docs: API Cobranças, notificações](https://dev.efipay.com.br/docs/api-cobrancas/notificacoes)). An IP filter built on the single Pix address is narrower but follows the Pix page.
- Bacen leaves the delivery SLA to each bank but expects "um aviso 'on-line'" ([spec, callback](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). Efí documents no latency figure beyond "A primeira tentativa ocorre imediatamente".

> **Implications for "How does the system learn a Charge was paid?"** Efí offers two ways to learn of a Payment:
>
> - **Push.** A webhook per Pix key, one URL per key per environment. The receiving endpoint must enforce mTLS with Efí's chain unless the skip header still works, and the payloads are unsigned. Retries last about 5 h; after that only a manual resend helps.
> - **Pull.** `GET /v2/cob/{txid}`, with no documented rate limit on GETs, and `GET /v2/cob` / `GET /v2/pix` by period for reconciling the Charges page.
>
> The "What do Vercel's plans and platform allow for this app?" research reports that Vercel Functions can't verify inbound client certificates on any plan. That leaves the push path with three options:
>
> - the `x-skip-mtls-checking` header, if Efí still honours it, with the source-IP and URL-secret checks instead;
> - an mTLS-terminating proxy hosted elsewhere, as in Efí's [Nginx container](https://github.com/efipay/mtls-webhook);
> - no webhooks at all, relying on the pull path alone.
>
> The sandbox confirms R$ 0,01–10,00 Charges and sends their webhooks, so both paths can be exercised there. Resend can't be.

## Limits and costs

**Rate limits** ([docs: Limites de Consumo](https://dev.efipay.com.br/docs/api-pix/limites-de-consumo), updated 2025-05-08):

- "Os endpoints com métodos PUT e POST da nossa API Pix estão sujeitos a um limite de `500 requisições por segundo`." The table lists `POST /v2/cob`, `PUT /v2/cob/{txid}`, `POST /v2/loc` and `PUT /v2/webhook/{chave}`, among others.
- Above the limit Efí returns 429 `{"nome": "Limite de Requisições Excedido", …}` ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas)). Efí suggests queues or retries "com intervalos variáveis".
- The docs don't say whether the limit is per application, per account or global.
- No limit is documented for GET endpoints or for `/oauth/token`.
- The "baldes de fichas" token buckets (`GET /v2/gn/chaves/balde`) cover DICT key lookups for *sending* Pix, not Charges ([docs: Endpoints exclusivos](https://dev.efipay.com.br/docs/api-pix/endpoints-exclusivos-efi)).

**Fees** (Efí [tarifas](https://sejaefi.com.br/tarifas) and [API Pix page](https://sejaefi.com.br/efi-pay/api-pix), both read 2026-11-10):

| Item | Price |
| --- | --- |
| "Pix Cobrança — Receber por cobrança com QR Code dinâmico ou Pix Copia e Cola – Pix Cob e Pix CobV via API" | **1,19%** of the amount received |
| "Pix pela API — Receber por QR Code dinâmico" | 1,19% |
| API integration, monthly fee | Free ("API Pix com integração gratuita – Sem mensalidade") |
| Creating, changing or cancelling Charges | Free ("Emissão de cobranças ilimitadas. Cancelamento e alteração de cobranças.") ([help: fees](https://sejaefi.com.br/central-de-ajuda/tarifas-e-prazos/tarifas-cobradas-pela-gerencianet), updated 2026-03-25) |

- "*A gratuidade não é válida para recebimentos por uma chave Pix cadastrada na API ou webhook". This is the app's "30 Pix GRÁTIS por mês".
- "As tarifas podem variar de acordo com a data de contratação e/ou negociações comerciais", and at high volume "a taxa pode ser negociada".
- The tarifas page shows the same Pix prices on the Efí Empresas and Efí Pro tabs.
- No minimum, maximum or rounding rule is published.
- Efí charges a R$ 39,90 inactivity fee on Efí Pro and Efí Empresas accounts idle for more than 120 days with a balance ([help: fees](https://sejaefi.com.br/central-de-ajuda/tarifas-e-prazos/tarifas-cobradas-pela-gerencianet)).
- The fee can be included in webhooks as `gnExtras.tarifa` when `webhook.notificacao.tarifa` is enabled for the key ([docs: Endpoints exclusivos](https://dev.efipay.com.br/docs/api-pix/endpoints-exclusivos-efi)).

> **Implications for "How do we keep bots from creating Charges?"** Efí's only guard is 500 req/s per endpoint, far above anything a donation page needs. Creating Charges costs nothing at Efí, so a bot costs no fees. It does fill the Bank Account with junk Charges, and a flood could hit the 429 limit for real Payers. The protection has to live in the app.

## Sandbox

- **Access.** The sandbox is part of every application: the Homologação Client_Id/Client_Secret pair, a certificate created under Meus Certificados → Homologação, and the base URL `https://pix-h.api.efipay.com.br`. Efí's help calls it the "ambiente de testes/sandbox (aba Homologação)" ([help: Client Id/Secret](https://sejaefi.com.br/central-de-ajuda/api/como-obter-chaves-client-id-e-client-secret-na-api)). Scopes are enabled separately for Homologação ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)).
- **Paying a sandbox Charge.** "Cobranças com valor entre R$ 0.01 à R$ 10.00 são confirmadas, e você receberá a informação via Webhook. Cobranças com valor acima de R$ 10.00 permanecem ativas, sem confirmação, e não há webhook nesses casos" ([docs: Cobranças imediatas](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas), [docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)).
  - So a Paid Charge is tested with any amount from R$ 1,00 to R$ 10,00, and an Expired one with more than R$ 10,00 and a short `expiracao`.
  - How quickly the confirmation happens isn't documented.
  - No way to pay a sandbox Charge from a real banking app is documented.
- **Differences from production.**
  - The webhook trusts the homologação certificate chain (URL above).
  - `linkVisualizacao` and the hosted payment links work only in production ([docs: Payload Locations](https://dev.efipay.com.br/docs/api-pix/payload-locations)).
  - Webhook resend, and the MED endpoints, answer "Funcionalidade desabilitada em ambiente de homologação" ([docs: Webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks)).
  - The dashboard keeps a separate request log per environment ([docs: Interpretando erros](https://dev.efipay.com.br/docs/erros/introducao)).
- **Not documented.** Which `chave` the sandbox accepts: an existing key of the account, or one created through `POST /v2/gn/evp` against `pix-h`? Also whether sandbox and production webhook registrations for the same key are independent.

## Where Efí departs from the Bacen standard

| Topic | Bacen API Pix 2.10.0 | Efí |
| --- | --- | --- |
| Re-using a txid on `PUT /cob/{txid}` | PUT may revise an existing `ATIVA` Charge; no 409 in the spec | 409 `txid_duplicado` |
| Unknown txid on `GET /cob/{txid}` | 404 `CobNaoEncontrado` | Documented as 400 `cobranca_nao_encontrada` |
| Error bodies | RFC 7807 problem JSON (`type`, `title`, `status`, `detail`, `violacoes`) | Mostly `{"nome", "mensagem"}` on Charge, Payment and location endpoints; RFC 7807 on newer ones such as resend |
| `PUT /webhook/{chave}` success | 200 | 201 |
| Webhook registration | Callback to `{webhookUrl}/pix` over mTLS | Same, plus a test POST to the bare URL, a two-request mTLS probe, `?ignorar=`, and the (now undocumented) `x-skip-mtls-checking` header |
| Payer data | None in the `Pix` object | `pagador` on `/v2/pix` and the Charge list; `gnExtras.pagador` and `gnExtras.tarifa` in webhooks (opt-in); `RECEBIMENTO_RECUSADO` notices |
| QR image | Not specified | `GET /v2/loc/{id}/qrcode` returns the image and a payment link |
| Extra endpoints | — | `/v2/gn/*`: account config, EVP keys, balance, webhook resend, receipts, reports |
| Rate limits | Not specified | 500 req/s per PUT/POST endpoint, 429 |
| Sandbox | Not specified | Auto-confirms Charges of R$ 0,01–10,00 |
| `POST /cob` (bank-chosen txid) | Standard | Same; Efí's wording calls it an exception, but it isn't a departure |

Coming in Bacen `2.11.0-rc1` (2026-10-29, a release candidate): `valorLiquido` on `Pix` and its notifications, and new `WebhookCob` notifications. Efí hasn't documented either ([changelog](https://github.com/bacen/pix-api/blob/master/changelog.md)).

## Sandbox access checklist

For the "Set up Efí sandbox access" task. Never paste the Client_Id, Client_Secret, `.p12`/`.pem` files or tokens into the repo, issues or comments. Keep the files **outside** this repository's directory, because `.gitignore` doesn't cover `*.p12`/`*.pem`.

[`efi-sandbox-check.mjs`](efi-sandbox-check.mjs), next to this file, automates steps 6–8 without printing secrets: it reports the `.p12`'s encryption and whether Node loads it as issued (falling back to an in-memory PEM conversion), requests a token, and with `--charge` creates and polls one R$ 1,00 sandbox Charge. Usage is in its header.

1. **Account.** Log in to an **Efí Pro** account (PF, CPF) or an **Efí Empresas** account (PJ) in the web dashboard. Efí Pay and its APIs are offered only on those two ([help: Efí Pay](https://sejaefi.com.br/central-de-ajuda/efi-pay/o-que-e-efi-pay)). If the only account is Efí Para você, check whether the "API" menu exists before going further, and record it as the blocker if it doesn't.
2. **Pix key.** Under Menu → Pix → Minhas chaves, confirm the account has a Pix key, or create one ([help: cadastrar chaves](https://sejaefi.com.br/central-de-ajuda/pix/como-cadastrar-chaves-pix)). Note which key it is; it goes in `chave`.
3. **Sandbox certificate.** API (bottom of the left menu) → **Meus Certificados** → select **Homologação** → **Novo Certificado** → give it a description → confirm → **download the `.p12` right away**, since it can't be downloaded again ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)). An active certificate is needed before the application can use API Pix ([help: criar aplicação](https://sejaefi.com.br/central-de-ajuda/api/como-criar-uma-nova-aplicacao-para-usar-a-api-pix)).
4. **Application.** API → **Aplicações** → **Criar aplicação** → name it → enable **API Pix** → under **Homologação**, tick:
   - `cob.write` and `cob.read`, to create and read Charges;
   - `pix.read`, to read Payments;
   - `webhook.write` and `webhook.read`, if webhooks are chosen;
   - `payloadlocation.read`, if Efí's QR image is used;
   - optionally `gn.pix.evp.write` and `gn.pix.evp.read`, to create a sandbox random key if the account's key is rejected.

   Then **Continuar** / **Criar aplicação** and validate. Production scopes can wait until launch. Scopes are editable later under API → Aplicações → ⋯ → Configurações. This list is a proposal; the grilling tickets may trim it.
5. **Credentials.** Open the application and, on its **Homologação** tab, copy the Client_Id and Client_Secret into the Operator's password manager ([help: Client Id/Secret](https://sejaefi.com.br/central-de-ajuda/api/como-obter-chaves-client-id-e-client-secret-na-api)).
6. **PEM copy for curl** (optional, outside the repo). Efí's own conversion is ([docs: Credenciais](https://dev.efipay.com.br/docs/api-pix/credenciais)):

   ```sh
   openssl pkcs12 -in homologacao.p12 -out homologacao.pem -nodes -password pass:""
   ```

   If OpenSSL 3 rejects the file's algorithm, add `-legacy` ([OpenSSL `pkcs12`](https://docs.openssl.org/3.0/man1/openssl-pkcs12/)). The `.pem` holds an unencrypted private key, so delete it after testing.
7. **Token request over mTLS.** Placeholders only:

   ```sh
   curl --request POST "https://pix-h.api.efipay.com.br/oauth/token" \
     --cert ./homologacao.pem \
     --user "<HOMOLOGACAO_CLIENT_ID>:<HOMOLOGACAO_CLIENT_SECRET>" \
     --header "Content-Type: application/json" \
     --data '{"grant_type": "client_credentials"}'
   ```

   - `--user` produces the `Authorization: Basic base64(id:secret)` header Efí expects.
   - `--cert` takes a PEM file holding the certificate and the key ([curl manpage](https://curl.se/docs/manpage.html)).
   - If your curl's TLS backend reads PKCS#12, `--cert-type P12 --cert "./homologacao.p12:"` (empty password after the colon) skips step 6.
   - Success is `200` with `"token_type": "Bearer"`, `"expires_in": 3600` and a `scope` string listing the scopes from step 4.
   - `401`/Unauthorized usually means a production/homologação mix-up of credentials or certificate ([help: Unauthorized](https://sejaefi.com.br/central-de-ajuda/api/estou-deparando-com-mensagem-de-unauthorized-sem-autorizacao-por-que)).
8. **Optional smoke test.** Create a sandbox Charge of R$ 1,00, which the sandbox should auto-confirm, and read it back:

   ```sh
   curl --request PUT "https://pix-h.api.efipay.com.br/v2/cob/<TXID_26_TO_35_ALPHANUMERIC>" \
     --cert ./homologacao.pem \
     --header "Authorization: Bearer <ACCESS_TOKEN>" \
     --header "Content-Type: application/json" \
     --data '{"calendario":{"expiracao":3600},"valor":{"original":"1.00"},"chave":"<PIX_KEY_FROM_STEP_2>"}'
   ```

   - If it fails with `chave_invalida`, the sandbox doesn't accept that key. Try one created with `POST /v2/gn/evp` against `pix-h`, then record which worked: this isn't documented.
   - Read the Charge back with `GET /v2/cob/<txid>`. Check whether it turned `CONCLUIDA`, how long that took, and whether `calendario.expiracao` comes back as a number or a string.
9. **Debugging.** API → Aplicações → (app) → Homologação → **Histórico de Requisições** shows every request Efí received ([docs: Interpretando erros](https://dev.efipay.com.br/docs/erros/introducao)).
10. **Record.** In the ticket, write only where the credentials and certificate are kept and which account type (Efí Pro or Efí Empresas) was used.

## Gaps and open questions

- **Skip-mTLS status.** This is the one open fact that decides whether Efí webhooks can reach a Vercel Function at all.
  - It's unknown whether `PUT /v2/webhook/{chave}` still honours `x-skip-mtls-checking: true`. The header was removed from the Portuguese docs in the 2026-06-02 revision, but it is still on the English page and still sent by the SDKs.
  - If it works, it's also unknown whether registration still runs the "first request without a certificate must be refused" probe.
  - Testing it needs a public HTTPS endpoint, such as a Preview deployment, registered against the sandbox.
- **Webhook source IPs.** Pix's single documented address (`34.193.116.226`) is labelled "currently used". The 28-address "Callbacks" list dates itself 2017 and doesn't name the products it covers. Efí documents no change-notification process for either.
- **Certificate and secret lifetime.** No validity period or renewal procedure is documented for certificates, and nothing says whether a Client_Secret expires or can be regenerated. The `notAfter` of a real certificate will tell. The two sources also disagree on the certificate limit: 5 per environment (docs) or 5 per account (help).
- **PF eligibility.** That Efí Para você can't create API applications is inferred from what the help center and tarifas page leave out; no page states it.
- **Sandbox key and timing.** Which `chave` the sandbox accepts, how soon a ≤ R$ 10,00 sandbox Charge turns `CONCLUIDA`, whether sandbox webhooks also require mTLS, and whether sandbox and production webhook registrations for a key are independent.
- **Expiry edge cases.** Whether Efí ever moves an unpaid expired Charge to `REMOVIDA_PELO_PSP`, and when it uses that status at all. Whether a Payment can still settle a Charge that has just expired, which Bacen's manual says shouldn't happen since the payment must be made within `expiracao`. Whether the payload at `location` returns 404/410 after expiry.
- **Webhook retry semantics.** Whether the table's waits are intervals or offsets, and whether there are 9 attempts or 10. No latency SLA is published.
- **Unlisted limits.** GET endpoints and `/oauth/token` have no documented rate limit. List endpoints have no documented maximum `inicio`–`fim` window. The docs don't say whether the 500 req/s applies per application, per account or globally.
- **Docs versus reality.** The 400 (rather than 404) for an unknown txid, mixed error-body shapes, and `expiracao` arriving as a string or a number all need confirming in the sandbox. Several Efí examples don't match their own patterns: hyphenated txids, 23-character txids and 26-character end-to-end ids in webhook samples. So decoding should follow Bacen's types but not reject odd-looking ids from Efí.
- **Fee details.** No minimum, rounding or cap on the 1,19% is published, and contracts may differ ("podem variar de acordo com a data de contratação").
- **OpenSSL 3 and legacy `.p12`.** Whether Efí's `.p12` uses legacy PKCS#12 algorithms that OpenSSL 3, and so Node, refuses without the legacy provider. The official Node SDK requires Node ≥ 22 and passes the `.p12` straight to `https.Agent`, which suggests it loads fine; this is unverified.
- **Bacen 2.11.0-rc1.** `valorLiquido` and the `WebhookCob` notifications aren't in Efí's docs yet.

## Sources

Efí developer docs (each with its "Última atualização" date):

- https://dev.efipay.com.br/docs/api-pix/credenciais (2025-05-15)
- https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas (2025-08-28)
- https://dev.efipay.com.br/docs/api-pix/glossario (2025-04-24)
- https://dev.efipay.com.br/docs/api-pix/status (2026-10-22)
- https://dev.efipay.com.br/docs/api-pix/payload-locations (2025-05-08)
- https://dev.efipay.com.br/docs/api-pix/gestao-de-pix (2025-11-20)
- https://dev.efipay.com.br/docs/api-pix/webhooks (2026-10-22)
- https://dev.efipay.com.br/en/docs/api-pix/webhooks (English, 2025-09-04)
- https://web.archive.org/web/20260420010759/https://dev.efipay.com.br/docs/api-pix/webhooks/ (Portuguese page, revision of 2025-09-04, with Skip-mTLS)
- https://web.archive.org/web/20260807203426/https://dev.efipay.com.br/docs/api-pix/webhooks/ (Portuguese page, revision of 2026-06-02, without it)
- https://dev.efipay.com.br/docs/api-pix/limites-de-consumo (2025-05-08)
- https://dev.efipay.com.br/docs/api-pix/endpoints-exclusivos-efi (2026-07-29)
- https://dev.efipay.com.br/docs/erros/introducao (2025-05-22)
- https://dev.efipay.com.br/docs/api-cobrancas/notificacoes (2024-02-20; links to Efí's IP list)

Efí help center, pricing and product pages (help articles with their `updatedAt`):

- https://sejaefi.com.br/central-de-ajuda/efi-bank/quais-sao-os-tipos-de-conta-da-efi-bank (2026-03-17)
- https://sejaefi.com.br/central-de-ajuda/efi-bank/efi-pro-e-uma-conta-digital-pf-ou-pj (2023-06-22)
- https://sejaefi.com.br/central-de-ajuda/efi-bank/o-que-tem-na-conta-digital-efi-pro (2024-06-06)
- https://sejaefi.com.br/central-de-ajuda/efi-pay/o-que-e-efi-pay (2024-09-04)
- https://sejaefi.com.br/central-de-ajuda/efi-pay/como-contratar-as-solucoes-da-efi-pay (2024-06-25)
- https://sejaefi.com.br/central-de-ajuda/api/como-gerar-o-certificado-para-usar-a-api-pix (2024-06-05)
- https://sejaefi.com.br/central-de-ajuda/api/como-criar-uma-nova-aplicacao-para-usar-a-api-pix (2024-06-05)
- https://sejaefi.com.br/central-de-ajuda/api/como-alterar-uma-aplicacao-existente-para-uso-da-api-pix (2024-06-05)
- https://sejaefi.com.br/central-de-ajuda/api/como-obter-chaves-client-id-e-client-secret-na-api (2024-06-05)
- https://sejaefi.com.br/central-de-ajuda/api/estou-deparando-com-mensagem-de-unauthorized-sem-autorizacao-por-que (2024-06-05)
- https://sejaefi.com.br/central-de-ajuda/pix/como-cadastrar-chaves-pix (2024-06-05)
- https://sejaefi.com.br/central-de-ajuda/pix/posso-ter-mais-de-uma-chave-de-enderecamento-em-uma-mesma-conta-gerencianet (2023-06-15)
- https://sejaefi.com.br/central-de-ajuda/tarifas-e-prazos/tarifas-cobradas-pela-gerencianet (2026-03-25)
- https://sejaefi.com.br/central-de-ajuda/api/quais-enderecos-de-ip-gerencianet-utiliza (2025-06-03; body dated 2017-02-13)
- https://sejaefi.com.br/tarifas (read 2026-11-10)
- https://sejaefi.com.br/efi-pay/api-pix (read 2026-11-10)

Efí source code (official `efipay` organization):

- https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/README.md (SDK 2.0.1, published to npm 2026-07-31)
- https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/wrapper.ts
- https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/httpClient.ts
- https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/constants/endpoints.ts
- https://github.com/efipay/sdk-node-apis-efi/blob/2.0.1/src/types/pix.ts
- https://github.com/efipay/mtls-webhook
- https://github.com/efipay/sdk-typescript-apis-efi/blob/main/src/lib/endpoints.js
- https://github.com/efipay/sdk-php-apis-efi/blob/main/src/Efi/Request.php
- https://github.com/efipay/sdk-python-apis-efi/blob/main/examples/pix/webhooks/cob-cobv/pix_config_webhook.py
- https://github.com/efipay/sdk-ruby-apis-efi/blob/main/lib/sdk_ruby_apis_efi/endpoints.rb
- https://github.com/efipay/sdk-dotnet-apis-efi/blob/main/Efipay/EfiPay.cs
- https://github.com/efipay/sdk-java-apis-efi/blob/main/src/main/java/br/com/efi/efisdk/Config.java
- https://github.com/efipay/sdk-dart-apis-efi/blob/main/example/pix/webhooks/cob-cobv/pixConfigWebhook.dart

Central Bank and standards:

- https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml (API Pix 2.10.0, released 2026-08-19)
- https://github.com/bacen/pix-api/blob/master/changelog.md (includes 2.11.0-rc1, 2026-10-29)
- https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf (Manual de Padrões para Iniciação do Pix v2.10.0, PDF dated 2026-10-29)
- https://www.rfc-editor.org/rfc/rfc8705
- https://www.rfc-editor.org/rfc/rfc5280#section-4.1.2.5
- https://docs.openssl.org/3.0/man1/openssl-pkcs12/
- https://curl.se/docs/manpage.html
