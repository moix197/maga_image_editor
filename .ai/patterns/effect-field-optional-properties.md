# Optional, opt-in overlay effect fields

Overlay visual effects are modelled as **optional** node properties that are
**opt-in** — absent by default, never always-on. Adding an effect means
threading the same optional field through four sites, each of which must treat
"field absent" as "effect off":

1. **`packages/editor/src/types.ts`** — declare the field optional (`?`), e.g.
   `dropShadow?: DropShadow`, `featherRadius?: number`.
2. **`packages/editor/src/defaults.ts`** — **omit** it from `DEFAULT_OVERLAY_NODE`.
   Omission is what makes the effect opt-in: a fresh node has no effect.
3. **`apps/web/src/components/overlay-controls-panel.tsx`** — surface it in the
   UI as a toggle/slider that sets the field (and clears it back to `undefined`
   to turn the effect off).
4. **`apps/web/src/lib/canvas-post-pass.ts`** — bake it into export, guarding on
   absence (`node.featherRadius ?? 0`, `if (node.dropShadow) …`) so an unset
   field is a no-op.

**Why this is a pattern, not a decision:** it is a recurring code *shape* that
already spans at least two effect fields (`dropShadow`, `featherRadius`) across
the same four files. The shape is the captured knowledge: every new effect
repeats it, and skipping any one site (e.g. setting a default, or not guarding
the post-pass) breaks the opt-in invariant. This is the single place where
"overlay effects are opt-in" is recorded.
