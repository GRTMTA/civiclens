# 02 — Fixed Desktop Panel Collapse

**What to build:** Desktop users can temporarily hide and restore the approximately 400px project workspace while the map expands into the released space.

**Blocked by:** 01 — Contextual Project Workspace.

**Status:** ready-for-agent

- [ ] The default desktop panel is fixed-width and leaves the map as the primary surface.
- [ ] The expanded panel has an explicit `Hide projects` control.
- [ ] The collapsed map exposes a discoverable `Show projects · N` control rather than an unexplained chevron.
- [ ] Collapse state is temporary presentation state and is not written into the URL.
- [ ] Selecting a project while collapsed reopens the panel.
- [ ] Collapsing from project details preserves the selected project so reopening returns to those details.
- [ ] The map is correctly resized after panel collapse and restoration.

