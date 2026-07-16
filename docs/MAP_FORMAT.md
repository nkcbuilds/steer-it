# Map format

`ShaftMap` stores a bottom-to-top centreline. Points must have decreasing Y values and each point carries a local tunnel width.

## TunnelBuilder (implemented)

`TunnelBuilder` in `src/client/gameplay/TunnelBuilder.ts`:

1. samples the centreline by arc length with **linear** interpolation only (no spline overshoot);
2. derives tangent and normal vectors at each sample;
3. offsets by half-width to create left and right walls;
4. uses the **same samples** for the visible tunnel void/edges and Matter static collision segments;
5. builds wall collisions as overlapping oriented rectangles along each wall edge;
6. places the exit as a static sensor from `map.exit`.

## Hand-authored practice map

`src/shared/handcraftedMap.ts` exports `HANDCRAFTED_TUNNEL_MAP` for the Phase 3–4 vertical slice. It is a valid `ShaftMap` with start pad near the bottom and an exit sensor near the top.

## Generator note

The deterministic generator already creates conservative centreline maps. Geometry intersection checks, curvature checks, and automated flyability validation remain later phases. Community maps and the map editor are out of scope for this slice.
