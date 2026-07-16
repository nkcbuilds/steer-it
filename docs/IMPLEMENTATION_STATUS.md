# Implementation status

## Completed: foundation

- App scaffold and Devvit configuration.
- Phaser/Matter initialization.
- Shared domain and configuration contracts.
- Deterministic challenge windows and seeded centreline generation.
- Baseline map validation.
- Server health/bootstrap routes.
- Responsive smoke-test views (`Foundation` scene retained for offline checks).

## Completed: physics sandbox (Phase 2)

1. Modular rocket: pixel body texture, separate gimballed nozzle, throttle-scaled flame.
2. Matter body with thrust applied at engine world point below centre of mass (`applyForceFrom`).
3. Keyboard controls: W/S throttle (persistent), Space cutoff, A/D or arrows gimbal with smooth neutral return, R reset.
4. No direct velocity steering and no auto-level; counter-gimbal is required to arrest rotation.
5. Speed safeguards for linear and angular velocity.
6. Responsive sandbox scene with ground pad and grid (`PhysicsSandbox` retained for offline physics checks).
7. Debug arrows and telemetry behind F3 / backtick toggle.
8. Tunables in `src/shared/config.ts` (`ROCKET_PHYSICS`, including `engineOffsetY`).

## Completed: tunnel + touch vertical slice (Phases 3–4)

1. Hand-authored practice shaft (`HANDCRAFTED_TUNNEL_MAP`) using the existing `ShaftMap` centreline contract.
2. Reusable `TunnelBuilder`: linear arc-length sampling (no spline overshoot), tangent normals, left/right walls, matched render path + overlapping static Matter rectangle segments.
3. `TunnelRun` scene is the expanded-view entry (shared challenge when available, else practice map).
4. Camera follow with upward look-ahead, compact viewport framing, scroll clamped to map extents.
5. Explicit `RunController` lifecycle: `ready` → `running` → `crashed` | `completed`; wall crash once; exit sensor complete once; R and visible RETRY restart without reload; elapsed time and fuel burn tracked.
6. Touch controls: bottom-left horizontal gimbal pad (pointer capture, spring-to-neutral), bottom-right vertical persistent throttle slider; large targets for ~320–390 width and short heights.
7. Keyboard remains mapped to the same normalized throttle/gimbal state via `InputController`.
8. Baseline HUD only: state, timer, throttle, fuel, retry banner/button.
9. Dev debug toggle (F3 / `` ` ``): centreline samples, wall samples, segment spines, force arrows, Matter body outlines.
10. Lifecycle/resize-safe layout; CSS prevents page scroll and canvas overflow.

## Completed: backend integration (community challenge path)

- tRPC v11 mounted through the Hono server entry and consumed by a runtime-validated client.
- Deterministic four-hour generated challenge shared by every player on the post.
- Redis keys scoped by post and challenge for attempts, counters, player names, and time rankings.
- Atomic attempt/run idempotency, server-timed plausibility checks, duplicate rejection, and identity from Devvit context.
- Personal-best sorted-set updates and top-ten leaderboard response.
- Shared attempt registration and result submission on completion; HUD `NET` status reports practice/shared/save outcome.
- A 2.5-second bootstrap timeout falls back to the handcrafted practice map instead of leaving a blank expanded view.

## Completed: map editor baseline (Phase 6)

1. Clear **EDIT** button on the run HUD opens the pixel-style `MapEditor` scene.
2. Editor manipulates a local `ShaftMap` centreline draft:
   - drag nodes (start/end endpoints keep locked Y);
   - tap yellow `+` midpoints to insert a node between segments;
   - **DELETE** removes non-endpoint nodes (minimum three points);
   - **W − / W +** adjusts selected node width (generator min/max).
3. Start pad and exit zone stay synced from first/last centreline nodes after every edit.
4. Geometry validation uses the existing shared `validateShaftMap` helper; status shows VALID / INVALID.
5. Live tunnel preview via `TunnelBuilder.buildGeometry` + `drawPreview` (same geometry path as play).
6. **TEST FLIGHT** launches the normal `TunnelRun` scene with the draft map (same physics, tunnel build, input, HUD) without community Redis submit.
7. Test flights show **EDITOR** to return to the draft; **BACK** leaves the editor for normal play.
8. Mobile and desktop usable: large hit targets, drag or mouse-wheel panning, native-scale centered viewport, and fixed chrome bars.
9. No Redis publishing / community map upload in this milestone.

Entry scene: `TunnelRun` via `src/client/game.ts` (also registers `MapEditor`).

## Completed: deployment verification

- `npm run type-check`, `npm run lint`, and `npm run build` pass.
- Devvit release upload completed successfully as `0.0.2`; the live `r/steer_it_dev` playtest refreshed to build `0.0.1.11`.
- Production client source maps are disabled, reducing the largest uploaded WebView asset from about 11.09 MB to 1.43 MB.
- Authenticated Reddit verification confirms the app resolves the signed-in pilot (`nkcbuilds`) and the inline playtest has no browser console errors.

## Completed: production pixel-art pass and generator v2

- Generated, trimmed, and integrated original production assets under `public/assets/pixel-v2`: modular rocket body, gimballed nozzle, directional flame, cavern edge strip, and cavern parallax background.
- The rocket is assembled from separate body/nozzle/flame objects. The nozzle and flame follow the real gimbal angle, while flame length, glow, and particles follow throttle.
- Cave visuals and Matter walls share the same sampled centreline geometry, so art and collision remain aligned through arbitrary bends.
- Cavern edge modules repeat along both procedural walls and the background parallax follows the camera.
- Generator v2 composes deterministic straight, sweep, S-turn, chicane, narrow, and wide modules across 18 points.
- Generated map IDs now include `generated-v2` so v1 and v2 geometry cannot share a leaderboard identity.
- Desktop and 390 x 844 phone layouts were rendered and checked; phone controls remain fully touch-operable without the desktop debug legend covering the launch pad.

## Intentionally not started

Redis map publishing / community map browser, procedural generator flyability automation, scheduled challenge posts, audio, and final editor polish.
