# How do we use Turso from Effect?

Research for the ticket "How do we use Turso from Effect?" on the map "Wayfinder map: PIX donation page". Read and run on 2026-11-10 against `effect` and `@effect/sql-libsql` 4.1.3, `@libsql/client` 0.18.0, `@tursodatabase/serverless` 1.4.1 and nitropack 2.13.5, plus the Turso and Vercel docs as published that day. No experiment touched a real database: everything ran against a local libSQL file or `:memory:` in a scratch directory outside the repo (see [Experiment log](#experiment-log)). In this note "transaction" always means a database transaction, never a Charge or a Payment.

## Answer

- **Client: `@effect/sql-libsql@4.1.3` with `effect@4.1.3`.**
  - Effect 4 has been stable since 2026-10-01. Its SQL toolkit now lives in `effect/sql`; `@effect/sql@0.52` is the Effect 3 line.
  - The driver wraps Turso's `@libsql/client@0.18`. `LibsqlClient.layerConfig({ url: Config.String("TURSO_DATABASE_URL"), authToken: Config.Redacted("TURSO_AUTH_TOKEN") })` provides `SqlClient`.
  - With a `libsql://` URL the client speaks Hrana over **HTTP**, not WebSockets. Nothing is opened at startup, and each statement is its own HTTPS request.
- **The database must be a libSQL database.**
  - Turso Cloud now hosts two engines. Effect's driver fits libSQL, the default for `turso db create`.
  - Databases created with `--tursodb` (early preview) are meant for `@tursodatabase/serverless`, which has no Effect driver. Its `/compat` client doesn't fit `LibsqlClient`: the types don't match, and one lock wraps every call.
  - Confirm the development database's engine with `turso db show`, and create production the same way.
- **A Vercel deploy breaks out of the box (reproduced).**
  - Importing `@effect/sql-libsql` loads libSQL's native binary at import time. Nitro 2.13.5, the version Nuxt 4.6.3 resolves in this repo, doesn't copy that binary into the function.
  - Run on its own, the built server fails with `Cannot find module '@libsql/linux-…-gnu'`.
  - Two fixes worked in a scratch Nitro app: add the resolved binary to `externals.traceInclude` (+8 MB), or alias `@libsql/client` to its `/web` entry and inline both packages. The second leaves no native code, but `file:` and `:memory:` don't work in that build.
- **Latency is per round trip.**
  - A plain statement is 1 HTTP request. `sql.withTransaction` with N statements is N + 1, because `BEGIN` rides with the first statement and `COMMIT` with the stream close.
  - Vercel functions default to `iad1`. Pinning `gru1` (AWS `sa-east-1`) puts them in the same AWS region as the `aws-sa-east-1` database.
  - Neither vendor publishes the round-trip time, so measure it once on a Preview deployment.
- **Database transactions work over HTTP, but they're short and exclusive.**
  - Every Effect database transaction is `BEGIN IMMEDIATE`, holding the write lock. It gets a 5-second window, and its stream closes after 10 s idle.
  - Never hold one open across a Provider's PIX API call. `sql.afterCommit` is the hook for follow-up work.
  - The upstream "invalid baton" issue for HTTP database transactions is still open.
- **Migrations are `Effect`s keyed `<id>_<name>`, loaded with `LibsqlMigrator.fromRecord`. Run them deliberately, once per database.**
  - `fromRecord` needs no file system and no bundler support. `LibsqlMigrator.run` applies every pending migration in one database transaction and records it in `effect_sql_migrations`.
  - The migrator only compares against the highest recorded id, so a lower-numbered migration that arrives later is skipped silently (reproduced).
  - A second runner racing the first fails with `SqlError` instead of waiting (reproduced locally).
  - So the place to run them is a script or CI step with that database's token, not cold start. Vercel's Deploy Hooks only re-run builds, and migrating at build time would let every Preview build migrate the shared development database.
- **Types: Effect Schema decodes rows; only SQLite errors get typed reasons.**
  - `SqlSchema.findAll/findOne/findOneOption/void` encode requests and decode rows with Effect Schema.
  - `Model.Class` plus `SqlModel.makeRepository` derive insert, update and find, using `RETURNING *`. SQLite helpers include `Model.BooleanSqlite`, `Model.DateTimeInsertFromNumber` and `Model.JsonFromString`.
  - SQLite error codes become typed reasons (`ConstraintError`, `UniqueViolation`, `LockTimeoutError`). HTTP, auth, quota (`BLOCKED`) and network failures all arrive as `UnknownError`.
- **Testing: the same layers and migrations run on `:memory:` or a `file:` database.**
  - Reproduced with `@effect/vitest@4.1.3` and `vitest@5.1.0`.
  - Effect 4 reuses a layer that an enclosing `Effect.provide` already built, so use `Layer.fresh` or `{ local: true }` when a test needs its own database.
  - The HTTP path itself wasn't exercised. `turso dev` starts a local libSQL server for that.
- **Plans: the Free plan's quotas are ample, but quiet databases get archived.**
  - Free gives 100 databases, 5 GB, 500 M rows read and 10 M rows written a month, and 1-day point-in-time restore. That's orders of magnitude above campaign volume.
  - Free-plan databases are archived after 10 days of inactivity and need `turso group unarchive`. That's a real risk for a quiet production database. Developer costs $4.99/month.
  - Going over a quota fails queries with `BLOCKED`.
- **Versioning: pin Effect to one exact version.**
  - All `effect/sql` and `@effect/sql-libsql` APIs are `@stability unstable`, so minor releases may break them. Pin `effect`, `@effect/sql-libsql` and `@effect/vitest` to the same exact version and update them together.
  - `SqlClient.batch`, which sends one libSQL batch in one round trip, is merged for Effect's next minor but isn't in 4.1.3.

## Client

### Packages (npm registry, 2026-11-10)

| Package | Version (published) | Role |
| --- | --- | --- |
| `effect` | 4.1.3 (2026-11-10) | Core. The SQL toolkit is `effect/sql` (`SqlClient`, `Migrator`, `SqlSchema`, `SqlModel`, `SqlResolver`, `Statement`, `SqlError`); row models are `Model` from `effect/schema`. |
| `@effect/sql-libsql` | 4.1.3 (2026-11-10) | The libSQL driver: `LibsqlClient`, `LibsqlMigrator`. Depends on `@libsql/client ^0.18.0`, peer `effect ^4.1.3`. |
| `@effect/vitest` | 4.1.3 | Test helpers; peer `vitest >=5.0.0 <6.0.0` (latest vitest: 5.1.0). |
| `@libsql/client` | 0.18.0 (2026-09-02) | Turso's libSQL client: HTTP, WebSocket, and local files through the native `libsql` 0.5.x package. |
| `@tursodatabase/serverless` | 1.4.1 (2026-10-06) | Turso's fetch-only driver for Turso-engine databases (see below). |
| `@effect/sql` | 0.52.x | The Effect 3 line. Not used with Effect 4. |

Source: `npm view <pkg> dist-tags time dependencies peerDependencies` for [effect](https://registry.npmjs.org/effect), [@effect/sql-libsql](https://registry.npmjs.org/@effect/sql-libsql), [@effect/vitest](https://registry.npmjs.org/@effect/vitest), [vitest](https://registry.npmjs.org/vitest), [@libsql/client](https://registry.npmjs.org/@libsql/client), [@tursodatabase/serverless](https://registry.npmjs.org/@tursodatabase/serverless) and [@effect/sql](https://registry.npmjs.org/@effect/sql).

- **Effect 4 is the current major.** `effect@4.0.0` was published on 2026-10-01 as "the first stable release of Effect v4", and 3.x now sits on the `prev` tag at 3.22.4 ([registry](https://registry.npmjs.org/effect), [sql-libsql changelog](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/CHANGELOG.md)).
- **`@effect/sql` was merged into `effect`** in v4, along with `@effect/platform`, `@effect/experimental` and others. Only drivers such as `@effect/sql-libsql` stay separate, and "All Effect packages share one version number … Use the same version of `effect` and every `@effect/*` package" ([changelog 4.0.0](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/CHANGELOG.md), [MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)).
- **Where the source lives:** the driver is `packages/sql/libsql` in `Effect-TS/effect`, because v4 development moved there from `effect-smol` ([PR #6522](https://github.com/Effect-TS/effect/pull/6522)).
- **Stability.** Every `effect/sql` module and the driver are tagged `@stability unstable`, which "means an API may receive new features in patch releases and breaking changes in minor releases" ([MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md)). The 4.0.0 notes add that driver-specific options in `@effect/sql-libsql` are unstable because they expose a third-party dependency. The repo already uses Renovate, which should group these packages so they update together.

### Configuration

`LibsqlClientConfig` comes in two shapes ([LibsqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlClient.ts)):

- **Full.** Fields:
  - `url`: `libsql:`, `http(s):`, `ws(s):` or `file:`.
  - `authToken`: a `Redacted`.
  - `encryptionKey`, `syncUrl`, `syncInterval`, `tls`.
  - `intMode`: `"number"` by default, `"bigint"` or `"string"`.
  - `concurrency`: the SDK default is 20.
  - `transformQueryNames`, `transformResultNames` and `spanAttributes`.

  The layer creates the SDK client and closes it with its scope.
- **Live.** `liveClient` is a `@libsql/client` `Client` you create and close yourself. It's how you use SDK options the Effect type doesn't list, such as `fetch`, `timeout` and `remoteEncryptionKey` ([api.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/api.ts)), or the `/web` entry.

`layer(config)` takes plain values and `layerConfig(config)` takes `Config`s. Both provide `LibsqlClient` and the generic `SqlClient`.

```ts
import { LibsqlClient } from "@effect/sql-libsql"
import { Config, String as Str } from "effect"

export const SqlLive = LibsqlClient.layerConfig({
  url: Config.String("TURSO_DATABASE_URL"), // libsql://<db>-<org>.aws-sa-east-1.turso.io
  authToken: Config.Redacted("TURSO_AUTH_TOKEN"),
  // optional: camelCase in code, snake_case in SQL
  transformQueryNames: Config.succeed(Str.camelToSnake),
  transformResultNames: Config.succeed(Str.snakeToCamel)
})

// A caller-owned SDK client instead, e.g. the web-standard entry (Effect won't close it):
// import { createClient } from "@libsql/client/web"
// LibsqlClient.layer({ liveClient: createClient({ url, authToken }) })
```

Both forms type-check under strict TypeScript 6.0.3 (E8).

- **Config constructors were renamed in Effect 4:** `Config.String`, `Config.Redacted`, `Config.URL` and so on. The Effect 3 spelling fails at runtime with `TypeError: Config.string is not a function`, which E3 hit on its first attempt.
- **Every field passed to `layerConfig` must itself be a `Config`** (`Config.Wrap`), hence `Config.succeed` for the transform functions ([Config.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/Config.ts)).
- **A missing variable fails the layer** before any query, with `ConfigError(SchemaError(Expected string at ["TURSO_DATABASE_URL"]))` (E3).
- **The default `ConfigProvider` snapshots the environment.** It is `fromEnv()`, which copies `process.env` and `import.meta.env` into its own record ([ConfigProvider.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/ConfigProvider.ts)), and in E3 deleting the variable after the first read changed nothing. Tests that vary configuration should provide `ConfigProvider.layer(ConfigProvider.fromEnv({ env: { … } }))`, or skip `Config` and use `LibsqlClient.layer({ url: ":memory:" })`.

### What the URL selects

- **`libsql://` means HTTP.** The Node and web entries of `@libsql/client` both call `expandConfig(config, true)` ("prefer HTTP"), so `libsql://` becomes `https:` and gets the HTTP client. WebSockets are used only for an explicit `wss://` or `ws://` URL, and `file:` and `:memory:` open the native engine ([config.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/config.ts), [node.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/node.ts)). The installed 0.18.0 code matches, and in E5 the client's `protocol` read `http` for `libsql://` and `ws` for `wss://`.
- **The HTTP client speaks Hrana v2 over JSON** (`POST /v2/pipeline`). `@libsql/hrana-client`'s `openHttp` defaults to protocol version 2, so it never sends a version-probe request ([hrana-client index.ts](https://github.com/libsql/hrana-client-ts/blob/main/src/index.ts), [Turso HTTP reference](https://docs.turso.tech/sdk/http/reference)).
- **The Node entry loads native code even for remote URLs.** It statically imports `./sqlite3.js` and, through it, the native `libsql` package. `@libsql/client/web` uses only web-standard `fetch` and `WebSocket` with no native module, but rejects `file:` URLs ([web.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/web.ts); Turso: "The `@libsql/client/web` does not support local file URLs", [TS reference](https://docs.turso.tech/sdk/ts/reference)).

### libSQL database or Turso database

- **Turso Cloud hosts two engines.** libSQL is the SQLite fork that has "powered [Turso Cloud] for years", and `turso db create` creates one by default. Turso is the ground-up rewrite with concurrent writes, created with `turso db create --tursodb`; Turso databases "on Turso Cloud are in early preview" ([Turso Cloud](https://docs.turso.tech/turso-cloud), [quickstart](https://docs.turso.tech/quickstart), [libSQL](https://docs.turso.tech/libsql)).
- **Turso's rule for network-only access** is to "match the driver to the database engine. Turso databases use the serverless drivers; libSQL databases use the libSQL clients" ([SDK introduction](https://docs.turso.tech/sdk/introduction), [Vercel integration](https://docs.turso.tech/integrations/vercel), [TS quickstart](https://docs.turso.tech/sdk/ts/quickstart)). `@effect/sql-libsql` sits on `@libsql/client`, so it is for **libSQL** databases.
- **`@tursodatabase/serverless` has no Effect driver.** It uses only `fetch` and speaks Hrana v3 (`/v3/pipeline`, `/v3/cursor`) ([README](https://github.com/tursodatabase/turso/blob/main/serverless/javascript/README.md), [protocol.ts](https://github.com/tursodatabase/turso/blob/main/serverless/javascript/src/protocol.ts)). The open PR for `@effect/sql-tursodatabase` targets the in-process engine `@tursodatabase/database`, not this driver ([#6522](https://github.com/Effect-TS/effect/pull/6522)).
- **Its `/compat` `createClient` can't stand in as a `liveClient`** ([compat.ts](https://github.com/tursodatabase/turso/blob/main/serverless/javascript/src/compat.ts); E8 type check):
  - TypeScript rejects it (TS2322): its `Row` values may be `boolean`, and `@libsql/client`'s may not.
  - It accepts only `url`, `authToken` and `remoteEncryptionKey`, so there's no `intMode`.
  - It runs every `execute`, `batch` and `transaction` through one client-wide lock. A transaction holds that lock until commit, and `BEGIN` goes out as its own request.
- **Unknown:** the docs don't say whether `@libsql/client` works against a Turso-engine database.

**Implication for the launch path:** confirm with `turso db show <name>` ([docs](https://docs.turso.tech/cli/db/show)) that the existing development database is a libSQL database, and create production the same way, without `--tursodb`.

## Serverless fit

### Per invocation

- **Creating the client sends nothing.** On HTTP, protocol v2's endpoint is fixed, so there's nothing to negotiate. E5 created clients for a placeholder `libsql://` host without errors.
- **A statement outside a database transaction is one HTTP request.** `execute` opens a Hrana stream and pipelines `execute` and `close` together ([http.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/http.ts)).
- **A database transaction with N statements is N + 1 requests.** `transaction("write")` opens a stream without a request. The first statement travels in one batch with `BEGIN IMMEDIATE`, each later statement is its own request, and `commit()` pipelines `COMMIT` with the stream close ([hrana.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/hrana.ts), [http.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/http.ts)). These counts come from reading the source; they weren't measured, because no server was run.
- **Concurrency.** A client runs at most `concurrency` requests at once, 20 by default. Since 4.1.2 Effect no longer serializes statements and database transactions on remote (`http`, `ws`) clients. Local `file:`, `:memory:` and embedded-replica clients still take turns on one permit ([changelog 4.1.2](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/CHANGELOG.md), [PR #10227](https://github.com/Effect-TS/effect/pull/10227), [LibsqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlClient.ts)).
- **Nothing persistent has to be kept alive or closed.**
  - Vercel's Fluid compute is on by default for new projects since 2025-04-23. It lets "multiple invocations … share a single function instance", with shared global state ([Fluid compute](https://vercel.com/docs/fluid-compute)), so one module-level client per instance serves many invocations.
  - Vercel notes that connections held by a suspended instance "remain open until either the VM shuts down or the database forcibly closes them" ([Vercel KB](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)).
  - That matters for a `wss://` client, which keeps one WebSocket, rotates it after 60 s and reconnects after errors ([ws.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/ws.ts)). It doesn't matter for HTTP.

**Implication for "How is Effect wired into the Nuxt server?":** build the `LibsqlClient` layer once per server instance rather than per request. The HTTP client is cheap to create and safe to share.

### Latency

- **No published figure.** Neither Turso nor Vercel publishes the round-trip time between their São Paulo regions, so measure it once on a Preview deployment, for example with a timed `SELECT 1`. Until then, count round trips as above.
- **Region pinning.** Vercel functions default to `iad1` (Washington, D.C.). `gru1` is AWS `sa-east-1`, and Vercel's advice is that "Functions should be executed in the same region as your database" ([regions](https://vercel.com/docs/regions)). Turso's São Paulo location is `aws-sa-east-1`, launched 2026-10-01 ([Turso blog](https://turso.tech/blog/turso-cloud-new-regions)).

**Implication for "What do Vercel's plans and platform allow for this app?":** the function region has to be set to `gru1` explicitly.

### Bundling: libSQL's native binary (reproduced)

- **The binary loads at import.** `libsql@0.5.29`, which `@libsql/client@0.18.0` installs, loads its binary when the module loads, through ``require(`@libsql/${target}`)``. In E5, importing `@effect/sql-libsql` loaded `@libsql/linux-arm64-gnu/index.node`, and importing `@libsql/client/web` loaded nothing.
- **Nitro's tracer can't follow it.** Nitro traces dependencies with `@vercel/nft`, which can't follow that dynamic require: "It's a limitation of @vercel/nft" ([nitro#3328](https://github.com/nitrojs/nitro/issues/3328)). libsql-js fixed it by moving to napi-rs with static requires ([libsql-js#185](https://github.com/tursodatabase/libsql-js/issues/185), [#182](https://github.com/tursodatabase/libsql-js/pull/182), merged 2025-06-12). The fix ships only in `libsql@0.6.0-pre.*`; stable 0.5.29 still has the dynamic require ([registry](https://registry.npmjs.org/libsql)).
- **Turso's Vercel page** says to "Use `@libsql/client/web` instead of `@libsql/client` for Vercel deployments" ([Vercel integration](https://docs.turso.tech/integrations/vercel)). Effect's driver imports the Node entry, though.
- **Reproduced with nitropack 2.13.5** (N1–N4), the version this repo's lockfile resolves for Nuxt 4.6.3 through `@nuxt/nitro-server`, with a route running `SELECT 1` through `@effect/sql-libsql`:
  - The `vercel` preset put `client`, `core`, `hrana-client` and `isomorphic-ws` in `.vercel/output/functions/__fallback.func/node_modules/@libsql/`, but no binary package.
  - The `node-server` output answered `{"driver":"libsql","rows":[{"ok":1}]}` inside the scratch project, but only because Node found the binary in the project's own `node_modules`.
  - Copied out of the project, the way Vercel deploys it, the route returned 500 with `Cannot find module '@libsql/linux-arm64-gnu'`.
  - On Vercel's x64 builders the missing package would be `@libsql/linux-x64-gnu`. People have hit exactly this on Vercel and Lambda ([libsql-client-ts#84](https://github.com/tursodatabase/libsql-client-ts/issues/84), [#112](https://github.com/tursodatabase/libsql-client-ts/issues/112)).
- **Fix A (worked): ship the binary.**
  - Resolve the installed binary from `libsql`'s own location and pass its absolute path to `externals.traceInclude`. The output grew from 6.0 MB to 14.4 MB.
  - A bare package name doesn't work: Nitro hands it to nft as a relative path, and the build fails with `File …/@libsql/linux-arm64-gnu does not exist.`
- **Fix B (worked): no native code.**
  - Alias `@libsql/client` to its `web` entry and inline both `@effect/sql-libsql` and `@libsql/client`. Inlining only the first left a broken relative import.
  - The output has no native code (5.9 MB), and a `libsql://`-style route used `http`.
  - A `:memory:` route failed with `URL_SCHEME_NOT_SUPPORTED`, so this build can't open local databases. Tests run under Vitest, not Nitro, so they're unaffected.
- **Scope of the check.** Both fixes were tested with bare nitropack, npm's layout and linux-arm64. They weren't tested inside Nuxt (where these options go under `nitro:` in `nuxt.config.ts`), with pnpm 12's layout, or on Vercel.

```ts
// Fix A: ship the binary (nitro.config.ts; in Nuxt: nitro: { externals: { traceInclude } })
import { createRequire } from "node:module"
const fromRoot = createRequire(import.meta.url)
const fromLibsql = createRequire(fromRoot.resolve("libsql"))
const libsqlBinaries = ["@libsql/linux-x64-gnu", "@libsql/linux-arm64-gnu"].flatMap((pkg) => {
  try { return [fromLibsql.resolve(pkg)] } catch { return [] } // only the installed one resolves
})
export default defineNitroConfig({ externals: { traceInclude: libsqlBinaries } })
```

```ts
// Fix B: no native code (nitro.config.ts; in Nuxt: nitro: { alias, externals })
import { fileURLToPath } from "node:url"
export default defineNitroConfig({
  alias: { "@libsql/client": fileURLToPath(import.meta.resolve("@libsql/client/web")) },
  externals: { inline: ["@effect/sql-libsql", "@libsql/client"] }
})
```

**Implication for "How is Effect wired into the Nuxt server?":** one of these, or an equivalent, has to be in `nuxt.config.ts` before the first deploy.

### Plans and limits (turso.tech/pricing, 2026-11-10)

| | Free | Developer | Scaler |
| --- | --- | --- | --- |
| Price shown | $0 | $4.99/month | $24.92/month |
| Databases | 100 | unlimited | unlimited |
| Storage | 5 GB | 9 GB, then $0.75/GB | 24 GB, then $0.50/GB |
| Rows read / month | 500 million | 2.5 billion, then $1/billion | 100 billion |
| Rows written / month | 10 million | 25 million, then $1/million | 100 million |
| Point-in-time restore | 1 day | 10 days | 30 days |

Source: [pricing](https://turso.tech/pricing). Free-plan point-in-time restore covers "the last 24 hours" ([PITR](https://docs.turso.tech/features/point-in-time-recovery)).

- **Volume.** A campaign of hundreds to low thousands of Charges sits orders of magnitude below the Free quotas, as long as list queries use indexes. A "row read" is a row *scanned*, so an unindexed query pays for every row it scans ([usage and billing](https://docs.turso.tech/help/usage-and-billing)).
- **Quotas are hard limits.** On plans with quotas, "any query that exceeds these limits will result in a failure, indicated by the `BLOCKED` error code". Rows written by aborted database transactions still count ([usage and billing](https://docs.turso.tech/help/usage-and-billing)).
- **Free-plan databases "get archived after 10 days of inactivity".** `turso group unarchive <group>`, or the API, brings them back ([CLI](https://docs.turso.tech/cli/group/unarchive), [API](https://docs.turso.tech/api-reference/groups/unarchive)). The docs don't say whether a request against an archived database fails or wakes it. A production database that goes quiet for ten days is the case to worry about.
- **Timeouts.** Interactive database transactions get "a 5 seconds window to complete, while connections get closed after 10 seconds of idle time" ([HTTP reference](https://docs.turso.tech/sdk/http/reference)). See [Transactions and types](#transactions-and-types).
- **Tokens.** `turso db tokens create <db>` makes a full-access token for one database that never expires by default; `--read-only`, `--expiration 7d` and fine-grained `-p` narrow it. `turso group tokens create` covers every database in a group, so per-database tokens keep development and production apart ([tokens](https://docs.turso.tech/sdk/authorization/tokens), [CLI](https://docs.turso.tech/cli/db/tokens/create)).
- **New databases.** A freshly created Cloud database has been reported to return HTTP 404 after the Platform API reports that it exists: about 2.5 s in the original report, and more than 15 s in a later one ([libsql-client-ts#346](https://github.com/tursodatabase/libsql-client-ts/issues/346)). That's worth knowing when production is created at launch.
- **Ownership.** The pricing page carries Turso's news that it is joining Supabase. Supabase's announcement (2026-10-02) says "For existing users, nothing changes" ([Supabase](https://supabase.com/blog/supabase-is-acquiring-turso)).

## Migrations

### Writing them

- **A migration is an `Effect` that uses `SqlClient`.** Loaders turn records or files into `[id, name, load]` tuples sorted by id ([Migrator.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/Migrator.ts)):
  - `fromRecord({ "0001_create_charges": effect })`, with keys `<id>_<name>`.
  - `fromGlob(import.meta.glob(...))`, for files named `<id>_<name>.(js|ts|mjs|mts)` with a default-exported Effect.
  - `fromBabelGlob(...)`.
  - `fromFileSystem(dir)`, which reads a directory and `import()`s each file. It needs `FileSystem` and `Path` services, lives outside the `effect/sql` barrel ([MigratorFileSystem.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/MigratorFileSystem.ts)), and is re-exported by `LibsqlMigrator`.
- **`fromRecord` with static imports needs no file system and no bundler feature.** One module can serve a CLI script, the tests and, if wanted, the server bundle. `fromFileSystem` would need the migration files on disk at run time and importable by Node.
- **Running them.** `LibsqlMigrator.run({ loader, table? })` returns the applied `[id, name]` pairs, and `LibsqlMigrator.layer(...)` runs them while a layer is built ([LibsqlMigrator.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlMigrator.ts)).
- **`schemaDirectory` does nothing on libSQL.** `LibsqlMigrator` is `Migrator.make({})`, which has no schema dumper.

```ts
// server/migrations.ts — one record, static imports (the shape E7 ran; tables illustrative only)
import { LibsqlMigrator } from "@effect/sql-libsql"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export const loader = LibsqlMigrator.fromRecord({
  "0001_create_charges": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE charges (
      id TEXT PRIMARY KEY,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'expired')),
      created_at INTEGER NOT NULL
    ) STRICT`
  })
})
```

```ts
// scripts/migrate.ts — once per database:
//   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/migrate.ts
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { Config, Effect } from "effect"
import { loader } from "../server/migrations.ts"

const SqlLive = LibsqlClient.layerConfig({
  url: Config.String("TURSO_DATABASE_URL"),
  authToken: Config.Redacted("TURSO_AUTH_TOKEN")
})

const applied = await Effect.runPromise(LibsqlMigrator.run({ loader }).pipe(Effect.provide(SqlLive)))
console.log("applied:", applied)
```

E7 ran this shape with the token made optional, so a `file:` URL works without one.

### What a run does

1. **Outside any database transaction**, it runs `CREATE TABLE IF NOT EXISTS effect_sql_migrations (migration_id integer PRIMARY KEY NOT NULL, created_at datetime NOT NULL DEFAULT current_timestamp, name VARCHAR(255) NOT NULL)`.
2. **Inside one `withTransaction`**, which on libSQL is `BEGIN IMMEDIATE`, it:
   - reads the highest `migration_id`;
   - loads every migration with a greater id;
   - inserts their bookkeeping rows up front;
   - runs them in id order.

   Any failure rolls back everything, bookkeeping included.
3. **A unique or constraint conflict** on that up-front insert counts as "Locked", meaning another runner won. It logs and returns `[]` ([Migrator.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/Migrator.ts)).

Reproduced locally:

- **A second run applies nothing** (E1, E7).
- **Only the highest recorded id counts.** With 1 and 3 applied, a migration 2 that arrives later is skipped silently: no error, and no `branch_b` table (E3). That bites when one development database serves every Preview branch, or when two branches pick the same next number.
- **A runner that races the first doesn't reach the "Locked" path on SQLite.** Its `BEGIN IMMEDIATE` fails first with a `SqlError` whose reason is `LockTimeoutError` (`SQLITE_BUSY`). This happened with two clients in one process (E2) and with two processes (E7).
- **Remote behaviour differs and isn't documented.**
  - Turso Cloud doesn't support `busy_timeout` ([limitations](https://docs.turso.tech/cloud/limitations)).
  - Open-source `sqld` queues a second writer and may force a rollback of a lock holder older than 5 s ([connection_manager.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/connection/connection_manager.rs), [mod.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/connection/mod.rs)).
- **The whole run is one interactive database transaction.** Over HTTP it therefore lives inside the 5-second window, and each statement costs a round trip from wherever the script runs.

Turso specifics:

- **`PRAGMA user_version` is read-only on Turso Cloud**, and Turso recommends a version table instead, which is what Effect's migrator uses ([limitations](https://docs.turso.tech/cloud/limitations)).
- **Schema changes on populated tables scan rows.** `ALTER TABLE` and `CREATE INDEX` scan every row and may rewrite it ([usage and billing](https://docs.turso.tech/help/usage-and-billing)). At this volume the cost is negligible.

### When they run on a Vercel app (facts for the choice)

| Option | What the sources say |
| --- | --- |
| Build step: a migrate script before `nuxt build` | Code can read env vars "during the Build Step" ([env vars](https://vercel.com/docs/environment-variables)). Preview deployments get the Preview values, so **every Preview build would migrate the shared development database**, and under the highest-id rule, branches that diverge skip migrations silently. A failed migration fails the build. The migration lands before the new deployment serves traffic, so the live deployment briefly runs on the new schema; that last point is inferred from builds preceding promotion, not stated by Vercel. |
| Deploy hook | Vercel Deploy Hooks are URLs that "trigger deployments and re-run the Build Step" ([deploy hooks](https://vercel.com/docs/deploy-hooks)), so this is the build-step option again. |
| Script run by hand or from CI, once per database | `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/migrate.ts`, with that database's own token. There's one explicit runner, and development and production are migrated separately. Someone, or a CI job, has to run it before the code that needs it ships. `turso db create <copy> --from-db <prod>` makes a branch to rehearse on ([branching](https://docs.turso.tech/features/branching)). |
| On server start or first request | Fluid compute scales out, so several instances can boot at once. Racing runners fail as above, and cold starts get slower. No source recommends it. |

**Implication for "How is Effect wired into the Nuxt server?":** keep the migrations in one `fromRecord` module that the script and the tests import. Whether the server bundle imports it too is a wiring choice.

## Transactions and types

### Database transactions over HTTP

- **How `withTransaction` maps.** On `LibsqlClient`, the top-level `sql.withTransaction(effect)` starts with `sdk.transaction("write")`, which is `BEGIN IMMEDIATE`. Nested calls use `SAVEPOINT effect_sql_<n>`, `RELEASE` and `ROLLBACK TO` ([LibsqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlClient.ts)). Reproduced: a failure rolls everything back, and a failed inner savepoint rolls back on its own while the outer level commits (E1, E4).
- **Every Effect database transaction on libSQL is a write transaction.** The `BeginTransaction` reference, which picks another `BEGIN`, is ignored here, since "a driver that doesn't start transactions with a SQL statement ignores it" ([SqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlClient.ts)). Turso says write transactions "can't operate in parallel" ([TS reference](https://docs.turso.tech/sdk/ts/reference)).
- **Limits.**
  - Turso: "Interactive transactions in libSQL lock the database for writing until committed or rolled back, with a 5-second timeout" ([TS reference](https://docs.turso.tech/sdk/ts/reference)), and "Transaction have a 5 seconds window to complete, while connections get closed after 10 seconds of idle time" ([HTTP reference](https://docs.turso.tech/sdk/http/reference)).
  - Open-source `sqld` matches: `TXN_TIMEOUT` is 5 s, after which a waiting writer may steal the lock, and `EXPIRATION` closes idle HTTP streams after 10 s ([mod.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/connection/mod.rs), [stream.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/hrana/http/stream.rs)).
- **`sql.afterCommit(effect)`** runs work once the outermost transaction commits and drops it on rollback ([SqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlClient.ts)). It's the place for follow-up work that must not hold the lock.
- **Batches aren't exposed yet.** The non-interactive `batch()`, one request with an implicit transaction, isn't available through Effect 4.1.3. `SqlClient.batch`, which sends one libSQL `batch` in a single round trip, is merged into Effect's `v4/next-minor` branch ([#10147](https://github.com/Effect-TS/effect/pull/10147), [#10175](https://github.com/Effect-TS/effect/pull/10175)); its release date is unknown.
- **An open upstream issue.** "Long-lived client object can cause 'invalid baton' errors" has been open since 2023, and its reports involve HTTP transactions, including "Happens for every transaction from Vercel in our case" (2024-07) ([#119](https://github.com/tursodatabase/libsql-client-ts/issues/119)). The reports date from 2024 and name client versions 0.5.6 and 0.6.2. There have been none since August 2024, and it wasn't reproduced here.

**Implication for "What is a Charge's full lifecycle?" and "How is Effect wired into the Nuxt server?":** a database transaction shouldn't stay open across a call to a Provider's PIX API. How long that call takes is outside the app's control, the 5-second window and 10-second idle limit still apply, and the write lock blocks every other write meanwhile. Record the Charge and call the Provider as separate steps.

### Effect Schema for rows

- **SQLite's types.** There are five storage classes (NULL, INTEGER, REAL, TEXT, BLOB) and no Boolean or date type: "Boolean values are stored as integers 0 (false) and 1 (true)", and dates are TEXT, REAL or INTEGER ([SQLite datatypes](https://www.sqlite.org/datatype3.html)).
- **`SqlSchema` helpers.** `SqlSchema.findAll`, `findNonEmpty`, `findOne`, `findOneOption` and `void` encode the request with its schema, run `execute` and decode the rows. They fail with `SchemaError` or `NoSuchElementError` ([SqlSchema.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlSchema.ts)).
- **`Model.Class`** declares one set of fields with `select`, `insert`, `update`, `json`, `jsonCreate` and `jsonUpdate` variants ([Model.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/schema/Model.ts)). The SQLite-friendly helpers are:
  - `Model.BooleanSqlite`, stored as 0/1;
  - `Model.DateTimeInsertFromNumber` and `DateTimeUpdateFromNumber`, stored as epoch milliseconds;
  - `Model.DateTimeInsert`, stored as ISO text;
  - `Model.JsonFromString`, `Model.UuidV7Insert`, `Model.Sensitive` and `Model.GeneratedByDb`.
- **`SqlModel.makeRepository(Model, { tableName, spanPrefix, idColumn })`** derives `insert` and `update` (with `RETURNING *` on SQLite), `findById` and `delete` ([SqlModel.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlModel.ts)). Effect ships an end-to-end example in [ai-docs/src/40_sql/10_basics.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/ai-docs/src/40_sql/10_basics.ts).
- **Name transforms.** With `transformQueryNames: String.camelToSnake` and `transformResultNames: String.snakeToCamel`, models stay camelCase over snake_case columns (E1).
- **Integers.** With the default `intMode: "number"`, reading an INTEGER above 2^53 fails, and it surfaces as a `SqlError` with `UnknownError` "Failed to execute statement" rather than a `RangeError`. `intMode: "bigint"` returns a `bigint` (E1). Amounts in centavos fit in a `number` easily.

```ts
// From E1 (illustrative, not a schema decision)
const ChargeId = Schema.String.pipe(Schema.brand("ChargeId"))

class Charge extends Model.Class<Charge>("Charge")({
  id: Model.UuidV7Insert(ChargeId),
  amountCents: Schema.Int,
  status: Schema.Literals(["pending", "paid", "expired"]),
  copiaECola: Schema.NullOr(Schema.String),
  isTest: Model.BooleanSqlite,
  createdAt: Model.DateTimeInsertFromNumber
}) {}

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const repo = yield* SqlModel.makeRepository(Charge, { tableName: "charges", spanPrefix: "Charges", idColumn: "id" })
  // INSERT … RETURNING *, decoded back into a Charge
  yield* Charge.insert.makeEffect({ amountCents: 1500, status: "pending", copiaECola: null, isTest: true })
    .pipe(Effect.flatMap(repo.insert))
  const findByStatus = SqlSchema.findAll({
    Request: Schema.Struct({ status: Schema.Literals(["pending", "paid", "expired"]) }),
    Result: Charge,
    execute: ({ status }) => sql`SELECT * FROM charges WHERE status = ${status}`
  })
  return yield* findByStatus({ status: "pending" })
})
```

### Errors

- **`classifySqliteError` maps** ([SqlError.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlError.ts)):
  - `SQLITE_CONSTRAINT_UNIQUE` → `UniqueViolation`
  - other `SQLITE_CONSTRAINT*` → `ConstraintError` (seen for a `CHECK` in E1)
  - `SQLITE_BUSY` and `SQLITE_LOCKED` → `LockTimeoutError` (E2)
  - `SQLITE_AUTH` → `AuthenticationError`
  - `SQLITE_PERM` → `AuthorizationError`
  - `SQLITE_CANTOPEN` → `ConnectionError`
  - everything else → `UnknownError`
- **Remote failures land in `UnknownError`.** libSQL's remote failures carry other codes: `SERVER_ERROR: Server returned HTTP status …` ([#119](https://github.com/tursodatabase/libsql-client-ts/issues/119), [#346](https://github.com/tursodatabase/libsql-client-ts/issues/346)), `BLOCKED` for quotas, and fetch failures. A refused connection in N4 came back as `UnknownError`.
- **Retry and alerting logic has to inspect `cause`**, which holds the `LibsqlError` code. `withTransaction`'s docs also warn against retrying after a lost `COMMIT`, which "may have committed" ([SqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlClient.ts)).

## Testing

- **The same layers and migrations run locally** against `url: ":memory:"` or `url: "file:…"` (E1–E4, E6, E7). `@effect/vitest@4.1.3` needs `vitest` 5. In E4:
  - `layer(SqlTest)("…", (it) => …)` built one database for the block.
  - Providing `SqlTest` inside a test, outside any shared layer, gave each test its own.
  - All 8 tests passed.
- **Effect 4 memoizes layers across nested `Effect.provide`.** "A layer already built by an enclosing `Effect.provide` or runtime is reused by nested `Effect.provide` calls" ([layer memoization](https://github.com/Effect-TS/effect/blob/main/migration/layer-memoization.md)). In E4:
  - Inside a `layer()` block, re-providing `SqlTest` returned the shared database.
  - `Layer.fresh(SqlTest)` and `Effect.provide(SqlTest, { local: true })` each gave an empty one.
- **`:memory:` is one connection per client** in `@libsql/client@0.18.0`: "An in-memory database exists only on the connection that opened it … Both are therefore single-connection databases" ([sqlite3.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/sqlite3.ts)). Tables survive committed transactions, and two clients get two separate databases (E2).
- **Local runs differ from Turso Cloud:**
  - Effect serializes local clients on one permit.
  - Local libSQL (SQLite 3.45.1) defaults to `foreign_keys = 1` and `journal_mode = delete` (E6). Turso Cloud manages journaling itself ([limitations](https://docs.turso.tech/cloud/limitations)) and doesn't document its foreign-key default.
  - The native driver is synchronous. In E2, the race run with a 5-second busy timeout took about 5 s longer and still failed. The wait appears to block the event loop, so the lock holder in the same process couldn't finish. Give each test its own file or `:memory:` database instead of contending on one file.
- **`file:` and `:memory:` don't exercise the remote protocol**: HTTP streams, batons, the 5 s and 10 s limits, network errors.
  - `turso dev` starts a local libSQL server at `http://127.0.0.1:8080`, and `--db-file` keeps the data ([local development](https://docs.turso.tech/local-development)).
  - Effect's own libSQL integration tests run `ghcr.io/tursodatabase/libsql-server:main` through testcontainers ([test/util.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/test/util.ts)).
  - Neither was run here: the brief allowed only npm packages.

```ts
// Excerpt from E4 (test/charges.test.ts)
const migrations = LibsqlMigrator.fromRecord({
  "0001_create_charges": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE charges (id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100))`
  })
})

// The same migrations the real database gets, applied to a fresh in-memory database.
const SqlTest = LibsqlMigrator.layer({ loader: migrations }).pipe(
  Layer.provideMerge(LibsqlClient.layer({ url: ":memory:" }))
)

layer(SqlTest)("shared in-memory database", (it) => {
  it.effect("rolls back a failed transaction", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const error = yield* sql.withTransaction(Effect.gen(function*() {
        yield* insert("b", 200)
        yield* insert("c", 50) // violates CHECK
      })).pipe(Effect.flip)
      assert.strictEqual(error._tag, "SqlError")
      assert.strictEqual(yield* count, 1)
    }))

  it.effect("Layer.fresh builds a separate, empty database", () =>
    count.pipe(Effect.map((n) => assert.strictEqual(n, 0)), Effect.provide(Layer.fresh(SqlTest))))
})
```

## Gotchas

1. **The Vercel function is missing libSQL's native binary** (reproduced). Importing `@effect/sql-libsql` loads native code, and Nitro 2.13.5 doesn't ship the platform binary. See Fix A or Fix B in [Bundling](#bundling-libsqls-native-binary-reproduced).
2. **Wrong engine.** Effect's driver fits libSQL databases. A `--tursodb` database is meant for `@tursodatabase/serverless`, which has no Effect driver.
3. **Lower-numbered migrations are skipped silently** (reproduced). This matters with one development database shared across Preview branches.
4. **Concurrent migrators fail instead of waiting** (reproduced locally). Run one migrator per database, deliberately.
5. **HTTP database transactions are short.** They get a 5-second window and their streams close after 10 seconds idle, with the write lock held throughout. Don't call a Provider inside `withTransaction`.
6. **Every Effect database transaction is `BEGIN IMMEDIATE`.** This driver ignores `BeginTransaction`.
7. **Remote, HTTP, quota and network errors are all `UnknownError`.** Look at `cause` for `SERVER_ERROR` or `BLOCKED`.
8. **Integers above 2^53 fail as `UnknownError`** unless `intMode: "bigint"` (reproduced).
9. **APIs are unstable.** `effect/sql` and the driver may break in minor releases. Pin `effect`, `@effect/sql-libsql` and `@effect/vitest` to the same exact version. Effect 3 examples (`@effect/sql`, `Config.string`, `Context.Tag`) don't apply.
10. **Layers are memoized in tests** (reproduced). Use `Layer.fresh` or `{ local: true }` for a fresh database inside a shared `layer()` block.
11. **The default `ConfigProvider` snapshots the environment** on first use (observed).
12. **No streaming.** `executeStream` is "not implemented" in this driver, so streamed queries die ([LibsqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlClient.ts)).
13. **Free-plan databases are archived after 10 days of inactivity** and need `turso group unarchive`.
14. **`@libsql/client/web`, and therefore Fix B, can't open `file:` or `:memory:`.** Keep the tests on the Node entry.
15. **"Invalid baton" errors** for HTTP database transactions are still an open issue ([#119](https://github.com/tursodatabase/libsql-client-ts/issues/119)).
16. **A new database may return 404 briefly** after creation ([#346](https://github.com/tursodatabase/libsql-client-ts/issues/346)).

## Experiment log

**Environment:** a devcontainer on Debian, `Linux aarch64`, Node v24.20.0 (which runs TypeScript directly by stripping types), npm 11.19.0.

**Setup:**

- Two scratch directories outside the repo, written `$EXP` and `$NITRO` below.
- Only official npm packages were installed.
- Every database was a local file under `$EXP/data` or `:memory:`. No real database and no `.env` file was touched.

```sh
# $EXP/package.json: {"type":"module"}
npm install --prefix $EXP --save-exact effect@4.1.3 @effect/sql-libsql@4.1.3 @effect/vitest@4.1.3 \
  vitest@5.1.0 @libsql/client@0.18.0 @tursodatabase/serverless@1.4.1
npm install --prefix $EXP --save-exact typescript@6.0.3 @types/node@24
bash $EXP/run-all.sh   # E1–E8 in order (script below)

# $NITRO/package.json: {"type":"module"}
npm install --prefix $NITRO --save-exact nitropack@2.13.5 effect@4.1.3 @effect/sql-libsql@4.1.3
```

| # | What ran | Result |
| --- | --- | --- |
| E1 | `node scripts/exp1-file-db.ts data/exp1.db` | Migrations applied `[[1,"create_charges"],[2,"index_status"]]`, then `[]`. The repository insert came back decoded (`isTest: true`, `createdAt: DateTime.Utc(…)`), while the raw row held `is_test: 1` and `created_at: 1794338418992`. A decode failure gave `SchemaError`; a `CHECK` violation gave `SqlError ConstraintError`. Rollback left the count at 1, and the nested savepoint rollback kept only `outer`. A big integer gave `SqlError UnknownError Failed to execute statement` with `intMode=number` and `bigint 9007199254740993` with `intMode=bigint`. |
| E2 | `node scripts/exp2-memory-and-concurrency.ts data/exp2.db` | `:memory:` rows after a committed transaction: `[ { n: 1 } ]`. A second `:memory:` client can't see the table. In both migrator races, one applied and the other got `SqlError … LockTimeoutError … SQLITE_BUSY: database is locked`; that held without a busy timeout and with `timeout: 5000` through `liveClient`. With the timeout the run took about 5 s longer (whole script: 6.05 s), which fits a synchronous wait blocking the event loop. |
| E3 | `node scripts/exp3-config-and-out-of-order.ts data/exp3.db` | `layerConfig` read `TURSO_DATABASE_URL`. Branch A applied `[[1,"first"],[3,"branch_a"]]`, and branch B then applied `[]`, leaving tables `branch_a, effect_sql_migrations, first`. Deleting the env var after the first read still succeeded (snapshot). An explicit empty env gave `ConfigError(SchemaError(Expected string at ["TURSO_DATABASE_URL"]))`. |
| E4 | `vitest run` on `test/charges.test.ts` | 8 of 8 passed: shared block, rollback, memoized re-provide (1 row), `Layer.fresh` (0), `{ local: true }` (0), fresh per test (1, then 0). |
| E5 | `node scripts/exp5-native-and-liveclient.ts` (no queries) | No native modules loaded after importing `@libsql/client/web`; `@libsql/linux-arm64-gnu/index.node` loaded after importing `@effect/sql-libsql`. `libsql://` gives `http` on both entries and `wss://` gives `ws`; the serverless compat client reports `http`. |
| E6 | `node scripts/exp6-pragmas.ts data/exp6.db` | `foreign_keys: 1`, `journal_mode: delete`, `sqlite_version 3.45.1`; an orphan child insert failed. |
| E7 | `TURSO_DATABASE_URL=file:data/exp7.db node scripts/migrate.ts`, twice, then two processes at once with `MIGRATION_DELAY_MS=500` | First run: `applied: [[1,"create_charges"]]`; second run: `applied: []`. In the race, one process applied and the other logged `migration failed: effect/sql/SqlError: Failed to begin transaction`. |
| E8 | `tsc -p tsconfig.json` (strict, TS 6.0.3) | Clean apart from the deliberate `typecheck-serverless-live.ts(6,43): error TS2322`: the compat `Client` isn't assignable to `@libsql/client`'s `Client`. |
| N1 | `NITRO_PRESET=vercel nitropack build` (no options) | `__fallback.func/node_modules/@libsql` held `client core hrana-client isomorphic-ws` and no binary; runtime `nodejs24.x`. |
| N2 | `NITRO_PRESET=node-server nitropack build`, then `.output/server/index.mjs` run in place and from a copy outside the project, then `curl /` | In place: `{"driver":"libsql","rows":[{"ok":1}]}`. From the copy: HTTP 500 with `Cannot find module '@libsql/linux-arm64-gnu'`. |
| N3 | The same build with Fix A (`externals.traceInclude` set to the resolved binary path), copied, then `curl /` | `{"driver":"libsql","rows":[{"ok":1}]}`, at 14.4 MB against 6.0 MB. A bare package name in `traceInclude` failed the build instead (`File …/@libsql/linux-arm64-gnu does not exist`). |
| N4 | The same build with Fix B (alias to `/web`, both packages inlined), copied, then `curl /web` and `curl /` | `/web`: `{"protocol":"http","error":"UnknownError","message":"Failed to execute statement"}` (a closed local port, no database). `/`: 500 with `URL_SCHEME_NOT_SUPPORTED … got "file:"`. No `Cannot find module`, at 5.92 MB. Inlining only `@effect/sql-libsql` failed with a broken relative import of `@libsql/client/lib-esm/ws.js`. |

N2–N4 ran the server with `PORT=… HOST=127.0.0.1 timeout 15 node <dir>/.output/server/index.mjs &` and then `curl --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:<port>/…`. N3 and N4 built with `env -C $NITRO NITRO_PRESET=node-server ./node_modules/.bin/nitropack build`.

The scripts, exactly as run:

<details>
<summary><code>$EXP/package.json (after installs)</code></summary>

```json
{
  "name": "turso-effect-exp",
  "private": true,
  "type": "module",
  "dependencies": {
    "@effect/sql-libsql": "4.1.3",
    "@effect/vitest": "4.1.3",
    "@libsql/client": "0.18.0",
    "@tursodatabase/serverless": "1.4.1",
    "@types/node": "24.19.2",
    "effect": "4.1.3",
    "typescript": "6.0.3",
    "vitest": "5.1.0"
  }
}
```

</details>

<details>
<summary><code>$EXP/tsconfig.json</code></summary>

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts", "test/**/*.ts"]
}
```

</details>

<details>
<summary><code>$EXP/run-all.sh</code></summary>

```sh
#!/usr/bin/env bash
# Re-runs every local experiment in order and prints their output.
set -u
E="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$E/data"
echo "### node $(node --version) | npm $(npm --version) | $(uname -sm)"
echo "### E1 file database: client, migrator, Model/SqlSchema, transactions, intMode"
node "$E/scripts/exp1-file-db.ts" "$E/data/exp1.db"
echo "### E2 :memory: semantics and in-process migrator races"
node "$E/scripts/exp2-memory-and-concurrency.ts" "$E/data/exp2.db"
echo "### E3 layerConfig from env, out-of-order migration ids, ConfigProvider snapshot"
node "$E/scripts/exp3-config-and-out-of-order.ts" "$E/data/exp3.db"
echo "### E4 @effect/vitest against :memory:"
"$E/node_modules/.bin/vitest" run --root "$E" --reporter=verbose 2>&1 | grep -E "✓|✗|×|Tests |Test Files"
echo "### E5 native binary loading and liveClient options (no network)"
node "$E/scripts/exp5-native-and-liveclient.ts"
echo "### E6 local pragma defaults"
node "$E/scripts/exp6-pragmas.ts" "$E/data/exp6.db"
echo "### E7 standalone migrate script: run, re-run, two processes racing"
rm -f "$E/data/exp7.db" "$E/data/exp7b.db"
TURSO_DATABASE_URL="file:$E/data/exp7.db" node "$E/scripts/migrate.ts"
TURSO_DATABASE_URL="file:$E/data/exp7.db" node "$E/scripts/migrate.ts"
TURSO_DATABASE_URL="file:$E/data/exp7b.db" MIGRATION_DELAY_MS=500 node "$E/scripts/migrate.ts" &
TURSO_DATABASE_URL="file:$E/data/exp7b.db" MIGRATION_DELAY_MS=500 node "$E/scripts/migrate.ts"
wait
echo "### tsc --noEmit (strict, TS 6.0.3)"
"$E/node_modules/.bin/tsc" -p "$E/tsconfig.json" | grep -E "error TS" | sed -E 's#^.*/scripts/##' | cut -c1-200
echo "### done"
```

</details>

<details>
<summary><code>$EXP/scripts/exp1-file-db.ts (E1)</code></summary>

```ts
// Experiment 1: @effect/sql-libsql 4.1.3 against a local libSQL *file*.
// Covers: client layer, migrator (fromRecord), Model/SqlModel/SqlSchema decoding,
// transactions (rollback, nested savepoints), integer mode, and migrator re-runs.
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { Effect, Layer, Schema, String as Str } from "effect"
import { Model } from "effect/schema"
import { SqlClient, SqlModel, SqlSchema } from "effect/sql"
import { rmSync } from "node:fs"

const dbPath = process.argv[2]
if (!dbPath) throw new Error("usage: node exp1-file-db.ts <db-file>")
rmSync(dbPath, { force: true })

const ChargeId = Schema.String.pipe(Schema.brand("ChargeId"))

class Charge extends Model.Class<Charge>("Charge")({
  id: Model.UuidV7Insert(ChargeId),
  amountCents: Schema.Int,
  status: Schema.Literals(["pending", "paid", "expired"]),
  copiaECola: Schema.NullOr(Schema.String),
  isTest: Model.BooleanSqlite,
  createdAt: Model.DateTimeInsertFromNumber
}) {}

const migrations = LibsqlMigrator.fromRecord({
  "0001_create_charges": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE charges (
      id TEXT PRIMARY KEY,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'expired')),
      copia_e_cola TEXT,
      is_test INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    ) STRICT`
  }),
  "0002_index_status": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE INDEX charges_status ON charges (status)`
  })
})

const SqlLive = LibsqlClient.layer({
  url: `file:${dbPath}`,
  transformQueryNames: Str.camelToSnake,
  transformResultNames: Str.snakeToCamel
})

const log = (label: string, value: unknown) =>
  Effect.sync(() => console.log(label, JSON.stringify(value, (_k, v) => typeof v === "bigint" ? `${v}n` : v)))

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  console.log("driver:", sql.driver)

  // 1. migrations, twice
  yield* log("migrate #1 applied:", yield* LibsqlMigrator.run({ loader: migrations }))
  yield* log("migrate #2 applied:", yield* LibsqlMigrator.run({ loader: migrations }))
  yield* log("effect_sql_migrations:", yield* sql`SELECT migration_id, name FROM effect_sql_migrations`.withoutTransform)

  // 2. repository derived from the model
  const repo = yield* SqlModel.makeRepository(Charge, { tableName: "charges", spanPrefix: "Charges", idColumn: "id" })
  const inserted = yield* Charge.insert.makeEffect({ amountCents: 1500, status: "pending", copiaECola: null, isTest: true }).pipe(
    Effect.flatMap(repo.insert)
  )
  yield* log("inserted (decoded):", { ...inserted, createdAt: String(inserted.createdAt) })
  yield* log("raw row:", yield* sql`SELECT * FROM charges`.withoutTransform)

  // 3. SqlSchema for a custom query
  const findByStatus = SqlSchema.findAll({
    Request: Schema.Struct({ status: Schema.Literals(["pending", "paid", "expired"]) }),
    Result: Charge,
    execute: ({ status }) => sql`SELECT * FROM charges WHERE status = ${status}`
  })
  yield* log("findByStatus(pending) count:", (yield* findByStatus({ status: "pending" })).length)

  // 4. schema decode failure surfaces as SchemaError
  const bad = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ amountCents: Schema.String }),
    execute: () => sql`SELECT amount_cents FROM charges`
  })().pipe(Effect.flip)
  console.log("decode-failure tag:", bad._tag)

  // 5. CHECK constraint violation surfaces as SqlError with a classified reason
  const violation = yield* sql`INSERT INTO charges ${sql.insert({ id: "x", amountCents: 99, status: "pending", isTest: 0, createdAt: 0 })}`.pipe(Effect.flip)
  console.log("check violation:", violation._tag, violation.reason._tag)

  // 6. transaction rollback
  const count = sql<{ n: number }>`SELECT count(*) AS n FROM charges`.pipe(Effect.map((rows) => rows[0].n))
  const before = yield* count
  const txResult = yield* sql.withTransaction(Effect.gen(function*() {
    yield* sql`INSERT INTO charges ${sql.insert({ id: "tx-1", amountCents: 200, status: "pending", isTest: 1, createdAt: 1 })}`
    console.log("  inside tx, count =", yield* count)
    return yield* Effect.fail("boom" as const)
  })).pipe(Effect.flip)
  console.log("rollback: before =", before, "after =", yield* count, "error =", txResult)

  // 7. nested transaction: inner savepoint rolls back, outer commits
  yield* sql.withTransaction(Effect.gen(function*() {
    yield* sql`INSERT INTO charges ${sql.insert({ id: "outer", amountCents: 300, status: "pending", isTest: 1, createdAt: 2 })}`
    yield* sql.withTransaction(Effect.gen(function*() {
      yield* sql`INSERT INTO charges ${sql.insert({ id: "inner", amountCents: 400, status: "pending", isTest: 1, createdAt: 3 })}`
      return yield* Effect.fail("inner-fail")
    })).pipe(Effect.ignore)
  }))
  yield* log("after nested tx ids:", (yield* sql<{ id: string }>`SELECT id FROM charges ORDER BY id`).map((r) => r.id))

  // 8. integers above 2^53 with the default intMode ("number")
  yield* sql`CREATE TABLE big (v INTEGER)`
  yield* sql`INSERT INTO big (v) VALUES (9007199254740993)`
  const big = yield* sql`SELECT v FROM big`.pipe(Effect.flip)
  console.log("bigint read (intMode=number):", big._tag, big.reason?._tag, String(big.reason?.message ?? big).slice(0, 120))
})

await Effect.runPromise(program.pipe(Effect.provide(SqlLive), Effect.scoped)).then(
  () => console.log("OK"),
  (e) => { console.error("FAILED", e); process.exitCode = 1 }
)

// 9. bigint mode in a fresh client
const bigProgram = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ v: bigint }>`SELECT v FROM big`
  console.log("bigint read (intMode=bigint):", typeof rows[0].v, String(rows[0].v))
})
await Effect.runPromise(bigProgram.pipe(Effect.provide(LibsqlClient.layer({ url: `file:${dbPath}`, intMode: "bigint" })))).catch((e) => {
  console.error("FAILED bigint", e)
  process.exitCode = 1
})
```

</details>

<details>
<summary><code>$EXP/scripts/exp2-memory-and-concurrency.ts (E2)</code></summary>

```ts
// Experiment 2: ":memory:" semantics across transactions, client isolation, and
// what happens when two migrators race on the same local file.
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { Effect, Exit } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { SqlClient } from "effect/sql"
import { rmSync } from "node:fs"

const dbPath = process.argv[2]
if (!dbPath) throw new Error("usage: node exp2-memory-and-concurrency.ts <db-file>")
rmSync(dbPath, { force: true })

// A. :memory: keeps its tables across a transaction (single connection), and two
//    clients get two separate databases.
const memory = Effect.gen(function*() {
  const a = yield* LibsqlClient.make({ url: ":memory:" })
  const b = yield* LibsqlClient.make({ url: ":memory:" })
  yield* a`CREATE TABLE t (v INTEGER)`
  yield* a.withTransaction(a`INSERT INTO t (v) VALUES (1)`)
  const afterTx = yield* a`SELECT count(*) AS n FROM t`
  console.log("A1 :memory: rows after committed tx:", afterTx)
  const other = yield* b`SELECT count(*) AS n FROM t`.pipe(Effect.flip)
  console.log("A2 second :memory: client sees table t?", other._tag === "SqlError" ? `no (${other.reason._tag})` : "yes")
}).pipe(Effect.scoped, Effect.provide(Reactivity.layer))

// B. Two migrators racing on one file through two separate clients
//    (what two cold-starting serverless instances would do if migrations ran at boot).
const slowMigration = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS raced (v INTEGER)`
  yield* Effect.sleep("300 millis")
})
const loader = LibsqlMigrator.fromRecord({ "0001_raced": slowMigration })
const runWithOwnClient = (label: string) =>
  LibsqlMigrator.run({ loader }).pipe(
    Effect.provide(LibsqlClient.layer({ url: `file:${dbPath}` })),
    Effect.exit,
    Effect.map((exit) =>
      Exit.isSuccess(exit)
        ? `${label}: applied ${JSON.stringify(exit.value)}`
        : `${label}: FAILED ${String(exit.cause).split("\n")[0].slice(0, 200)}`
    )
  )
const race = Effect.all([runWithOwnClient("migrator-1"), runWithOwnClient("migrator-2")], { concurrency: 2 })

// C. Same race, but with libSQL's busy timeout so the loser waits instead of failing.
const raceWithTimeout = Effect.gen(function*() {
  rmSync(dbPath, { force: true })
  // `timeout` is not part of LibsqlClientConfig, so build the SDK client and pass it as liveClient
  const { createClient } = yield* Effect.promise(() => import("@libsql/client"))
  const run = (label: string) => {
    const live = createClient({ url: `file:${dbPath}`, timeout: 5000 })
    return LibsqlMigrator.run({ loader }).pipe(
      Effect.provide(LibsqlClient.layer({ liveClient: live })),
      Effect.exit,
      Effect.map((exit) =>
        Exit.isSuccess(exit)
          ? `${label}: applied ${JSON.stringify(exit.value)}`
          : `${label}: FAILED ${String(exit.cause).split("\n")[0].slice(0, 200)}`
      ),
      Effect.ensuring(Effect.sync(() => live.close()))
    )
  }
  return yield* Effect.all([run("migrator-1"), run("migrator-2")], { concurrency: 2 })
})

await Effect.runPromise(memory).catch((e) => { console.error("A FAILED", e); process.exitCode = 1 })
console.log("B race (no busy timeout):", await Effect.runPromise(race))
console.log("C race (timeout: 5000):", await Effect.runPromise(raceWithTimeout))
```

</details>

<details>
<summary><code>$EXP/scripts/exp3-config-and-out-of-order.ts (E3)</code></summary>

```ts
// Experiment 3: (a) LibsqlClient.layerConfig reading TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
// through Effect Config, here pointed at a local file; (b) what the migrator does with a
// migration whose id is lower than the latest one already recorded (two branches sharing
// one development database).
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { Config, ConfigProvider, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { rmSync } from "node:fs"

const dbPath = process.argv[2]
if (!dbPath) throw new Error("usage: node exp3-config-and-out-of-order.ts <db-file>")
rmSync(dbPath, { force: true })
process.env.TURSO_DATABASE_URL = `file:${dbPath}` // a local file stands in for libsql://...
process.env.TURSO_AUTH_TOKEN = "not-a-real-token" // ignored for file: URLs

const SqlLive = LibsqlClient.layerConfig({
  url: Config.String("TURSO_DATABASE_URL"),
  authToken: Config.Redacted("TURSO_AUTH_TOKEN")
})

const table = (name: string) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE ${sql(name)} (id INTEGER PRIMARY KEY)`
  })

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const client = yield* LibsqlClient.LibsqlClient
  console.log("config.url seen by the client:", String((client.config as { url: string }).url))
  // branch A deployed first: migrations 1 and 3
  const a = yield* LibsqlMigrator.run({
    loader: LibsqlMigrator.fromRecord({ "1_first": table("first"), "3_branch_a": table("branch_a") })
  })
  console.log("branch A applied:", JSON.stringify(a))
  // branch B (or a later merge) brings migration 2
  const b = yield* LibsqlMigrator.run({
    loader: LibsqlMigrator.fromRecord({ "1_first": table("first"), "2_branch_b": table("branch_b"), "3_branch_a": table("branch_a") })
  })
  console.log("branch B applied:", JSON.stringify(b))
  const tables = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
  console.log("tables now:", tables.map((t) => t.name).join(", "))
})

await Effect.runPromise(program.pipe(Effect.provide(SqlLive))).catch((e) => {
  console.error("FAILED", e)
  process.exitCode = 1
})

// (c) missing env var -> the layer fails with a ConfigError before any query
delete process.env.TURSO_DATABASE_URL
const FreshLayer = LibsqlClient.layerConfig({
  url: Config.String("TURSO_DATABASE_URL"),
  authToken: Config.Redacted("TURSO_AUTH_TOKEN")
})
const exit = await Effect.runPromiseExit(
  Effect.gen(function*() { yield* SqlClient.SqlClient }).pipe(Effect.provide(FreshLayer))
)
console.log("deleted TURSO_DATABASE_URL after first Config read ->", exit._tag, "(default provider snapshots the env on first use)")
// (d) an explicit provider without the variable -> ConfigError
const exit2 = await Effect.runPromiseExit(
  Effect.gen(function*() { yield* SqlClient.SqlClient }).pipe(
    Effect.provide(FreshLayer),
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })))
  )
)
console.log("explicit empty env ->", exit2._tag, String(exit2._tag === "Failure" ? exit2.cause : "").replace(/\s+/g, " ").slice(0, 220))
void Layer
```

</details>

<details>
<summary><code>$EXP/test/charges.test.ts (E4)</code></summary>

```ts
// Experiment 4: @effect/vitest + an in-memory libSQL database built from the same migrations.
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { assert, describe, it, layer } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

const migrations = LibsqlMigrator.fromRecord({
  "0001_create_charges": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE charges (id TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100))`
  })
})

// The same migrations the real database gets, applied to a fresh in-memory database.
const SqlTest = LibsqlMigrator.layer({ loader: migrations }).pipe(
  Layer.provideMerge(LibsqlClient.layer({ url: ":memory:" }))
)

const count = Effect.flatMap(SqlClient.SqlClient, (sql) => sql<{ n: number }>`SELECT count(*) AS n FROM charges`).pipe(
  Effect.map((rows) => rows[0].n)
)
const insert = (id: string, amountCents: number) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql`INSERT INTO charges ${sql.insert({ id, amount_cents: amountCents })}`)

// One database shared by every test in the block (built once, torn down in afterAll).
layer(SqlTest)("shared in-memory database", (it) => {
  it.effect("inserts", () =>
    Effect.gen(function*() {
      yield* insert("a", 100)
      assert.strictEqual(yield* count, 1)
    }))

  it.effect("sees the previous test's row (shared layer)", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* count, 1)
    }))

  it.effect("rolls back a failed transaction", () =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const error = yield* sql.withTransaction(Effect.gen(function*() {
        yield* insert("b", 200)
        yield* insert("c", 50) // violates CHECK
      })).pipe(Effect.flip)
      assert.strictEqual(error._tag, "SqlError")
      assert.strictEqual(yield* count, 1)
    }))

  // Effect 4 memoizes layers across nested Effect.provide calls:
  it.effect("re-providing SqlTest inside the block reuses the shared database", () =>
    count.pipe(Effect.map((n) => assert.strictEqual(n, 1)), Effect.provide(SqlTest)))

  it.effect("Layer.fresh builds a separate, empty database", () =>
    count.pipe(Effect.map((n) => assert.strictEqual(n, 0)), Effect.provide(Layer.fresh(SqlTest))))

  it.effect("{ local: true } also builds a separate, empty database", () =>
    count.pipe(Effect.map((n) => assert.strictEqual(n, 0)), Effect.provide(SqlTest, { local: true })))
})

// A fresh database per test: provide the layer inside each test, outside any shared layer.
describe("fresh database per test", () => {
  it.effect("writes a row", () =>
    Effect.gen(function*() {
      yield* insert("x", 100)
      assert.strictEqual(yield* count, 1)
    }).pipe(Effect.provide(SqlTest)))
  it.effect("does not see the previous test's row", () =>
    count.pipe(Effect.map((n) => assert.strictEqual(n, 0)), Effect.provide(SqlTest)))
})
```

</details>

<details>
<summary><code>$EXP/scripts/exp5-native-and-liveclient.ts (E5)</code></summary>

```ts
// Experiment 5: (a) does importing @effect/sql-libsql load libSQL's native binary?
// (b) can a fetch-only client (@libsql/client/web, or the Turso serverless compat client)
//     be handed to LibsqlClient as `liveClient`? No network: nothing is executed remotely.
import { createRequire } from "node:module"
import type { Client as LibsqlSdkClient } from "@libsql/client"

const require = createRequire(import.meta.url)
const nativeLoaded = () => Object.keys(require.cache).filter((k) => /@libsql[\\/](linux|darwin|win32)/.test(k))

const web = await import("@libsql/client/web")
console.log("after importing @libsql/client/web, native modules loaded:", nativeLoaded().length)

const { LibsqlClient } = await import("@effect/sql-libsql")
console.log("after importing @effect/sql-libsql, native modules loaded:", nativeLoaded().map((k) => k.split("node_modules/")[1]))

// a libsql:// URL with the Node entry resolves to the HTTP transport (no request is made here)
const node = await import("@libsql/client")
const placeholderUrl = "libsql://example-db-example-org.aws-sa-east-1.turso.io"
const viaNode = node.createClient({ url: placeholderUrl, authToken: "placeholder" })
const viaWeb = web.createClient({ url: placeholderUrl, authToken: "placeholder" })
console.log("protocol for libsql:// via @libsql/client:", viaNode.protocol, "| via /web:", viaWeb.protocol)
const viaWss = node.createClient({ url: placeholderUrl.replace("libsql://", "wss://"), authToken: "placeholder" })
console.log("protocol for wss://:", viaWss.protocol)
viaNode.close(); viaWss.close()

// the Turso serverless compat client as a liveClient (type-level check happens in tsc)
const { createClient: createServerless } = await import("@tursodatabase/serverless/compat")
const serverless = createServerless({ url: placeholderUrl, authToken: "placeholder" })
console.log("serverless compat protocol:", serverless.protocol)
const asLive: LibsqlSdkClient = serverless as unknown as LibsqlSdkClient
void LibsqlClient.layer({ liveClient: viaWeb })
void LibsqlClient.layer({ liveClient: asLive })
console.log("layers constructed (not run)")
viaWeb.close()
```

</details>

<details>
<summary><code>$EXP/scripts/exp6-pragmas.ts (E6)</code></summary>

```ts
// Experiment 6: local libSQL defaults that differ from what a remote database may do.
import { LibsqlClient } from "@effect/sql-libsql"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { rmSync } from "node:fs"

const dbPath = process.argv[2]
if (!dbPath) throw new Error("usage: node exp6-pragmas.ts <db-file>")
rmSync(dbPath, { force: true })

const program = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  console.log("PRAGMA foreign_keys (local file):", yield* sql`PRAGMA foreign_keys`)
  console.log("PRAGMA journal_mode (local file):", yield* sql`PRAGMA journal_mode`)
  console.log("sqlite_version():", yield* sql`SELECT sqlite_version() AS v`)
  yield* sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`
  yield* sql`CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent (id))`
  const orphan = yield* sql`INSERT INTO child (id, parent_id) VALUES (1, 999)`.pipe(Effect.exit)
  console.log("orphan insert without PRAGMA foreign_keys=ON:", orphan._tag)
})

await Effect.runPromise(program.pipe(Effect.provide(LibsqlClient.layer({ url: `file:${dbPath}` })))).catch((e) => {
  console.error("FAILED", e)
  process.exitCode = 1
})
```

</details>

<details>
<summary><code>$EXP/scripts/migrations.ts (E7)</code></summary>

```ts
// A migrations module in the shape the app could use: one record, static imports, no
// file-system or bundler magic, shared by a CLI script, tests and (if ever wanted) the server.
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { LibsqlMigrator } from "@effect/sql-libsql"

export const loader = LibsqlMigrator.fromRecord({
  "0001_create_charges": Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE charges (
      id TEXT PRIMARY KEY,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 100),
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'expired')),
      created_at INTEGER NOT NULL
    ) STRICT`
    // keep the write transaction open a little, to make races observable
    yield* Effect.sleep(Number(process.env.MIGRATION_DELAY_MS ?? 0))
  })
})
```

</details>

<details>
<summary><code>$EXP/scripts/migrate.ts (E7)</code></summary>

```ts
// Experiment 7: a standalone migration script (`node scripts/migrate.ts`), configured only by
// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, as it would be run per database (dev, prod).
import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql"
import { Config, Effect } from "effect"
import { loader } from "./migrations.ts"

const SqlLive = LibsqlClient.layerConfig({
  url: Config.String("TURSO_DATABASE_URL"),
  authToken: Config.Redacted("TURSO_AUTH_TOKEN").pipe(Config.option, Config.map((o) => o._tag === "Some" ? o.value : undefined))
})

const program = LibsqlMigrator.run({ loader }).pipe(
  Effect.tap((applied) => Effect.sync(() => console.log(`[${process.pid}] applied:`, JSON.stringify(applied)))),
  Effect.provide(SqlLive)
)

await Effect.runPromise(program).catch((error) => {
  console.error(`[${process.pid}] migration failed:`, String(error).split("\n")[0].slice(0, 200))
  process.exitCode = 1
})
```

</details>

<details>
<summary><code>$EXP/scripts/typecheck-serverless-live.ts (E8, expected to fail)</code></summary>

```ts
// Type-level check only: is the Turso serverless compat client assignable to @libsql/client's Client?
import { LibsqlClient } from "@effect/sql-libsql"
import { createClient } from "@tursodatabase/serverless/compat"

const client = createClient({ url: "libsql://placeholder.turso.io", authToken: "placeholder" })
export const layer = LibsqlClient.layer({ liveClient: client })
```

</details>

<details>
<summary><code>$EXP/scripts/doc-sketch-client.ts (E8)</code></summary>

```ts
// Type-check only: the client-configuration sketches used in the research note.
import { LibsqlClient } from "@effect/sql-libsql"
import { createClient } from "@libsql/client/web"
import { Config, Effect, Layer, Redacted, String as Str } from "effect"
import { SqlClient } from "effect/sql"

// 1. Managed client from env vars (each field of Config.Wrap must itself be a Config)
export const SqlLive = LibsqlClient.layerConfig({
  url: Config.String("TURSO_DATABASE_URL"),
  authToken: Config.Redacted("TURSO_AUTH_TOKEN"),
  transformQueryNames: Config.succeed(Str.camelToSnake),
  transformResultNames: Config.succeed(Str.snakeToCamel)
})

// 2. Caller-owned SDK client (e.g. the fetch-only /web entry); Effect will not close it
export const SqlLiveWeb = Layer.unwrap(
  Effect.gen(function*() {
    const url = yield* Config.String("TURSO_DATABASE_URL")
    const authToken = yield* Config.Redacted("TURSO_AUTH_TOKEN")
    const sdk = yield* Effect.acquireRelease(
      Effect.sync(() => createClient({ url, authToken: Redacted.value(authToken) })),
      (sdk) => Effect.sync(() => sdk.close())
    )
    return LibsqlClient.layer({ liveClient: sdk })
  })
)

// 3. Same program, any of the layers
export const ping = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<{ ok: number }>`SELECT 1 AS ok`
})
export const runPing = ping.pipe(Effect.provide(SqlLive))
export const runPingWeb = ping.pipe(Effect.provide(SqlLiveWeb))

import type { Effect as E } from "effect"
export const _checkWeb: E.Effect<unknown, unknown, never> = runPingWeb
export const _check: E.Effect<unknown, unknown, never> = runPing
```

</details>

<details>
<summary><code>$NITRO/package.json (after installs)</code></summary>

```json
{
  "name": "nitro-libsql-trace-exp",
  "private": true,
  "type": "module",
  "dependencies": {
    "@effect/sql-libsql": "4.1.3",
    "effect": "4.1.3",
    "nitropack": "2.13.5"
  }
}
```

</details>

<details>
<summary><code>$NITRO/server/routes/index.ts (N1–N4)</code></summary>

```ts
import { LibsqlClient } from "@effect/sql-libsql"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Query a local in-memory database through @effect/sql-libsql, to prove the module
// (and libSQL's native binding it loads) is present in the built server.
export default defineEventHandler(() =>
  Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ ok: number }>`SELECT 1 AS ok`
      return { driver: sql.driver, rows }
    }).pipe(Effect.provide(LibsqlClient.layer({ url: ":memory:" })))
  )
)
```

</details>

<details>
<summary><code>$NITRO/server/routes/web.ts (N4)</code></summary>

```ts
import { LibsqlClient } from "@effect/sql-libsql"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Remote-style URL pointing at a closed local port: proves which transport is bundled
// without any real database (expects a connection error, not a missing-module error).
export default defineEventHandler(() =>
  Effect.runPromise(
    Effect.gen(function*() {
      const client = yield* LibsqlClient.LibsqlClient
      const sql = yield* SqlClient.SqlClient
      const error = yield* sql`SELECT 1`.pipe(Effect.flip)
      return {
        protocol: (client as unknown as { sdk: { protocol: string } }).sdk.protocol,
        error: error.reason._tag,
        message: String(error.reason.message).slice(0, 120)
      }
    }).pipe(Effect.provide(LibsqlClient.layer({ url: "http://127.0.0.1:9" })))
  )
)
```

</details>

<details>
<summary><code>$NITRO/nitro.config.ts for N1, N2 (no options)</code></summary>

```ts
import { defineNitroConfig } from "nitropack/config"

export default defineNitroConfig({
  compatibilityDate: "2026-06-30",
  srcDir: "server"
})
```

</details>

<details>
<summary><code>$NITRO/nitro.config.ts for N3 (Fix A)</code></summary>

```ts
import { createRequire } from "node:module"
import { defineNitroConfig } from "nitropack/config"

// Mitigation under test: nft cannot follow libsql@0.5.x's dynamic
// require(`@libsql/${target}`), so resolve the installed platform binary from libsql's own
// location (works for npm's hoisted and pnpm's nested layouts) and hand nft an absolute path.
const fromRoot = createRequire(import.meta.url)
const fromLibsql = createRequire(fromRoot.resolve("libsql"))
const libsqlBinaries = ["@libsql/linux-x64-gnu", "@libsql/linux-arm64-gnu"].flatMap((pkg) => {
  try {
    return [fromLibsql.resolve(pkg)]
  } catch {
    return [] // not installed for this platform
  }
})

export default defineNitroConfig({
  compatibilityDate: "2026-06-30",
  srcDir: "server",
  externals: { traceInclude: libsqlBinaries }
})
```

</details>

<details>
<summary><code>$NITRO/nitro.config.ts for N4 (Fix B)</code></summary>

```ts
import { fileURLToPath } from "node:url"
import { defineNitroConfig } from "nitropack/config"

// Mitigation under test: never load libSQL's native module in the server build.
// Bundle @effect/sql-libsql (so the alias applies to its import) and point its
// "@libsql/client" import at the fetch-only web entry.
const webEntry = fileURLToPath(import.meta.resolve("@libsql/client/web"))

export default defineNitroConfig({
  compatibilityDate: "2026-06-30",
  srcDir: "server",
  alias: { "@libsql/client": webEntry },
  externals: { inline: ["@effect/sql-libsql", "@libsql/client"] }
})
```

</details>

## Gaps and open questions

- **The development database's engine.** Is it libSQL or Turso (`--tursodb`)? Everything here assumes libSQL; check with `turso db show`. The docs also don't say whether `@libsql/client` works against a Turso-engine database.
- **Real latency** between Vercel `gru1` and Turso `aws-sa-east-1`. No vendor figure exists, so measure it on a Preview deployment.
- **The HTTP path wasn't run.**
  - The round-trip counts, the 5 s and 10 s limits and the error shapes come from source code and docs.
  - No libSQL server (`turso dev`, Docker) was run, because the brief allowed only npm packages.
- **Concurrent writers on Turso Cloud.** It's unknown what a second concurrent `BEGIN IMMEDIATE` sees there, whether it waits or fails. It's also unknown whether open-source `sqld`'s lock stealing after 5 s applies, which would force a rollback of a slow database transaction.
- **"Invalid baton" errors** ([#119](https://github.com/tursodatabase/libsql-client-ts/issues/119)): it's unknown whether they still happen with `@libsql/client` 0.18 and `@libsql/hrana-client` 0.10.
- **Free-plan archiving.**
  - Unknown: what a request against an archived database returns, and whether activity on one database keeps its group alive.
  - That matters if development and production share a group. It decides between the Free plan with a safeguard and a paid plan for production. It belongs to the launch path and to the plan question in "What do Vercel's plans and platform allow for this app?".
- **Foreign keys on Turso Cloud.**
  - Local libSQL enforces them by default (E6). Turso doesn't document its default.
  - `@libsql/client`'s `migrate()` turns `PRAGMA foreign_keys` off and back on around its batch, which suggests enforcement is on. That's an inference.
  - One `PRAGMA foreign_keys;` against the development database settles it.
- **The bundling fixes outside the scratch app.**
  - Both were tested on bare nitropack 2.13.5 with npm on arm64. They're untested inside Nuxt 4.6.3, with pnpm 12's nested layout (resolving the binary from `libsql`'s location should work there, but wasn't tried), and on Vercel's x64 builders.
  - The first build ticket should look in `.vercel/output/functions/__fallback.func/node_modules/@libsql/` for `linux-x64-gnu`, or for no native package at all if Fix B is used.
- **Effect's next minor.** It's unknown when it ships with `SqlClient.batch`, one round trip for an atomic batch.
- **Env var naming.** The map names `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, which Effect `Config` reads straight from `process.env`. Turso's Nuxt guide instead uses `NUXT_TURSO_DATABASE_URL` and `NUXT_TURSO_AUTH_TOKEN` through `runtimeConfig` ([Nuxt guide](https://docs.turso.tech/sdk/ts/guides/nuxt)). Which one the server reads is for "How is Effect wired into the Nuxt server?".
- **Turso and Supabase.** The acquisition was announced on 2026-10-02, with "nothing changes" for existing users. The long-term direction of Turso Cloud's libSQL offering isn't stated, and Turso's docs already steer new projects towards the Turso engine.
- **No first-party Effect driver for `@tursodatabase/serverless`.** If production ever needs a Turso-engine database, that's a gap.

## Sources

All read or fetched on 2026-11-10.

**Effect** (`Effect-TS/effect`, tag `effect@4.1.3` unless noted)

- [packages/sql/libsql/src/LibsqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlClient.ts)
- [packages/sql/libsql/src/LibsqlMigrator.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/src/LibsqlMigrator.ts)
- [packages/sql/libsql/CHANGELOG.md](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/CHANGELOG.md)
- [packages/sql/libsql/test/util.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/sql/libsql/test/util.ts)
- [packages/effect/src/sql/Migrator.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/Migrator.ts)
- [packages/effect/src/sql/MigratorFileSystem.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/MigratorFileSystem.ts)
- [packages/effect/src/sql/SqlClient.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlClient.ts)
- [packages/effect/src/sql/SqlSchema.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlSchema.ts)
- [packages/effect/src/sql/SqlModel.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlModel.ts)
- [packages/effect/src/sql/SqlError.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/sql/SqlError.ts)
- [packages/effect/src/schema/Model.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/schema/Model.ts)
- [packages/effect/src/Config.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/Config.ts)
- [packages/effect/src/ConfigProvider.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/packages/effect/src/ConfigProvider.ts)
- [ai-docs/src/40_sql/10_basics.ts](https://github.com/Effect-TS/effect/blob/effect%404.1.3/ai-docs/src/40_sql/10_basics.ts)
- [MIGRATION.md](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md) (main)
- [migration/layer-memoization.md](https://github.com/Effect-TS/effect/blob/main/migration/layer-memoization.md) (main)
- [PR #6522](https://github.com/Effect-TS/effect/pull/6522): `@effect/sql-tursodatabase`, open
- [PR #10147](https://github.com/Effect-TS/effect/pull/10147) and [PR #10175](https://github.com/Effect-TS/effect/pull/10175): `SqlClient.batch`, merged to `v4/next-minor`
- [PR #10227](https://github.com/Effect-TS/effect/pull/10227): concurrent remote statements, 4.1.2

**libSQL client and server**

- [libsql-core/src/config.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/config.ts)
- [libsql-core/src/api.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/api.ts)
- [libsql-client/src/node.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/node.ts)
- [libsql-client/src/web.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/web.ts)
- [libsql-client/src/http.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/http.ts)
- [libsql-client/src/hrana.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/hrana.ts)
- [libsql-client/src/ws.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/ws.ts)
- [libsql-client/src/sqlite3.ts](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/sqlite3.ts)
- [hrana-client-ts src/index.ts](https://github.com/libsql/hrana-client-ts/blob/main/src/index.ts)
- libsql-client-ts issues [#84](https://github.com/tursodatabase/libsql-client-ts/issues/84), [#112](https://github.com/tursodatabase/libsql-client-ts/issues/112), [#119](https://github.com/tursodatabase/libsql-client-ts/issues/119) and [#346](https://github.com/tursodatabase/libsql-client-ts/issues/346)
- libsql-js [#185](https://github.com/tursodatabase/libsql-js/issues/185) and [#182](https://github.com/tursodatabase/libsql-js/pull/182)
- libsql-server: [connection/mod.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/connection/mod.rs), [connection/connection_manager.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/connection/connection_manager.rs) and [hrana/http/stream.rs](https://github.com/tursodatabase/libsql/blob/main/libsql-server/src/hrana/http/stream.rs)
- Turso serverless driver: [README](https://github.com/tursodatabase/turso/blob/main/serverless/javascript/README.md), [compat.ts](https://github.com/tursodatabase/turso/blob/main/serverless/javascript/src/compat.ts) and [protocol.ts](https://github.com/tursodatabase/turso/blob/main/serverless/javascript/src/protocol.ts)
- [nitrojs/nitro#3328](https://github.com/nitrojs/nitro/issues/3328)

**npm registry** (`npm view <pkg> dist-tags / time / dependencies`)

- [effect](https://registry.npmjs.org/effect)
- [@effect/sql-libsql](https://registry.npmjs.org/@effect/sql-libsql)
- [@effect/sql](https://registry.npmjs.org/@effect/sql)
- [@effect/vitest](https://registry.npmjs.org/@effect/vitest)
- [@libsql/client](https://registry.npmjs.org/@libsql/client)
- [libsql](https://registry.npmjs.org/libsql)
- [@tursodatabase/serverless](https://registry.npmjs.org/@tursodatabase/serverless)
- [vitest](https://registry.npmjs.org/vitest)

**Turso docs and site**

- [TS reference](https://docs.turso.tech/sdk/ts/reference)
- [TS quickstart](https://docs.turso.tech/sdk/ts/quickstart)
- [SDK introduction](https://docs.turso.tech/sdk/introduction)
- [Vercel integration](https://docs.turso.tech/integrations/vercel)
- [Nuxt guide](https://docs.turso.tech/sdk/ts/guides/nuxt)
- [Turso Cloud](https://docs.turso.tech/turso-cloud)
- [libSQL](https://docs.turso.tech/libsql)
- [Quickstart](https://docs.turso.tech/quickstart)
- [HTTP reference](https://docs.turso.tech/sdk/http/reference)
- [Limitations](https://docs.turso.tech/cloud/limitations)
- [Usage and billing](https://docs.turso.tech/help/usage-and-billing)
- [group unarchive (CLI)](https://docs.turso.tech/cli/group/unarchive)
- [Unarchive group (API)](https://docs.turso.tech/api-reference/groups/unarchive)
- [Point-in-time recovery](https://docs.turso.tech/features/point-in-time-recovery)
- [Branching](https://docs.turso.tech/features/branching)
- [Platform tokens](https://docs.turso.tech/sdk/authorization/tokens)
- [db tokens create](https://docs.turso.tech/cli/db/tokens/create)
- [db show](https://docs.turso.tech/cli/db/show)
- [Local development](https://docs.turso.tech/local-development)
- [Pricing](https://turso.tech/pricing)
- [New regions, including Brazil (2026-10-01)](https://turso.tech/blog/turso-cloud-new-regions)

**Vercel**

- [Fluid compute](https://vercel.com/docs/fluid-compute)
- [Regions](https://vercel.com/docs/regions)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [Deploy Hooks](https://vercel.com/docs/deploy-hooks)
- [KB: connection pools with Fluid compute](https://vercel.com/kb/guide/efficiently-manage-database-connection-pools-with-fluid-compute)

**Other**

- [SQLite datatypes](https://www.sqlite.org/datatype3.html)
- [Supabase: "Supabase is acquiring Turso" (2026-10-02)](https://supabase.com/blog/supabase-is-acquiring-turso)
