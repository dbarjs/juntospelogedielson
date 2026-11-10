# How does Effect run inside Nuxt server routes on Vercel?

Research for the map ticket of the same name, read on **2026-11-10**. These are the versions I read. Effect: `effect`, `@effect/platform-node`, `@effect/vitest` and `@effect/sql-libsql`, all 4.1.3 (npm `latest`). HTTP client: `undici` 8.12.4. From this repo's lockfile: `nuxt` 4.6.3, `nitropack` 2.13.5 and `h3` 1.15.11. Experiments ran outside the repo on Node 24.20.0 (bundled undici 7.29.0, OpenSSL 3.5.7) in an aarch64 Linux container. **Nothing was deployed to Vercel.** **Inferred** marks a conclusion that no source states outright. Every URL cited inline is also listed under [Sources](#sources).

## Answer

- **Effect 4 is the latest stable major.** `effect@4.1.3` (published 2026-11-10) is npm `latest`. Version 4.0.0 shipped on 2026-10-01 and is a long-term-support line. The 3.x line continues as `prev` (3.22.4) on the `v3` branch. Every satellite package now shares the core's version: `@effect/platform-node`, `@effect/sql-libsql` and `@effect/vitest` are all 4.1.3. `@effect/platform`, `@effect/sql` and `@effect/schema` are v3-era packages; their code now lives inside `effect` as `effect/http`, `effect/http-api`, `effect/sql` and `effect/Schema`. Effect 4 needs Node ≥ 22.19 and TypeScript ≥ 5.9 with `strict` on.
- **Only the core follows strict semver.** `Effect`, `Layer`, `Context`, `ManagedRuntime`, `Schema` and `Cache` are marked `@stability stable`. These are marked `@stability unstable`, so they may break in a minor release: `effect/http`, `effect/http-api`, `effect/sql`, `LayerMap`, and every module in the `@effect/*` satellite packages. Pin exact, matching versions and upgrade them together.
- **Effect documents two ways in, and both fit Nuxt 4.6.3, which runs Nitro 2 (nitropack 2.13.5, h3 1.15.11):**
  - **(A)** One module-scope `ManagedRuntime.make(AppLayer)`, with `runtime.runPromiseExit(...)` called inside each `defineEventHandler`. This is Effect's documented way to bridge into another framework.
  - **(B)** An `HttpApi` turned into a Web `(Request) => Promise<Response>` handler with `HttpRouter.toWebHandler(...)`, which Effect says "can be used in serverless environments". It mounts on a Nitro catch-all route through h3's `toWebRequest`.

  Effect, Nuxt and Nitro publish no Nuxt-specific example. The only public Nuxt + Effect code I found builds a runtime for every request, which throws away layer reuse.
- **Layers are built once per warm instance, and a failed build is cached too.** `ManagedRuntime` builds on first use; `toWebHandler` builds when the module loads. In both, a failed build makes every later request fail until the instance is recycled, so keep network I/O out of layer construction or retry inside the layer. Nitro's `close` hook, the natural place to call `dispose()`, never runs on Vercel. It runs only under `nuxt dev`, during prerender and in the node-server preset.
- **How errors become HTTP responses differs:**
  - **(A)** You map the `Exit`/`Cause` to h3's `createError` yourself.
  - **(B)** HttpApi does it from the declared error's `httpApiStatus` (default 500). A request that fails decoding gets an empty 400 and a defect gets an empty 500. The catch-all route returns a raw `Response`, so Nitro's typed `$fetch` inference is lost.
- **Effect's HttpClient can present a different client certificate for each Bank Account.** Since `@effect/platform-node` 4.0.5, client certificates are documented. `NodeHttpClient.makeDispatcherOptions({ connect: { cert, key } })` (or `{ pfx, passphrase }`) combined with `NodeHttpClient.makeUndici` gives one `HttpClient` per Bank Account, built from certificate bytes held in memory. In a live experiment, interleaved concurrent requests each presented the right certificate, and HTTP/2 was negotiated by default. The `node:https` client (`makeAgent` + `makeNodeHttp`) works too.
- **The experiment found three traps:**
  - **(a)** A `LayerMap` built from `NodeHttpClient.layerUndiciOptions(...)` gave **every** key the first Bank Account's certificate, because a shared inner layer is memoized. Wrap each layer in `Layer.fresh`, or build the clients with `makeUndici`.
  - **(b)** Node 24's built-in `fetch` rejects an undici 8 `Agent` with `invalid onRequestStart method`. Use the undici-backed client, undici's own `fetch`, or `Dispatcher1Wrapper` instead.
  - **(c)** A legacy-encrypted (RC2-40) PKCS#12 file fails on Node 24 / OpenSSL 3.5 with `Unsupported PKCS12 PFX data`; an AES-encrypted one works. This matters because Efí issues `.p12` certificates.
- **On Vercel, outbound client certificates should work, but that is inferred.** Vercel's Node runtime supports "all Node.js APIs". Its docs never mention outbound mTLS, and nothing was deployed to check.
- **In-memory state lives per instance, is shared by concurrent invocations, and can vanish at any time.** Fluid compute is the default for new projects since 2025-04-23. It serves many concurrent invocations from one running instance with shared global state. So the module-scope runtime, the per-Bank-Account clients and a cache of OAuth tokens all survive between invocations on that instance. But each new instance starts empty, instances suspend between invocations, and Vercel documents no instance lifetime. Work that continues after the response needs `waitUntil` from `@vercel/functions`; Nitro 2's `event.waitUntil` isn't connected to it on Vercel.
- **Effect's cold-start cost is mostly import time, and it depends on how Effect is loaded.** Nitro 2 keeps `node_modules` external: dependencies are traced and copied, not tree-shaken. Medians from 11–15 fresh processes on my machine:

  | Import | Median |
  | --- | --- |
  | `import { … } from "effect"` | ≈ 131 ms |
  | `@effect/platform-node` index | ≈ 290 ms |
  | Deep imports of the same modules | ≈ 75 ms / 103 ms |
  | Tree-shaken bundle: Effect core / HttpApi / undici | ≈ 6 ms / 19 ms / 25 ms |

  Vercel's knowledge-base guide says only paid plans pre-warm instances, so on Hobby cold starts are more likely.
- **Testing:** `@effect/vitest@4.1.3` requires Vitest 5. Vitest 5 accepts Vite 6.4–8 (Nuxt 4.6.3 ships Vite 8.3.5), and `@nuxt/test-utils@4.4.0` accepts Vitest 5. Run Effect server code in a plain `node` Vitest project and Nuxt-environment tests in a `defineVitestProject` project. A smoke test covering a shared layer, `TestClock`, and an HttpApi handler returning 404 passed.

## Versions

### Effect packages (npm registry, read 2026-11-10)

| Package | Version | Notes |
| --- | --- | --- |
| `effect` | **4.1.3** (`latest`, published 2026-11-10) | 4.0.0 published 2026-10-01; `prev` is 3.22.4 (2026-10-22). Contains what used to be `@effect/platform` (`effect/http`, `effect/http-api`), `@effect/sql` (`effect/sql`), `@effect/schema` (`effect/Schema`), `@effect/rpc` and more ([registry](https://registry.npmjs.org/effect), [MIGRATION.md](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/MIGRATION.md)) |
| `@effect/platform-node` | **4.1.3** | Depends on `undici ^8.12.4` and `@effect/platform-node-shared` 4.1.3. Peer dependencies: `effect ^4.1.3` and `redis >=5.1.0 <7.0.0`; there is no `peerDependenciesMeta` marking `redis` optional. The package index re-exports `NodeRedis`, which imports `redis` statically, so importing from `@effect/platform-node` loads `redis`; importing from `@effect/platform-node/NodeHttpClient` doesn't. `engines.node >=22.19.0` ([registry](https://registry.npmjs.org/@effect/platform-node)) |
| `@effect/sql-libsql` | **4.1.3** | Depends on `@libsql/client ^0.18.0` ([registry](https://registry.npmjs.org/@effect/sql-libsql)) |
| `@effect/vitest` | **4.1.3** | Peer `vitest >=5.0.0 <6.0.0` ([registry](https://registry.npmjs.org/@effect/vitest)) |
| `@effect/platform` / `@effect/sql` / `@effect/schema` | 0.97.x / 0.52.x / 0.75.5 | v3-era packages with no 4.x release; `@effect/platform@0.97.2` and `@effect/sql@0.52.1` have a peer dependency on `effect ^3.22`, so they don't belong next to Effect 4 ([registry](https://registry.npmjs.org/@effect/platform)) |

What the release notes and the repo say:

- **Version 4.x is long-term support.** The [Effect README](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/README.md) promises at least three years of support. It also says "Stable APIs reserve breaking changes for major releases. APIs marked unstable may change in minor releases". Requirements: "TypeScript 5.9 or newer", "Node.js 22.19 or newer", and `strict` on. This repo pins TypeScript ^6.0.3.
- **The 3.x code lives on the [`v3` branch](https://github.com/Effect-TS/effect/tree/v3).** The v4 code is now the `main` branch of `Effect-TS/effect`. The npm metadata for 4.1.3 points at `Effect-TS/effect` (`packages/effect`), not at the earlier `effect-smol` repository.
- **All packages share one version.** "All Effect ecosystem packages now share a single version number and are released together." Old `effect/unstable/<module>` import paths lost their `unstable` segment, for example `effect/http` ([MIGRATION.md](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/MIGRATION.md)).
- **Releases:** [effect@4.0.0](https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0) and [effect@4.1.3](https://github.com/Effect-TS/effect/releases/tag/effect%404.1.3).

How stable each module is, read from the `@stability` tag in the 4.1.3 sources:

| Stable | Unstable (may break in a minor release) |
| --- | --- |
| `effect/Effect`, `Layer`, `Context`, `ManagedRuntime`, `Schema`, `Cache` | `effect/http/*` (HttpClient, HttpRouter, FetchHttpClient), `effect/http-api/*`, `effect/sql/*`, `effect/LayerMap`, all of `@effect/platform-node` (including the `Undici` re-export), `@effect/sql-libsql`, `@effect/vitest` |

MIGRATION.md states it plainly: "Modules in packages other than `effect` are currently `@stability unstable`." It also says APIs that expose a third-party dependency, such as `@effect/platform-node/Undici`, are unstable.

### What this repo runs today (`pnpm-lock.yaml` in the main checkout)

| Package | Installed | Notes |
| --- | --- | --- |
| `nuxt` | 4.6.3 | npm `latest` is 4.6.4. Engines: Node `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` |
| `@nuxt/nitro-server` | 4.6.3 | Depends on `nitropack ^2.13.5` and `h3 ^1.15.11` ([package.json](https://unpkg.com/@nuxt/nitro-server@4.6.3/package.json)) |
| `nitropack` (Nitro 2) | 2.13.5 | npm `latest` is 2.13.6 (2026-11-02). Nitro 3 (the `nitro` package) is still `3.0.261103-rc` |
| `h3` | 1.15.11 | `h3@2.0.1-rc.26` is also in the lockfile, but only through `devframe` (devtools), not on the server path |
| `vite` | 8.3.5 | Relevant to the Vitest 5 compatibility below |
| `undici` | 8.12.3 | A direct dependency of `nuxt`. `@effect/platform-node` will pull in `^8.12.4` |

**Implications for "How is Effect wired into the Nuxt server?":**

- Pin `effect`, `@effect/platform-node`, `@effect/sql-libsql` and `@effect/vitest` to one exact version and upgrade them together.
- The HTTP, HttpApi and SQL modules are unstable, so a minor upgrade can need code changes.

## Integration patterns

### What Nitro 2 does on Vercel (read from nitropack 2.13.5)

- **One function for the whole server.** The `vercel` preset builds a single Node function, `.vercel/output/functions/__fallback.func`. Its entry calls `useNitroApp()` once at module load and serves every request through `toNodeListener(nitroApp.h3App)` ([runtime/vercel.mjs](https://unpkg.com/nitropack@2.13.5/dist/presets/vercel/runtime/vercel.mjs)). Anything created at module scope or in a Nitro plugin therefore lives as long as the instance.
- **The function config `.vc-config.json` gets** `launcherType: "Nodejs"`, `shouldAddHelpers: false` and `supportsResponseStreaming: true`. It also merges in `nitro.vercel.functions` (for example `regions`, `maxDuration`, `memory`).
- **Runtime selection.** The runtime is the build machine's Node major, rounded up to one the preset supports: 18, 20, 22 or 24 in 2.13.5; 22, 24 or 26 in 2.13.6. Setting `vercel.functions.runtime` overrides it ([2.13.5 utils.mjs](https://unpkg.com/nitropack@2.13.5/dist/presets/vercel/utils.mjs), [2.13.6 utils.mjs](https://unpkg.com/nitropack@2.13.6/dist/presets/vercel/utils.mjs)). Vercel builds on Node 26.x by default ([Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)), so with 2.13.5 the function would be declared `nodejs24.x` (**Inferred** from that code).
- **`close` never fires on Vercel.** Nitro calls its `close` hook only from the node-server preset's graceful shutdown, the dev server and the prerenderer ([shutdown.mjs](https://unpkg.com/nitropack@2.13.5/dist/runtime/internal/shutdown.mjs), [node-server.mjs](https://unpkg.com/nitropack@2.13.5/dist/presets/node/runtime/node-server.mjs)).
- **`event.waitUntil` is a no-op on Vercel.** It only forwards to `event.context.waitUntil` when the platform sets it, and the Vercel entry doesn't ([app.mjs](https://unpkg.com/nitropack@2.13.5/dist/runtime/internal/app.mjs)).
- **h3 1.15.11 can exchange Web objects.** `toWebRequest(event)` builds a Web `Request`. A handler may return a Web `Response`, which h3 streams back through `sendWebResponse`. `fromWebHandler(handler)` is literally `eventHandler((event) => handler(toWebRequest(event), event.context))` ([h3 dist](https://unpkg.com/h3@1.15.11/dist/index.mjs)).
- **The Nitro 2 docs** mark `vercel-edge` as deprecated and recommend the Node.js runtime with Fluid compute ([Nitro v2 Vercel docs](https://v2.nitro.build/deploy/providers/vercel)).

### Pattern A: Nitro event handlers running Effect through a `ManagedRuntime`

**What Effect documents:**

- **The bridge.** "`ManagedRuntime` bridges Effect programs with non-Effect code. Build one runtime from your application Layer, then use it anywhere you need imperative execution, like web handlers". The first-party example uses Hono: a module-scope runtime with a shared `Layer.makeMemoMapUnsafe()`, `runtime.runPromise(...)` in each route, and `runtime.dispose()` on `SIGINT`/`SIGTERM` ([ai-docs 10_managed-runtime.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/04_integration/10_managed-runtime.ts)).
- **Build once, cache the result, including a failure.** "The layer is built lazily on first use and its context is cached for subsequent runs … A failed layer build is also cached: subsequent runs return the same build failure without rebuilding the layer. For transient failures, retry inside the layer before passing it to `make`" ([ManagedRuntime.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/ManagedRuntime.ts); the [v4 Runtime guide](https://effect.website/docs/v4/runtime) says the same and recommends `Effect.retry` inside the layer).
- **No more `Runtime<R>`.** v4 removed the type: "Run functions live directly on `Effect`" (`Effect.runForkWith(services)` etc.), and `ManagedRuntime` remains the stable bridge ([migration/runtime.md](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/migration/runtime.md)).
- **Layer memoization changed in v4.** A layer already built by an enclosing provide or runtime is reused by nested `Effect.provide` calls. Sibling `provide` calls still build their own copies ([migration/layer-memoization.md](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/migration/layer-memoization.md)).

**What it looks like in Nuxt.** This is a sketch, not run in a Nuxt app. The API names were checked against the 4.1.3 sources.

```ts
// server/effect/runtime.ts: one runtime per server instance (module scope)
import { Layer, ManagedRuntime } from "effect"
import { AppLayer } from "./app-layer" // SqlClient, Providers, token cache, …

export const memoMap = Layer.makeMemoMapUnsafe()
export const runtime = ManagedRuntime.make(AppLayer, { memoMap })
```

```ts
// server/plugins/effect-runtime.ts: `close` fires on `nuxt dev` reloads and in prerender, never on Vercel
import { runtime } from "../effect/runtime"

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("close", () => runtime.dispose())
})
```

```ts
// server/api/charges.post.ts
import { Cause, Exit, Option } from "effect"
import { createCharge } from "../effect/charges" // Effect<Charge, InvalidAmount | ProviderUnavailable, …>
import { runtime } from "../effect/runtime"

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const exit = await runtime.runPromiseExit(createCharge(body)) // decode `body` with Schema inside the program
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.findErrorOption(exit.cause) // the typed failure, if there is one
  if (Option.isSome(failure)) {
    switch (failure.value._tag) {
      case "InvalidAmount": throw createError({ statusCode: 422, statusMessage: "Invalid amount" })
      case "ProviderUnavailable": throw createError({ statusCode: 503 })
    }
  }
  throw createError({ statusCode: 500 }) // defect or interruption
})
```

**How layers are reused across invocations:**

- The runtime is a module-level value, and Nitro's vercel entry keeps one `nitroApp` per instance. So the layer is built by the first request that reaches a fresh instance and reused by every later and concurrent request on that instance. **Inferred** from the two sources above.
- Pass per-request data (the Operator's session, the client IP) with `Effect.provideService` on the program. Do not build a runtime per request.
- The one public Nuxt + Effect repository I found does build a runtime per request. Its Nitro middleware calls `ManagedRuntime.make(MainLayer.pipe(Layer.provide(headersLayer)))` on every request and never disposes it ([FootprintsForFreedom server/middleware/1.effect-runtime.ts](https://github.com/FootprintsForFreedom/FootprintsForFreedom/blob/759293d3d7c20c1074c24f01300a0bf49b8840c8/server/middleware/1.effect-runtime.ts); Effect 3.14, Nuxt 3, inactive since 2025-04). That rebuilds every layer per request.

**How errors map:**

- Nothing is automatic. `runPromise` rejects on failure, while `runPromiseExit` returns an `Exit` you can inspect with `Exit.isSuccess` and `Cause.findErrorOption` ([ManagedRuntime.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/ManagedRuntime.ts)).
- Nuxt turns uncaught errors into 500s and uses `createError` for other status codes ([Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server)).
- Because handlers return plain values, Nitro keeps generating route types for `$fetch`/`useFetch` ([Nuxt server engine, "Typed API Routes"](https://nuxt.com/docs/4.x/guide/concepts/server-engine)).

### Pattern B: an Effect `HttpApi` mounted as a Web handler inside Nitro

**What Effect documents:**

- **The serverless handler.** The first-party HttpApi walkthrough ends with "Or create a web handler, which can be used in serverless environments": `export const { handler, dispose } = HttpRouter.toWebHandler(AllRoutes.pipe(Layer.provide(HttpServer.layerServices)))` ([ai-docs 51_http-server/10_basics.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/51_http-server/10_basics.ts)).
- **`toWebHandler(appLayer, { memoMap?, routerConfig?, disableLogger?, middleware? })`** returns `{ handler(request, context?) => Promise<Response>, dispose }`. "The layer is built immediately, so the cost is paid when the handler is created rather than on the first request … If the build fails, every request rejects with the build error." It logs each request unless `disableLogger: true`. The handled effect "runs uninterruptibly by default" ([HttpRouter.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpRouter.ts), [HttpEffect.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpEffect.ts)).
- **The optional second argument is an Effect `Context`.** The handler merges it into the request's services, and ignores it unless `Context.isContext(...)` is true. So h3's `fromWebHandler`, which passes `event.context`, is harmless, and Nitro code could pass request-scoped services such as an already-verified Operator this way ([HttpEffect.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpEffect.ts)).
- **`HttpServer.layerServices`** supplies `HttpPlatform`, `Path`, an ETag generator and a no-op `FileSystem`. Its JSDoc files it under "testing", but the serverless example above uses it in production code ([HttpServer.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpServer.ts)).

**What it looks like in Nuxt.** This is a sketch. The same shape ran in the smoke test under [Testing](#testing).

```ts
// server/effect/api.ts
import { Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { AppLayer, createCharge } from "./app"
import { memoMap } from "./runtime" // optional: share built layers with Pattern A's runtime

class InvalidAmount extends Schema.TaggedError<InvalidAmount>()("InvalidAmount", {}, { httpApiStatus: 422 }) {}

class ChargesGroup extends HttpApiGroup.make("charges").add(
  HttpApiEndpoint.post("create", "/api/charges", { // full path: the router sees the whole URL
    payload: Schema.Struct({ amount: Schema.String }),
    success: Schema.Struct({ txid: Schema.String, copiaECola: Schema.String }),
    error: InvalidAmount
  })
) {}
export class Api extends HttpApi.make("api").add(ChargesGroup) {}

const ChargesLive = HttpApiBuilder.group(Api, "charges", (handlers) =>
  handlers.handle("create", ({ payload }) => createCharge(payload)))

export const { handler, dispose } = HttpRouter.toWebHandler(
  HttpApiBuilder.layer(Api).pipe(
    Layer.provide(ChargesLive),
    Layer.provide(AppLayer),
    Layer.provide(HttpServer.layerServices)
  ),
  { memoMap, disableLogger: true }
)
```

```ts
// server/routes/api/[...].ts: Nitro catch-all that hands the request to Effect
import { handler } from "../../effect/api"

export default defineEventHandler((event) => handler(toWebRequest(event)))
```

**How layers are reused.** The handler is created at module load, so the layer is built once per instance, when the server bundle is first imported. The same "a failed build sticks" caveat applies. Pass the same `memoMap` to share already-built layers with a `ManagedRuntime` ([HttpRouter.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpRouter.ts)).

**How errors map:**

- A declared error's status comes from `{ httpApiStatus: 404 }` on a `Schema.TaggedError`, or from `HttpApiSchema.status(...)` ([fixtures/domain/UserErrors.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/51_http-server/fixtures/domain/UserErrors.ts)).
- A declared error without a status becomes **500**, and a success without one becomes 200 ([HttpApiSchema.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http-api/HttpApiSchema.ts), `getStatusError … ?? 500`).
- A request that fails decoding becomes an empty **400**; a response that fails encoding becomes an empty 500 ([HttpApiError.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http-api/HttpApiError.ts)).
- Defects become an empty **500** ([HttpServerError.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpServerError.ts), `causeResponse`).
- Ready-made `HttpApiError.*` classes cover the common statuses (400, 401, 403, 404, 409, 422, 503 …).
- Bundling this shape gave 200 for a found id and `404 {"_tag":"ChargeNotFound"}` for a missing one.

**What it trades against Pattern A:**

- **Gains:** OpenAPI generation, a typed `HttpApiClient` and Schema-checked contracts.
- **Loss:** Nitro's route typing has nothing to infer from a handler that returns a raw `Response` (**Inferred** from the Nuxt typed-routes rule above).
- **Exposure:** HttpApi sits entirely on unstable modules.

**Real examples.** Effect's own ai-docs show `toWebHandler` for serverless use. GitHub code search (2026-11-10) and web search found **no** public project that mounts an Effect `HttpApi` in Nitro/Nuxt.

### Side by side

| | A: `ManagedRuntime` in handlers | B: `HttpApi` → `toWebHandler` |
| --- | --- | --- |
| Layer build | Lazily, on the first `run*` | Eagerly, when the module is imported |
| Failed build | Cached for the runtime's life | Every request rejects with it |
| Error → HTTP | Hand-written `Exit` → `createError` | From the schemas: `httpApiStatus`, 400 on decode failure, 500 on defect |
| Nuxt typed `$fetch` | Kept | Lost; use `HttpApiClient` |
| Modules relied on | `ManagedRuntime` (stable) | `effect/http`, `effect/http-api` (unstable) |
| Disposal | `runtime.dispose()`, only meaningful in dev and prerender | `dispose()`, same |

## mTLS from Effect's HttpClient on Node

### What the API offers (`@effect/platform-node` 4.1.3)

- **`NodeHttpClient.makeDispatcherOptions(options?: Undici.Agent.Options)`** acquires a scoped undici `Agent` and destroys it when the scope closes. Added in 4.0.5, from [PR #9158](https://github.com/Effect-TS/effect/pull/9158): "Add typed connection options to `NodeHttpClient` for unix sockets and mutual TLS". The JSDoc reads: "Use to control how the Undici client connects, for example to … present a client certificate … `connect: { ca, cert, key, servername, rejectUnauthorized }` configures TLS for `https:` origins, including mutual TLS." It adds that `makeUndici` overrides `headersTimeout`/`bodyTimeout`, so use `Effect.timeout` for timeouts. Sources: [NodeHttpClient.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/platform/node/src/NodeHttpClient.ts), [API reference](https://effect.website/docs/v4/api/platform-node/NodeHttpClient), [release notes](https://github.com/Effect-TS/effect/releases/tag/%40effect/platform-node%404.0.5).
- **`NodeHttpClient.layerUndiciOptions(options)`** is the same thing as an `HttpClient` layer. `layerDispatcherOptions(options)` provides just the `Dispatcher`.
- **`NodeHttpClient.makeUndici`** builds an `HttpClient` that reads the `Dispatcher` service once, at construction (`const dispatcher = yield* Dispatcher`). The `UndiciOptions` reference is read per request, but it holds undici `Dispatcher.RequestOptions`, which carry no TLS settings. TLS belongs to the connector: for undici's `connect` option, "every `tls.connect()` option is accepted", which includes `pfx`/`passphrase` ([undici Client.md](https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/api/Client.md)). **So one client certificate means one `Agent` and one `HttpClient`, per Bank Account.**
- **`NodeHttpClient.makeAgent(options)` + `makeNodeHttp`** is the `node:https` path. `HttpAgentOptions extends https.AgentOptions`, where "`ca`, `cert`, `key`, `servername` and `rejectUnauthorized` configure TLS for `https:` URLs, including mutual TLS". It doesn't load undici at all.
- **`FetchHttpClient`** reads its `RequestInit` service and `Fetch` reference **per request** from the fiber ([FetchHttpClient.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/FetchHttpClient.ts)). Node's fetch accepts a non-standard `dispatcher` in `RequestInit` ([undici Fetch.md](https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/api/Fetch.md)). But Node 24 bundles undici 7.29.0, while `@effect/platform-node` brings undici 8. Undici 8 "mirrors a v1-compatible wrapper for legacy consumers such as Node.js built-in `fetch`" and suggests `Dispatcher1Wrapper` for passing a dispatcher to them ([undici v7→v8 migration](https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/best-practices/migrating-from-v7-to-v8.md)). Experiment 4a below shows what happens without the wrapper.
- **HTTP/2 is on by default.** Undici 8 defaults `allowH2` to `true` ([Client.md](https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/api/Client.md)), so the undici-backed client negotiates HTTP/2 whenever a server offers it. Vercel documents the same change for Node 26's built-in fetch, with a `VERCEL_FETCH_DISABLE_H2=1` opt-out, and notes that "a custom dispatcher set with `setGlobalDispatcher`, or a `dispatcher` passed to `fetch`, takes precedence" ([Advanced Node.js usage](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration)). For a dispatcher Effect owns, the opt-out is `allowH2: false` in the Agent options.

### Per-Bank-Account client (sketch; `bankAccountHttpClient` is the construction that ran as row 2'' below)

```ts
import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Layer, LayerMap } from "effect"
import { HttpClient } from "effect/http"

type ClientCertificate =
  | { readonly cert: Buffer; readonly key: Buffer }       // PEM pair
  | { readonly pfx: Buffer; readonly passphrase: string } // PKCS#12, e.g. Efí's .p12 with an empty passphrase

// One HttpClient per Bank Account, from certificate bytes decrypted at runtime (never a file path)
export const bankAccountHttpClient = (certificate: ClientCertificate) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function*() {
      const dispatcher = yield* NodeHttpClient.makeDispatcherOptions({ connect: certificate }) // closed with the layer
      return yield* NodeHttpClient.makeUndici.pipe(Effect.provideService(NodeHttpClient.Dispatcher, dispatcher))
    })
  )

// Keyed cache of clients. Use Layer.effect as above, NOT NodeHttpClient.layerUndiciOptions (see trap (a)).
// lookup's requirements (database, encryption key) become requirements of BankAccountClients.layer,
// or can be supplied with the `dependencies` option.
export class BankAccountClients extends LayerMap.Service<BankAccountClients>()("app/BankAccountClients", {
  lookup: (bankAccountId: string) => Layer.unwrap(Effect.map(loadCertificate(bankAccountId), bankAccountHttpClient)),
  idleTimeToLive: "15 minutes"
}) {}

// per call: callProvider.pipe(Effect.provide(BankAccountClients.get(bankAccountId)))
```

`LayerMap` lets one Bank Account's entry be rebuilt with `BankAccountClients.invalidate(id)`, for example after the Operator uploads a renewed certificate. It is `@stability unstable` ([LayerMap.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/LayerMap.ts), [ai-docs 30_layer-map.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/01_effect/05_resources/30_layer-map.ts)).

### Experiment: what I ran and what happened

**Setup.**

- **Location.** A scratch directory outside the repo; dependencies installed from npm with scripts disabled.
- **Certificates.** Two throwaway self-signed certificates, generated locally, never committed and not real credentials.
- **Endpoint.** `https://certauth.cryptomix.com/json/`, a public test service. It asks for any client certificate and echoes its subject as `SSL_CLIENT_S_DN`; without one it returns 403.

```sh
npm install --ignore-scripts effect@4.1.3 @effect/platform-node@4.1.3 @effect/vitest@4.1.3 undici@8.12.4

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=scratch-client-a/O=Scratch Test" -keyout client-a.key -out client-a.crt
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=scratch-client-b/O=Scratch Test" -keyout client-b.key -out client-b.crt
openssl pkcs12 -export -in client-a.crt -inkey client-a.key -out client-a-modern.p12 -passout pass:          # AES-256-CBC, PBKDF2
openssl pkcs12 -export -legacy -in client-b.crt -inkey client-b.key -out client-b-legacy.p12 -passout pass:  # pbeWithSHA1And40BitRC2-CBC

node mtls.mjs <certs-dir>; node layermap.mjs <certs-dir>; node nodehttps.mjs <certs-dir>
```

**Results.** Node v24.20.0, bundled undici 7.29.0, OpenSSL 3.5.7.

| # | Client | Result |
| --- | --- | --- |
| 1 | One `makeUndici` client per account via `makeDispatcherOptions({ connect: { cert, key } })`, requests a, b, a, b concurrently | ✅ each response echoed its own certificate (`CN=scratch-client-a`, `-b`, `-a`, `-b`) over **HTTP/2.0** |
| 2 | `LayerMap` with `lookup: (id) => NodeHttpClient.layerUndiciOptions(accounts[id])`, keys a, b, a | ❌ **all three echoed `CN=scratch-client-a`**. Again with keys b, a, b sequentially: all echoed `-b`. The first key's client is reused for every key |
| 2' | Same `LayerMap`, lookup wrapped in `Layer.fresh(...)` | ✅ b, a, b |
| 2'' | Same `LayerMap`, lookup = `Layer.effect(HttpClient, makeUndici + makeDispatcherOptions)` (the sketch above) | ✅ b, a, b |
| 3 | undici client without a certificate | 403 (the endpoint requires one) |
| 4a | `FetchHttpClient` (Node 24 built-in fetch) + `RequestInit { dispatcher: <undici 8 Agent> }` | ❌ `TypeError: fetch failed (cause: InvalidArgumentError: invalid onRequestStart method)` |
| 4b | Same, with `dispatcher: new Dispatcher1Wrapper(agent)` | ✅ right certificate, HTTP/1.1 |
| 4c | `FetchHttpClient` with `Fetch` = undici's own `fetch` + an undici 8 Agent | ✅ right certificate, HTTP/2.0 |
| 5a | `connect: { pfx, passphrase: "" }` with the AES-encrypted PKCS#12 | ✅ |
| 5b | Same with the legacy RC2-40 PKCS#12 | ❌ `Error: Unsupported PKCS12 PFX data` |
| 6 | `node:https`: `makeAgent({ cert, key })` + `makeNodeHttp`, one per account, a, b, a concurrently | ✅ right certificate each time, HTTP/1.1 |

**Why row 2 happens.**

- `layerUndiciOptions(options)` is `Layer.provide(layerUndiciNoDispatcher, layerDispatcherOptions(options))`, and `layerUndiciNoDispatcher` is a single module-level constant.
- `LayerMap.make` builds every key with one memo map, `Layer.CurrentMemoMap.forkOrCreate(context)` ([LayerMap.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/LayerMap.ts); [NodeHttpClient.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/platform/node/src/NodeHttpClient.ts)).
- Layers are memoized by reference, so the constant is built once, around the first key's dispatcher, and then reused.
- **Inferred:** the same could happen anywhere two `layerUndiciOptions(...)` layers are built in one memo map, for example inside one `ManagedRuntime`.
- An issue search for `layerUndiciOptions` in `Effect-TS/effect` (2026-11-10) found no report of this.

<details>
<summary><code>mtls.mjs</code> as run (rows 1, 2, 3, 4a–4c, 5a, 5b)</summary>

```js
import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Layer, LayerMap } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Agent, Dispatcher1Wrapper, fetch as undiciFetch } from "undici"

const dir = process.argv[2]
const read = (f) => readFileSync(join(dir, f)) // Buffers: certificates arrive as bytes, not file paths
const ECHO = "https://certauth.cryptomix.com/json/"

const accounts = {
  a: { connect: { cert: read("client-a.crt"), key: read("client-a.key") } },
  b: { connect: { cert: read("client-b.crt"), key: read("client-b.key") } },
  aP12: { connect: { pfx: read("client-a-modern.p12"), passphrase: "" } },
  bLegacyP12: { connect: { pfx: read("client-b-legacy.p12"), passphrase: "" } }
}

const echo = (client) =>
  client.get(ECHO).pipe(
    Effect.flatMap((res) =>
      res.status === 200
        ? Effect.map(res.json, (b) => ({ status: res.status, dn: b.SSL_CLIENT_S_DN, protocol: b.SERVER_PROTOCOL }))
        : Effect.succeed({ status: res.status })
    )
  )

const report = (label, effect) =>
  effect.pipe(Effect.exit, Effect.tap((exit) => Effect.sync(() =>
    console.log(label, "=>", exit._tag === "Success" ? JSON.stringify(exit.value) : `FAILURE ${String(exit.cause).slice(0, 400)}`))))

const clientFor = (options) =>
  Effect.gen(function*() {
    const dispatcher = yield* NodeHttpClient.makeDispatcherOptions(options)
    return yield* NodeHttpClient.makeUndici.pipe(Effect.provideService(NodeHttpClient.Dispatcher, dispatcher))
  })

const perAccountClients = Effect.scoped(Effect.gen(function*() {
  const a = yield* clientFor(accounts.a)
  const b = yield* clientFor(accounts.b)
  return yield* Effect.all([echo(a), echo(b), echo(a), echo(b)], { concurrency: "unbounded" })
}))

class ClientMap extends LayerMap.Service()("scratch/ClientMap", {
  lookup: (accountId) => NodeHttpClient.layerUndiciOptions(accounts[accountId]),
  idleTimeToLive: "5 minutes"
}) {}

const echoCurrent = Effect.gen(function*() {
  const client = yield* HttpClient.HttpClient
  return yield* echo(client)
})
const viaLayerMap = (accountId) => echoCurrent.pipe(Effect.provide(ClientMap.get(accountId)))
const layerMapRun = Effect.all([viaLayerMap("a"), viaLayerMap("b"), viaLayerMap("a")], { concurrency: "unbounded" })
  .pipe(Effect.provide(ClientMap.layer))

const noCert = Effect.scoped(Effect.flatMap(clientFor(undefined), echo))

const fetchClient = echoCurrent.pipe(Effect.provide(FetchHttpClient.layer))
const withInit = (init) => Effect.provideService(fetchClient, FetchHttpClient.RequestInit, init)
const agentA = new Agent(accounts.a)
const agentB = new Agent(accounts.b)

Effect.runPromise(Effect.gen(function*() {
  console.log("node", process.version, "bundled undici", process.versions.undici, "openssl", process.versions.openssl)
  yield* report("1. per-account makeUndici clients (a, b, a, b concurrently)", perAccountClients)
  yield* report("2. LayerMap keyed clients (a, b, a)", layerMapRun)
  yield* report("3. undici client, no certificate", noCert)
  yield* report("4a. built-in fetch + RequestInit{dispatcher: undici@8 Agent}", withInit({ dispatcher: agentA }))
  yield* report("4b. built-in fetch + RequestInit{dispatcher: Dispatcher1Wrapper(undici@8 Agent)}",
    withInit({ dispatcher: new Dispatcher1Wrapper(agentB) }))
  yield* report("4c. Fetch=undici.fetch + RequestInit{dispatcher: undici@8 Agent}",
    withInit({ dispatcher: agentB }).pipe(Effect.provideService(FetchHttpClient.Fetch, undiciFetch)))
  yield* report("5a. PKCS#12 (AES-256-CBC) via connect.pfx", Effect.scoped(Effect.flatMap(clientFor(accounts.aP12), echo)))
  yield* report("5b. PKCS#12 (legacy RC2-40) via connect.pfx", Effect.scoped(Effect.flatMap(clientFor(accounts.bLegacyP12), echo)))
  yield* Effect.promise(() => Promise.all([agentA.close(), agentB.close()]))
}))
```

`layermap.mjs` (rows 2–2'') runs `LayerMap.make(lookup, { idleTimeToLive: "1 minute" })` with keys `b, a, b` sequentially for three lookups: `NodeHttpClient.layerUndiciOptions(accounts[k])`, `Layer.fresh(NodeHttpClient.layerUndiciOptions(accounts[k]))`, and `Layer.effect(HttpClient.HttpClient)(clientFor(accounts[k]))`. `nodehttps.mjs` (row 6) builds clients with `NodeHttpClient.makeAgent({ cert, key })` + `NodeHttpClient.makeNodeHttp` (with `Effect.provideService(NodeHttpClient.HttpAgent, agent)`) and runs a, b, a concurrently.

</details>

### Does it work on Vercel's Node runtime?

- **What Vercel says.** Node.js functions "support all Node.js APIs" ([Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js), updated 2026-08-11). The client in rows 1 and 6 only uses `node:tls`, through undici's connector or `node:https`, with certificates held in memory. Nothing needs the filesystem.
- **Inferred:** it should work on Vercel the same way, on Node 22, 24 or 26.
- **Not verified.** I found no Vercel page about outbound client certificates, and nothing was deployed.
- A Vercel community thread (a lead, not a primary source) shows staff saying that **inbound** mTLS isn't supported ([community thread](https://community.vercel.com/t/receber-webhook-e-necessita-de-mtls/26734)). The closed ticket "What do Vercel's plans and platform allow for this app?" already settled that; it doesn't affect outbound calls.

**Implications for "What does the app need from a Provider?":**

- **Formats.** Accept certificates as PEM (`cert`/`key`) or PKCS#12 (`pfx`/`passphrase`) bytes. Efí documents its certificate as "PFX (.p12)", with an empty password when converting, and requires it "in all requests made to the Pix API, including the authorization request" ([Efí credentials](https://dev.efipay.com.br/en/docs/api-pix/credenciais/)).
- **Check the `.p12` encryption.** Whether a given Efí `.p12` uses legacy RC2 encryption, which row 5b shows Node 24 rejects, has to be checked against a real sandbox certificate. Converting to PEM when the Bank Account is registered avoids the question.
- **Per-account clients.** Each Bank Account needs its own client, for the OAuth token request as well as for Charge calls.

## Serverless behaviour on Vercel

### Instance reuse under Fluid compute

- **The default.** Fluid compute has been the default for new projects since April 23, 2025, on the Node.js runtime among others ([Fluid compute](https://vercel.com/docs/fluid-compute), updated 2026-08-24).
- **Instances are shared by concurrent invocations.** "Fluid compute starts a new instance only when no running instance has spare capacity. Additional requests reuse existing instances while they're still processing work, so one instance serves many invocations concurrently." ([What is compute?](https://vercel.com/docs/fundamentals/what-is-compute), updated 2026-08-11)
- **Global state is shared too.** "Fluid compute lets multiple invocations share the same physical instance and its global state. Functions can reuse resources across invocations, such as in-memory caches and established database connections." (same page)
- **Instances suspend.** Vercel documents `attachDatabasePool` for Fluid compute: it "ensures that idle pool clients are properly released before functions suspend" ([@vercel/functions reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), updated 2026-09-03).
- **No documented lifetime.** No page I read states how long an idle instance lives. The cold-start guide only says that functions are archived after two weeks idle in production, and that the first invocation after that adds "at least one second" ([cold-start guide](https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel), updated 2026-07-23).
- **Errors stay local.** With uncaught exceptions or unhandled rejections, Fluid compute "logs the error and lets current requests finish before stopping the process" ([Fluid compute](https://vercel.com/docs/fluid-compute)).
- **Duration limits on Hobby:** 300 s by default and at most (same page).
- **The two sources disagree on pre-warming.**
  - The Fluid compute page and "What is compute?" both say production deployments are pre-warmed, with no plan qualifier.
  - The cold-start guide says "On paid plans, production deployments keep instances warm and ready".
  - So with the map's Hobby default, assume no pre-warming.
- **Work after the response.** `waitUntil(promise)` from `@vercel/functions` "extends the lifetime of the request handler for the lifetime of the given Promise", with the same timeout as the function ([@vercel/functions reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)). Nitro 2's `event.waitUntil` isn't wired to it on Vercel (see [What Nitro 2 does on Vercel](#what-nitro-2-does-on-vercel-read-from-nitropack-2135)).
- **Region.** Functions default to `iad1`. São Paulo is `gru1` (`sa-east-1`) ([regions](https://vercel.com/docs/regions), [function regions](https://vercel.com/docs/functions/configuring-functions/region)). The Build Output API's `.vc-config.json` accepts `regions` ([primitives](https://vercel.com/docs/build-output-api/primitives)), and Nitro merges `nitro.vercel.functions` into that file. So `nitro.vercel.functions.regions = ["gru1"]` or `vercel.json` `regions` should pin it (**Inferred**; not deployed).

### Which in-memory state survives between invocations

Survives, per instance and only while that instance lives (**Inferred** from the sources above together with Nitro's module-scope `nitroApp`):

- the `ManagedRuntime` or `toWebHandler` and everything its layers built: the `SqlClient`, the Provider services, `LayerMap`/`RcMap` entries;
- each Bank Account's undici `Agent`, its pooled connections and its TLS session cache (`maxCachedSessions`, default 100, per [Client.md](https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/api/Client.md));
- an OAuth token cache.

Does not survive:

- a new instance, or every instance after a redeploy, starts empty;
- two concurrent instances each hold their own copy.

An Effect `Cache` fits per-instance OAuth tokens. It "shares an in-progress lookup when multiple callers request the same missing key", caches failures too, and takes a per-result time-to-live ([Cache.ts](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/Cache.ts)):

```ts
// inside a layer: one token per Bank Account per instance; concurrent misses share one token request
const tokens = yield* Cache.makeWith(
  (bankAccountId: string) => fetchAccessToken(bankAccountId), // OAuth over mTLS with that account's client
  {
    capacity: 16,
    timeToLive: (exit) => Exit.isSuccess(exit) ? Duration.seconds(exit.value.expiresIn - 60) : Duration.zero
  }
)
```

Efí's tokens expire in 3600 s by default ([Efí credentials](https://dev.efipay.com.br/en/docs/api-pix/credenciais/)).

**Implications for "What does the app need from a Provider?":** several instances may each hold a valid token for the same Bank Account at once. Find out from each Provider whether issuing a new token revokes older ones, and what limits apply to the token endpoint.

### Effect's cold-start cost

**Measured.** All on Node 24.20.0, aarch64, 12 vCPUs, taking the median of 11–15 fresh `node` processes per case. These numbers come from my machine, not from Vercel, whose CPUs and filesystem will differ.

| What was imported | How | Size (min / gzip) | Import time |
| --- | --- | --- | --- |
| `import { Effect, Layer, ManagedRuntime, Schema } from "effect"` | from `node_modules`, unbundled | n/a | **≈ 131 ms** |
| `effect/Effect`, `effect/Layer`, `effect/ManagedRuntime`, `effect/Schema` (deep imports) | unbundled | n/a | ≈ 75 ms |
| `effect` + `effect/http` index | unbundled | n/a | ≈ 154 ms |
| `effect` + `effect/http` + `effect/http-api` indexes | unbundled | n/a | ≈ 158 ms |
| `import { NodeHttpClient } from "@effect/platform-node"` (index; also loads `redis` through `NodeRedis`) | unbundled | n/a | **≈ 290 ms** |
| `@effect/platform-node/NodeHttpClient` (deep) | unbundled | n/a | ≈ 103 ms |
| `undici` | unbundled | n/a | ≈ 43 ms |
| Effect core (`ManagedRuntime` + `Layer` + `Schema.Class`) | rolldown bundle, tree-shaken, minified | 82 / 26 KiB | ≈ 6 ms |
| HttpApi + `HttpRouter.toWebHandler` (Pattern B), first request ≈ 22 ms more | bundle | 272 / 87 KiB | ≈ 19 ms |
| `ManagedRuntime` + `NodeHttpClient.layerUndici` + `Schema` (Pattern A), first run ≈ 12 ms more | bundle | 849 / 268 KiB | ≈ 25 ms |
| `undici` `Agent` alone | bundle | 705 / 221 KiB | ≈ 25 ms |

**How Nitro loads Effect.**

- Nitro 2's node and vercel presets don't bundle `node_modules`. They mark them external and trace them into the function's own `node_modules` ([rollup/index.mjs](https://unpkg.com/nitropack@2.13.5/dist/rollup/index.mjs)).
- Nuxt inlines only Vue, `@nuxt/*`, its build directory and anything listed in `build.transpile` ([@nuxt/nitro-server dist](https://unpkg.com/@nuxt/nitro-server@4.6.3/dist/index.mjs)).
- So by default Effect loads unbundled, which means the upper half of the table applies.
- **Inferred:**
  - Importing from package indexes multiplies the cost: the index module re-exports every submodule, and for `@effect/platform-node` that includes `NodeRedis` and with it the `redis` client.
  - Deep imports roughly halve it.
  - Inlining Effect with `nitro.externals.inline` or `build.transpile` would bring tree-shaking back. This is untested in a real `nuxt build`.
  - Effect's own claim, "A minimal Effect program bundles to 7.1 kB (minified + gzipped)" ([MIGRATION.md](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/MIGRATION.md)), only holds once the code is bundled.
- **What Vercel's caching saves.** Bytecode caching, on Node 20+ in production only, removes recompilation on later cold starts. "The first request isn't cached yet" ([Fluid compute](https://vercel.com/docs/fluid-compute)). Vercel's guide also notes that "Startup time correlates with function size, and most of that size usually comes from external dependencies" ([cold-start guide](https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel)).

**Implications for "How is Effect wired into the Nuxt server?":**

- Prefer deep imports, or inline Effect into the server bundle.
- Keep the Payer-facing route's layer graph small; there is no pre-warming on Hobby.
- Measure the cold path on a Vercel Preview before deciding.
- Keep network I/O out of layer construction, because a failed build is cached for the instance's life.

## Testing

### Versions that fit together

| Piece | Requirement | Source |
| --- | --- | --- |
| `@effect/vitest@4.1.3` | `vitest >=5.0.0 <6.0.0`, `effect ^4.1.3` | [registry](https://registry.npmjs.org/@effect/vitest), [README](https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/vitest/README.md) |
| `vitest@5.1.0` (`latest`) | Node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0` | [registry](https://registry.npmjs.org/vitest) |
| `@nuxt/test-utils@4.4.0` (`latest`, 2026-11-08) | peer `vitest ^4.0.2 \|\| ^5.0.0`, `nuxt ^3.21.0 \|\| ^4.0.0 \|\| ^5.0.0-0` | [registry](https://registry.npmjs.org/@nuxt/test-utils) |
| This repo | Vite 8.3.5 (through Nuxt 4.6.3) | `pnpm-lock.yaml` |

From the `@effect/vitest` README:

- **Helpers.** `it.effect` gives each test the test services (`TestClock`, `TestConsole`) and a fresh `Scope`; `it.live` uses the live environment. `layer(L)(name, (it) => …)` or `it.layer` shares one layer across a block, and `{ buildPerTest: true }` builds it per test.
- **Vitest 5 changes to know.** Replace `test.sequential` with `{ concurrent: false }`. In concurrent tests, use `ctx.expect`.

### Alongside Nuxt

**What Nuxt documents.** The Nuxt 4 testing guide uses one `vitest.config.ts` with Vitest `projects` ([Nuxt testing](https://nuxt.com/docs/4.x/getting-started/testing)):

- a `unit` project (`environment: 'node'`, `test/unit/*.{test,spec}.ts`);
- a `nuxt` project created with `await defineVitestProject(...)` from `@nuxt/test-utils/config`, which "is only for Nuxt-environment tests";
- an `e2e` project, also `environment: 'node'`, using `setup`/`$fetch` from `@nuxt/test-utils/e2e`.

Each test file should match exactly one project, and the projects' `include` globs choose its environment. The config needs `"type": "module"`, which this repo already has.

**Where Effect fits.** Effect services and HttpApi handlers belong in the plain `node` project, written with `@effect/vitest`.

**Inferred** from the above:

- Keep Effect server code free of Nitro auto-imports (`defineEventHandler`, `useRuntimeConfig`) so it runs there.
- In Pattern A the Nitro handler is a thin adapter.
- In Pattern B, a handler can be tested in-process by calling `handler(new Request(...))`.

**Smoke test** (scratch directory, `vitest@5.1.0` + `@effect/vitest@4.1.3`, plain `node` environment): **3/3 passed**. The cases:

- a `layer(...)` block sharing one service across tests;
- `TestClock.adjust("1 hour")` releasing a forked `Effect.sleep("1 hour")`;
- `HttpRouter.toWebHandler(HttpApiBuilder.layer(Api) …)` answering 200 for a found id and 404 for a declared `Schema.TaggedError(…, { httpApiStatus: 404 })`.

## Gaps and open questions

- **Nothing was run on Vercel.** Outbound mTLS, cold-start cost, HTTP/2 negotiation and the `gru1` pinning through `nitro.vercel.functions.regions` are all unverified there. One throwaway route on a Preview deployment would settle it: echo `certauth.cryptomix.com` with a throwaway certificate and log import timings.
- **The LayerMap / `layerUndiciOptions` behaviour (trap a) is undocumented.** It reproduces every time, and I found no upstream issue. Is it a bug or intended memoization? Either way the safe constructions are the ones in rows 2' and 2''. Whether to report it upstream is open.
- **Certificate formats, per Provider.** Is Efí's `.p12` encrypted with legacy RC2? Node 24 / OpenSSL 3.5 rejects legacy PKCS#12. And in what form do Inter's certificates come? These belong to "How does Efí's PIX API work for us?" and "How does Inter's PIX API work for us?".
- **HTTP/2 to the banks.** Undici 8, and therefore Effect's undici client, offers HTTP/2 by default. Whether Efí's and Inter's endpoints negotiate it cleanly together with client certificates is unknown; `allowH2: false` is the fallback.
- **Instances suspend, but how long and how is undocumented.** Pooled keep-alive connections may be stale when a suspended instance resumes (**Inferred**). If so, the first Provider call after an idle period could fail at the transport level. Retrying is only safe if creating a Charge is idempotent at the Provider. That question belongs to "What does the app need from a Provider?".
- **Tokens across instances.** Do the Providers revoke an older OAuth token when a new one is issued, and what limits apply to their token endpoints? Several instances can each fetch a token for the same Bank Account.
- **Pattern B in depth wasn't explored.** Open points: authenticating the Operator inside HttpApi middleware versus in Nitro (passing an Effect `Context` as the handler's second argument), CORS, and how `HttpServer.layerServices` (filed under "testing") is meant to be used in production.
- **Effect's docs site has no guides for v4 HTTP clients, HTTP servers, HttpApi or `@effect/vitest`.** Its guide index lists none ([v4 guides](https://effect.website/docs/v4/guides)). The facts above come from source JSDoc, the repo's `ai-docs` examples, READMEs and the API reference.
- **Nitro 3 / h3 2 are out of scope.** Nuxt 4.6.x is on Nitro 2. Nitro 3 is still a release candidate. In h3 2, `H3Event.req` is itself a Web `Request` ([h3 2.0.1-rc.26 types](https://unpkg.com/h3@2.0.1-rc.26/dist/h3.d.mts)), which would change the glue code in both patterns.
- **Inlining Effect isn't tested.** Inlining it into the Nitro bundle (`nitro.externals.inline` / `build.transpile`) to recover tree-shaking hasn't been tried in a real `nuxt build`.

## Sources

npm registry (dist-tags, versions, dependency metadata; read with `npm view`, 2026-11-10)

- https://registry.npmjs.org/effect
- https://registry.npmjs.org/@effect/platform-node
- https://registry.npmjs.org/@effect/sql-libsql
- https://registry.npmjs.org/@effect/vitest
- https://registry.npmjs.org/@effect/platform
- https://registry.npmjs.org/vitest
- https://registry.npmjs.org/@nuxt/test-utils

Effect (pinned to the 4.1.3 release commit `7865dbb`)

- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/README.md
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/MIGRATION.md
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/migration/runtime.md
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/migration/layer-memoization.md
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/ManagedRuntime.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpRouter.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpEffect.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/FetchHttpClient.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpServer.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http/HttpServerError.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http-api/HttpApiSchema.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/http-api/HttpApiError.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/LayerMap.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/effect/src/Cache.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/platform/node/src/NodeHttpClient.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/packages/vitest/README.md
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/04_integration/10_managed-runtime.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/51_http-server/10_basics.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/51_http-server/fixtures/domain/UserErrors.ts
- https://github.com/Effect-TS/effect/blob/7865dbbb7b6a91691921dbb4febedf3ab94a348b/ai-docs/src/01_effect/05_resources/30_layer-map.ts
- https://github.com/Effect-TS/effect/tree/v3
- https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0
- https://github.com/Effect-TS/effect/releases/tag/effect%404.1.3
- https://github.com/Effect-TS/effect/releases/tag/%40effect/platform-node%404.0.5
- https://github.com/Effect-TS/effect/pull/9158
- https://effect.website/docs/v4/runtime
- https://effect.website/docs/v4/api/platform-node/NodeHttpClient
- https://effect.website/docs/v4/guides

Nitro, h3, Nuxt (installed sources mirrored from npm, plus docs)

- https://unpkg.com/nitropack@2.13.5/dist/presets/vercel/utils.mjs
- https://unpkg.com/nitropack@2.13.5/dist/presets/vercel/runtime/vercel.mjs
- https://unpkg.com/nitropack@2.13.5/dist/runtime/internal/app.mjs
- https://unpkg.com/nitropack@2.13.5/dist/runtime/internal/shutdown.mjs
- https://unpkg.com/nitropack@2.13.5/dist/presets/node/runtime/node-server.mjs
- https://unpkg.com/nitropack@2.13.5/dist/rollup/index.mjs
- https://unpkg.com/nitropack@2.13.6/dist/presets/vercel/utils.mjs
- https://unpkg.com/h3@1.15.11/dist/index.mjs
- https://unpkg.com/h3@2.0.1-rc.26/dist/h3.d.mts
- https://unpkg.com/@nuxt/nitro-server@4.6.3/package.json
- https://unpkg.com/@nuxt/nitro-server@4.6.3/dist/index.mjs
- https://v2.nitro.build/deploy/providers/vercel
- https://nuxt.com/docs/4.x/getting-started/testing
- https://nuxt.com/docs/4.x/guide/concepts/server-engine
- https://nuxt.com/docs/4.x/directory-structure/server

undici (v8.12.4)

- https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/api/Client.md
- https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/api/Fetch.md
- https://github.com/nodejs/undici/blob/v8.12.4/docs/docs/best-practices/migrating-from-v7-to-v8.md

Vercel (last-updated dates as shown on each page)

- https://vercel.com/docs/fluid-compute (2026-08-24)
- https://vercel.com/docs/fundamentals/what-is-compute (2026-08-11)
- https://vercel.com/docs/functions/runtimes/node-js (2026-08-11)
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions (2026-02-27)
- https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration (2026-04-27)
- https://vercel.com/docs/functions/configuring-functions/region (2026-08-11)
- https://vercel.com/docs/regions (2026-08-11)
- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package (2026-09-03)
- https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel (2026-07-23)
- https://vercel.com/docs/build-output-api/primitives (2025-03-04)
- https://community.vercel.com/t/receber-webhook-e-necessita-de-mtls/26734 (community thread, used as a lead only)

Providers, examples and test endpoints

- https://dev.efipay.com.br/en/docs/api-pix/credenciais/
- https://github.com/FootprintsForFreedom/FootprintsForFreedom/blob/759293d3d7c20c1074c24f01300a0bf49b8840c8/server/middleware/1.effect-runtime.ts
- https://certauth.cryptomix.com/json/ (public client-certificate echo endpoint used in the experiment)
