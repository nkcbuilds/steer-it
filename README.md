# Steer It

Steer It is a physics-based rocket game built for Reddit with Devvit Web. Players control engine throttle and gimbal angle to guide a rocket from the bottom of a narrow procedural shaft to the surface. The rocket is driven by forces and torque—there is no direct steering or automatic leveling.

The app runs directly inside a Reddit post: a lightweight inline view previews the active shaft, while the expanded view launches the full Phaser game.

## Features

- Physics-driven rocket flight using Phaser's Matter.js integration
- Separate throttle and engine-gimbal controls
- Keyboard and mobile touch controls
- Procedurally generated four-hour challenges shared by everyone on a post
- Deterministic shaft generation and map validation
- Matter.js wall collisions, crash detection, exit sensing, fuel use, and run timing
- Reddit-authenticated attempts and server-validated result submission
- Redis-backed attempt counters, personal bests, and top-10 leaderboards
- Automatic local practice mode when the shared challenge cannot be reached
- In-game shaft editor with node dragging, insertion, deletion, width controls, validation, and test flights
- Responsive inline and expanded Reddit views
- Pixel-art rocket, cavern, launch, exit, UI, and explosion assets
- Optional physics and tunnel debug overlays

## Technology

- Reddit Devvit and Devvit Web
- Phaser 4 and Matter.js
- TypeScript, HTML5, and CSS3
- Node.js 22 serverless runtime
- Hono
- tRPC 11
- Redis through Devvit
- Zod
- Vite
- ESLint and Prettier

React is not used in this project. The client is written in TypeScript and rendered with Phaser, Canvas/WebGL, HTML, and CSS.

## How the game works

Every Reddit post hosts a shared challenge. The server derives the active four-hour challenge window, generates the same shaft from a deterministic seed, and returns the map and leaderboard through tRPC. Players begin an authenticated attempt, fly the shaft in the expanded webview, and submit a result after reaching the exit.

The backend uses Reddit's trusted post and user context instead of accepting identity from the browser. Attempts are recorded before a run, expire automatically, and are checked for ownership, challenge identity, duplicate submission, and plausible elapsed time. Redis stores post-scoped counters and each player's fastest completion.

If the server is unavailable, the client falls back to a bundled handcrafted practice shaft. Practice runs remain local and are not submitted to the leaderboard.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Increase throttle | `W` or `Up` | Move the right throttle slider upward |
| Decrease throttle | `S` or `Down` | Move the right throttle slider downward |
| Cut throttle | `Space` | Move the throttle slider to zero |
| Gimbal left/right | `A` / `D` or arrow keys | Drag the left gimbal control |
| Retry | `R` or the on-screen **Retry** button | Tap **Retry** |
| Debug overlay | `F3` or backtick | — |

Throttle persists after input. The gimbal returns to neutral when released, but the rocket keeps its angular momentum; counter-gimbal input is required to stop a rotation.

## Architecture

```text
Reddit post
├── Inline view (splash.html)
│   └── Challenge preview and play button
├── Expanded view (game.html)
│   └── Phaser scenes, Matter physics, controls, HUD, and editor
└── Devvit server
    ├── Hono HTTP routes
    ├── tRPC challenge and result API
    ├── Reddit identity/post context
    └── Redis leaderboards and attempt state
```

The source is divided by runtime boundary:

| Path | Purpose |
| --- | --- |
| `src/client` | Inline view, expanded Phaser game, scenes, controls, HUD, and editor |
| `src/server` | Devvit server, Hono routes, tRPC procedures, Reddit actions, and Redis keys |
| `src/shared` | Domain types, physics settings, map generation, validation, and deterministic challenge logic |
| `public/assets` | Pixel-art game assets |
| `docs` | Architecture, physics, map format, implementation status, and manual test notes |
| `tools` | TypeScript project configurations for each runtime target |

### Client

`src/client/game.ts` configures Phaser with Matter physics and registers the playable `TunnelRun` and `MapEditor` scenes. Gameplay responsibilities are split across focused modules:

- `RocketPhysics`: rocket body, gimballed engine, thrust, torque, drag, and speed limits
- `InputController` and `TouchControls`: normalized keyboard and touch input
- `TunnelBuilder`: matching visual and collision geometry from shaft centerline samples
- `RunController`: ready, running, crashed, completed, and retry states
- `RunHud`: timer, fuel, throttle, run state, network status, results, and editor entry
- `TunnelDebugOverlay`: collision geometry and force visualization

### Server

The Node.js server runs Hono and exposes tRPC at `/api/trpc`. The current router provides:

- `currentChallenge`: generated map, challenge metadata, counters, and leaderboard
- `leaderboard`: current top times and personal best
- `beginAttempt`: creates an expiring, idempotent server-side attempt ticket
- `submitResult`: validates and records a completed run and updates personal bests

The app also registers a subreddit moderator menu action and an install trigger in `devvit.json` to create Steer It posts.

## Local development

### Prerequisites

- Node.js `22.2.0` or newer
- npm
- A Reddit account with access to Devvit

### Install

```bash
git clone https://github.com/nkcbuilds/steer-it.git
cd steer-it
npm install
```

Log in to Devvit:

```bash
npm run login
```

Start a Reddit playtest:

```bash
npm run dev
```

The Devvit CLI uploads a development build, creates or reuses a private test subreddit, and prints the playtest URL. The configured development subreddit is `r/steer_it_dev`.

> The Devvit app name `steer-it` is globally registered. Forks intended for deployment must use their own app name in `devvit.json`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run a Devvit playtest |
| `npm run build` | Create production client and server bundles with Vite |
| `npm run type-check` | Type-check all TypeScript project targets |
| `npm run lint` | Run ESLint over TypeScript source files |
| `npm run prettier` | Format the repository with Prettier |
| `npm run deploy` | Type-check, lint, and upload a Devvit build |
| `npm run launch` | Upload and publish the Devvit app |

Before opening a pull request, run:

```bash
npm run type-check
npm run lint
npm run build
```

## Configuration

- `devvit.json` defines the inline and expanded entrypoints, server bundle, menu item, install trigger, and development subreddit.
- `src/shared/config.ts` contains rocket physics and generator tuning values.
- `vite.config.ts` integrates the Devvit Vite plugin and disables production source maps.
- Redis access, Reddit API access, and runtime context are provided by `@devvit/web/server`; no local Redis connection string is required.

## Current scope

Implemented today:

- Complete playable tunnel flight loop
- Desktop and touch input
- Procedural shared challenges
- Server-validated attempts and results
- Redis leaderboards
- Local shaft editor and test flights
- Inline Reddit preview and expanded gameplay
- Production pixel-art visual pass

Not yet implemented:

- Publishing editor-created maps to Redis
- Community map browsing
- Automated generator flyability simulation
- Scheduled challenge posts
- Audio
- Final editor polish

See [Implementation Status](docs/IMPLEMENTATION_STATUS.md) for the detailed milestone history.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Implementation Status](docs/IMPLEMENTATION_STATUS.md)
- [Manual Testing](docs/MANUAL_TESTING.md)
- [Map Format](docs/MAP_FORMAT.md)
- [Physics Contract](docs/PHYSICS.md)

Devvit documentation: [developers.reddit.com/docs](https://developers.reddit.com/docs/)

## License

This project is distributed under the [BSD 3-Clause License](LICENSE).
