# Effect runs behind thin Nitro handlers, not an HttpApi

All server logic is Effect, but requests reach it through ordinary Nitro handlers. Each route is a few lines that read the request, run an Effect program on one module-scope `ManagedRuntime` and map the result to HTTP. Effect's own `HttpApi` mounted on a catch-all route was the obvious alternative. It would have given Schema-checked contracts, error statuses derived from the schemas, OpenAPI and a typed `HttpApiClient`. We passed on it for four reasons:

- `effect/http` and `effect/http-api` are marked unstable, while `ManagedRuntime` is stable.
- Its raw `Response` breaks the `$fetch` types Nuxt infers from its routes.
- Its typed client would put Effect into the bundle of the page Payers open on their phones.
- Nobody had shown it working inside Nuxt.

The cost is mapping errors to statuses by hand, contained in one shared helper, and having no generated API description. Request and response Schemas still live on the server, and the pages import only their types.
