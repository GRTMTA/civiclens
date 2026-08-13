# Viewport-driven MapLibre map

**Status: accepted.** CivicLens will use MapLibre GL JS through `react-map-gl/maplibre` for the resident map, with server-driven PostGIS viewport queries and clustered GeoJSON source/layer rendering. React components will own selected drawers, popups, and controls rather than rendering every project or observation as an individual marker.

**Consequences:** The backend needs a bounded map query contract and explicit project/observation layer provenance; map state should be URL-addressable; point geometry is the prototype scope, with future line or polygon geometry kept as an extension rather than inferred from points.
