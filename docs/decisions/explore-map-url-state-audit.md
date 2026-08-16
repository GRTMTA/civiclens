# Explore map URL-state audit

Status: audit complete; no URL behavior changed by this decision record.

## Current behavior

The Explore map reads three camera parameters from the browser URL when the page initializes: `lat`, `lng`, and `zoom`. It also reads the optional `project` parameter and uses it to start the selected-project state. Browser back/forward handling reads the same values and flies the map to a valid camera state when one is present.

The current write helpers intentionally remove camera parameters instead of writing the passed camera value:

- A settled map movement calls `writeCameraSearch`, which deletes `lat`, `lng`, and `zoom` before the current search string is written with `history.replaceState`.
- Selecting a project calls `writeProjectSearch`, which deletes the camera parameters and then adds `project=<id>` before `history.pushState`.
- Closing a project calls `writeProjectSearch` without an ID, which removes both `project` and any camera parameters before `history.replaceState`.

For example, a URL such as `?project=dpwh-1&lat=10.3&lng=123.8&zoom=12` becomes `?project=dpwh-1` after the next settled viewport write. Selecting another project produces `?project=dpwh-2`, also without camera parameters. A reload can therefore use camera state only when the original URL still contains it; normal map movement does not preserve it.

## Minimum future contract

Any later URL change should be approved separately from the workspace redesign and should:

1. Keep `project` as the authoritative selected-record deep link.
2. Decide explicitly whether `lat`, `lng`, and `zoom` are canonical persisted camera state.
3. Preserve unrelated query parameters when writing map state.
4. Use replacement history for continuous camera movement and a deliberate push/replace policy for project selection and closing.
5. Keep browser back/forward, reload, and selected-project loading behavior consistent with the approved contract.

This ticket records the discrepancy and the decision boundary. It does not change routing, browser history, camera persistence, or the existing URL helper behavior.
