# GLB Texture Repair Tool

一个基于 Electron + Node.js 的 Cesium GLB 模型修复与验证工具。它面向“3D 查看器可以打开，但 Cesium 中黑屏、空白、贴图丢失或模型不可见”的 GLB 文件，提供本地批量修复、Cesium 预览和诊断日志。

## 当前功能

- 选择单个 GLB 文件或目录，批量生成修复后的 GLB。
- 将 GLB 内嵌的 JPG 等图片转码为 PNG。
- 定位并嵌入外部贴图 URI，包括相对路径、Windows 路径和 `.fbm` 目录中的图片。
- 清理 Cesium 兼容性风险较高的 `KHR_materials_specular` 扩展。
- 将包含 `skins`、`JOINTS_0`、`WEIGHTS_0` 的蒙皮模型烘焙为静态网格。
- 自动更新顶点范围、GLB BIN 区块和图片 `bufferView`。
- 使用本地 Cesium 1.128 验证修复结果。
- 提供模型元数据、包围球、相机、渲染错误和修复失败原因日志。
- 自定义窗口标题栏，支持拖拽、最小化、最大化和关闭。

## 修复的问题

工具主要处理以下 Cesium 加载问题：

1. 外部贴图路径失效，导致 `Failed to load texture`。
2. JPG、非 PNG 或异常图片格式导致材质加载失败。
3. `KHR_materials_specular` 等材质扩展造成兼容性问题。
4. FBX 转换产生的蒙皮结构在 Cesium 中加载成功但不显示。
5. 顶点范围、包围球或相机取景异常导致模型不可见。
6. GLB 重新打包后图片、顶点和索引的二进制偏移不一致。

## 运行

```bash
npm install
npm run dev
```

首次启动会自动下载缺失的 Cesium 1.128 本地运行文件。之后可直接使用本地资源启动。

## 常用命令

```bash
npm run ensure:cesium
npm run lint
npm test
```

修复结果会写入用户选择的输出目录，并可直接通过“选择验证模型”在 Cesium 中检查。
