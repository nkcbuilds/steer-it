# Physics contract

Steer It uses Matter Physics. Screen X increases rightward and screen Y increases downward, so gravity is positive Y.

The player controls two physical inputs:

- engine gimbal angle, limited initially to plus or minus 30 degrees;
- throttle from zero to one.

Thrust must be applied at a point below the rocket's centre of mass. The force is opposite the exhaust direction, so an angled engine creates both linear acceleration and torque. Input must never directly set horizontal velocity or rocket rotation. Returning the nozzle to neutral must not erase angular momentum.

Initial tunable values live in `src/shared/config.ts` (`ROCKET_PHYSICS`). They are placeholders for sandbox tuning, not final balance.

## Phase 2 sandbox (implemented)

### Modules

| Module | Responsibility |
| --- | --- |
| `src/client/gameplay/RocketPhysics.ts` | Matter body, engine force point, thrust application, speed clamps, modular visuals |
| `src/client/gameplay/InputController.ts` | Keyboard + touch → throttle / gimbal / reset / debug-toggle |
| `src/client/gameplay/PhysicsDebugOverlay.ts` | Force/velocity/exhaust arrows + telemetry (sandbox) |
| `src/client/gameplay/rocketTextures.ts` | Pixel-style body, nozzle, and flame textures |
| `src/client/scenes/PhysicsSandbox.ts` | Open responsive sandbox scene (no tunnel) |

### Force model

1. Gimbal angle is measured relative to the rocket body (0 = exhaust straight aft).
2. Exhaust direction is local `+Y` rotated by gimbal, then by body rotation.
3. Thrust force = `maxThrust * throttle` in the **opposite** exhaust direction.
4. Force is applied with `applyForceFrom` at the engine world position (`engineOffsetY` below CoM).
5. Matter derives torque from the lever arm; no manual torque writes, no velocity steering, no auto-level.

### Input map

| Control | Behaviour |
| --- | --- |
| W / Up | Increase throttle (persistent) |
| S / Down | Decrease throttle (persistent) |
| Space | Immediate throttle cutoff |
| A / Left | Gimbal left |
| D / Right | Gimbal right |
| (release gimbal) | Smooth return to neutral at `gimbalReturnRadiansPerSecond` |
| Touch gimbal pad | Absolute normalized gimbal while held; spring on release |
| Touch throttle slider | Absolute throttle; persists on release |
| R | Reset / retry pose, velocities, and controls |
| F3 or `` ` `` | Toggle debug arrows and telemetry |

### Safeguards

- Linear speed clamped to `maxLinearSpeed`.
- Angular speed clamped to `maxAngularSpeed`.
- `frictionAir` uses `linearDrag`; angular velocity is additionally damped by `angularDrag` each frame without zeroing momentum on gimbal release.

### Debug

When enabled, the overlay draws:

- cyan: linear velocity
- orange: thrust force at the engine point
- red: exhaust direction
- white dot: engine application point

Telemetry lists position, angle, speed, angular velocity, throttle, gimbal, and force components.

## Phase 3–4 tunnel run (implemented)

Force-at-engine behaviour is unchanged. Additional modules:

| Module | Responsibility |
| --- | --- |
| `TunnelBuilder` | Centreline sampling, wall paths, render + overlapping Matter segments |
| `RunController` | ready / running / crashed / completed + fuel/time |
| `TouchControls` | On-screen gimbal pad + throttle slider |
| `RunHud` | Baseline state / timer / throttle / fuel / retry |
| `TunnelDebugOverlay` | Geometry samples + force debug for the tunnel scene |
| `TunnelRun` | Active playable entry scene |

Wall contacts crash the run once. The exit sensor completes the run once. Fuel burns with throttle while running; empty fuel zeros effective thrust.
