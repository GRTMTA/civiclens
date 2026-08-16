# 06 — Stable Refresh, Error, and Notification Semantics

**What to build:** Viewport refreshes and failures communicate clearly without blanking usable records or duplicating the same event across alerts, map notices, and toasts.

**Blocked by:** 01 — Contextual Project Workspace.

**Status:** ready-for-agent

- [ ] Existing records remain visible during viewport refreshes with a subtle updating state.
- [ ] Viewport/data failures use contextual map or list messaging with Retry.
- [ ] Map-provider failures remain persistent map states.
- [ ] Truncation is communicated through one contextual surface and does not generate a toast.
- [ ] No Sonner dependency or notification surface is added unless a later decision requires temporary action feedback.

