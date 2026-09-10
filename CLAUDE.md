# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

An Electron + plain-Node desktop tool that repairs GLB (glTF 2.0 binary) models that open fine in 3D viewers but fail to render in Cesium, then previews the result in a bundled local Cesium. The core is a **hand-written GLB binary parser/repacker with no third-party glTF libraries** — all format handling lives in the code, not in a dependency.

The app is split into two layers:

- `src/repair.js` — the repair engine. Pure Node (CommonJS), no Electron or npm runtime deps, so it runs and tests under plain `node`.
- `src/main.js` + `src/preload.js` + `src/renderer.js`/`index.html` — the standard Electron main/preload/renderer shell over IPC.

**All UI strings, log lines, and thrown error messages are Chinese (zh-CN);** keep new user-facing strings Chinese for consistency. The design doc (`docs/001-code-design.md`) and issue analysis (`docs/cesium-glb-load-issues.md`) are Chinese too.

## Commands

- `npm install` — installs the Electron dev toolchain.
- `npm run dev` / `npm start` — runs `ensure:cesium` then launches Electron (app entry is `src/main.js`).
- `npm run ensure:cesium` — downloads the Cesium 1.128 release zip and unpacks it to `vendor/cesium/1.128/Build/Cesium/` only if `Cesium.js` + `Widgets/widgets.css` are missing. Needed before `dev`/`start` because `index.html` loads Cesium from that exact relative path as a plain global `<script>` (no bundler).
- `npm run lint` — `node --check` (syntax check only) over the four `src/*.js` files. Not a style linter.
- `npm test` — Node's built-in test runner (`node --test`), which discovers `test/*.test.js`.
- Run one test file: `node --test test/repair.test.js`. Filter by name: `node --test --test-name-pattern='external PNG'`.
- `npm run dist:win` — `electron-builder` Windows x64 NSIS + portable into `dist/`.

**Image transcoding is self-contained:** non-PNG images (JPEG) are converted to PNG in-process via the `jpeg-js` + `pngjs` production dependencies (`encodePng` in `src/repair.js`). Do NOT shell out to an external binary like `ffmpeg` here — packaged end-user apps have none, which produced `spawnSync ffmpeg ENOENT`. `jpeg-js`/`pngjs` must stay under `dependencies` (not `devDependencies`) or electron-builder won't package them into the asar.

Several directories the code depends on are **gitignored and present only locally**: `vendor/cesium/` (downloaded by `ensure:cesium`), `refs/models/*.glb` (fixtures that `npm test` copies), and `model/` (scratch sample GLBs). After a fresh clone, `npm run dev` regenerates `vendor/cesium/`, but the tests need the fixture GLBs restored to pass.

## Repair pipeline (`src/repair.js`)

`repairGlbFile(inputPath, outputPath)` reads a GLB, mutates the parsed JSON + BIN in place, and writes a new file. One call repairs one file and **never throws** — it returns a `report` object with `status: 'success' | 'error'` and a Chinese `error` message on failure, so `repairMany` (batch/directory scan) keeps going past bad files. A repaired file keeps the original's basename in the chosen output dir (BR-001).

Steps run in this order; each has byte-layout consequences:

1. **`bakeSkinnedMeshes`** — bakes skinned primitives (mesh nodes with `skin`; `JOINTS_0`/`WEIGHTS_0` attrs) to static ones. It does its own node/scene walk (`computeNodeGlobalMatrices`), TRS→matrix and 4×4 inverse math, and per-vertex skinning with up to 4 influences using `inverseBindMatrices`. Rewrites POSITION/NORMAL accessor bytes and **recomputes `accessor.min`/`max`** (Cesium reads these for culling/framing — stale bounds are a root cause of "loads but invisible"). Strips `JOINTS_0`/`WEIGHTS_0`, and if any mesh was baked, deletes `skins` and `animations`.

   **Pose freezing:** by default it bakes to the **bind pose** — so an animated character whose action (e.g. a crouch) lives only in its animation clip would collapse to the standing bind pose. Pass `options.poseTime` (a number of seconds, or `'start'`/`'end'` of animation index `options.animationIndex`, default 0) to first sample the glTF animation (LINEAR slerp/lerp + STEP are handled via `computePosedLocalMatrices`/`sampleAnimationChannel`) and bake in that posed frame instead. The app exposes this as the "烘焙为动画起始姿势" checkbox (`freezePose` → `poseTime: 'start'`). A file with no animation is unaffected (resolves to `null`).
2. **Image normalization** — for each `image`, either read its `bufferView` bytes out of the BIN, or resolve an external `uri` via `resolveExternalImage`. PNGs are kept as-is; JPEG bytes are converted to PNG in memory by `encodePng` (`jpeg-js` decode → `pngjs` encode). Any other image format throws a per-file error telling the user to supply PNG/JPEG. Every image ends up `mimeType: 'image/png'`. `resolveExternalImage` handles data URIs, absolute paths (incl. Windows `C:\...`), relative paths, and recursive by-name search next to the GLB (catches `.fbm` folders). A missing external image throws a recovery message telling the user to place the file / its `.fbm` dir beside the GLB.
3. **`stripSpecularExtensions`** — removes `KHR_materials_specular` from `extensionsUsed`, `extensionsRequired`, and per-material `extensions` (empty arrays/objects are deleted, not left as `[]`/`{}`).
4. **`fillMissingTexCoords`** — for a primitive whose material samples a texture (any of `baseColorTexture` / `metallicRoughnessTexture` / `normalTexture` / `occlusionTexture` / `emissiveTexture` / a `*Texture` in an extension) at `texCoord: n` but which has no `TEXCOORD_n` attribute, appends a zero-filled float32 `VEC2` accessor sized to the primitive's `POSITION.count`. Such primitives otherwise make Cesium generate a fragment shader referencing an undeclared varying — the compile failure stops rendering for the **whole scene**, not just that model.
5. **`mergePrimitivesByMaterial`** — the Cesium scalability fix. Cesium 1.128's model load time grows super-linearly with primitive count (measured: 6 prims 0.6s, 50 prims 9.3s, 100+ never finishes). When a file has more than `options.mergePrimitiveThreshold` primitives (default 100), primitives sharing a material and an attribute format are merged into one, baking each mesh node's **world matrix** into POSITION (via `transformPoint`) and NORMAL (via `transposeMatrix(invertMatrix(...))` + `transformVector`). Zero-filled `TEXCOORD_n` is synthesized for members lacking it, so UV presence never splits a group. **Triangle winding is reversed per primitive when `determinant3(world) < 0`** — many of these models use mirrored nodes and every material is `doubleSided`, so skipping this inverts lighting without changing the silhouette. Merged indices are always `uint32`. New streams go into **appended** bufferViews (never reuse a source view: an accessor can be shared across material groups). Consumed meshes get `primitives: []` (not just the surviving one) because `getPositionBounds` in `main.js` unions every mesh's POSITION `min`/`max` with no node-transform awareness. Scene restructuring appends an identity root node holding the merged mesh, so no existing index needs remapping. It **skips** (whole file, no-op) on Draco/meshopt, morph targets, animations, skinned bakes, instanced meshes, non-TRIANGLES modes, non-float32 attributes, sparse accessors, interleaved views, multi-buffer files, or nodes unreachable from the default scene.
6. **`rebuildBinary`** — the repack pass. BufferView bytes that changed are supplied as a `Map<bufferViewIndex, Buffer>` (from steps 1–2, 4–5). It sorts views by original `byteOffset`, re-emits gaps as-is, **keeps every 4-byte alignment**, and rewrites each `bufferView.byteOffset`/`byteLength` and `buffers[0].byteLength`.
7. **`appendBufferViewToBinary`** — external or newly-converted external images (now PNG) are appended as new `bufferView`s; their `uri` is deleted and `mimeType` set to `image/png`. Steps 4–5 use the same helper to append merged/UV bytes.

Appending steps thread a `workingBin` (`let workingBin = bin`) and register their new bytes in `replacements`, because `rebuildBinary` copies any view absent from the map straight out of the bin it is handed. `mergePrimitivesByMaterial` reads and appends against the same `workingBin`, so it sees the UV accessors step 4 just added.

Format invariants that are easy to break (there are helper tests but no golden-binary snapshot tests):

- GLB container: 12-byte header (`glTF`, version 2), JSON chunk padded with spaces `0x20` to a 4-byte boundary, BIN chunk padded to 4; all lengths little-endian. `readGlb`/`createGlbBuffer`/`writeGlb` encode this.
- Only **non-interleaved** bufferViews are supported — a view with `byteStride` throws (`readAccessorData`).
- Accessor `min`/`max` must stay in sync whenever you rewrite POSITION data.
- `align4`, matrix helpers (`identityMatrix`, `multiplyMatrix`, `invertMatrix`, `transformPoint`, `transformVector`, `getNodeLocalMatrix`, `getTypedArrayConstructor`, `readAccessorData`) are exported/testable primitives used by the bake.

The batch entry points `collectGlbEntries` (returns `{ inputPath, relativePath }`, preserving nested structure under a directory root) and `collectGlbFiles` mirror the earlier standalone scripts under `refs/scripts/` — the `refs/` versions are the pre-productization originals of this logic.

## Electron shell & IPC contract

- **Main process** (`src/main.js`) owns the frameless `BrowserWindow`, the custom title bar (min/max/close), native dialogs, and validation-pane reads. IPC handlers: `pick-inputs`, `pick-output-dir`, `repair-glb` (calls `repairMany`), `read-glb-data-url` (returns the GLB as a base64 `data:model/gltf-binary` URL plus `bounds` from accessor min/max and a `metadata` summary), and the window controls. `BrowserWindow` uses `contextIsolation: true` and `nodeIntegration: false`.
- **Preload** (`src/preload.js`) is the only bridge — it exposes `window.repairApp` wrapping each `ipcRenderer.invoke`. The renderer has no Node access; any new capability must be plumbed as a channel here + a handler in `main.js`.
- **Renderer** (`src/renderer.js` + `index.html` + `styles.css`) is dependency-free DOM scripting. Two functional areas: the repair queue/results panel, and the Cesium validation view which creates a `Cesium.Viewer`, loads the chosen GLB via `Cesium.Model.fromGltfAsync` on the data URL, frames the camera from the bounding sphere / accessor bounds, and logs bounding-sphere/camera/animation/render diagnostics to the log pane. After a successful batch run it auto-validates the first success. If you touch Cesium preview framing, `docs/cesium-glb-load-issues.md` explains why conservative near-plane and bounds-based framing matter.

## Conventions & house rules

- CommonJS modules, 2-space indent, short functions, lowercase-hyphen filenames (`scripts/ensure-cesium.js`, `refs/scripts/repair-casualty-glb-textures.cjs`). No bundler, no TypeScript, no framework.
- Keep new runtime code under `src/`; experimental/reference material goes in `refs/` or `docs/`.
- When behavior changes, update `docs/001-code-design.md` (module/interface tables, BR rules). Do not overwrite `AGENTS.md`.
- `docs/` is design/analysis documentation, not tracked in git here; treat it as living reference.
