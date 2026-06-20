# `/editor` folded into a single `/batch` workspace

**Decision:** There is one editor surface, the `/batch` workspace. `/editor`
is now a server `redirect()` to `/batch`; the single-image editing flow lives as
a section inside the batch workspace, navigated by a `?section=` query param via
`WorkspaceSideNav`.

**Why:** The two routes never shared navigation or state, so the user lost context
crossing between them and the single/batch flows duplicated chrome. Single editing
is just batch with one overlay — folding them removes the duplicated shell and
makes one place to load a background, set a template, edit, and export.

**Rejected:** Keeping `/editor` and `/batch` as separate routes. That keeps the
duplicated navigation/actions chrome and the context loss; nothing in the single
flow is absent from batch.

**Constraints it creates:** Don't reintroduce a standalone editor route. New
top-level surfaces are sections under `/batch` (a `WorkspaceSideNav` entry +
`?section=` value), not new routes. `/editor` must stay a redirect for old links.
