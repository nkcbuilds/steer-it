# Architecture

## Runtime split

- `src/client/splash.*`: lightweight inline Reddit-post view.
- `src/client/game.ts`: expanded Phaser entrypoint (`TunnelRun` scene).
- `src/client/scenes`: gameplay scenes.
  - `TunnelRun`: active expanded-view playable tunnel + touch controls.
  - `PhysicsSandbox`: Phase 2 open sandbox retained for offline physics checks.
  - `Foundation`: bootstrap smoke test.
- `src/client/gameplay`: rocket physics, input, tunnel build, run lifecycle, HUD, debug overlays.
- `src/server`: Hono routes running in Devvit's trusted server environment.
- `src/shared`: deterministic domain logic shared by browser and server (including handcrafted maps).

The client never supplies Reddit identity. The server reads identity and post context from `@devvit/web/server`.

## Gameplay module boundaries

1. `RocketPhysics` owns the Matter body, engine application point, forces, and limits.
2. `InputController` normalizes keyboard and touch into throttle and gimbal commands.
3. `TouchControls` renders large on-screen pads and writes into `InputController`.
4. `TunnelBuilder` converts centreline samples into matching render and collision geometry.
5. `RunController` owns the explicit run state machine and retry lifecycle.
6. `RunHud` displays baseline timer / throttle / fuel / state / retry only.
7. Server repositories (later) own Redis key construction and persistent results.

The editor, official generator, and hand-authored maps all produce the same `ShaftMap` contract.

## Tunnel collision construction

`TunnelBuilder` samples the authored centreline by arc length with **linear** segment interpolation only (no spline that can overshoot control points). At each sample it derives:

- unit tangent along travel (bottom → top);
- unit normal pointing left relative to travel;
- left/right wall points at half local width.

Wall collision uses **overlapping static rectangles** along each wall edge (same samples as render). Segments are slightly longer than their edges so neighbors overlap for dependable Matter contact. The exit is a static sensor rectangle from `ShaftMap.exit`.

## Touch mapping

| Control | Mapping |
| --- | --- |
| Bottom-left horizontal pad | Gimbal ∈ [-1, 1] → ±`maxGimbalRadians`; release springs to neutral |
| Bottom-right vertical slider | Absolute throttle ∈ [0, 1]; top = full; value persists on release |
| Keyboard W/S / Space / A/D | Same throttle/gimbal state machine; Space cutoff |
| R / HUD RETRY | `RunController.retry()` + rocket reset, no page reload |
