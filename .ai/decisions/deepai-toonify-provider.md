# DeepAI Toonify is the cartoonizer provider

**Decision:** Cartoonization is delegated to **DeepAI Toonify**
(`https://api.deepai.org/api/toonify`), called **server-side** from
`apps/web/src/app/api/cartoonize/route.ts` via the service in
`apps/web/src/lib/cartoonize-service.ts`. There is no vendor SDK — the call is a
plain `fetch` with the key in an `api-key` header.

**Why:** The provider key (`DEEPAI_API_KEY`) lives only on the server, read from
the environment inside the service. Keeping the call in the route means the key
never enters the client bundle and there is **zero client-side bundle cost** —
no SDK to ship, no secret to leak. This matches the CLAUDE.md
dependency-minimization rule: a raw `fetch` to a documented HTTP endpoint beats
adding a vendor package.

**Rejected:** A client-side / browser SDK provider — it would force the API key
(or a proxy token) toward the client and put third-party JS in the bundle.
Bundling any vendor SDK at all — the endpoint is a single multipart POST; an SDK
adds maintenance surface for no gain.

**Constraints it creates:** The API key never reaches the client. All provider
calls stay in the route and `cartoonize-service.ts` — never in components or
client hooks. The hook `apps/web/src/hooks/use-cartoonize.ts` talks only to the
internal `/api/cartoonize` route, never to DeepAI directly. This service is one
instance of the [[lib-service-function-convention]].
