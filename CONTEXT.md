# CivicLens

CivicLens helps residents understand documented public infrastructure and contribute attributable observations without presenting AI suggestions or citizen reports as findings of wrongdoing.

## Language

### Public infrastructure

The physical road, bridge, drainage system, building, flood-control work, or facility a resident can observe.
_Avoid_: asset, issue, project (when referring to the physical thing)

### Project

An official government project record describing planned or documented public infrastructure work.
_Avoid_: confirmed physical match, live construction site

### Official record

The source-attributed government data CivicLens displays about a project, including its status, dates, identifiers, and financial metadata when available.
_Avoid_: CivicLens finding, verified truth about current physical conditions

### Resident

A person using CivicLens to explore official records or submit an observation; CivicLens does not independently verify residency.
_Avoid_: citizen (when identity or residency has not been established)

### Community observation

A resident's dated account of something they saw, optionally supported by a photo and location.
_Avoid_: allegation, complaint, anomaly, finding, corruption report

### Evidence

The photo, note, timestamp, and location supplied to support a community observation.
_Avoid_: proof, verdict

### Possible record match

A government project record ranked by CivicLens as a candidate connection for a captured image and reported location.
_Avoid_: confirmed match, AI-verified project, match probability

### Capture point

The location reported for an image or observation, including its location uncertainty; it is not automatically the project's location.
_Avoid_: exact project location, ground truth

### Signal

A source-linked factual relationship shown for review, such as an official completion date followed by a later observation.
_Avoid_: anomaly score, suspicion, red flag

### Observation status

The moderation state of a community observation: unverified, reviewed, or hidden. This state describes CivicLens review, not whether a real-world condition was fixed.
_Avoid_: truth status, accusation status

### Observation outcome

A separately recorded real-world result, such as a reported condition being addressed; it must not be inferred from the observation's moderation status.
_Avoid_: resolved status, moderator verdict

### Observation summary

The public, privacy-limited presentation of a community observation: its category, date, approximate area, text when appropriate, and moderation status without exposing private evidence by default.
_Avoid_: public evidence file, verified report

### Private evidence

An observation's original photo, exact capture location, or identifying metadata that is visible only to the author and authorized moderators unless the resident explicitly chooses broader sharing.
_Avoid_: automatically public photo, proof

### Location uncertainty

The known imprecision of a reported capture point, including browser accuracy and the resident's ability to adjust the point before submitting.
_Avoid_: exact project location, GPS truth

### Explore

The map-led CivicLens experience for browsing official records and community observation summaries without requiring a scan.
_Avoid_: analytics dashboard, GIS console

### Resident mode

The small set of map filters and actions intended for ordinary exploration: category, official status, observations, search, and nearby or barangay scope.
_Avoid_: advanced investigation filters

### Investigation mode

A separate, denser search and filtering surface for moderators, researchers, journalists, and engaged residents.
_Avoid_: default resident experience, dashboard mode

### Scan input

An image and reported capture point supplied for finding possible official record matches; it is private matching input unless the resident explicitly attaches it as observation evidence.
_Avoid_: automatic public evidence, proof of project identity

### Review

An authorized moderator's examination and recorded decision about an observation's visibility or status.
_Avoid_: verification of the physical condition, resolution of the issue

### Official status

The status stated by the official project source, separate from the moderation state of community observations.
_Avoid_: CivicLens status, current physical condition

### Official-source record

The source-attributed government information CivicLens presents about a Project; it is distinct from CivicLens interpretation and Resident-submitted content.
_Avoid_: CivicLens fact, current physical truth

### AI interpretation

Machine-generated classification, clue extraction, or ranking that helps connect Scan input to possible Official-source records; it is not an official record or a Community observation.
_Avoid_: AI finding, verified identity, match probability

### Citizen-submitted observation

The Resident's own account and optional Evidence about observed Public infrastructure, kept distinct from the Official-source record and AI interpretation.
_Avoid_: AI report, official complaint, finding of wrongdoing

### Application shell

The shared CivicLens frame that provides navigation, session boundaries, responsive layout, and route-level states around product surfaces.
_Avoid_: dashboard, map feature, business logic

### Compatibility route

A temporary route that preserves an existing working experience while its replacement is built elsewhere in the application.
_Avoid_: permanent legacy surface, second application shell

### Moderator

An authorized reviewer who evaluates observations, manages their visibility, and records moderation decisions.
_Avoid_: investigator, judge
