# Repository Guidelines

## Project Structure & Module Organization
This repository is a small Electron desktop tool for repairing Cesium-compatible GLB textures. The main entry point is `src/main.js` as declared in `package.json`. Reference material lives in `docs/`, including `docs/001-code-design.md`. Source repair scripts and sample assets are stored under `refs/scripts/` and `refs/models/`. Keep new runtime code under `src/` and keep experimental or reference material in `refs/` or `docs/`.

## Build, Test, and Development Commands
- `npm install` installs the Electron dependency set.
- `npm run dev` starts the desktop app in development mode.
- `npm start` runs the same Electron entry point for local launch.
- `npm run lint` and `npm test` are placeholders today and only print a message. Replace them with real checks before relying on them in automation.

## Coding Style & Naming Conventions
Use CommonJS modules and Node/Electron conventions already present in the repo. Prefer 2-space indentation, short functions, and descriptive filenames such as `repair-casualty-glb-textures.cjs`. Use lowercase, hyphenated names for scripts and assets unless the upstream file format requires otherwise. Keep generated outputs separate from checked-in source files.

## Testing Guidelines
Automated tests are not configured yet. When adding them, prefer behavior-focused names such as `repair-glb-preserves-materials`. Keep test commands in `package.json` so they are easy to run from the project root. For manual verification, use the three sample models in `refs/models/` and confirm the repaired GLB opens correctly in Cesium-compatible viewers.

## Commit & Pull Request Guidelines
No usable commit history is available in this checkout, so there is no project-specific commit convention to copy. Use concise imperative subjects, for example `feat: add batch repair command`. Pull requests should explain the change, list validation steps, and include screenshots or sample outputs when the UI or GLB output changes.

## Agent Notes
Do not overwrite `AGENTS.md` if it already exists. Keep changes narrowly scoped and update the design docs when behavior changes.
