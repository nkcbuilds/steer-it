# Manual testing

## Foundation smoke test

- Run `npm run type-check`, `npm run lint`, and `npm run build`.
- Run `npm run dev` and open the returned Reddit playtest URL.
- Confirm the inline post says Steer It and opens expanded mode.
- Confirm expanded mode reports `Foundation connected` and `Matter ready` only when the Foundation scene is wired (default entry is now `TunnelRun`).
- Resize the browser and confirm the canvas continues filling the viewport.
- Confirm `/api/bootstrap` logs no map-validation error.

## Physics sandbox checklist (offline / optional)

- Temporarily set the game entry scene to `PhysicsSandbox` if re-validating Phase 2.
- Expanded view loads the Physics Sandbox (grid + rocket + help text).
- W raises throttle and holds it when released; S lowers; Space cuts to zero.
- A/D or arrows gimbal the nozzle; release returns nozzle to neutral without stopping spin.
- Angled thrust at partial throttle rotates the rocket (torque from engine offset).
- Counter-gimbal is required to arrest rotation (no auto-level).
- R resets position, velocities, throttle, and gimbal.
- F3 or backtick toggles debug arrows (vel / thrust / exhaust) and telemetry.
- Resize the viewport; canvas and ground pad remain usable.
- Linear/angular speed do not run away unboundedly under continuous thrust.

## Tunnel run checklist (Phases 3–4 — default entry)

### Layout / lifecycle

- Expanded view loads the hand-authored practice shaft (dark rock, tunnel void, start pad, teal exit).
- No page scrolling; canvas fills the webview without overflow.
- Resize / rotate (390×844 and short ~320×512-ish heights): camera zoom fits width, HUD and touch pads remain usable, no layout crash.

### Flight / physics

- Keyboard controls match sandbox behaviour (W/S throttle, Space cutoff, A/D gimbal, R retry).
- Thrust still applies at the engine point; angled gimbal produces torque; no auto-level.
- Touch: bottom-left horizontal gimbal pad captures pointer and springs to neutral on release.
- Touch: bottom-right vertical throttle slider is persistent (top = full throttle).
- Keyboard and touch drive the same normalized control state.

### Run state

- Starts in `READY`; applying throttle transitions to `RUNNING`.
- Any rocket–wall collision transitions once to `CRASHED` (no thrash / multi-crash).
- Crossing the exit sensor transitions once to `COMPLETED`.
- HUD shows state, elapsed time, throttle %, fuel %.
- R or visible RETRY restarts pose, fuel, timer, and state without page reload.

### Debug

- F3 or backtick toggles centreline samples, wall samples, segment spines, force arrows, telemetry, and Matter body outlines.

## Later gameplay checklist

- Two-account leaderboard persistence.
- Community maps / editor.
- Automated flyability validation.
- Final art polish.
