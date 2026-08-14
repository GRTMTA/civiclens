# Separate moderation review from real-world outcome

**Status: accepted.** CivicLens will use `unverified`, `reviewed`, and `hidden` for observation visibility and moderation state; it will not use `resolved` to mean that a physical condition was fixed or that an observation was proven inaccurate. Any future real-world outcome will be a separate, explicitly sourced field.

**Consequences:** The existing database enum and UI labels require an additive, reviewed migration before implementation; moderator actions must record what CivicLens did, while copy must not imply what happened outside the platform.
