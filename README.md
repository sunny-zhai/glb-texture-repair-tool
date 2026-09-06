# GLB 贴图修复桌面工具

基于 Electron + Node.js 的本地桌面工具，用于批量修复 Cesium 中发黑的伤员 GLB 模型贴图，并输出可直接替换的修复产物。

## 当前内容

- `docs/001-code-design.md`：需求与开发设计基线
- `refs/scripts/`：现有修复脚本拷贝
- `refs/models/`：三个待修复样本模型

## 参考输入

- `refs/models/person-stand.glb`
- `refs/models/person-move.glb`
- `refs/models/蹲姿.glb`

## 参考实现

- `refs/scripts/repair-casualty-glb-textures.cjs`
- `refs/scripts/normalize-casualty-glb.cjs`

