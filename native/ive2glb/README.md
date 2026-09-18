# ive2glb

把 OpenSceneGraph 的 **IVE** 场景导出为中间产物（`scene.json` + `data.bin`）的小型命令行工具，
供 Electron 侧 `src/ive.js` 组装为自包含 GLB。

## 为什么需要原生代码

IVE 是 OpenSceneGraph 的私有序列化格式，npm 上只有 `.osgb/.osgt` 的 JS 序列化库，
没有任何可用的 JS/WASM IVE 解析器；IVE 内部的类（`osg::Geometry`、`osg::Image`、各类
`StateSet`）也无法在纯 JS 里可靠还原。因此"读懂 IVE"这一步必须由链接 OSG 的原生程序完成。

工具刻意做得很薄：只链接 `libosg` / `libosgDB`，不链接 Qt、Assimp、`osgViewer` 或 `osgGA`，
不创建任何图形上下文。GLB 的组装与贴图编码留在 Node 侧（`src/ive.js`），
以便复用已有的 `jpeg-js` / `pngjs` 依赖与手写 GLB 打包约定。

## 构建与分发

### macOS

```bash
npm run build:ive2glb
```

脚本 `scripts/build-ive2glb.sh` 会：配置并构建 `native/ive2glb`，把可执行文件、传递依赖的
动态库与 OSG 插件复制到 `vendor/ive2glb/darwin-<arch>/`，把依赖改写为 `@rpath` 并加上
`@executable_path/lib`，最后统一做 ad-hoc 重签（`install_name_tool` 会让原签名失效，
不重签的话 arm64 上会被系统直接杀掉）。

> 若本机 CommandLineTools 的 libc++ 头文件缺失，脚本会自动改用 `$(xcrun --show-sdk-path)/usr/include/c++/v1`。

### Windows

Windows 需要一个 Windows 构建环境（`dist:win` 在 macOS 上只能出 Electron 包，无法交叉编译原生程序）：

```powershell
vcpkg install openscenegraph:x64-windows-static
cmake -S native/ive2glb -B native/ive2glb/build -G Ninja `
  -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" `
  -DVCPKG_TARGET_TRIPLET=x64-windows-static
cmake --build native/ive2glb/build
```

把 `build/bin/ive2glb.exe` 放到 `vendor/ive2glb/win32-x64/`。静态三元组下无需附带 DLL；
若使用动态三元组，则需把 `osgDB`、`osg`、`OpenThreads` 等 DLL 与 `osgPlugins-<版本>/osgdb_ive.dll`
按 macOS 的目录约定一并放入 `lib/` 与 `osgPlugins/`（Windows 默认会搜索可执行文件所在目录）。

> Windows 产物尚未在本仓库验证过；`src/ive.js` 在找不到助手时会给出明确的中文错误，
> 不会静默失败。

## 中间产物格式

```
<output-dir>/
  scene.json   # 节点树、材质、贴图元信息、各访问器的字节区间
  data.bin     # 顶点属性、索引与原始像素缓冲（每段 4 字节对齐）
```

`scene.json` 关键字段：

| 字段 | 说明 |
|---|---|
| `images[]` | `width/height/rowBytes/pixelFormat/dataType/origin/offset/length`；`origin` 为 `BOTTOM_LEFT`（OpenGL 约定）或 `TOP_LEFT` |
| `materials[]` | `diffuse/ambient/specular/emission/shininess/baseColorImage/alphaMode/cullFace` |
| `meshes[].primitives[]` | `attributes`（`POSITION`/`NORMAL`/`TEXCOORD_n`，统一 float32）与 `indices`（uint32） |
| `nodes[]` | `name`、可选 `matrix`（列主序 16 元素）、`mesh`、`children` |
| `warnings[]` | 跳过的节点类型、图元模式、压缩贴图等提示 |

`pixelFormat` / `dataType` 沿用 OpenGL 枚举值（如 `6407`=RGB、`6408`=RGBA、`5121`=UNSIGNED_BYTE）。
多个 `primitive set` 会被展开合并为三角形，`GL_UNSIGNED_INT` 索引统一输出。

## 已知限制

- 只处理三角面：`GL_POINTS`/`GL_LINES` 等模式会被跳过并记入 `warnings`。
- 压缩贴图（DXT/KTX）与 16 位通道贴图会被跳过并记入 `warnings`。
- 只保留 `TEXCOORD_n` 的 per-vertex 数据；数量与顶点数不一致的属性会被跳过。
- 不导出动画、骨骼与蒙皮（IVE 中的骨骼通常以空节点树存在，转换时会被剪除）。
