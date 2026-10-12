# Enemy form studies

Open `client/previews/enemy-models.html` through a local HTTP server. A/B/C use the same camera, light rig and animation time. Drag to rotate, scroll to zoom, select one candidate for close inspection, or toggle the walking study.

- A / ASH: warm ceramic, narrow face recess, continuous chest shell.
- B / SLATE: graphite armor, wider chest, smoked visor.
- C / VEIL: open hood, matte fabric, long coat.

`EnemyModels.build(THREE, id)` returns a root group and `pose(seconds, walking)`, `reset()` and `dispose()` methods. Units are metres, +Y up, +Z forward. All parts are original procedural geometry; no downloaded assets or external dependencies are used.

`client/assets/enemies/enemy-{ash,slate,veil}.glb` contains geometry, PBR materials and the articulated rigid node hierarchy in its rest pose. The walking preview is procedural JavaScript; animation clips and skin weights are not included in the GLB. Run `node client/tests/enemy-models.cjs` from the worktree root to validate geometry, dimensions, node export and disposal, and regenerate the GLBs.

These are visual selection candidates. They are not connected to combat, hit volumes, or the live enemy renderer. Before adoption, fit the selected candidate to GRUNT dimensions and head band, verify FPS hit alignment, share/merge suitable materials and geometry, and check crowd rendering cost. The coat uses a reduced stride to keep the rigid cloth clear of the legs.
