# How does Inter's PIX API work for us?

Research for the wayfinder ticket "How does Inter's PIX API work for us?". Everything below was read on **2026-11-10**:

- Inter's OpenAPI for the **API Pix** as served by its developer portal ([`swagger-api-pix-yaml.yaml`](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), `info.version` empty, HTTP `Last-Modified: Tue, 27 Oct 2026`) and for **OAuth** ([`swagger-token-yaml.yaml`](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml)). These are the files behind the rendered references at [developers.inter.co/references/pix](https://developers.inter.co/references/pix) and [/references/token](https://developers.inter.co/references/token). Below, "Inter's Pix spec" means the first file.
- Inter's guides, FAQ, error page and changelog on developers.inter.co (newest changelog entry: 18/05/2026), Inter's sample webhook server and SDK on GitHub, and Inter's PJ tariff table in force since 21/06/2025. That is the newest PJ table listed on [inter.co/tarifas](https://inter.co/tarifas/) on 2026-11-10.
- The Central Bank's API Pix spec, **release 2.10.0** (2026-08-19) ([openapi.yaml @ 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). Release 2.11.0-rc1 (2026-10-29) is a release candidate and nothing here relies on it ([changelog](https://github.com/bacen/pix-api/blob/master/changelog.md)).
- A TLS handshake with both API hosts using `openssl s_client`, with no credentials, on 2026-11-10.

Quotes are verbatim pt-BR. "Integration" means Inter's *integração*: an API application with its own credentials, which a Bank Account would reference. It is not a synonym for Bank Account. Statements marked **(inferred)** are my reading where the sources are silent.

## Answer

- **Production needs an Inter Empresas (PJ) account and an approved integration; sandbox doesn't.** Inter's FAQ says API integrations are "apenas para conta PJ", in answer to whether MEI or PF accounts can have one ([FAQ](https://developers.inter.co/duvidas-frequentes)). Since 2026 every new integration goes through an Inter review ("Em validação"). The Pix API was closed to new integrations from 24/12/2025 to 12/03/2026 ([changelog 24/12/2025](https://developers.inter.co/changelog/24/12/2025), [12/03/2026](https://developers.inter.co/changelog/12/03/2026), [10/04/2026](https://developers.inter.co/changelog/10/04/2026)). The sandbox runs on a free developer-portal account ([sandbox](https://developers.inter.co/docs/sandbox/como-criar-uma-aplicacao)).
- **Each integration has a Client ID, a Client Secret, a client certificate (`.crt`) and a private key (`.key`), handed out once.** A production certificate lasts 1 year. Renewal is possible from 90 days before expiry to 90 days after. It issues a new `.crt`/`.key` and keeps the same Client ID, Client Secret and scopes. A sandbox certificate lasts 30 days, after which you create a new integration ([create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao), [renew](https://developers.inter.co/docs/introducao/como-renovar-uma-integracao), [sandbox](https://developers.inter.co/docs/sandbox/como-criar-uma-aplicacao)).
- **Auth is OAuth 2.0 client credentials over mTLS.** You call `POST /oauth/v2/token` with the client certificate, and send the certificate on every API call too. Tokens last 60 minutes. The token endpoint allows only **5 requests per minute**, so tokens have to be cached and shared, never fetched per request ([token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml), [FAQ](https://developers.inter.co/duvidas-frequentes), [errors](https://developers.inter.co/erros-status-code)).
- **Inter does not require pre-registered IPs for API calls.** Callers are identified by client certificate plus OAuth. No guide, spec, FAQ entry or step of creating an integration asks for the server's source IPs; I searched them all on 2026-11-10. The only IP caveat is a risk, not a registration step: an HTTP 406 can mean Inter's firewall blocked an IP "considerado malicioso", which is "comum para integrações em cloud, utilizando IPs dinâmicos", and Inter suggests "um IP dedicado". So Inter's docs alone don't force static egress IPs (Vercel Pro), but calls from Vercel need a smoke test. Inter's separate SOAP remittance API on masspayments.inter.co does require whitelisted IPs; that is a different product ([errors](https://developers.inter.co/erros-status-code), [create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao), [mass-payments guide](https://masspayments.inter.co/ppapis3/documentation/articles/GettingStarted.html)).
- **A Charge is a standard BACEN `cob`: `PUT /pix/v2/cob/{txid}`.** The request carries our txid (26–35 alphanumerics, unique per receiving CPF/CNPJ), `calendario.expiracao: 3600`, `valor.original` and a Pix key (`chave`) owned by the account. The `201` returns `pixCopiaECola` (the Copia e Cola, at most 512 characters), `location`, `calendario.criacao` and `status: ATIVA`. **No QR image is returned**: we render the QR from the Copia e Cola ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [FAQ](https://developers.inter.co/duvidas-frequentes)).
- **Tracking uses `GET /pix/v2/cob/{txid}`.** `status` goes from `ATIVA` to `CONCLUIDA` when the Charge is paid, and the Payment shows up in `pix[]` (`endToEndId`, `valor`, `horario`, `infoPagador`). **There is no expired status**: the spec says `status` has nothing to do with expiry, so we compute it from `calendario.criacao + expiracao`. Lists by period are `GET /cob` and `GET /pix`, up to 1,000 items per page ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **Rate limits are tight.** Each Pix endpoint allows **120 calls/min in production and 10/min in sandbox**, and webhook management allows 10/min. Going over returns HTTP 429. The docs don't say what the counter is keyed on. This caps how often open Payer screens can poll ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [errors](https://developers.inter.co/erros-status-code)).
- **Webhooks reach a receiver that doesn't do mTLS, and Inter publishes the IPs they come from.**
  - One URL per Pix key, registered with `PUT /pix/v2/webhook/{chave}`. Inter POSTs `{"pix":[…]}` with an `x-conta-corrente` header.
  - Inter presents its own client certificate, and its guide tells receivers to validate it against Inter's `ca.crt`. Inter's own sample server, though, explains how to switch that check off, after which "qualquer requisição … será aceita". Nothing says Inter refuses such a receiver. **(inferred)** Delivery works without mTLS.
  - There is no signature or auth header. Without mTLS, a callback can only be authenticated by its source IP (48 published addresses and ranges, updated 21/07/2025), a secret in our URL, or by re-reading the Charge.
  - A failed delivery is retried up to 4 times, after 20, 30, 60 and 120 minutes. A callback history and a resend endpoint exist.

  Sources: [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [webhook guide](https://developers.inter.co/docs/webhooks/como-config-webhooks), [sample server](https://github.com/inter-co/pj-webhook-server-java).
- **Callbacks carry payer data we never asked for.** Since 10/09/2024 Inter adds `pagador.nome` and `pagador.cpfCnpj` to Pix Charge callbacks, with an individual's CPF masked. This field is not part of the BACEN schema ([changelog 10/09/2024](https://developers.inter.co/changelog/10/09/2024), [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).
- **Fees are charged per Payment, not per Charge.** Receiving a dynamic immediate QR (`cob`) costs **0.9% of the amount, minimum R$ 0,10, maximum R$ 1,50**. A monthly free allowance comes first: 30 for "MEI e PJ (Digital)", 60 for PJ PRO, 100 for higher tiers. Creating Charges has no quota and no fee ([PJ tariff table](https://static.bancointer.com.br/site/tabela-tarifas/06828f37a7464f8ab3eb4e5571586214_tabela-de-tarifas-pj-maio.pdf), [FAQ](https://developers.inter.co/duvidas-frequentes)).
- **The sandbox (`cdpj-sandbox.partners.uatinter.co`) only works Monday to Friday, 08:00–20:00.** Sandbox integrations come with every scope. Two sandbox-only endpoints simulate a Payment: `POST /pix/v2/cob/pagar/{txid}` and `POST /pix/v2/sandbox/cob/pagamento`, both with scope `pix.write` ([sandbox](https://developers.inter.co/docs/sandbox/sobre-este-portal), [testing](https://developers.inter.co/docs/sandbox/como-testar-aplicacao), [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).

## Access and credentials

### Which accounts qualify

- **PJ only.** "O acesso às APIs do Inter é exclusivo para clientes pessoa jurídica" ([create an integration](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao)). "Para realização das integrações com as APIs do Inter é necessário ser um cliente Inter PJ" ([about this portal](https://developers.inter.co/docs/introducao/sobre-este-portal)).
- **MEI and PF are excluded.** The FAQ asks "Posso criar uma API para uma conta MEI ou PF?" and answers "Atualmente as Integrações via API poderão ser realizada apenas para conta PJ." ([FAQ](https://developers.inter.co/duvidas-frequentes)). Inter does sell MEI accounts, which the tariff table groups as "MEI e PJ (Digital)" ([PJ tariff table](https://static.bancointer.com.br/site/tabela-tarifas/06828f37a7464f8ab3eb4e5571586214_tabela-de-tarifas-pj-maio.pdf)). Going by the FAQ, an Inter MEI account is not enough for the API.
- **Opening an Inter Empresas account.** It is advertised as "Conta PJ 100% gratuita". The sign-up asks for the company name and CNPJ, then "Envie os documentos da sua empresa" ([Inter Empresas account page](https://inter.co/empresas/conta-digital/pessoa-juridica/)). The developer docs only say "um conjunto de documentos será solicitado" ([our APIs](https://developers.inter.co/docs/introducao/nossas-apis)). Inter's own blog post (2022, updated 11/07/2023, so possibly stale) says the documents "variam de acordo com o tipo da empresa". Its list: CNPJ and corporate name, the CPF of the person responsible, addresses, partners'/directors' documents (for non-customers), 12-month revenue or a forecast, references, tax regime, and incorporation documents such as the *contrato social*. It also requires a selfie in the Inter Empresas app and quotes a reply "de até 5 dias úteis" ([Inter blog](https://blog.inter.co/abrir-conta-pj)).
- **The sandbox needs only a developer-portal account.** Details are under [Sandbox](#sandbox).

### Creating and scoping an integration (production)

Steps from [Como criar uma integração?](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao):

1. In the PJ internet banking, open the **Integrar** menu and choose **Nova integração**. Older pages name the menu "Soluções para sua empresa" → "Nova Integração" / "Minhas integrações" ([portal home](https://developers.inter.co/), [webhook guide](https://developers.inter.co/docs/webhooks/como-config-webhooks)).
2. Enter a name and description and pick **Permissões**: "Cada API exige escopos específicos". The first time, you must "ler e aceitar os termos de uso de cada API selecionada".
3. Click **Continuar**. "O sistema realizará verificações automáticas" and then opens a form in three parts: **Seus clientes** (your customers' profile and activities), **Sua empresa**, and **Seu negócio** (line of business and business model). Then click **Enviar**.
4. **Analysis.** The status shows "Em validação", and "não será possível criar outras integrações até que o processo de análise seja concluído". Progress is under **Integrar > Minhas Integrações**, and an email arrives when the review ends.
5. **Activation.** The status becomes "Novo". From **Ações**, *Detalhes da integração* shows the permissions and the linked accounts. *Download chave e certificado* generates the credentials and shows them in a pop-up ("Salve o Client Secret e o Client ID — Essas informações não poderão ser visualizadas novamente"). A few minutes later the status becomes "Ativo".

Context from the changelog:

- 24/12/2025: the Pix API and the Banking API, except balance and statement, were "temporariamente desabilitadas para novas integrações". Existing integrations were not affected ([changelog](https://developers.inter.co/changelog/24/12/2025)).
- 12/03/2026: both were re-enabled, and "Todas as solicitações passarão por uma análise" ([changelog](https://developers.inter.co/changelog/12/03/2026)).
- 10/04/2026: "Um novo processo de análise para utilização de APIs foi implementado, seguindo critérios internos e regulatórios … antes da liberação dos certificados" ([changelog](https://developers.inter.co/changelog/10/04/2026)).

**Scopes.** A token can only include scopes that were selected when the integration was created: "só é possível incluir no token os escopos que foram previamente selecionados" ([Como gerar um token OAuth?](https://developers.inter.co/docs/configurando-postman-testes/como-gerar-um-token-oauth)). The scopes we need are listed under [Auth](#auth). The docs don't give the internet-banking labels of the Pix permissions.

**Several accounts per integration.** Since 08/03/2023 one integration can operate "uma ou mais contas correntes do seu grupo". You pick the account per call with `x-conta-corrente` ([changelog 08/03/2023](https://developers.inter.co/changelog/08/03/2023)).

### Credential material

- **Client ID and Client Secret.** These are the OAuth client credentials, "obtidas no momento em que se cria uma integração, após baixar o certificado e a chave" ([OAuth 2.0](https://developers.inter.co/docs/introducao/oauth-2.0)).
- **Certificate `.crt` and private key `.key`.** Every Inter sample passes the pair directly: Postman's "CRT"/"KEY" fields ([add the certificate](https://developers.inter.co/docs/configurando-postman-testes/como-add-certificado)), curl's `--cert <…>.crt --key <…>.key` in the reference's code recipes ([Pix reference](https://developers.inter.co/references/pix)), and `cert=(crt, key)` in Inter's Python SDK ([TokenUtils.py](https://github.com/inter-co/pj-sdk-python/blob/HEAD/inter_sdk_python/commons/utils/TokenUtils.py)). Postman's passphrase field is optional ("Crie uma senha … (opcional)"). **(inferred)** So the key file Inter issues has no passphrase.
- **The four values belong together.** Using one integration's credentials with another's certificate returns 401 ([errors](https://developers.inter.co/erros-status-code), [token guide](https://developers.inter.co/docs/configurando-postman-testes/como-gerar-um-token-oauth)).
- **Download once.** The sandbox portal's confirmation dialog says "Só é possível baixar uma vez a chave e o certificado de uma integração". I read that text in the portal's JavaScript, the client code behind [developers.inter.co/sandbox](https://developers.inter.co/sandbox); the ZIP it downloads is named `Inter_API-Chave_e_Certificado.zip`.
  - **Sources conflict on the secret.** The production guide says the Client ID/Secret "não poderão ser visualizadas novamente" ([create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao)). The OAuth page and the FAQ say "No detalhe da integração você verá o valor das credenciais" ([OAuth 2.0](https://developers.inter.co/docs/introducao/oauth-2.0), [FAQ](https://developers.inter.co/duvidas-frequentes)). Treat it as one-time and store it immediately.
- **Leaking them has a cost.** Inter warns that Client ID/Secret exposed "em locais públicos" can get the integration cancelled ([create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao)).

### Validity and renewal

- **Production certificates last 1 year** ("Nossos certificados têm um prazo de duração de 1 ano") ([create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao), [renew](https://developers.inter.co/docs/introducao/como-renovar-uma-integracao)).
- **Renewal** opens 90 days before expiry and also applies to integrations already "Expirado". The guide warns that integrations with an expired certificate "ficam com status 'Expirado' e podem parar de funcionar". Renewal gives "um novo certificado e uma nova chave de segurança (arquivos .crt e .key)", while "As credenciais ClientId, ClientSecret e os escopos de acesso permanecem os mesmos" ([renew](https://developers.inter.co/docs/introducao/como-renovar-uma-integracao), [changelog 19/11/2024](https://developers.inter.co/changelog/19/11/2024)). After expiry you have "até 90 dias após a data de expiração" to renew ([changelog 24/12/2025](https://developers.inter.co/changelog/24/12/2025)).
- **Cancelling cannot be undone.** Afterwards the certificate, key and scopes stop working ([renew](https://developers.inter.co/docs/introducao/como-renovar-uma-integracao)).
- **Sandbox certificates last 30 days.** After that, "uma nova integração deve ser gerada" ([sandbox create](https://developers.inter.co/docs/sandbox/como-criar-uma-aplicacao)). No sandbox renewal is documented.

### The `x-conta-corrente` header

- It is an optional request header on every Pix endpoint: "Necessário somente quando a aplicação estiver associada a mais de uma conta corrente. Enviar apenas números (incluindo o dígito), e não enviar zeros a esquerda." Its pattern is `[1-9][0-9]*` ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [changelog 08/03/2023](https://developers.inter.co/changelog/08/03/2023)).
- Inter also **sends it on every callback** to identify the account: "Em todos os callbacks das APIs Inter é enviado o header x-conta-corrente" ([FAQ](https://developers.inter.co/duvidas-frequentes), [changelog 10/04/2023](https://developers.inter.co/changelog/10/04/2023)).
- It is an Inter extension. The BACEN spec has no such header ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).

### No IP allowlisting for API calls

- **Nothing to register.** Inter Empresas' API identifies the caller by the client certificate (mTLS) plus the OAuth token ([mTLS](https://developers.inter.co/docs/introducao/autenticacao-mtls), [OAuth 2.0](https://developers.inter.co/docs/introducao/oauth-2.0), [token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml)). On 2026-11-10 I searched every place it could appear: the steps for creating and renewing an integration, the review form ("Seus clientes / Sua empresa / Seu negócio"), the sandbox portal's integration screens, both OpenAPI specs, the FAQ, the error page, the changelog and the SDK READMEs. None asks for or registers the caller's source IPs ([create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao), [renew](https://developers.inter.co/docs/introducao/como-renovar-uma-integracao), [FAQ](https://developers.inter.co/duvidas-frequentes)).
  - The only IP list in the docs is the *other* direction: the addresses Inter **sends webhooks from** ([webhook guide](https://developers.inter.co/docs/webhooks/como-config-webhooks)).
- **The one caveat.** HTTP 406 "Sem mensagem de Erro": "Seu IP pode ter sido bloqueado pelo firewall por ser considerado malicioso. Isso é comum para integrações em cloud, utilizando IPs dinâmicos. Tente utilizar um IP dedicado." ([errors](https://developers.inter.co/erros-status-code)). This describes reputation-based blocking that may happen, not a requirement to call from known IPs. How often it hits serverless egress isn't documented.
- **Don't confuse it with Inter's mass-payments API.** That product (a SOAP remittance API at masspayments.inter.co) states IP whitelisting is "Required for both UAT and Production", with IPs sent to its support by e-mail ([mass-payments guide](https://masspayments.inter.co/ppapis3/documentation/articles/GettingStarted.html)). That guide never mentions Inter Empresas, the API Pix or `cdpj.partners.bancointer.com.br`.
- **What it means for hosting.** Inter's docs alone don't force static egress IPs. Per the Vercel research ticket, those exist only on Vercel Pro. The 406 risk is the open question; it needs a production smoke test from Vercel, see [Gaps](#gaps-and-open-questions).

### TLS facts I observed (2026-11-10, `openssl s_client`, no credentials)

- **Server certificates.** Both `cdpj.partners.bancointer.com.br` and `cdpj-sandbox.partners.uatinter.co` serve Let's Encrypt certificates that verify against the default trust store. Both negotiated TLS 1.2.
- **Client certificate request.** Both ask for a client certificate during the handshake.
  - Production accepts client certificates from "API Intermediate Certificate Authority" and "SSSS Root Certificate Authority".
  - Sandbox accepts "UAT Partners CDPJ Certificate Authority" and its Intermediate.
  - **(inferred)** So sandbox and production certificates are not interchangeable.

### Implications for "What exactly is a Bank Account?"

- **What an Inter Bank Account holds.** The environment (production or sandbox host), Client ID, Client Secret, certificate, private key, the Pix key used as `chave`, an optional account number for `x-conta-corrente`, and the certificate's expiry date (1 year in production, 30 days in sandbox) so the Operator can be warned in time.
- **Renewing.** A production renewal swaps only the certificate and key, which ADR-0002 already allows without a redeploy. A sandbox "renewal" is a new integration, so all four secrets change.
- **Pix key.** The webhook is registered per Pix key (see [Webhooks](#webhooks)). **(inferred)** A key dedicated to this app keeps us from replacing a webhook another system registered on the same key.

## Auth

- **Token endpoint.**
  - Production: `POST https://cdpj.partners.bancointer.com.br/oauth/v2/token`.
  - Sandbox: `POST https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token`.
  - Body is `application/x-www-form-urlencoded`. Required fields: `client_id`, `client_secret`, `grant_type` (`client_credentials`) and `scope` (space-separated) ([token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml)).
- **mTLS everywhere.** "é obrigatório o uso do certificado tanto na geração do token quanto nas requisições das nossas API". A 400 with no message means the certificate is missing ([errors](https://developers.inter.co/erros-status-code)).
- **Response.** `access_token`, `token_type`, `expires_in`, `scope` ([token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml)). Check that the returned scopes match the requested ones ([token guide](https://developers.inter.co/docs/configurando-postman-testes/como-gerar-um-token-oauth)).
- **Using it.** Send `Authorization: Bearer <access_token>` together with the client certificate on each call ([use the token](https://developers.inter.co/docs/configurando-postman-testes/como-utilizar-token-apis-inter)).
- **Lifetime.** "O tempo de vida de um token gerado é de uma hora", and it "deverá ser reutilizado nas requisições" ([token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml), [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).
- **Limit.** The token endpoint allows 5 calls per minute, in production and in sandbox. Fetching a token per request "poderá receber o HTTP 429" ([token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml), [FAQ](https://developers.inter.co/duvidas-frequentes)).
- **Errors** ([errors](https://developers.inter.co/erros-status-code)):
  - 401: wrong credentials, or scopes not granted to the integration.
  - 401: credentials from another integration's certificate.
  - 401 "Token inválido": the token is missing or expired.
  - 401 "Acesso negado": the account's situation doesn't allow API use.
  - 403: the token lacks the scope.
  - 500 on the token endpoint: malformed body.

Scopes this app would use, all per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml):

| Need | Endpoint(s) | Scope |
|---|---|---|
| Create a Charge | `PUT /cob/{txid}` | `cob.write` |
| Cancel a Charge (if we ever do) | `PATCH /cob/{txid}` | `cob.write` |
| Read / list Charges | `GET /cob/{txid}`, `GET /cob` | `cob.read` |
| Read Payments | `GET /pix/{e2eId}`, `GET /pix` | `pix.read` |
| Register / delete the webhook, resend callbacks | `PUT`/`DELETE /webhook/{chave}`, `POST /webhook/callbacks/retry` | `webhook.write` |
| Read the webhook and callback history | `GET /webhook/{chave}`, `GET /webhook/callbacks` | `webhook.read` |
| Simulate a Payment (**sandbox only**) | `POST /cob/pagar/{txid}`, `POST /sandbox/cob/pagamento` | `pix.write` |

In production, `pix.write` also authorises refunds (`PUT /pix/{e2eId}/devolucao/{id}`), which are out of scope. Inter's Python SDK caches one token per client and scope set and renews it 60 s before expiry ([TokenUtils.py](https://github.com/inter-co/pj-sdk-python/blob/HEAD/inter_sdk_python/commons/utils/TokenUtils.py)).

### Implications for "What does the app need from a Provider?"

- **Share the token across instances.** On serverless, each cold instance that fetches its own token eats into the limit of 5 per minute per integration. The token, with all the scopes we need, should be cached where every instance can read it, e.g. stored per Bank Account.
- **Unknown:** the docs don't say whether issuing a new token invalidates the previous one.
- **Outbound mTLS.** The adapter has to make calls with a client certificate on Node, and expect HTTP 406 if Inter's firewall dislikes the egress IP.

## Creating a Charge

**Endpoint.** `PUT {base}/pix/v2/cob/{txid}`, where `{base}` is `https://cdpj.partners.bancointer.com.br` (production) or `https://cdpj-sandbox.partners.uatinter.co` (sandbox). Scope `cob.write`. Rate limit 120/min in production and 10/min in sandbox. `POST /pix/v2/cob` does the same but lets Inter choose the txid ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).

**txid rules.**

- Pattern `[a-zA-Z0-9]{26,35}`.
- "O txid é criado exclusivamente pelo usuário recebedor e está sob sua responsabilidade. O txid, no contexto de representação de uma cobrança, é único por CPF/CNPJ do usuário recebedor" ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).
- BACEN adds: "Cabe ao PSP recebedor validar essa regra" ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **(inferred)** A UUID written as 32 hex characters fits the pattern.

**Request body** (`CobSolicitada`). The required fields are `calendario`, `valor` and `chave`, the same as in BACEN 2.10.0. Minimal body for us:

```json
{
  "calendario": { "expiracao": 3600 },
  "valor": { "original": "10.00" },
  "chave": "<a Pix key registered to the Bank Account>"
}
```

- `calendario.expiracao`: the Charge's lifetime in seconds, counted from `calendario.criacao`. Minimum 1, default 86400.
- `valor.original`: a string matching `\d{1,10}\.\d{2}`; zero is rejected. `valor.modalidadeAlteracao` defaults to `0`, meaning the Payer cannot change the amount.
- `chave`: a DICT key of the receiver. The error list includes "O campo `cob.chave` corresponde a uma conta que não pertence a este usuário recebedor".
- Optional fields:
  - `devedor` (CPF or CNPJ plus name). We wouldn't send it, since we never ask who the Payer is.
  - `solicitacaoPagador` (up to 140 characters) and `infoAdicionais` (up to 50 name/value pairs) are shown to the Payer.
  - `loc.id` reuses a pre-created location.
- Add `x-conta-corrente` only for a multi-account integration.

Source for all of the above: [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml).

**Response `201` (`CobGerada`).** Per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml) it contains:

- `txid` and `revisao` (starts at 0).
- `calendario.criacao` and `calendario.expiracao`.
- `loc` (`id`, `location`, `tipoCob: "cob"`, `criacao`) and `location`.
- `status: "ATIVA"`, plus `valor` and `chave`.
- `pixCopiaECola`, which is "a sequência de caracteres que representa o BR Code", at most 512 characters.

**No QR image.** Inter returns only the text. The FAQ question on generating the QR says "é retornado o atributo pixCopiaECola" and points to a public site that renders it ([FAQ](https://developers.inter.co/duvidas-frequentes)). The BACEN spec doesn't define a QR image either.

**Errors.** Errors follow RFC 7807 (`Problema`), with `type` set to `https://pix.bcb.gov.br/api/v2/error/<TipoErro>`, plus `title`, `status`, `detail`, `correlationId` and `violacoes[]` (`razao`, `propriedade`, `valor`). `PUT` can return 400 `CobOperacaoInvalida`, 403, 404 or 503 ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).

**Repeating a `PUT` with the same txid.** Inter copies BACEN's violation "A cobrança já existe, não está no status ATIVA, e a presente requisição busca alterá-la". **(inferred)** So a `PUT` on an existing **ATIVA** Charge is treated as an update rather than a duplicate. That makes a retried create plausibly idempotent, but Inter doesn't document it ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).

**Revise or cancel.** `PATCH /cob/{txid}` with `CobRevisada`. Its only accepted `status` value is `REMOVIDA_PELO_USUARIO_RECEBEDOR`, and the Charge must still be `ATIVA` ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).

### Implications for "What is a Charge's full lifecycle?"

- We choose the txid, so the Charge can be recorded before calling Inter and the `PUT` retried with the same txid.
- The 1-hour expiry runs from Inter's `calendario.criacao`, not from our clock. Store `criacao` from the response.

## Tracking

**One Charge.** `GET /pix/v2/cob/{txid}`, scope `cob.read`, 120/min in production and 10/min in sandbox. It returns `CobCompleta`: everything in `CobGerada`, including `pixCopiaECola`, plus `pix[]`, the Payments received ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)). Inter's FAQ names this endpoint as the way to check a Pix Charge's status ([FAQ](https://developers.inter.co/duvidas-frequentes)).

**Lists by period.** All per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml):

- **`GET /pix/v2/cob`**
  - Required: `inicio` and `fim`, RFC 3339. They filter on creation time: "data de criação seja maior ou igual que a data de início".
  - Optional: `status`, `cpf`/`cnpj`, `locationPresente`, `paginacao.paginaAtual` (default 0) and `paginacao.itensPorPagina` (default 100, **max 1000**).
  - Response: `{ parametros: { inicio, fim, paginacao: { paginaAtual, itensPorPagina, quantidadeDePaginas, quantidadeTotalDeItens } }, cobs: [...] }`.
- **`GET /pix/v2/pix`**
  - Required: `inicio` and `fim`.
  - Optional: `txId`, `txIdPresente`, `devolucaoPresente`, `cpf`/`cnpj` and paging.
  - Scope `pix.read`.
  - **Inter departs from BACEN here.** Inter limits results to "recebimentos que tiveram origem de um Pix Cobrança (Cob ou CobV) gerado pela API Pix ou IBPJ(Boleto com Pix) pagos via QR Code". BACEN's `GET /pix` covers "Pix recebidos" in general and offers a `txIdPresente` filter ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **`GET /pix/v2/pix/{e2eId}`** reads one Payment.
- The longest allowed `inicio`–`fim` window isn't documented.

**Status values and transitions.** All four values are the same as in BACEN ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).

| `status` | Meaning (spec text) | How it is reached |
|---|---|---|
| `ATIVA` | "gerada mas ainda não foi paga nem removida" | on creation |
| `CONCLUIDA` | "já foi paga e, por conseguinte, não pode acolher outro pagamento" | a Payment arrives |
| `REMOVIDA_PELO_USUARIO_RECEBEDOR` | the receiver asked to remove it | our `PATCH` with that status |
| `REMOVIDA_PELO_PSP` | "o PSP Recebedor solicitou a remoção" | Inter's decision; when is undocumented |

- **Expiry is not a status.** `status` is the "Estado do registro da cobrança. Não se confunde com o estado da cobrança em si, ou seja, não guarda relação com o fato de a cobrança encontrar-se vencida ou expirada" ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)). **(inferred)** A Charge past its expiry can still read `ATIVA`.
- **What the payer's bank sees after expiry is up to the receiving PSP.** For an expired Charge it may answer the location with 404/410 or keep serving the payload: "é uma liberalidade do PSP recebedor" ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). Inter doesn't say which it does.

**How the settling Payment appears.** Each item in `pix[]` (the `Pix` schema), per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml):

| Field | Format | Meaning |
|---|---|---|
| `endToEndId` | `[a-zA-Z0-9]{32}` | end-to-end id of the Payment |
| `txid` | | our txid |
| `valor` | string `\d{1,10}\.\d{2}` | amount paid |
| `componentesValor.original.valor` | string | breakdown; for a `cob` only `original` (plus saque/troco cases) |
| `chave` | ≤ 77 | receiver's Pix key |
| `horario` | RFC 3339 date-time | "Horário em que o Pix foi processado no PSP" |
| `infoPagador` | ≤ 140 | free text typed by the Payer |
| `devolucoes[]` | `id`, `rtrId`, `valor`, `horario.solicitacao`/`liquidacao`, `status` (`EM_PROCESSAMENTO`/`DEVOLVIDO`/`NAO_REALIZADO`), `motivo` | refunds, if any |
| `pagador` | `nome`, `cpfCnpj` | **Inter-only.** For individuals the CPF comes masked, e.g. `***853226**` |

**The `pagador` field.** It is not part of the BACEN `Pix` schema ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). Inter's `Pix` schema lists `pagador` as *required* but defines its fields only in the callback schema (`PixCallback`). The changelog announces it for the Pix Charge webhook callback only ([changelog 10/09/2024](https://developers.inter.co/changelog/10/09/2024)). Whether `GET` responses carry it is unverified.

### Implications for "How does the system learn a Charge was paid?"

- **Polling one Charge per open screen is expensive.** Calling `GET /cob/{txid}` every 3 s costs 20 calls/min per screen. If the 120/min limit applies per integration, that allows about 6 open screens at once, and 0 in sandbox (10/min).
- **One list call can cover every open Charge.** A single `GET /pix?inicio=…&fim=…`, or `GET /cob?…&status=CONCLUIDA`, over a short window checks all open Charges at once.

### Implications for "What is a Charge's full lifecycle?"

- Paid means `CONCLUIDA` with `pix[0]`. Expired has to be computed. Inter can also move a Charge to `REMOVIDA_PELO_PSP`. Refunds made in the bank's app show up under `pix[].devolucoes`.
- Inter sends payer name and CPF/CNPJ without being asked. Collecting payer data is out of scope, so the model has to decide whether to drop those fields.

## Webhooks

### Registration

All per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml) unless noted.

- **Register.** `PUT /pix/v2/webhook/{chave}` with body `{"webhookUrl": "https://…"}`; the URL must match `^https://`. Scope `webhook.write`, 10/min in production and in sandbox. Success returns **204**, where BACEN returns 200.
- **One webhook per Pix key.** The key is the path parameter. Phone keys go without the "+" (e.g. `5511999999999`).
- **Read and delete.**
  - `GET /pix/v2/webhook/{chave}` returns `{webhookUrl, chave, criacao}` (scope `webhook.read`).
  - `DELETE /pix/v2/webhook/{chave}` returns 204.
  - Inter has no `GET /webhook` list endpoint; BACEN does ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **What it notifies.** "notificações (callbacks) relacionados a Pix Cobrança, cob e cobv (recebimento do valor cobrado)". BACEN additionally requires a callback when a refund on a Pix with a txid reaches `DEVOLVIDO` or `NAO_REALIZADO` ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)). Inter's spec has a "Callback Pix Cobrança com Devolução" example, so expect those too.
- **Validating a URL first.** The portal's "Validar webhook" button sends a sample callback to a URL before you register it ([validate a webhook URL](https://developers.inter.co/docs/webhooks/validar-url-do-webhook)).
- **Unknown:** whether `PUT` itself probes the URL.

### Delivery

- **URL.**
  - Inter's spec writes the callback expression as `{$request.body#/webhookUrl/pix}`. BACEN's is `{$request.body#/webhookUrl}/pix`, i.e. BACEN expects the PSP to append `/pix` ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
  - Inter's sample server tells you to register `https://meu-webhook-inter.com.br:8443/pix` and routes exactly the path `/pix` ([sample README](https://github.com/inter-co/pj-webhook-server-java), [Constants.java](https://github.com/inter-co/pj-webhook-server-java/blob/HEAD/src/main/java/inter/contants/Constants.java)).
  - **(inferred)** Inter posts to the registered URL as-is, without a suffix. Verify in sandbox.
- **Request.** `POST` with header `x-conta-corrente`. Body: `{"pix": [{ endToEndId, txid, valor, componentesValor, chave, horario, infoPagador, devolucoes, pagador: { nome, cpfCnpj } }]}` ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), schemas `WebhookPixBody` and `PixCallback`). BACEN allows the PSP to "agrupar Pix associados a uma mesma chave", so one callback can carry several Payments ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **Expected answer.** `200` ("Notificação recebida com sucesso") ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).

### Security on the receiving side

**In short:**

- Inter's webhooks **can be delivered to a receiver that does not do mTLS**. This is **(inferred)**, but from Inter's own sample code, as explained below; no Inter document requires the receiver to ask for a client certificate.
- Inter **does publish** the IPs its webhooks come from (list below).
- Inter sends **no signature or auth header**.

The details:

- **Inter's guide.** "Seu servidor deve possuir a versão mínima do TLS 1.2". Download Inter's public certificate (`ca.crt`) from the internet banking, under "Soluções para sua empresa" → "Minhas integrações" → "Certificado Webhook". The endpoint "deverá receber requisições do tipo POST e validar a origem da chamada com a chave pública (ca.crt) … portanto ele deverá ser criado num servidor HTTPS" ([how to configure a webhook](https://developers.inter.co/docs/webhooks/como-config-webhooks)).
- **Inter's Node.js sample.** It sets `requestCert: true, rejectUnauthorized: false, ca: ca.crt` and answers 401 when `!req.client.authorized` ([callback server guide](https://developers.inter.co/docs/webhooks/callback-webhook)). So Inter's callbacks present a **client certificate** chained to that CA, which is mTLS. That matches BACEN, where the callback "está protegido por uma camada de autenticação mTLS" ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).
- **Inter's Java sample.**
  - The server's own certificate "não pode ser autoassinado e deve ser gerado através de uma CA confiável".
  - It explains how to turn client-certificate checking off (`sslEngine.setNeedClientAuth(false)`): "Dessa forma qualquer requisição realizada para o seu endpoint será aceita, independente da origem. Sendo assim, não recomendamos essa configuração!" ([sample README](https://github.com/inter-co/pj-webhook-server-java), [HttpServerInitializer.java](https://github.com/inter-co/pj-webhook-server-java/blob/HEAD/src/main/java/inter/initializer/HttpServerInitializer.java)).
  - **(inferred)** Verifying Inter's certificate is the receiver's protection, not a delivery requirement. Inter will deliver to a server that doesn't ask for a client certificate.
- **No signature, shared secret or auth header** is documented for Pix callbacks. Only the `x-conta-corrente` header is sent.
- **Source IPs.** "Caso necessite liberar no Firewall os IP's que o Inter utiliza para envio de callback" ([how to configure a webhook](https://developers.inter.co/docs/webhooks/como-config-webhooks); list last updated 21/07/2025 per the [changelog](https://developers.inter.co/changelog/21/07/2025)). Reproduced as published, including `136.226.82.8/23`, which has host bits set:

  ```text
  64.215.22.0/24   104.129.194.0/23  136.226.48.0/23  136.226.50.0/23  136.226.52.0/23
  136.226.62.0/23  136.226.68.0/23   136.226.76.0/23  136.226.78.0/23  136.226.80.0/23
  136.226.82.8/23  136.226.84.0/23   136.226.86.0/23  147.161.128.0/23 165.225.8.0/23
  165.225.48.0/24  165.225.214.0/23  170.85.16.0/23   170.85.18.0/23   170.85.20.0/23
  170.85.22.0/23   170.85.24.0/23
  3.22.50.76       3.141.240.2       18.228.100.224   18.228.201.125   18.228.215.112
  18.230.107.120   52.15.229.40      54.232.192.91    54.232.234.54    54.232.254.135
  56.125.121.233   56.126.139.245    100.63.247.226   100.63.248.117   3.12.176.222
  3.23.203.130     18.116.227.76     18.205.74.21     18.228.121.118   18.229.39.213
  34.232.74.103    50.17.40.204      52.70.125.130    54.94.20.106     54.197.240.47
  54.242.121.186
  ```

### Retries, history and resend

All per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml) unless noted.

- **Retries.** "Caso o servidor de webhook retorne erro de recebimento do callback, serão realizadas até 4 tentativas com intervalos de 20, 30, 60 e 120 minutos."
- **History: `GET /pix/v2/webhook/callbacks`.**
  - Required: `dataHoraInicio` and `dataHoraFim`.
  - Optional: `pagina` (default 0), `tamanhoPagina` (10–50, default 20) and `txid`.
  - Each attempt shows `webhookUrl` ("URL do webhook no momento do disparo"), `payload`, `numeroTentativa`, `dataHoraDisparo`, `sucesso`, `httpStatus` and `mensagemErro`.
  - Scope `webhook.read`, 10/min.
  - When the feature launched, Inter said records stay queryable for "até 1 mês após a data de disparo" ([changelog 19/06/2023](https://developers.inter.co/changelog/19/06/2023)).
- **Resend: `POST /pix/v2/webhook/callbacks/retry`.**
  - Body `{"txId": [up to 50 txids], "chavePix": "<key>"}`, response `{"foundIds": [...]}`.
  - Scope `webhook.write`. Rate limit 5/min in production; no sandbox limit is listed.
  - Available since 14/04/2025 ([changelog](https://developers.inter.co/changelog/14/04/2025)).
- **Latency.** No delivery SLA is documented. BACEN leaves the SLA to each PSP but expects the callback to be an "aviso 'on-line' da ocorrência do pagamento" ([BACEN 2.10.0](https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml)).

### Implications for "How does the system learn a Charge was paid?"

- **Authenticating callbacks.** Per the Vercel research ticket, Vercel Functions can't verify inbound client certificates on any plan. So Inter's callbacks can still *arrive*, but can't be authenticated the way Inter intends (`ca.crt`). What's left:
  - Treat a callback only as a hint and confirm the Charge with `GET /cob/{txid}`. A forged callback then costs one API call and changes nothing.
  - Keep a secret in the webhook URL path.
  - Check the source IP against Inter's published list. That list includes wide `/23` ranges, and the client IP as Vercel reports it is an assumption to check.
- **Speed.** A failed first delivery is only retried 20 minutes later, so webhooks alone can't promise "paid within ~5 s" on the Payer's screen.
- **Environments.** One webhook per key: Production and Preview (sandbox) Bank Accounts each register their own.

## Limits and costs

### Rate limits

All per endpoint, from [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml) and [token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml):

| Endpoint(s) | Production | Sandbox |
|---|---|---|
| `POST /oauth/v2/token` | 5/min | 5/min |
| `PUT`/`PATCH`/`GET /cob/{txid}`, `POST`/`GET /cob` | 120/min | 10/min |
| `GET /pix`, `GET /pix/{e2eId}`, `PUT`/`GET /pix/{e2eId}/devolucao/{id}` | 120/min | 10/min |
| `POST`/`GET /loc`, `GET /loc/{id}`, `DELETE /loc/{id}/txid` | 120/min | 10/min |
| `cobv` and `lotecobv` endpoints | 120/min | 10/min |
| `PUT`/`GET`/`DELETE /webhook/{chave}`, `GET /webhook/callbacks` | 10/min | 10/min |
| `POST /webhook/callbacks/retry` | 5/min | not listed |
| `POST /cob/pagar/{txid}`, `POST /sandbox/cob/pagamento` | (sandbox only) | 10/min |

- **Going over the limit.** HTTP 429: "Cada endpoint está configurado com um limite de chamadas por minuto … Recomenda-se aguardar alguns segundos" ([errors](https://developers.inter.co/erros-status-code)). The docs don't mention a `Retry-After` header or what the counter is keyed on (integration, account or IP).
- **No issuance quota.** "Nossas API's não tem limite para emissão, apenas possuímos um rate limit" ([FAQ](https://developers.inter.co/duvidas-frequentes)).
- **IP blocking.** HTTP 406 with no message: "Seu IP pode ter sido bloqueado pelo firewall por ser considerado malicioso. Isso é comum para integrações em cloud, utilizando IPs dinâmicos. Tente utilizar um IP dedicado." ([errors](https://developers.inter.co/erros-status-code)).

### Fees

From Inter's PJ tariff table, "Vigência a partir de 21/06/2025", the newest PJ table on [inter.co/tarifas](https://inter.co/tarifas/) as of 2026-11-10 ([PDF](https://static.bancointer.com.br/site/tabela-tarifas/06828f37a7464f8ab3eb4e5571586214_tabela-de-tarifas-pj-maio.pdf)). The previous table, in force from 01/04/2025, has the same Pix receiving prices.

| Service | Price per event (outside the allowance) | Free per month, by segment |
|---|---|---|
| Recebimento QR Code Pix (static) | R$ 0,00 | Isento |
| **Recebimento QR Code Pix (imediato)** | **0,9% of the amount; min R$ 0,10; max R$ 1,50** | MEI e PJ (Digital): **30**; PJ PRO: 60; PJ Enterprise, Middle Market, Upper Middle, Corporate, WIN: 100 |
| Recebimento QR Code Pix (com vencimento) | 0,99%; min R$ 0,10; max R$ 1,99 | same allowances |
| Transferência Pix para outras instituições / Inter para Inter | R$ 0,00 | Isento |

- **Worked examples** (my arithmetic, once the allowance is used up):
  - Any amount below R$ 11,11 pays the R$ 0,10 minimum, so a R$ 1,00 Charge loses 10%.
  - R$ 20,00 pays R$ 0,18, and R$ 100,00 pays R$ 0,90.
  - From R$ 166,67 up, the fee is capped at R$ 1,50.
- **What isn't charged.** Neither the table nor the developer docs list any fee for creating Charges, for API calls, or for the account, which is "100% gratuita" ([Inter Empresas account page](https://inter.co/empresas/conta-digital/pessoa-juridica/)).
- **Copia e Cola.** **(inferred)** A Payment made by pasting the Copia e Cola of a `cob` counts as "Recebimento QR Code Pix (imediato)", because it is the same dynamic BR Code. The table doesn't say.

### Implications for "How do we keep bots from creating Charges?"

- **Fees don't hurt; rate limits do.** A bot-created Charge costs nothing in fees, which apply only to Payments. But every Charge spends one `PUT /cob` from the 120/min budget that real Payers and payment polling share, so a bot can starve real Payers. The token endpoint (5/min) is a second choke point if tokens aren't shared.

## Sandbox

### Access requirements

- **A developer-portal account.** At [developers.inter.co/sandbox](https://developers.inter.co/sandbox): "Para acessar, utilize o login da Comunidade ou realize um novo cadastro." The sandbox guide begins "Depois de criar e ativar sua conta de desenvolvedor…" ([sandbox create](https://developers.inter.co/docs/sandbox/como-criar-uma-aplicacao)).
- **The registration form** ("Criar usuário como desenvolvedor") asks for:
  - Nome completo, E-mail, Nome de acesso, Senha / Confirme sua senha.
  - Perfil do usuário: "Sou desenvolvedor" (Telefone, Nome da empresa, CNPJ, Área de atuação) or "Sou cliente" (Conta corrente).
  - **CNPJ and conta corrente are optional** in the form's validation.
  - I read this from the portal's client-side code on 2026-11-10, so **(inferred)** an Inter Empresas account doesn't seem to be needed for the sandbox.
- **Availability.** "Nosso ambiente de Sandbox está disponível das 8h às 20h, de segunda a sexta-feira" ([what is the sandbox](https://developers.inter.co/docs/sandbox/sobre-este-portal)). The time zone isn't stated; presumably Brasília.

### Creating a sandbox integration

Per [sandbox create](https://developers.inter.co/docs/sandbox/como-criar-uma-aplicacao):

1. **Nova integração** → name and description. "Para o ambiente Sandbox não será necessário selecionar os escopos desejados, a integração será criada com os escopos listados." Then **Criar integração**.
2. Under **Minhas Integrações**, the detail view shows permissions, expiry date and status "Novo". "Neste momento será possível baixar a chave e o certificado".
3. Once downloaded, the credentials "poderão ser visualizadas clicando nos três pontinhos … 'Detalhar integração'". After a few minutes the status becomes "Ativo".
4. "Nossos certificados têm um prazo de duração de 30 dias."

### Simulating a Payment

Both endpoints are listed under "Endpoints específicos para testes" ([how to test](https://developers.inter.co/docs/sandbox/como-testar-aplicacao)). Per [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml):

- `POST https://cdpj-sandbox.partners.uatinter.co/pix/v2/cob/pagar/{txid}` with body `{"valor": 150}`, a JSON number. Returns `201 {"e2e": "<endToEndId>"}`. Scope `pix.write`, 10/min.
- `POST https://cdpj-sandbox.partners.uatinter.co/pix/v2/sandbox/cob/pagamento` with body `{"qrCode": "<pixCopiaECola>", "valor": 100}`. Returns `200 {"endToEnd": "<endToEndId>"}`. Scope `pix.write`, 10/min.

### Differences from production

| | Production | Sandbox |
|---|---|---|
| Base URL | `https://cdpj.partners.bancointer.com.br` | `https://cdpj-sandbox.partners.uatinter.co` |
| Who can get in | Inter Empresas PJ account (MEI/PF excluded) | developer-portal account |
| Getting an integration | internet banking, reviewed by Inter | portal, immediate, every scope |
| Certificate | 1 year, renewable | 30 days, then a new integration |
| Client-certificate CA (observed) | "API Intermediate Certificate Authority" | "UAT Partners CDPJ Certificate Authority" |
| Pix endpoint rate limit | 120/min | 10/min |
| Hours | none documented | Mon–Fri 08:00–20:00 |
| Paying a Charge | a real Pix | `POST /cob/pagar/{txid}` or `POST /sandbox/cob/pagamento` |
| Data | real | "dados fictícios" |

Sources: [token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml), [Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml), [sandbox docs](https://developers.inter.co/docs/sandbox/sobre-este-portal), [FAQ](https://developers.inter.co/duvidas-frequentes) and the TLS observation above.

**Webhooks in sandbox.** The sandbox is described as letting developers build "integrações, webhooks e outras funcionalidades" ([what is the sandbox](https://developers.inter.co/docs/sandbox/sobre-este-portal)). Inter's Postman collection includes the sandbox webhook endpoints ([collection](https://developers.inter.co/assets/files/collection_clients-70dbd986b515ebb52d5e58c70a05ff68.json)). The docs don't say whether a simulated Payment fires a callback, or which CA signs sandbox callbacks.

## Sandbox access checklist

For the "Set up Inter sandbox access" ticket. Do it **on a weekday between 08:00 and 20:00**. **Never paste credentials, the certificate or the key into the repo or the ticket**; record only *where* they are kept.

**Account type and documents.** The sandbox needs only a free developer account on the portal: no Inter Empresas account and no documents. CNPJ is optional on the form **(inferred from the portal's form)**. A **production** Bank Account later needs an Inter Empresas PJ account (MEI/PF are excluded per the FAQ) and an integration reviewed by Inter; see the end of this checklist.

1. **Create the developer account.** Open <https://developers.inter.co/sandbox>.
   - If you have a Comunidade Inter login, click **Entrar** and sign in.
   - Otherwise click **Cadastrar** → "Criar usuário como desenvolvedor". Fill in Nome completo, E-mail, Nome de acesso and Senha, and pick Perfil "Sou desenvolvedor" (Telefone, Nome da empresa, optional CNPJ, Área de atuação) or "Sou cliente" (optional Conta corrente).
   - Confirm the e-mail and sign in.
2. **Create the integration.** On the sandbox page, open **Nova integração** → **Acessar** (<https://developers.inter.co/sandbox/create-integration>). Enter a name (e.g. "juntospelogedielson-dev") and a description. Scopes are pre-selected (all of them). Click **Criar integração**.
3. **Download the key and certificate.** Open **Minhas integrações** (<https://developers.inter.co/sandbox/my-integrations>) and select the integration (status "Novo"). Click **Baixar chave e certificado** and confirm. **The download only works once.** It is a ZIP (`Inter_API-Chave_e_Certificado.zip`) with a `.crt` and a `.key`.
4. **Copy the credentials.** Open **Detalhar integração** and copy the **Client ID** and **Client Secret**. Note the **Contas** (account number) and **Expira em**, which is 30 days out.
5. **Store all four secrets** (Client ID, Client Secret, `.crt`, `.key`) in your password manager or another place outside the repo. Set a reminder to create a new sandbox integration before the 30 days run out.
6. **Wait for "Ativo".** This takes a few minutes.
7. **Check that a token works.** From the folder holding the two files, run this with your values in place of the placeholders. Typing the secret on the command line leaves it in shell history; prefer an environment variable or clear the history.

   ```sh
   curl --silent --show-error \
     --cert ./<SANDBOX_CERT_FILE>.crt \
     --key  ./<SANDBOX_KEY_FILE>.key \
     --request POST 'https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token' \
     --header 'Content-Type: application/x-www-form-urlencoded' \
     --data-urlencode 'client_id=<CLIENT_ID>' \
     --data-urlencode 'client_secret=<CLIENT_SECRET>' \
     --data-urlencode 'grant_type=client_credentials' \
     --data-urlencode 'scope=cob.write cob.read pix.read pix.write webhook.read webhook.write'
   ```

   Success is HTTP 200 with a JSON body containing `access_token`, `token_type`, `expires_in` and `scope`. Troubleshooting:
   - 400 with no message: the certificate wasn't sent.
   - 401: Client ID/Secret don't match this certificate, or a scope isn't granted.
   - 429: more than 5 token requests in a minute.

   Sources: [token spec](https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml), [errors](https://developers.inter.co/erros-status-code).
8. **Optional: run a Charge end to end.** Send `PUT /pix/v2/cob/<TXID>` with `{"calendario":{"expiracao":3600},"valor":{"original":"1.00"},"chave":"<SANDBOX_PIX_KEY>"}`, then `POST /pix/v2/cob/pagar/<TXID>` with `{"valor":1.00}`, then `GET /pix/v2/cob/<TXID>` and expect `status: CONCLUIDA` with one item in `pix[]`. Each call needs the same `--cert/--key` plus `Authorization: Bearer <ACCESS_TOKEN>`. The docs don't say which `chave` the sandbox accepts; Inter's Postman collection pre-fills a sample `chave` variable ([collection](https://developers.inter.co/assets/files/collection_clients-70dbd986b515ebb52d5e58c70a05ff68.json)).

**Later, for a production Bank Account** ([create](https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao)):

1. Get an Inter Empresas PJ account, opened online with the CNPJ and company documents ([account page](https://inter.co/empresas/conta-digital/pessoa-juridica/)).
2. In the internet banking, go to **Integrar** → **Nova integração**.
3. Select the API Pix permissions that grant `cob.write`, `cob.read`, `pix.read`, `webhook.read` and `webhook.write`. Leave out `pix.write`, which allows refunds.
4. Accept the terms, fill in the form (Seus clientes / Sua empresa / Seu negócio) and wait for the review ("Em validação", then an e-mail).
5. At "Novo", use **Download chave e certificado** and save the Client ID and Client Secret shown in the pop-up.
6. Wait for "Ativo".
7. To receive webhooks, also download **Certificado Webhook** (`ca.crt`) from "Minhas integrações" ([webhook guide](https://developers.inter.co/docs/webhooks/como-config-webhooks)).
8. Renew the certificate every year, starting up to 90 days before expiry.

## Gaps and open questions

1. **Eligibility and review.**
   - The FAQ excludes MEI and PF but doesn't say which PJ types qualify.
   - The 2026 review's criteria, duration and outcome are undocumented: "critérios internos e regulatórios". So is whether a donation campaign's business model passes it.
   - Without an approved PJ integration, Inter can't be a production Provider.
2. **Webhook URL suffix.**
   - Does Inter append `/pix` to `webhookUrl` (BACEN), or post to it as-is (Inter's sample)?
   - Verify in sandbox: `GET /webhook/callbacks` shows the `webhookUrl` used for each attempt.
3. **Webhooks in sandbox.**
   - Do simulated Payments fire callbacks?
   - Which CA signs sandbox callbacks, and where is the sandbox `ca.crt`?
   - Does `PUT /webhook/{chave}` probe the URL when registering?
4. **Callback latency.** No SLA is documented. It needs measuring against the ~5 s requirement.
5. **Rate-limit scope.**
   - Is "120 chamadas por minuto" counted per integration, per account, per IP or per endpoint?
   - How are bursts handled, and is there a `Retry-After`? Polling design depends on this.
6. **Expiry behaviour.**
   - After `criacao + expiracao`, does the Charge stay `ATIVA`, become `REMOVIDA_PELO_PSP`, or stop being payable at its location (404/410)?
   - Can a late Payment still settle it?
   - Not documented; test in sandbox, keeping in mind the sandbox may differ from production.
7. **Idempotent create.** What does a second `PUT /cob/{txid}` with the same body do: update it (BACEN semantics) or return an error?
8. **`pagador` in `GET` responses.** The schema says it's required but leaves it undefined. The callback has carried it since 2024. How much payer data reaches us affects LGPD handling.
9. **Sandbox `chave`.** Which Pix key, if any, does a sandbox account have, and does the sandbox check that the key belongs to the account?
10. **Concurrent tokens.** Does a new token revoke the previous one? This matters for several serverless instances sharing a Bank Account.
11. **Client Secret visibility.** The docs disagree on whether it can be viewed again after creation.
12. **Query windows and amounts.**
    - The longest `inicio`–`fim` window for `GET /cob`/`GET /pix` is undocumented.
    - So is any per-Charge maximum beyond the `\d{1,10}\.\d{2}` pattern. The Payer's bank limits will apply.
13. **Egress IPs (HTTP 406).**
    - Inter doesn't require pre-registered caller IPs (see [No IP allowlisting](#no-ip-allowlisting-for-api-calls)). Will its firewall still block Vercel's dynamic egress IPs?
    - Only a production smoke test from a Vercel deployment can tell, and the sandbox may behave differently.
    - If 406s appear, the documented remedy is "um IP dedicado". Per the Vercel research ticket ("What do Vercel's plans and platform allow for this app?"), that means Vercel Pro's static egress IPs.
14. **Authenticating callbacks without mTLS.** The Vercel research ticket found Vercel Functions can't verify inbound client certificates on any plan. Inter documents no other callback authentication: no signature, token or header. The remaining options are listed under [Webhooks](#implications-for-how-does-the-system-learn-a-charge-was-paid-1); the choice belongs to "How does the system learn a Charge was paid?".
15. **Fees.**
    - The PJ table is from 2025. The tariffs page carries an October 2026 PF table but no newer PJ table; confirm there is no newer PJ table before launch.
    - It is inferred, not stated, that Copia e Cola Payments count as "Recebimento QR Code Pix (imediato)".
    - The free allowance is presumably per account per month.
16. **Spec stability.**
    - Inter's spec has no version (`info.version: ''`) and says "Alterações sem quebra de contrato … podem ocorrer a qualquer momento" ([Inter's Pix spec](https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml)).
    - Its examples are copied from BACEN (`pix.example.com`) and are internally inconsistent: some callback examples are top-level arrays, and `componentesValor` appears as a number. Rely on the schemas.
17. **Sandbox clock.** The 08:00–20:00 window's time zone isn't stated. Preview deployments and CI runs against Inter's sandbox will fail outside it.

## Sources

Inter: OpenAPI specs and references

- Inter's Pix spec (OpenAPI, Last-Modified 2026-10-27): https://developers.inter.co/redocusaurus/swagger-api-pix-yaml.yaml
- Inter OAuth spec (OpenAPI): https://developers.inter.co/redocusaurus/swagger-token-yaml.yaml
- Rendered Pix reference: https://developers.inter.co/references/pix
- Rendered token reference: https://developers.inter.co/references/token

Inter: developer guides

- Portal home: https://developers.inter.co/
- About this portal: https://developers.inter.co/docs/introducao/sobre-este-portal
- Create an integration: https://developers.inter.co/docs/introducao/como-criar-uma-aplicacao
- Renew an integration: https://developers.inter.co/docs/introducao/como-renovar-uma-integracao
- OAuth 2.0: https://developers.inter.co/docs/introducao/oauth-2.0
- mTLS authentication: https://developers.inter.co/docs/introducao/autenticacao-mtls
- Our APIs: https://developers.inter.co/docs/introducao/nossas-apis
- FAQ: https://developers.inter.co/duvidas-frequentes
- HTTP error codes: https://developers.inter.co/erros-status-code

Inter: Postman guides and collection

- Add the certificate: https://developers.inter.co/docs/configurando-postman-testes/como-add-certificado
- Generate a token: https://developers.inter.co/docs/configurando-postman-testes/como-gerar-um-token-oauth
- Use the token: https://developers.inter.co/docs/configurando-postman-testes/como-utilizar-token-apis-inter
- Collection page: https://developers.inter.co/docs/configurando-postman-testes/import_collection
- Collection JSON: https://developers.inter.co/assets/files/collection_clients-70dbd986b515ebb52d5e58c70a05ff68.json

Inter: sandbox

- Sandbox portal (including the registration form's client code): https://developers.inter.co/sandbox
- Sandbox "Nova integração" screen: https://developers.inter.co/sandbox/create-integration
- Sandbox "Minhas integrações" screen: https://developers.inter.co/sandbox/my-integrations
- What is the sandbox: https://developers.inter.co/docs/sandbox/sobre-este-portal
- Create a sandbox integration: https://developers.inter.co/docs/sandbox/como-criar-uma-aplicacao
- Test in the sandbox: https://developers.inter.co/docs/sandbox/como-testar-aplicacao

Inter: webhooks

- Configure a webhook: https://developers.inter.co/docs/webhooks/como-config-webhooks
- Build a callback server: https://developers.inter.co/docs/webhooks/callback-webhook
- Validate a webhook URL: https://developers.inter.co/docs/webhooks/validar-url-do-webhook
- Sample webhook server (Java): https://github.com/inter-co/pj-webhook-server-java
- Sample server constants: https://github.com/inter-co/pj-webhook-server-java/blob/HEAD/src/main/java/inter/contants/Constants.java
- Sample server TLS setup: https://github.com/inter-co/pj-webhook-server-java/blob/HEAD/src/main/java/inter/initializer/HttpServerInitializer.java

Inter: Python SDK

- Token caching: https://github.com/inter-co/pj-sdk-python/blob/HEAD/inter_sdk_python/commons/utils/TokenUtils.py

Inter: changelog entries

- 08/03/2023, API Pix and multi-account integrations: https://developers.inter.co/changelog/08/03/2023
- 10/04/2023, `x-conta-corrente` on callbacks: https://developers.inter.co/changelog/10/04/2023
- 19/06/2023, callback history: https://developers.inter.co/changelog/19/06/2023
- 10/09/2024, payer data in Pix Charge callbacks: https://developers.inter.co/changelog/10/09/2024
- 19/11/2024, integration renewal: https://developers.inter.co/changelog/19/11/2024
- 14/04/2025, callback resend: https://developers.inter.co/changelog/14/04/2025
- 21/07/2025, callback IP list updated: https://developers.inter.co/changelog/21/07/2025
- 24/12/2025, Pix API closed to new integrations; renewal window: https://developers.inter.co/changelog/24/12/2025
- 12/03/2026, Pix API re-enabled with review: https://developers.inter.co/changelog/12/03/2026
- 10/04/2026, new review process: https://developers.inter.co/changelog/10/04/2026

Inter: fees and accounts

- Tariffs page: https://inter.co/tarifas/
- PJ tariff table in force from 21/06/2025: https://static.bancointer.com.br/site/tabela-tarifas/06828f37a7464f8ab3eb4e5571586214_tabela-de-tarifas-pj-maio.pdf
- PJ tariff table in force from 01/04/2025: https://static.bancointer.com.br/site/tabela-tarifas/96845097c66c49cbbb73a5e05fdf4c85_tabela-de-tarifas-pj-fevereiro.pdf
- Inter Empresas account page: https://inter.co/empresas/conta-digital/pessoa-juridica/
- Inter blog on opening a PJ account (2022, updated 2023): https://blog.inter.co/abrir-conta-pj

Inter: a different product, cited only to tell it apart

- Inter mass-payments (SOAP remittance) API getting-started guide, which requires IP whitelisting: https://masspayments.inter.co/ppapis3/documentation/articles/GettingStarted.html

Central Bank (BACEN)

- API Pix repository: https://github.com/bacen/pix-api
- OpenAPI, release 2.10.0: https://github.com/bacen/pix-api/blob/2.10.0/openapi.yaml
- Release 2.10.0: https://github.com/bacen/pix-api/releases/tag/2.10.0
- Changelog (2.11.0-rc1 and 2.10.0): https://github.com/bacen/pix-api/blob/master/changelog.md
