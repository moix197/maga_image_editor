# The cartoonize result is ephemeral page state

**Decision:** The cartoonized image lives only in React state on
`apps/web/src/app/editor/page.tsx` — the `resultDataUrl` state set by
`handleCartoonize` from the value returned by the `use-cartoonize.ts` hook. It
is **not persisted** anywhere: not to storage, not to the editor node model, not
to a project record.

**Why:** Stage-3 scoped cartoonize to a single in-session action. Persistence was
deferred **on purpose**, not forgotten — there is no project/storage model for it
to land in yet, and adding one would have widened Stage-3 beyond its cap.

**Rejected:** Persisting the result now — writing it into storage or the editor
node model. That would commit to a persistence shape before the project model
that should own it exists.

**Constraints it creates:** Callers must treat the cartoonize result as
**ephemeral** — it vanishes on reload and is not part of saved editor state.
Wiring persistence is a deliberate future decision, not an oversight to "fix"
opportunistically. The hook drives the value; the page holds it.

> Naming note: the value is held as `resultDataUrl` on `page.tsx`. (Earlier
> planning referred to a `cartoonizeDataUrl` identifier; no such identifier
> exists — the fact is the same, only the name differs.)
