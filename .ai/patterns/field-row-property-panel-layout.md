# Property-panel field-row layout

Property panels lay out every control as a vertical **label-above-control row**:
a muted, small-text label stacked over its input. Both
`apps/web/src/components/text-style-panel.tsx` and
`apps/web/src/components/overlay-controls-panel.tsx` express this with a local
`FieldRow` wrapper used for every field in the panel.

**The convention:** when adding a control to a property panel, wrap it in the
panel's `FieldRow` (label + control) rather than hand-rolling a one-off layout.
This keeps spacing, label styling, and stacking consistent across panels.

**Why it's a pattern:** the same row layout already recurs across both property
panels (a genuine 2nd use). Currently each panel declares its own byte-identical
`FieldRow` locally — a future panel should follow the same convention. The
duplication is a standing candidate for extraction into one shared `FieldRow`
component; until then, match the existing convention rather than inventing a new
row layout.
