# Plan: Populate the `.ai/` Knowledge Base from the Existing Codebase

**Created:** 2026-06-20
**Branch:** populate-ai-knowledge-base
**Status:** not started

## Context

The `.ai/` knowledge base is wired into the workflow (sync-knowledge,
write-prd, execute-prd) but its scaffolding files (`README.md`, `index.md`,
`architecture.md`) ship empty and `decisions/` + `patterns/` are unpopulated.
Every research pass therefore re-derives the project's structure and rationale
from raw source — the exact cost `.ai/` exists to eliminate.

This plan **seeds** the KB from the *current* codebase. It writes only Markdown
under `.ai/`; **no application code changes**. The governing goal is **token
savings**: a future agent must be able to pull the one file it needs without
loading the whole KB. That forces **maximum granularity** — one fact per file
(one decision per `decisions/<slug>.md`, one pattern per `patterns/<slug>.md`),
with `index.md` kept as a thin router (one terse row per module, link out, never
paragraphs).

Every candidate entry is run through the **anti-wiki test**: if a competent
reader could reconstruct it by reading the code, it does not belong. Decision
records use the sync-knowledge schema (`# Title`, `**Decision:**`, `**Why:**`,
`**Rejected:**`, `**Constraints it creates:**`). Files are plain Markdown, no
YAML frontmatter, kebab-case slugs, cross-linked with `[[slug]]`.

## Risk: low

Documentation-only. No runtime, build, or test surface is touched. The only
failure modes are inaccuracy (stale paths, wiki-bloat) — caught by the Phase 5
audit.

## Dependencies & Risks

- **Anti-wiki discipline is the main risk.** The easy failure is writing
  reconstructible-from-code prose. Each phase must apply the test per entry and
  drop anything that fails (Phase 2 explicitly may drop a decision in favor of a
  pattern).
- **Path accuracy.** Every `index.md` row and every decision/pattern path must
  resolve to a live file. **The implementer must re-verify every cited path with
  a file-resolution check at write time inside each phase — not defer it to the
  Phase 5 audit.** A path that does not resolve when its doc is written must be
  corrected or the entry retired before the phase commits. Codebase paths
  confirmed at planning time:
  `packages/editor/src/{index,types,defaults,editor-state,guards,constants}.ts`,
  `apps/web/src/lib/{canvas-post-pass,cartoonize-service,export-helpers,image-helpers,css-helpers}.ts`,
  `apps/web/src/app/api/cartoonize/route.ts`,
  `apps/web/src/app/editor/page.tsx` (holds `cartoonizeDataUrl` page state),
  `apps/web/src/hooks/use-cartoonize.ts` (React wrapper over the cartoonize service),
  `apps/web/src/components/{text-style-panel,overlay-controls-panel}.tsx`.
- **Order-sensitive:** Phase 1 establishes `index.md`/`architecture.md`
  scaffolds + the dependency rules that later phases link into. Phases 2–4 are
  independent domains but each appends to the same `index.md`/`architecture.md`,
  so they run sequentially to avoid edit collisions.
- **Pattern bar:** a `patterns/<slug>.md` is allowed only on a genuine 2nd+ use.
  Phase 5 re-verifies each pattern actually recurs; a pattern with one real site
  gets retired.
- **In-phase retirement is allowed and expected.** If, while writing a candidate
  entry, the implementer finds it fails the anti-wiki test (reconstructible from
  code) or a pattern resolves to <2 live sites on close inspection, that entry is
  **dropped in the same phase** — do not author a weak entry just to match this
  plan's table. Record the drop in the phase's commit body and remove its
  `index.md` link. Phase 5 is the safety net, not the only gate.

## Phases

### Phase 0: Create worktree

**This phase is always first. No exceptions.**

Create a git worktree for this plan's branch. Always confirm worktree creation
with the user before running.

**Steps:**

- [ ] Confirm branch name and base ref with the user
- [ ] Run `git worktree add ../populate-ai-knowledge-base -b populate-ai-knowledge-base main`
- [ ] Verify worktree is active and on the correct branch (`git worktree list`)

---

### Phase 1: Foundation & map — packages, dependency direction, framework-free boundary

**Risk:** low
**Mode:** afk
**Type:** docs
**Success criteria:** Given only `.ai/index.md` + `.ai/architecture.md`, an agent can name which of the three packages owns any given concern and state the dependency-direction rule (web → editor → config, one-way). `decisions/framework-free-editor-package.md` exists and explains why `@maga/editor` carries no React.
**Commit message:** `docs(ai): seed KB foundation — package map, dependency direction, framework-free decision`

> **Allowed-exception justification:** This is the one permitted thin
> infrastructure-prerequisite slice. It carries no domain decisions of its own
> beyond the framework-free boundary; it exists so Phases 2–4 have an
> `index.md` router and an `architecture.md` skeleton to append into and link
> back to. Combining it into a domain phase would force that domain to own the
> cross-cutting package map.

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `.ai/README.md` | Confirm/polish; ensure Layout table + anti-wiki rule read correctly against the now-populated structure. Minimal edits only. |
| modify | `.ai/index.md` | Replace `_empty_` Modules table with 3 real rows: `@maga/web`, `@maga/editor`, `@maga/config` — one-line responsibility + path + linked docs column. Scaffold the Cross-cutting table headers (rows filled by later phases). |
| modify | `.ai/architecture.md` | Fill "System shape" (3-package decomposition: what each owns) and "Dependency direction" (web → editor → config, one-way, no cycles). Leave "Data flow" stub for Phases 2–4. |
| create | `.ai/decisions/framework-free-editor-package.md` | Decision: `@maga/editor` is React-free domain logic. Why / Rejected / Constraints. |

**Steps:**

- [ ] Write `decisions/framework-free-editor-package.md` using the sync-knowledge schema: Decision (editor package is pure TS, no React/DOM); Why (domain reuse + testability + the web hook is the only React boundary); Rejected (colocating mutation logic in React hooks); Constraints (no React imports may enter `packages/editor`; web consumes via `use-editor-state.ts` wrapper).
- [ ] Fill `architecture.md` System shape: `@maga/web` (Next.js UI, routes, hooks, lib), `@maga/editor` (framework-free types/defaults/state), `@maga/config` (static build config). One terse paragraph each, link `[[framework-free-editor-package]]`.
- [ ] Fill `architecture.md` Dependency direction: one-way `@maga/web` → `@maga/editor` → `@maga/config`; no cycles; reference CLAUDE.md Architecture rule.
- [ ] Populate `index.md` Modules rows for the 3 packages with confirmed paths; Decisions column links `[[framework-free-editor-package]]` on the editor row.
- [ ] Polish `README.md` only where it now mis-describes the populated state.
- [ ] Verify every path written resolves to a real directory/file.

**Tests:**

No automated tests — justified because: pure docs change, no behavior. Accuracy is verified by path-resolution checks in this phase and the routing audit in Phase 5.

**Verification:**

- [ ] `index.md` has exactly 3 module rows, each path resolves to a live dir
- [ ] `architecture.md` System shape + Dependency direction sections are non-stub; dependency rule is stated one-way with no-cycle invariant
- [ ] `decisions/framework-free-editor-package.md` has all four schema headers (`**Decision:**`/`**Why:**`/`**Rejected:**`/`**Constraints it creates:**`) and no code restatement
- [ ] Acid test passes: from index + architecture alone, the correct owning package can be named for "where do overlay types live" (editor), "where is the cartoonize route" (web), "where is the tailwind preset" (config)

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (this phase IS the documentation)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `docs(ai): seed KB foundation — package map, dependency direction, framework-free decision`
- [ ] Phase marked complete

---

### Phase 2: Editor state & node/property-panel domain

**Risk:** low
**Mode:** afk
**Type:** docs
**Success criteria:** A fresh agent can route any task in the editor-state / node-model / property-panel domain using only `.ai/`: it lands on `packages/editor/src/editor-state.ts` for state mutation, knows overlay defaults lock aspect ratio + effects are opt-in, and finds the property-panel layout pattern.
**Commit message:** `docs(ai): seed KB editor-state & property-panel domain`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `.ai/architecture.md` | Add "Canvas + DOM-overlay node model" subsection under Data flow: text/overlay nodes live as DOM in the overlay layer over the canvas; state is the editor package's immutable node array. |
| modify | `.ai/index.md` | Add `decisions/`+`patterns/` links to the `@maga/editor` row and a Cross-cutting row for "Property panels". |
| create | `.ai/decisions/immutable-state-mutation-functions.md` | Pure mutation fns in editor package + thin React hook wrapper in web. |
| create | `.ai/decisions/aspect-ratio-locked-default.md` | New overlays default `aspectRatioLocked: true`. |
| create | `.ai/patterns/effect-field-optional-properties.md` | Optional effect fields (drop-shadow, feather) threaded through types→defaults→panel→post-pass; opt-in not always-on. |
| create | `.ai/patterns/field-row-property-panel-layout.md` | Shared label+control FieldRow layout across property panels. |

**Steps:**

- [ ] Write `decisions/immutable-state-mutation-functions.md`: Decision (state transitions are pure functions in `packages/editor/src/editor-state.ts` returning new state; React hook `use-editor-state.ts` only wraps them); Why (framework-free reuse + trivial testing, ties to `[[framework-free-editor-package]]`); Rejected (mutating in the hook / using a reducer in web); Constraints (mutation fns must stay pure; new node ops belong in editor-state.ts, not the hook). Cross-link `[[framework-free-editor-package]]`.
- [ ] Write `decisions/aspect-ratio-locked-default.md`: Decision (new overlay nodes start `aspectRatioLocked: true`); Why (the non-obvious UX default — most users resize images proportionally; localized to overlay creation in defaults); Rejected (unlocked default); Constraints (the default lives in `packages/editor/src/defaults.ts`; aspect-lock *logic* is one component's concern and is intentionally NOT a pattern).
- [ ] Write `patterns/effect-field-optional-properties.md`: the recurring shape where overlay effect fields are optional and opt-in — declared in `types.ts`, omitted from `defaults.ts`, surfaced in `overlay-controls-panel.tsx`, baked in `canvas-post-pass.ts`. Document the 4 sites (proves 2+ use). This pattern is where "effects are opt-in" is captured.
- [ ] Write `patterns/field-row-property-panel-layout.md`: the shared label+control row layout reused by `text-style-panel.tsx` and `overlay-controls-panel.tsx` (2 sites). Capture the convention, not the JSX.
- [ ] Add `architecture.md` node-model subsection; link `[[immutable-state-mutation-functions]]`.
- [ ] Wire `index.md`: editor row links `[[immutable-state-mutation-functions]]` + `[[aspect-ratio-locked-default]]` + `[[effect-field-optional-properties]]`; Cross-cutting "Property panels" row links `[[field-row-property-panel-layout]]`.
- [ ] Verify each path cited resolves live; run anti-wiki test on each entry.

**Anti-wiki / consolidation note:** The candidate "effects opt-in optional
fields" appears once as a decision and once as a pattern. It is captured **only
as the pattern** `effect-field-optional-properties` (it is a recurring code
shape across 4 sites, not a one-time why) — **no separate decision is
written**. The candidate "aspect-ratio preservation" stays a **decision (the
default)** and is deliberately **not** a pattern, because the lock logic lives
in a single component.

**Tests:**

No automated tests — justified because: pure docs change, no behavior.

**Verification:**

- [ ] 2 decision files + 2 pattern files created, all with correct schema/shape
- [ ] Each pattern lists ≥2 real code sites; each cited path resolves live
- [ ] No file restates code (e.g. the immutable-state doc explains *why pure*, not the signatures)
- [ ] `index.md` editor row + Property-panels cross-cutting row resolve all links
- [ ] Routing acid test: "where is editor state mutated?" → `packages/editor/src/editor-state.ts`; "where is the overlay effect UI?" → `overlay-controls-panel.tsx`

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (this phase IS the documentation)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `docs(ai): seed KB editor-state & property-panel domain`
- [ ] Phase marked complete

---

### Phase 3: Export / compositing domain

**Risk:** low
**Mode:** afk
**Type:** docs
**Success criteria:** A fresh agent can route any export/compositing task using only `.ai/`: it lands on `export-helpers.ts` + `canvas-post-pass.ts`, understands *why* a native canvas post-pass exists on top of html-to-image, and finds the coordinate-mapping and per-item-fallback patterns.
**Commit message:** `docs(ai): seed KB export & compositing domain`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `.ai/architecture.md` | Add "Export fidelity" subsection under Data flow: html-to-image base render + native canvas post-pass at 2x to bake overlay effects. |
| modify | `.ai/index.md` | Add Cross-cutting "Export / compositing" row linking the two decisions + two patterns; tag the `@maga/web` lib path. |
| create | `.ai/decisions/canvas-post-pass-for-export-effects.md` | Why a native canvas post-pass is the only reliable bake path for image-overlay CSS effects. |
| create | `.ai/decisions/data-overlay-dom-serialization.md` | Overlay node data serialized onto DOM via `data-overlay` JSON for the non-React post-pass to read. |
| create | `.ai/patterns/pixelratio-coordinate-mapping.md` | pixelRatio-aware %↔px coordinate mapping. |
| create | `.ai/patterns/per-item-trycatch-fallback.md` | Per-item try/catch fallback in batch operations. |

**Steps:**

- [ ] Write `decisions/canvas-post-pass-for-export-effects.md`: Decision (a native canvas post-pass at 2x bakes image-overlay effects after the html-to-image render); Why (html-to-image / foreignObject silently drops CSS transforms, border-radius, drop-shadow, mask — the non-obvious failure that forced it); Rejected (relying on html-to-image alone; switching export libs); Constraints (overlay effects must be re-implementable in canvas; new effect fields must be handled in `canvas-post-pass.ts`, ties `[[effect-field-optional-properties]]`).
- [ ] Write `decisions/data-overlay-dom-serialization.md`: Decision (overlay nodes serialize their data to a `data-overlay` JSON attribute on the DOM element); Why (the post-pass is non-React and must read node geometry/effects without the React tree); Rejected (passing node state through React refs into the post-pass); Constraints (the `data-overlay` payload shape is a contract between the overlay layer and `canvas-post-pass.ts`). Cross-link `[[canvas-post-pass-for-export-effects]]`.
- [ ] Write `patterns/pixelratio-coordinate-mapping.md`: the %↔px mapping that accounts for pixelRatio when baking onto the 2x canvas (sites in `canvas-post-pass.ts`; cite the recurring conversion). Capture the convention + why pixelRatio matters, not the formula.
- [ ] Write `patterns/per-item-trycatch-fallback.md`: per-item try/catch so one failing overlay/export item doesn't abort the batch — sites in `canvas-post-pass.ts` and `export-helpers.ts` (2 sites).
- [ ] Add `architecture.md` Export-fidelity subsection; link both export decisions.
- [ ] Wire `index.md` Cross-cutting "Export / compositing" row to all four docs.
- [ ] Verify paths resolve; anti-wiki test each entry; confirm per-item-fallback genuinely appears in both cited files (retire if not 2+).

**Tests:**

No automated tests — justified because: pure docs change, no behavior.

**Verification:**

- [ ] 2 decision files + 2 pattern files created with correct schema/shape
- [ ] `per-item-trycatch-fallback` confirmed in ≥2 real files; `pixelratio-coordinate-mapping` cites real conversion sites
- [ ] Export-fidelity architecture subsection states the html-to-image limitation as the *why*, without restating canvas API calls
- [ ] `index.md` Export/compositing row resolves all links
- [ ] Routing acid test: "where does overlay export rendering happen?" → `export-helpers.ts` + `canvas-post-pass.ts`

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (this phase IS the documentation)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `docs(ai): seed KB export & compositing domain`
- [ ] Phase marked complete

---

### Phase 4: Cartoonize / external-services domain

**Risk:** low
**Mode:** afk
**Type:** docs
**Success criteria:** A fresh agent can route any cartoonize / external-service task using only `.ai/`: it lands on `/api/cartoonize/route.ts` + `cartoonize-service.ts` (with `use-cartoonize.ts` as the client caller), knows the provider is DeepAI Toonify (server-only key, no SDK) and that the result is ephemeral state in `editor/page.tsx`, and finds the lib service-function convention.
**Commit message:** `docs(ai): seed KB cartoonize & external-services domain`

**File changes:**
| Action | File | What changes |
|---|---|---|
| modify | `.ai/architecture.md` | Add cartoonize data-flow entry under Data flow: `editor/page.tsx` → `use-cartoonize.ts` hook → `/api/cartoonize` route (server holds key) → DeepAI Toonify → dataURL back into page state. |
| modify | `.ai/index.md` | Add Cross-cutting "External services (cartoonize)" row linking the two decisions + the pattern. |
| create | `.ai/decisions/deepai-toonify-provider.md` | DeepAI Toonify chosen as cartoonizer provider. |
| create | `.ai/decisions/ephemeral-cartoonize-result-state.md` | `cartoonizeDataUrl` kept in page React state, not persisted. |
| create | `.ai/patterns/lib-service-function-convention.md` | `lib/` service-function convention for external integrations. |

**Steps:**

- [ ] Write `decisions/deepai-toonify-provider.md`: Decision (DeepAI Toonify is the cartoonizer provider, called server-side from `/api/cartoonize/route.ts`); Why (server-only API key → zero client bundle cost, no SDK to add → matches CLAUDE.md dependency-minimization); Rejected (client-side SDK providers; bundling a vendor SDK); Constraints (the API key never reaches the client; provider calls stay in the route/service, not components).
- [ ] Write `decisions/ephemeral-cartoonize-result-state.md`: Decision (`cartoonizeDataUrl` lives in `apps/web/src/app/editor/page.tsx` React state and is not persisted; the `use-cartoonize.ts` hook drives it); Why (Stage-3 scope cap — persistence deferred intentionally); Rejected (persisting to storage/project model now); Constraints (callers must treat the cartoonize result as ephemeral; persistence is a future decision, not an oversight).
- [ ] Write `patterns/lib-service-function-convention.md`: external integrations live as plain async service functions under `apps/web/src/lib/` (`cartoonize-service.ts`, `image-helpers.ts`, `export-helpers.ts`) — not hooks, not components. Cite the 3 sites.
- [ ] Add `architecture.md` cartoonize data-flow entry; link `[[deepai-toonify-provider]]`.
- [ ] Wire `index.md` Cross-cutting "External services (cartoonize)" row to the two decisions + the pattern.
- [ ] Verify paths resolve; anti-wiki test each entry.

**Tests:**

No automated tests — justified because: pure docs change, no behavior.

**Verification:**

- [ ] 2 decision files + 1 pattern file created with correct schema/shape
- [ ] `lib-service-function-convention` cites ≥2 real `lib/` service files
- [ ] Cartoonize data-flow entry states the server-key boundary as the *why*, not the fetch mechanics
- [ ] `index.md` External-services row resolves all links
- [ ] Routing acid test: "where is the cartoonize API?" → `/api/cartoonize/route.ts` + `cartoonize-service.ts`

**Phase review:**

- [ ] All Steps and Verification checkboxes above ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block as the final message of this turn
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent has verified this phase
- [ ] Any changes made in response to code-reviewer suggestions have been reflected back into this plan file
- [ ] Tests for this phase written and passing — or no-tests justification accepted
- [ ] Documentation updated (this phase IS the documentation)
- [ ] Orchestrator (user) has verified and approved this phase
- [ ] Changes committed: `docs(ai): seed KB cartoonize & external-services domain`
- [ ] Phase marked complete

---

### Phase 5: Final Verification — routing acceptance & accuracy audit

**This phase runs after all other phases are complete.**
**Mode:** hil
**Type:** test

**Overall success criteria:**

- A fresh agent given **only** `index.md` + `architecture.md` names the correct
  file paths for sample tasks (routing probes below all pass).
- Every `index.md` row, every decision, and every pattern path resolves to live
  code; nothing fails the anti-wiki test; every pattern genuinely recurs 2+.

**Routing probes (must all resolve correctly from index.md + architecture.md alone):**

1. "Where does overlay export rendering happen?" → `apps/web/src/lib/export-helpers.ts` + `apps/web/src/lib/canvas-post-pass.ts`
2. "Where is editor state mutated?" → `packages/editor/src/editor-state.ts`
3. "Where is the cartoonize API?" → `apps/web/src/app/api/cartoonize/route.ts` + `apps/web/src/lib/cartoonize-service.ts` (client caller: `apps/web/src/hooks/use-cartoonize.ts`)
4. "Where are overlay node defaults (aspect-lock) set?" → `packages/editor/src/defaults.ts` (+ `[[aspect-ratio-locked-default]]`)
5. "Where is the property-panel layout reused?" → `text-style-panel.tsx` + `overlay-controls-panel.tsx` (+ `[[field-row-property-panel-layout]]`)
6. "Which package may NOT import React?" → `@maga/editor` (+ `[[framework-free-editor-package]]`)

**Audit checklist:**

- [ ] Every `index.md` Modules + Cross-cutting row path resolves to a live file/dir
- [ ] Every `decisions/<slug>.md` cited path resolves; all four schema headers present; passes anti-wiki test
- [ ] Every `patterns/<slug>.md` cites ≥2 real sites that still exist; any pattern with <2 live sites is **retired**
- [ ] All `[[slug]]` cross-links point at files that exist
- [ ] `index.md` is still a thin router — no cell contains a paragraph; anything that grew prose is pushed into the linked decision/architecture doc
- [ ] No decision duplicates a pattern (confirm "effects opt-in" lives only in the pattern; confirm aspect-ratio is only a decision)
- [ ] All 6 routing probes above pass from index + architecture alone — each probe's **expected path list** (above) is produced verbatim, and every path in each expected answer is confirmed to resolve to a live file

**Steps:**

- [ ] Every preceding phase's Steps/Verification/Phase review checkboxes are ticked in the plan file
- [ ] Reviewer handoff prompt emitted in a fenced code block (scoped to end-to-end review)
- [ ] Orchestrator cleared context (`/clear`) and pasted the handoff prompt into a fresh session
- [ ] Code-reviewer agent reviews the entire KB end-to-end (accuracy + anti-wiki + thin-index)
- [ ] Any changes made in response to the final review reflected back into this plan file
- [ ] Run all 6 routing probes; fix or retire anything that fails
- [ ] No CLAUDE.md invariants violated
- [ ] Overall success criteria met
- [ ] All phase checkboxes above are ticked
- [ ] Changes committed: `docs(ai): KB routing audit — fixes from accuracy pass`

## Documentation

This entire plan *is* documentation. There is no separate README to update —
the artifacts produced are the documentation.

| Change | Documentation location |
| ------ | ---------------------- |
| Package map + dependency rules | `.ai/index.md`, `.ai/architecture.md` |
| All decisions | `.ai/decisions/*.md` |
| All patterns | `.ai/patterns/*.md` |

## Knowledge Base Impact

**This plan is the knowledge-base seed — its KB impact is the artifacts it
creates.** All `.ai/` artifacts below are authored *by the phases themselves*.
The Phase 5 routing-acceptance & accuracy audit **substitutes for a separate
sync-knowledge closeout pass** — `execute-prd` must **not** double-run
sync-knowledge at closeout for this plan, since the KB *is* the deliverable and
Phase 5 already performs the reconcile + anti-wiki + retire sweep that
sync-knowledge would.

| `.ai/` artifact | Action | What it captures |
| --------------- | ------ | ---------------- |
| `README.md` | update (polish) | confirm Layout table vs populated state |
| `index.md` | populate | thin router: 3 module rows + cross-cutting rows |
| `architecture.md` | populate | system shape, dependency direction, node model, export fidelity, cartoonize flow |
| `decisions/framework-free-editor-package.md` | create | why `@maga/editor` is React-free |
| `decisions/immutable-state-mutation-functions.md` | create | pure mutation fns + thin hook wrapper |
| `decisions/aspect-ratio-locked-default.md` | create | overlays default to locked aspect ratio |
| `decisions/canvas-post-pass-for-export-effects.md` | create | why a native canvas post-pass is needed |
| `decisions/data-overlay-dom-serialization.md` | create | `data-overlay` JSON DOM contract |
| `decisions/deepai-toonify-provider.md` | create | provider choice, server-only key, no SDK |
| `decisions/ephemeral-cartoonize-result-state.md` | create | result kept in page state, not persisted |
| `patterns/effect-field-optional-properties.md` | create | opt-in optional effect fields across 4 sites |
| `patterns/field-row-property-panel-layout.md` | create | shared FieldRow layout across panels |
| `patterns/pixelratio-coordinate-mapping.md` | create | pixelRatio-aware %↔px mapping |
| `patterns/per-item-trycatch-fallback.md` | create | per-item fallback in batch ops |
| `patterns/lib-service-function-convention.md` | create | lib service-function convention |

**Consolidated/dropped under the anti-wiki test:** the candidate "effects
opt-in optional fields" decision is **dropped** — captured only as the pattern
`effect-field-optional-properties` (a recurring code shape, not a one-time
why). "Aspect-ratio preservation" is kept as a **decision (the default)** and
is **not** made a pattern (lock logic lives in a single component).

## Tests

No phase introduces testable application logic — every phase is a pure docs
change under `.ai/`. Verification is by path-resolution + schema checks
(per-phase) and routing probes + accuracy audit (Phase 5), not automated tests.

| Phase | Logic under test | Test file |
| ----- | ---------------- | --------- |
| 1–5 | none (docs only) | n/a — verified by path-resolution, schema, and routing-probe checks |

## Human Summary

**What & why:** The `.ai/` knowledge base is wired into the team's planning
tools but ships empty. This plan fills it in from the code that already exists,
so future agents read a small map-and-decisions index instead of re-scanning
the whole repo every time. The whole point is token savings, so the rule is
**one fact per file** and a **thin index that just routes** — pull the single
file you need, never the whole KB.

**How the phases connect:** Phase 1 lays the foundation — the package map, the
dependency-direction rule, and the one decision that explains why the editor
package has no React. Phases 2–4 each take one subsystem and make it fully
routable end-to-end: editor state & property panels (2), export/compositing
(3), cartoonize/external services (4). Each adds a short architecture
subsection, the decisions whose *why* isn't obvious from code, the patterns
that genuinely recur, and the index links that tie them together. Phase 5 is
the acceptance gate: a fresh agent must route real sample tasks using only the
index + architecture, and every path/decision/pattern is audited against live
code — anything stale, wiki-ish, or only-used-once gets fixed or removed.

**End result:** a small, accurate, decision-oriented KB where every entry earns
its place by the anti-wiki test, and any task in the four domains can be routed
from `.ai/` alone.

**Key trade-offs decided during planning:** the "effects are opt-in" idea is
captured only as a pattern (it's a recurring code shape, not a one-off
decision); aspect-ratio-locked is captured only as a decision-about-the-default
(its logic lives in one component, so it isn't a pattern); and Phase 5's audit
deliberately replaces the usual sync-knowledge closeout, because here the KB is
the deliverable rather than a side effect of a code change.
