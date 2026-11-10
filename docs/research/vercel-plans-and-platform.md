# What do Vercel's plans and platform allow for this app?

Findings for the research ticket "What do Vercel's plans and platform allow for this app?". Every source was read on **2026-11-10**. Dates in brackets are each page's own "last updated" stamp. Most of the sources are first-party: Vercel's docs (their Markdown versions), its legal and pricing pages and its changelog, plus Nitro's docs and the `nitropack` source that this repo's lockfile pins (2.13.5, through Nuxt 4.6.3). Community threads appear only as leads and are marked as such.

## Answer

- **Hobby is allowed for this site under Vercel's own wording, but only because of one sentence.** The Fair Use Guidelines count "Any method of requesting or processing payment from visitors of the site" as commercial, then add: "Asking for Donations **does not** fall under commercial usage." The Terms of Service only require "personal or non-commercial use" on Hobby. A personal campaign that sells nothing, shows no ads and pays no one to build it fits that donation exception. Three things leave some risk. No source defines "donations" or says whether giving each Payer a PIX Charge still counts as asking for donations. A Vercel help article that restates the rule leaves the exception out. And Vercel may shut down Hobby deployments "without notice for any reason or no reason". Vercel tells anyone unsure to contact Support, and a written reply from Support would settle the question.
- **Functions can run in São Paulo on Hobby.** Nuxt bundles every server route into one Node.js Vercel Function. Hobby can pin it to "any single region", including `gru1`, which is AWS `sa-east-1`, the same AWS region as the Turso database. Hobby fixes the maximum duration at 300 s and memory at 2 GB / 1 vCPU. Pro defaults to 300 s, allows up to 800 s (1,800 s in beta) and up to 4 GB / 2 vCPU, and supports several regions.
- **No plan lets a function require or read a client certificate on incoming requests.** Vercel's CDN terminates TLS. No documented header, setting or Firewall condition exposes a client certificate. Vercel staff said in December 2025 that inbound mTLS isn't supported, and no changelog entry since has changed that. So a Provider that only delivers webhooks over mTLS can't reach a Vercel Function directly. Outbound mTLS, from the function to the bank, is ordinary Node.js code.
- **Cron runs at most once a day on Hobby, accurate only to the hour (±59 min), and once a minute on Pro.** Vercel Schedules, in public beta since 2026-11-05, lets Hobby run every 15 min, up to 5,000 runs a month, and Pro run every minute. Neither comes near the ~5 s "paid" requirement.
- **BotID is the only invisible bot check, and its Basic level is free on Hobby.** Deep Analysis is Pro-only, at $1 per 1,000 checks. Nuxt needs a client plugin that calls `initBotId({ protect: [...] })` and a `checkBotId()` call in the H3 handler, with no module or rewrites. Firewall rate limiting allows one rule on Hobby (keyed by IP or JA4, counted within the 3 custom rules) and 40 on Pro. The WAF Challenge action, Attack Mode and the Bot Protection ruleset all show a visible "Vercel Security Checkpoint" page.
- **Hobby has no static outbound IPs.** Static IPs are a Pro/Enterprise add-on at $100 a month per project, plus Private Data Transfer ($0.31/GB in `gru1`). Without them, outbound traffic uses changing IPs, and Vercel publishes no range to allowlist. If a Provider requires IP allowlisting, Hobby is out.
- **Environment variables aren't a constraint.** Each deployment gets 64 KB for names and values together, which is also the most any one variable can hold, on every plan. Every plan can set separate values for Production, Preview (optionally per branch) and Development. Custom environments are Pro-only. Changes apply only to new deployments.
- **Hobby usage is capped, not billed.** Each month includes 1M function invocations, 4 h of Active CPU and 360 GB-hrs of provisioned memory. Going over pauses the project, possibly for 30 days, and Hobby can't buy more. Pro costs $20 a month, which includes $20 of usage credit. After that it bills on demand at `gru1` rates.
- **Long-lived connections end at the maximum duration.** WebSockets and streamed responses work on every plan, but they close at 300 s on Hobby (800 s on Pro). A screen waiting out a 1-hour Charge would have to reconnect.

## Terms

### What the sources say, word for word

**Terms of Service, § 4 "Hobby Plan"**: <https://vercel.com/legal/terms#hobby-plan> [Last Updated October 19, 2026]

> We offer a free Hobby plan at our sole discretion. The Hobby plan is subject to all provisions of these Terms of Service, unless expressly stated otherwise. You shall only use the Services under a Hobby plan for your personal or non-commercial use. We may change the features, limitations, or other conditions applicable to the Hobby plan or discontinue offering the Hobby plan at any time. We reserve the right to disable or remove any Project or website deployment on the Hobby plan with or without notice at our sole discretion. We may shut down and terminate projects or deployments using the Hobby plan without notice for any reason or no reason. We may shut down affected projects or deployments on the Hobby plan in case of any delays or performance problems including, without limitation, those caused by a malicious attack on a project or deployment.

**Fair Use Guidelines, "Commercial usage"**: <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage> [2026-09-14]. The rendered HTML page has the same text.

> **Hobby teams** are restricted to non-commercial personal use only. All commercial usage of the platform requires either a Pro or Enterprise plan.
>
> Commercial usage is defined as any Deployment that is used for the purpose of financial gain of **anyone** involved in **any part of the production** of the project, including a paid employee or consultant writing the code. Examples of this include, but are not limited to, the following:
>
> - Any method of requesting or processing payment from visitors of the site
> - Advertising the sale of a product or service
> - Receiving payment to create, update, or host the site
> - Affiliate linking is the primary purpose of the site
> - The inclusion of advertisements, including but not limited to online advertising platforms like Google AdSense
>
> Note: Asking for Donations **does not** fall under commercial usage.
>
> If you are unsure whether or not your site would be defined as commercial usage, please contact the Vercel Support team.

**Hobby plan docs**: <https://vercel.com/docs/plans/hobby> [2026-09-14]: "As stated in the fair use guidelines, the Hobby plan restricts users to non-commercial, personal use only."

**Vercel KB, "Why has my account or deployment been paused?"**: <https://vercel.com/kb/guide/why-is-my-account-deployment-blocked> [2026-10-02]. This article restates the rule **without** the donations note: "One frequent trigger is commercial use on a Hobby plan. Hobby teams are for non-commercial personal use only. All commercial usage requires a Pro or Enterprise plan." Its first example is "**Requesting or processing payment:** Any method of taking payment from visitors of the site." It closes with: "When you're unsure if your project counts as commercial, contact Vercel Support before deployment."

Related:

- Terms § 10.2: "Vercel is not a payment processor." (<https://vercel.com/legal/terms#pci-compliance>). This fits the design, in which the bank moves the money and Vercel never touches it.
- The changelog entry for the October 19, 2026 Terms update lists changes to credits, managed accounts, renewal and cancellation, and service changes. It says nothing about the Hobby use restriction. (<https://vercel.com/changelog/updates-to-hobby-and-pro-terms-of-service>)
- The Acceptable Use Policy [April 21, 2026] has nothing on donations or fundraising. It does forbid circumventing the Fair Use Guidelines. (<https://vercel.com/legal/acceptable-use-policy>)
- The pricing page describes Hobby as "The perfect starting place for your web app or personal project." (<https://vercel.com/pricing>)

### How it applies here

- **For Hobby:**
  - The campaign's only purpose is asking the public for money for a personal cause, which is exactly the case the donations note names.
  - Nothing is sold or advertised, and there are no ads or affiliate links.
  - Nobody is paid to build or host the site, as long as that stays true.
  - The Terms, which are the binding agreement, ask only for "personal **or** non-commercial use".
- **Against, or unclear:**
  - The site literally does what the first commercial example describes. Each Payer gets a PIX Charge, a *cobrança* or payment request.
  - The money lands in a Bank Account belonging to the Operator, who is also the person building the site ("anyone involved in any part of the production").
  - The guidelines don't define "donations" or say whether a per-Payer Charge flow still counts as "asking for donations".
  - The KB article leaves the exception out.
  - Vercel keeps the discretion to shut down Hobby deployments "for any reason or no reason".
- **Reading:** this is an inference, not Vercel's statement. The exception sits directly under the examples, and the definition turns on "financial gain". So the most natural reading is that a site whose only job is collecting donations is non-commercial, whatever payment method it uses. Only Vercel can confirm this, and it points anyone unsure to Support.
- **Wording mismatch:** the Terms say "personal or non-commercial", while the guidelines and Hobby docs say "non-commercial personal". No source says whether raising money for another person counts as "personal". As written, the Terms' "or" makes "non-commercial" enough.
- **What a "no" would look like:** Vercel pauses a project for a policy violation by stopping its production deployment, which then returns `503 DEPLOYMENT_PAUSED`. Vercel emails the reason, and "If you don't receive that email, Vercel is unable to discuss the pause further." (<https://vercel.com/kb/guide/why-is-my-account-deployment-blocked>)
- **Git connection:** Hobby can't connect a project to "Git repositories owned by Git organizations" (<https://vercel.com/docs/limits#connecting-a-project-to-a-git-repository>). This repo belongs to a personal GitHub account, so that rule doesn't block it.

**Implications for a possible plan change:** under the documented rules, any of the following forces a move to Pro:

- Support calls the site commercial.
- A Provider requires IP allowlisting, which needs Static IPs.
- BotID Deep Analysis is wanted.
- Cron must run more than once a day, or schedules more often than every 15 minutes.
- A request or connection must stay open longer than 300 s.

Inbound mTLS isn't solved by any Vercel plan.

## Functions

### How Nuxt server routes become a Vercel Function

- Vercel: "Nuxt deploys routes defined in `/server/api`, `/server/routes`, and `/server/middleware` as one server-rendered Function by default. Nuxt Pages, APIs, and Middleware routes get bundled into a single Vercel Function." (<https://vercel.com/docs/frameworks/full-stack/nuxt> [2026-08-26]). Nuxt's `server/middleware` therefore runs inside that function and in its region. It isn't Vercel Routing Middleware, which Vercel deploys to all regions (<https://vercel.com/docs/functions/configuring-functions/region#limits>).
- This repo's `pnpm-lock.yaml` pins `nuxt@4.6.3` with `nitropack@2.13.5`, which is Nitro v2. That version's `vercel` preset writes one function to `.vercel/output/functions/__fallback.func`. It builds that function's `.vc-config.json` as `{ runtime, ...nitro.options.vercel?.functions, handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true }` (<https://github.com/nitrojs/nitro/blob/v2.13.5/src/presets/vercel/utils.ts>).
  - When `compatibilityDate` is 2025-07-15 or later (the repo uses `2026-06-30`), the preset also adds per-route `.func` symlinks for observability.
  - Vercel's Build Output API says a symlinked `.func` lets "more than one path point to the same underlying Vercel Function" (<https://vercel.com/docs/build-output-api/primitives>).
- **Runtime:** the `vercel` preset runs on Node.js. The Edge preset `vercel_edge` is "(deprecated)", and Nitro recommends "migrating to the default Node.js runtime" (<https://v2.nitro.build/deploy/providers/vercel>). Vercel offers Node **26.x (default)**, 24.x and 22.x (<https://vercel.com/docs/functions/runtimes/node-js/node-js-versions> [2026-02-27]). Nitro picks the function's runtime from the Node major version used for the build:
  - Nitro 2.13.5 chooses from `[18, 20, 22, 24]` and falls back to `nodejs24.x` for any newer build. 2.13.6 changes the list to `[22, 24, 26]` (<https://github.com/nitrojs/nitro/blob/v2.13.6/src/presets/vercel/utils.ts>).
  - `nitro.vercel.functions.runtime` overrides that choice.
- **Node API:** the limits page lists "Full Node.js coverage" (<https://vercel.com/docs/functions/limitations> [2026-08-24]). Nothing in Vercel's docs restricts outbound TLS with a client certificate. This is an inference from that silence plus full API coverage.
- **Fluid compute** has been "enabled by default for new projects" since April 23, 2025, and it runs on Hobby. Several invocations can share one instance, and `waitUntil` runs work after the response has been sent (<https://vercel.com/docs/fluid-compute> [2026-08-24]).

### Duration, memory and regions per plan

| | Hobby | Pro |
|---|---|---|
| Max duration (Node, Fluid) | 300 s default **and** maximum | 300 s default, 800 s maximum; 1,800 s "extended maximum" in beta, set per function, on `nodejs22.x`/`24.x`/`26.x` |
| Memory / CPU | 2 GB / 1 vCPU, fixed: "**Hobby users cannot configure this size**" | 2 GB / 1 vCPU default; 4 GB / 2 vCPU option, chosen in the dashboard (not `vercel.json`) |
| Function regions | "Single region"; "Hobby plans can select any single region" | "5 regions" on the region page, but "Up to 3" on the Fluid compute page (see Gaps) |
| Region failover | No (Enterprise only) | No (Enterprise only) |
| Concurrency | Auto-scales up to 30,000 | Auto-scales up to 30,000 |
| Request/response body | 4.5 MB | 4.5 MB |
| Runtime logs kept | 1 hour | 1 day |
| Included usage / price | 1,000,000 invocations, 4 h Active CPU, 360 GB-hrs provisioned memory a month. Over the cap the project is paused, and you "wait until 30 days have passed". No extra usage can be bought. | $20/month platform fee with $20 usage credit; then in `gru1`: $0.221 per Active-CPU hour, $0.0183 per GB-hr, $0.60 per 1M invocations |

Sources:

- Durations: <https://vercel.com/docs/functions/limitations#max-duration> and <https://vercel.com/docs/functions/configuring-functions/duration> [2026-08-24].
- Memory: <https://vercel.com/docs/functions/configuring-functions/memory> [2026-07-15].
- Regions: <https://vercel.com/docs/functions/configuring-functions/region> [2026-08-11], <https://vercel.com/docs/project-configuration/vercel-json#regions> and <https://vercel.com/docs/fluid-compute#default-settings-by-plan>.
- Logs: <https://vercel.com/docs/limits#logs>.
- Hobby caps and pauses:
  - <https://vercel.com/docs/plans/hobby> ("In most cases, if you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again.")
  - <https://vercel.com/docs/plans> ("Hobby plans will be paused when they exceed the included free tier usage")
  - <https://vercel.com/pricing> ("If you have a free Hobby account, you are limited to the usage caps and cannot purchase additional usage.")
- Pro pricing: <https://vercel.com/docs/plans/pro-plan> [2026-09-15], <https://vercel.com/docs/pricing/regional-pricing/gru1> [2026-09-14] and <https://vercel.com/docs/functions/usage-and-pricing>.

How memory is billed, since it matters for any connection held open: "Billed for the entire instance lifetime in GB-hours ... Billing continues until the last in-flight request completes". Active CPU "Pauses billing when your code is waiting for external services" (<https://vercel.com/docs/functions/usage-and-pricing>).

### Pinning `gru1`

- `gru1` is "sa-east-1 | São Paulo, Brazil" (<https://vercel.com/docs/regions> [2026-08-11]). That is the same AWS region the Turso database uses (`aws-sa-east-1`).
- New projects default to `iad1` (Washington, D.C.), so the region has to be changed (<https://vercel.com/docs/functions/configuring-functions/region>).
- Documented ways to change it:
  - In the dashboard, under Settings → Functions → Function Regions.
  - With `"regions": ["gru1"]` in `vercel.json`. That key "overrides the Vercel Function Region in Project Settings" (<https://vercel.com/docs/project-configuration/vercel-json#regions>).
  - With `vercel --regions gru1` on the CLI.
  - Deploying to more regions than the plan allows "causes the deployment to fail before the build step".
- From Nuxt itself: Nitro v2 copies `nitro.vercel.functions` into the function's `.vc-config.json`, and the Build Output API reads `regions` there as the "List of Vercel Regions where the Vercel Function will be deployed to". `maxDuration` is read there too, and the value `"max"` "resolves to your plan's maximum" (<https://vercel.com/docs/build-output-api/primitives>). Nitro's v2 docs don't show this route; it comes from the preset source.
  - Nitro v2's top-level `vercel.regions` applies only to the deprecated Edge preset. The source comment reads "If you are using `vercel-edge`, you can specify the region(s) for your edge function." (<https://github.com/nitrojs/nitro/blob/v2.13.5/src/presets/vercel/types.ts>)
  - Per-route `vercel.functionRules` (with `regions`) exists only in Nitro v3 (<https://nitro.build/deploy/providers/vercel>).
  - Vercel's duration docs show the matching `vercel.functions.maxDuration` key for Nuxt (<https://vercel.com/docs/functions/configuring-functions/duration>).

```ts
// nuxt.config.ts — sketch derived from the nitropack 2.13.5 preset source
export default defineNuxtConfig({
  nitro: { vercel: { functions: { regions: ['gru1'], maxDuration: 60 } } }
})
```

**Implications for "How does the system learn a Charge was paid?":**

- **Connections held open.** WebSockets are "available on all plans", but "WebSocket connections close when a Vercel Function reaches its maximum duration", and they bill as function usage for as long as they're open (<https://vercel.com/docs/functions/websockets> [2026-08-10]). A stream or socket kept open for a Charge's full hour reconnects at least every 300 s on Hobby, or 800 s on Pro.
- **Polling budget.** A screen polling every 3 s for a full hour makes 1,200 requests. Hobby's 1,000,000 invocations a month would cover about 830 such screen-hours. That figure is plain arithmetic on the documented allowance, and the same allowance also has to cover creating Charges and the Operator's pages.

## Cron

### Cron Jobs (legacy, still supported)

| | Hobby | Pro |
|---|---|---|
| Cron jobs per project | 100 | 100 |
| Minimum interval | Once per day | Once per minute |
| Scheduling precision | Per-hour (±59 min) | Per-minute |

Source: <https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing> [2026-07-15]. On Hobby, a more frequent expression fails the deployment with "*Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day.*" A job set for `0 1 * * *` "will trigger anywhere between 1:00 am and 1:59 am". The same page calls Cron Jobs "a legacy feature [that] will be migrated to Schedules in the future". Cron requests go only to "your project's production deployment URL", with the user agent `vercel-cron/1.0` (<https://vercel.com/docs/schedules/cron-jobs> [2026-09-16]). The limit of 100 per project on every plan dates from 2026-01-20 (<https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan>).

### Vercel Schedules (public beta, the successor)

Vercel launched Schedules "in public beta on all plans" on 2026-11-05 (<https://vercel.com/changelog/vercel-schedules-is-now-in-public-beta>). The limits page says "Schedules are in beta, and these limits may change before general availability" (<https://vercel.com/docs/schedules/limits>; the page's own date stamp, 2018-10-20, is clearly wrong).

| | Hobby | Pro |
|---|---|---|
| Most frequent cron schedule | Every 15 minutes | Every minute, with a 1-minute jitter window |
| Jitter window | Always 15 minutes | 1 to 15 minutes, default 1 |
| Schedules per team | 1,000 | 10,000 |
| Usage | Up to 100 static schedules per deployment; each billing period, 500 dynamic schedule creations and 5,000 runs (scheduled and manual). Past that, creating schedules and running them is blocked until the next billing period. | Billed from $5 per 1M runs and $10 per 1M creations |
| Environments | Production, Preview branches, custom environments (Cron Jobs: production only) | same |

Sources: <https://vercel.com/docs/schedules/limits>, <https://vercel.com/docs/schedules> [2026-10-26] and <https://vercel.com/docs/schedules/concepts>. A schedule can target a path, a private function with no public URL, or a Vercel Queue topic.

### Nuxt specifics

- Nitro v2, which Nuxt 4.6 uses, does **not** turn `scheduledTasks` into Vercel Cron Jobs. The 2.13.5 and 2.13.6 `vercel` presets contain no cron code (<https://github.com/nitrojs/nitro/blob/v2.13.5/src/presets/vercel/preset.ts>).
- Nitro v3 does make that conversion, and has an experimental Schedules mode (<https://nitro.build/deploy/providers/vercel>).
- On Nitro v2, cron entries go in `vercel.json` `crons`. The Build Output `config.json` also accepts `crons` (<https://vercel.com/docs/build-output-api/configuration#crons>), and Nitro v2 merges `nitro.vercel.config` into that file. This last route comes from reading the source.

**Implications for "How does the system learn a Charge was paid?":** neither a Cron Job (daily on Hobby) nor a Schedule (15 min on Hobby, 1 min on Pro) can meet the ~5 s requirement for the Payer's screen. The settled rule that "nothing has to happen when nobody is looking" means a schedule is optional rather than required.

## Inbound mTLS

**Short answer:** no Vercel Function, on any plan, can require or read a client certificate on an incoming request. The docs never say "unsupported" outright; they document no mechanism at all. Vercel staff have confirmed in community threads that the feature isn't supported.

- **Where TLS ends:** Vercel's points of presence terminate TCP, and "TLS termination: The Vercel region the request is routed to handles TLS encryption and decryption." (<https://vercel.com/docs/regions>). A function only ever sees the HTTP request after Vercel's CDN has finished TLS.
- **What the TLS docs cover:** the encryption page documents TLS 1.2/1.3, ciphers, OCSP stapling, ECH and server certificates. It mentions no client-certificate option (<https://vercel.com/docs/cdn-security/encryption> [2026-09-15]).
- **What reaches the function:** the documented request headers are `host`, `x-vercel-id`, the `x-forwarded-*` set, `x-real-ip`, `x-vercel-deployment-url`, geo-IP headers and `x-vercel-signature`. None carries a client certificate (<https://vercel.com/docs/headers/request-headers>).
- **What the Firewall can match on:** WAF rule parameters include path, method, user agent, headers, query, cookie, hostname, IP, protocol, scheme, environment, region, geo, ASN and JA3/JA4 TLS digests. A client certificate isn't among them (<https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration>).
- **What Vercel staff said (community, lead only):**
  - On 2025-11-13, about a bank webhook: "This isn't currently supported, however, it is something our Product team is looking into" (<https://community.vercel.com/t/receber-webhook-e-necessita-de-mtls/26734>).
  - On 2025-12-04, about Banco do Brasil's mTLS webhooks: "Currently, Vercel doesn't support mTLS (mutual TLS) certificate validation for incoming connections at the platform level." That staff member said they used v0 to draft the reply (<https://community.vercel.com/t/mtls-de-entrada/29186>).
  - A follow-up on 2026-02-26 asking the same for Bradesco got no answer.
- **What changed since:** no changelog entry up to 2026-11-10 mentions mTLS or client certificates (<https://vercel.com/changelog/sitemap.md>, searched).
- **Undocumented outbound feature:** the Activity Log lists the event `project-client-cert-upload`, "A client certificate was uploaded to a project." (<https://vercel.com/docs/activity-log>). The limits page lists API rate limits named `api-projects-client-cert-post`, `-get` and `-delete` (<https://vercel.com/docs/limits#rate-limits>). A third-party mirror of Vercel's REST reference, now returning 410, called the endpoint "Upload client certificate for egress mTLS". That points to an **outbound** feature, and no current Vercel page documents it.
- **Ways around it, outside the platform:**
  - Vercel staff suggested a proxy that validates mTLS (such as Cloudflare or CloudFront) in front of the app.
  - Vercel's docs say "**We do not recommend** placing a reverse proxy server in front of your Vercel project", though they list Cloudflare, CloudFront and others as "Verified Proxy Lite" providers on Hobby and Pro (<https://vercel.com/docs/security/reverse-proxy>).
  - Bot Protection "doesn't work when a reverse proxy ... is placed in front of your Vercel deployment" (<https://vercel.com/docs/bot-management>).
- **Webhooks sent to Preview deployments:** when Deployment Protection covers Previews, a webhook sender that can't set headers can pass the bypass secret as a query parameter, `?x-vercel-protection-bypass=<secret>`. This is Protection Bypass for Automation, "available on all plans" (<https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation>).
- **Webhooks and the Bot Protection ruleset:** in challenge mode, that ruleset "serves a javascript challenge" to clients that don't behave like browsers. Efí and Inter webhooks aren't in Vercel's verified-bots directory (searched on <https://vercel.com/docs/bot-management>), so a webhook path would need a bypass custom rule.

**Implications for "How does the system learn a Charge was paid?":**

- A Provider that insists on presenting a client certificate when it delivers a webhook can't deliver to a Vercel Function on Hobby or Pro.
- The remaining routes:
  - The Provider offers a webhook mode without mTLS. Whether Efí or Inter do belongs to the tickets "How does Efí's PIX API work for us?" and "How does Inter's PIX API work for us?".
  - A proxy or separate host for the webhook hostname only, which Vercel discourages.
  - No webhooks: ask the Provider for the Charge's status while the Payer's screen is open.
- Firewall custom rules can match on IP address. If a Provider publishes its webhook source IPs, a rule could restrict the webhook path to them; Hobby allows 3 custom rules.

## Env vars

- **Size:** "The total size of your Environment Variables, names and values, is limited to **64KB** for projects using Node.js ... This limit is the total allowed for each deployment, and is also the maximum size of any single Environment Variable." Only variables exposed at runtime count (<https://vercel.com/docs/limits#environment-variables> [2026-09-16]). The env-var docs add: "With support for 64 KB of environment variables, you can add large values for authentication tokens, JWTs, or certificates." Edge functions cap each variable at 5 KB, but they don't apply here (<https://vercel.com/docs/environment-variables#environment-variable-size> [2026-09-17]). A few KB per certificate or key fits easily. Under ADR-0002, only the encryption key lives in an env var anyway.
- **Count:** at most 1,000 variables per environment per project (<https://vercel.com/docs/limits#environment-variables>).
- **Scoping, the same on Hobby and Pro:** each variable applies to one or more of **Production**, **Preview** and **Development** (<https://vercel.com/docs/environment-variables#environments>).
  - A Preview variable can cover all non-production branches or one branch, and branch values override the general Preview value.
  - Development values are used by `vercel dev`, or downloaded with `vercel env pull`.
  - **Custom environments** are "available on Enterprise and Pro plans". The pricing table lists them as Hobby "Not available", Pro "1 environment" and Enterprise "12 environments" (<https://vercel.com/docs/deployments/environments>, <https://vercel.com/pricing>). Hobby can still use a long-lived Preview branch with its own branch-specific variables.
  - This covers the settled split: Development and Preview share the development database, and Production gets its own.
- **Config vs Secret:** values are encrypted at rest. A **Secret** is write-only once saved, and "Secrets are allowed in Development. This reverses the earlier rule that limited Sensitive environment variables to Production and Preview." Secret values of 32 characters or more are redacted from build logs (<https://vercel.com/docs/environment-variables/sensitive-environment-variables> [2026-08-28]).
- **When changes apply:** "Any change you make to environment variables are not applied to previous deployments, they only apply to new deployments." (<https://vercel.com/docs/environment-variables>). This is the redeploy cost that ADR-0002 avoids for Bank Account secrets.

## Bot protection

### What each plan offers

| | Hobby | Pro |
|---|---|---|
| BotID Basic | Free | Free |
| BotID Deep Analysis (Kasada) | Not available | $1 per 1,000 `checkBotId()` Deep Analysis calls |
| WAF custom rules | Up to 3 | Up to 40 |
| WAF rate-limit rules | 1 per project, counted within the 3 custom rules | 40 per project |
| Rate-limit counting keys / algorithm / window | IP or JA4 digest; fixed window; 10 s to 10 min | same |
| Rate-limit requests | 1,000,000 allowed requests a month included | Usage-based: "Starting at $0.50 per 1M allowed requests", $0.80 per 1M in `gru1` |
| IP blocking | Up to 10 | Up to 40 |
| Persistent actions (time-based blocks) | No | Yes |
| DDoS mitigation, Attack Mode, Bot Protection and AI Bots managed rulesets | Included | Included |

Sources:

- BotID: <https://vercel.com/docs/botid> [2026-06-16].
- Prices: <https://vercel.com/pricing> and <https://vercel.com/docs/pricing/regional-pricing/gru1>.
- Rate limiting: <https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting> [2026-08-28]. Its counters "are tracked on a per-region basis".
- Custom rules and persistent actions: <https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules>.
- IP blocking: <https://vercel.com/docs/plans/hobby>.
- Managed rulesets: <https://vercel.com/docs/bot-management>.
- Traffic that the WAF denies, challenges or rate-limits incurs no CDN Requests or Fast Data Transfer charges (<https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing>).

### Which of these are invisible

- **BotID:** "an invisible CAPTCHA that protects against sophisticated bots without showing visible challenges or requiring user action" (<https://vercel.com/docs/botid>). Basic "validates the integrity and correctness of the challenge response, catching many less sophisticated bots". Deep Analysis adds Kasada's machine-learning model. BotID "requires a project to be deployed on Vercel" (<https://vercel.com/kb/guide/vercel-botid-vs-cloudflare-turnstile>).
- **Not invisible:**
  - The WAF **Challenge** action: "visitors see a **Vercel Security Checkpoint** screen", and solving it opens a 1-hour session (<https://vercel.com/docs/vercel-firewall/firewall-concepts#challenge>).
  - **Attack Mode**, which challenges all traffic.
  - The **Bot Protection managed ruleset** in challenge mode. It is off by default and "serves a javascript challenge" to clients that "violate browser-like behavior" (<https://vercel.com/docs/bot-management>).
- **Rate limiting** acts only after a source passes the limit, so Payers below it never notice it. By default it returns 429. It can instead Log, Deny or Challenge, and Challenge shows the checkpoint page.

### How BotID plugs into Nuxt server routes

The steps below are from <https://vercel.com/docs/botid/get-started> [2026-06-08].

1. `pnpm i botid`. "Vercel automatically routes BotID challenge and detection requests. You don't need ... the `botid/nuxt` module, or manual BotID rewrites in `vercel.json`." (Vercel's own KB comparison page still lists the `botid/nuxt` module as the Nuxt route; the get-started page is newer.)
2. Add a client plugin, `plugins/botid.client.ts`, with `defineNuxtPlugin({ enforce: 'pre', setup() { initBotId({ protect: [{ path: '/api/…', method: 'POST' }] }) } })`. Leaving the route out of this list makes `checkBotId()` fail.
3. Call `const verification = await checkBotId()` inside the `defineEventHandler`, and throw a 403 when `verification.isBot` is true.
4. Deep Analysis is a dashboard toggle under Firewall → Rules, "available on Enterprise and Pro plans". The `checkLevel` value must be the same on the client and the server (`botid@1.4.5` and later; <https://vercel.com/docs/botid/advanced-configuration>).

Things to know about how it behaves:

- "If you test with `curl` or visit a protected route directly, BotID will block you in production". The protected call has to be a `fetch` made from the page.
- Locally, `checkBotId()` "always returns `{ isBot: false }`" unless `developmentOptions.bypass` is set (<https://vercel.com/docs/botid/local-development-behavior>).
- "In production, headers are extracted automatically" (advanced configuration page). The published `botid@1.5.13` bundle (<https://registry.npmjs.org/botid/-/botid-1.5.13.tgz>), whose source repository is private, reads the request from Vercel's request context (`Symbol.for("@vercel/request-context")`) and authenticates with the Vercel OIDC token. That is why the Nuxt handler doesn't pass the event. This was found by reading the bundle, without running it.
- **Optional pattern:** check BotID once when the page loads, then issue a short-lived signed cookie, and keep calling `checkBotId()` for each sensitive action (<https://vercel.com/docs/botid/verify-on-page-load>).

There is also a rate-limit SDK. `@vercel/firewall`'s `checkRateLimit(id, { request?, headers?, rateLimitKey?, timeout? })` is "Experimental: Check rate-limits defined through the Vercel Firewall". It needs a dashboard rule with a `@vercel/firewall` condition under the same ID (<https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk>, <https://github.com/vercel/vercel/blob/main/packages/firewall/docs/functions/checkRateLimit.md>). On Hobby, that rule would use up the single rate-limit rule.

**Implications for "How do we keep bots from creating Charges?":**

- On Hobby, the only invisible bot check is BotID Basic. Deep Analysis needs Pro.
- The WAF Challenge action, Attack Mode and the Bot Protection ruleset all show a visible checkpoint page, so they conflict with the "invisible only" rule. That includes switching Attack Mode on during an attack.
- Hobby's whole rate-limiting budget is one rule, keyed by IP or JA4, with a window of 10 s to 10 min.

## Outbound IPs

| | Hobby | Pro |
|---|---|---|
| Static IPs (shared pool) | Not available | $100 per project a month, plus Private Data Transfer ($0.31/GB in `gru1`) |
| Secure Compute (dedicated IPs, VPC) | Not available | Not available (Enterprise only) |

Sources: <https://vercel.com/pricing>, <https://vercel.com/docs/networking/static-ips> [2026-06-30], <https://vercel.com/docs/networking/static-ips/getting-started> and <https://vercel.com/docs/pricing/regional-pricing/gru1>.

- **Without Static IPs**, which is every Hobby project: "outbound traffic from your deployments uses dynamic IP addresses, and Vercel doesn't publish a fixed range for you to allowlist." (<https://vercel.com/docs/networking/static-ips>)
- **How Static IPs work:**
  - Each configured region gets "two static IP addresses from a shared pool" that "a small group of customers in the same region shares", and a project can pick up to three regions.
  - They apply "to every environment in the project, including preview and production". They cover Vercel Functions, and builds too if you opt in, but never Routing Middleware.
  - They are outbound only: "Incoming requests to your app don't route through them". So they can't be handed to a Provider as the webhook source address.
  - Vercel advises keeping the backend's own authentication "such as database credentials, an API key, or mutual TLS" in place behind an allowlist.
- **`gru1` support:** the docs don't say directly whether Static IPs can be configured in `gru1`. The `gru1` price list does carry a Private Data Transfer rate, which is the Static IPs meter (see Gaps).

**Implications for "How does Efí's PIX API work for us?" and "How does Inter's PIX API work for us?":** check whether either Provider requires the caller's IP to be allowlisted for API access. If one does, Hobby can't meet the requirement. Pro plus Static IPs costs at least $120 a month: the $20 plan fee plus $100 for Static IPs.

## Gaps and open questions

1. **Whether the donation exception covers this flow.** No source defines "donations" or says whether a site that creates a PIX Charge for each Payer is "asking for donations" or "requesting ... payment from visitors". The KB article drops the exception. Vercel's remedy is to ask Support. A written answer from Support before launch would settle Hobby either way. A related unknown is whether raising money for a third person fits "personal" use, though the Terms' "or" suggests non-commercial use is enough.
2. **Inbound mTLS has only community answers.** Vercel's docs neither document nor explicitly rule out client-certificate validation. The "not supported" statements come from staff posts on the community forum, one of them drafted with an AI assistant. Whether Efí or Inter can deliver webhooks without mTLS, or publish source IPs, belongs to the Provider research tickets.
3. **An undocumented "client certificate for egress mTLS" project feature exists.** It shows up in the Activity Log events and API rate-limit lists, but no doc describes it. It doesn't appear necessary, since functions can do outbound mTLS in their own code.
4. **Region precedence for Nuxt's build output isn't spelled out.** Docs describe the dashboard default, `vercel.json` `regions` and `.vc-config.json` `regions` separately, but not which one wins for a framework's Build Output. Check the region in the first deployment's summary.
5. **Pro's region count conflicts:** "5 regions" on the region page against "Up to 3" on the Fluid compute page. This doesn't matter here, since one region is enough.
6. **Static IPs in `gru1` are only implied.** The docs give no region list. `gru1` has a Private Data Transfer price, which suggests the region is supported (inference).
7. **Schedules is new and in beta.** It launched 5 days before this research, and its limits "may change before general availability". Nitro v3's docs say Schedules "must be enabled for your Vercel team", while the changelog says "public beta on all plans". Nitro v2, which Nuxt 4.6 uses, has no Cron or Schedules integration.
8. **Hobby's limit of 12 functions per deployment, and Nitro's symlinks.** Hobby caps "Functions created per deployment" at 12 for frameworks that don't bundle routes (<https://vercel.com/docs/functions/runtimes#functions-created-per-deployment>). Nitro emits one function plus per-route symlinks to it. The docs say symlinks point to "the same underlying Vercel Function", but not how they count against that cap.
9. **BotID internals come from a private bundle.** How `checkBotId()` reads headers without the H3 event comes from reading the minified `botid@1.5.13` npm bundle. Its source repository is private. The docs say only that headers are "extracted automatically" in production.
10. **Default Deployment Protection for new projects.** Current pages don't say whether new projects get Deployment Protection by default. That decides whether webhooks to Preview URLs need the bypass query parameter.

## Sources

Vercel legal and pricing:

- <https://vercel.com/legal/terms> (Terms of Service, § 4 Hobby Plan, § 10.2)
- <https://vercel.com/legal/acceptable-use-policy>
- <https://vercel.com/pricing>
- <https://vercel.com/changelog/updates-to-hobby-and-pro-terms-of-service>

Vercel docs, plans and limits:

- <https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage>
- <https://vercel.com/docs/plans>
- <https://vercel.com/docs/plans/hobby>
- <https://vercel.com/docs/plans/pro-plan>
- <https://vercel.com/docs/limits>

Vercel docs, functions and regions:

- <https://vercel.com/docs/functions/limitations>
- <https://vercel.com/docs/functions/configuring-functions/duration>
- <https://vercel.com/docs/functions/configuring-functions/memory>
- <https://vercel.com/docs/functions/configuring-functions/region>
- <https://vercel.com/docs/functions/runtimes>
- <https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>
- <https://vercel.com/docs/functions/usage-and-pricing>
- <https://vercel.com/docs/functions/websockets>
- <https://vercel.com/docs/fluid-compute>
- <https://vercel.com/docs/regions>
- <https://vercel.com/docs/pricing/regional-pricing/gru1>
- <https://vercel.com/docs/project-configuration/vercel-json#regions>
- <https://vercel.com/docs/build-output-api/primitives>
- <https://vercel.com/docs/build-output-api/configuration#crons>
- <https://vercel.com/docs/frameworks/full-stack/nuxt>

Vercel docs, cron and Schedules:

- <https://vercel.com/docs/schedules/cron-jobs>
- <https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing>
- <https://vercel.com/docs/schedules>
- <https://vercel.com/docs/schedules/limits>
- <https://vercel.com/docs/schedules/concepts>
- <https://vercel.com/changelog/vercel-schedules-is-now-in-public-beta>
- <https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan>

Vercel docs, TLS, headers, networking and protection:

- <https://vercel.com/docs/cdn-security/encryption>
- <https://vercel.com/docs/headers/request-headers>
- <https://vercel.com/docs/activity-log>
- <https://vercel.com/docs/security/reverse-proxy>
- <https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation>
- <https://vercel.com/docs/deployments/environments>
- <https://vercel.com/docs/networking/static-ips>
- <https://vercel.com/docs/networking/static-ips/getting-started>
- <https://vercel.com/changelog/sitemap.md> (searched for mTLS and client-certificate entries)

Vercel docs, environment variables:

- <https://vercel.com/docs/environment-variables>
- <https://vercel.com/docs/environment-variables/sensitive-environment-variables>

Vercel docs, bot protection and Firewall:

- <https://vercel.com/docs/botid>
- <https://vercel.com/docs/botid/get-started>
- <https://vercel.com/docs/botid/advanced-configuration>
- <https://vercel.com/docs/botid/local-development-behavior>
- <https://vercel.com/docs/botid/verify-on-page-load>
- <https://vercel.com/docs/bot-management>
- <https://vercel.com/docs/vercel-firewall/firewall-concepts#challenge>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk>
- <https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing>

Vercel KB (first-party guides):

- <https://vercel.com/kb/guide/why-is-my-account-deployment-blocked>
- <https://vercel.com/kb/guide/vercel-botid-vs-cloudflare-turnstile>

Nitro, Nuxt and first-party source code:

- <https://v2.nitro.build/deploy/providers/vercel>
- <https://nitro.build/deploy/providers/vercel> (Nitro v3)
- <https://github.com/nitrojs/nitro/blob/v2.13.5/src/presets/vercel/utils.ts>
- <https://github.com/nitrojs/nitro/blob/v2.13.5/src/presets/vercel/types.ts>
- <https://github.com/nitrojs/nitro/blob/v2.13.5/src/presets/vercel/preset.ts>
- <https://github.com/nitrojs/nitro/blob/v2.13.6/src/presets/vercel/utils.ts>
- <https://github.com/vercel/vercel/blob/main/packages/firewall/docs/functions/checkRateLimit.md>
- <https://registry.npmjs.org/botid/-/botid-1.5.13.tgz> (published bundle, read without running it)

Leads only (community, not authoritative):

- <https://community.vercel.com/t/receber-webhook-e-necessita-de-mtls/26734>
- <https://community.vercel.com/t/mtls-de-entrada/29186>
