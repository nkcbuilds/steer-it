# Steer It production pixel-art pass

The user rejected the current placeholder look. Implement a production-quality frontend visual overhaul while preserving the working Matter physics, reaction-force direction, collisions, tRPC/Redis behavior, map editor, and mobile/desktop controls.

Reference images:

- `C:\Users\chnav\AppData\Local\Temp\codex-clipboard-39e7a7ae-b794-4b86-a945-60b1fa9bb9a1.png`
- `C:\Users\chnav\AppData\Local\Temp\codex-clipboard-3730afab-904a-4ba1-a3e2-2f9c2004adbf.png`
- `C:\Users\chnav\AppData\Local\Temp\codex-clipboard-5a93c9d5-7384-4229-ad63-c20eddd7f477.png`

Production assets already generated, chroma-keyed, cropped, pixel-scaled, and validated:

- `public/assets/pixel-v2/rocket-body.png` - 60x132 transparent
- `public/assets/pixel-v2/rocket-nozzle.png` - 30x50 transparent
- `public/assets/pixel-v2/rocket-flame.png` - 30x114 transparent
- `public/assets/pixel-v2/cavern-edge.png` - 512x62 transparent modular strip
- `public/assets/pixel-v2/cavern-background.png` - 512x910 opaque parallax texture

Requirements:

1. Preload and use the new rocket, nozzle, and flame assets instead of generated placeholder textures. Body and nozzle remain separate. Nozzle and flame rotate with the actual gimbal. Animate the flame with controlled pixel-preserving scale/flicker and particles, not chaotic random deformation.
2. Render the cavern background as a camera-following or tiled parallax layer behind the playable shaft.
3. Use the cavern edge as reusable overlapping rock modules following both wall polylines, rotated to the local tangent and oriented so the highlighted playable edge faces into the tunnel. Keep collision geometry unchanged and aligned.
4. Replace flat industrial wall fill, blue lines, and non-debug centreline with layered cave darkness, rock mass, edge shadows and highlights. Centreline must be debug-only.
5. Redesign `RunHud` and `TouchControls` as compact pixel-game UI: translucent dark panels, amber/cyan accents, readable timer/fuel/throttle, minimal obstruction. Touch controls remain large and obvious on phone.
6. Add restrained flame light, sparks/embers, crash burst and exit beacon if feasible with Phaser built-ins.
7. Improve generated maps into visibly twisty but safe shafts using deterministic curve modules or constrained direction states: straights, soft left/right sweeps, S-turns, chicanes, narrow/wide sections. Preserve bottom-to-top order, minimum clearance, determinism and validator compatibility. Avoid impossible sharp corners.
8. Keep the editor preview visually usable.
9. Do not change the server or Redis contracts unless required to keep shared generated maps deterministic.
10. Follow `AGENTS.md`: no TypeScript casts, prefer type aliases and named exports.
11. Run `npm run type-check`, `npm run lint`, and `npm run build`, fixing every failure.

Make the changes directly. Finish with a concise file-by-file summary and remaining concerns.
