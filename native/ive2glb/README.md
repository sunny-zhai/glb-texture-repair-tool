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

## 平台支持矩阵（REQ-012 / TASK-030）

Electron 侧**不改代码就能支持新平台**：`src/ive.js::platformDirectory()` 返回
`${process.platform}-${process.arch}`，`resolveIveHelper()` 就按这个目录名在
`vendor/ive2glb/<platform>-<arch>/` 里找 `ive2glb`（Windows 上找 `ive2glb.exe`）。
所以"支持一个平台" = **往对应目录放一份自包含产物**。

| 目标平台 | 目录 | 本机（macOS arm64）能否构建 | 前置 |
| :-- | :-- | :-- | :-- |
| macOS Apple Silicon | `vendor/ive2glb/darwin-arm64/` | ✅ 已入库 | `brew install openscenegraph` + `npm run build:ive2glb` |
| macOS Intel | `vendor/ive2glb/darwin-x64/` | ❌ **本机不行** | 需要 **x86_64 的 OSG**（本机只有 arm64 Homebrew，`/usr/local` 下没有 x86_64 工具链）。两条路：① Rosetta 下装 x86_64 Homebrew + OSG（写 `/usr/local`，系统级改动）；② 在 Intel Mac 上直接 `npm run build:ive2glb` |
| Windows x64 | `vendor/ive2glb/win32-x64/` | ❌ 不能交叉编译 | Windows x64 构建环境，见下节 |
| Linux x64 | `vendor/ive2glb/linux-x64/` | ❌ 不能交叉编译 | Linux 环境或容器（本机 docker 不可用），`brew`/`apt` 装 OSG 后跑同一套构建脚本思路 |

> **路线说明（2026-09-22 更新）**：上表属 ADR-012 的**路线 B（多平台预编译）**，**已被路线 A 取代**——
> TASK-027 的 spike 证明 OSG + IVE 插件可编成 **WASM**（一次构建四平台通用，见 `WASM-SPIKE.md`），
> TASK-028 已落地 `vendor/ive2glb/wasm/`。因此：
> - **发布形态只有 WASM**：`package.json` 的 `files`/`asarUnpack` 只放 `vendor/ive2glb/wasm/**`，
>   安装包里**不会**有平台原生助手（REQ-012 标准 2）；本表列的平台目录**不再需要**，新的平台不必再补产物；
> - 本机 `darwin-arm64/` 仍在仓库里，但**只是开发态的对照物**（原生助手启动更快，且"原生↔WASM 逐字节等价"
>   用例需要两者同时在），不随包分发；
> - 下表与"新增一个平台的步骤"仅在**排障**或**万一要回到路线 B** 时有用；若真要让某个平台目录随包分发，
>   必须同时改回 `files`/`asarUnpack`，并先在 REQ-012 标准 2 上取得一致（那是一次规格变更，不是打包细节）。

### 新增一个平台的步骤

1. 在目标平台装好 OpenSceneGraph（含 `osgdb_ive` 插件）与 CMake/Ninja；
2. 构建 `native/ive2glb`（见下两节的命令），确认 `ive2glb` 能独立跑通：
   `ive2glb <某个.ive> <临时目录>` → stdout 一行 `{"status":"ok",...}` 且生成 `scene.json` + `data.bin`；
3. 把可执行文件 + 依赖库 + OSG 插件按平台约定放进 `vendor/ive2glb/<platform>-<arch>/`
   （macOS 用 `lib/` + `osgPlugins/` 与 `@rpath`；Windows 推荐静态三元组单文件，动态三元组把 DLL 放 exe 同目录；Linux 用 `$ORIGIN` rpath）；
4. 自检依赖闭包（macOS：`DYLD_PRINT_LIBRARIES=1` 下 Homebrew 加载数必须为 0；Windows：`dumpbin /dependents` 只剩系统 DLL；Linux：`ldd` 无「not found」）；
5. 端到端比对：`node -e "console.log(require('./src/ive').convertIveToGlb('o-model/蹲姿.ive', require('os').tmpdir()+'/ive-check'))"`
   → `success`、世界盒 `[0.538, 1.364, 1.056]`（容差 0.02）、顶点 `11516`、三角面 `18924`；
6. 把结果回填本表与 `docs/release/RELEASE_CHECKLIST.md` 的对应行。

### macOS

```bash
npm run build:ive2glb
```

脚本 `scripts/build-ive2glb.sh` 会：配置并构建 `native/ive2glb`，把可执行文件、传递依赖的
动态库与 OSG 插件复制到 `vendor/ive2glb/darwin-<arch>/`，把依赖改写为 `@rpath` 并加上
`@executable_path/lib`，最后统一做 ad-hoc 重签（`install_name_tool` 会让原签名失效，
不重签的话 arm64 上会被系统直接杀掉）。

> 若本机 CommandLineTools 的 libc++ 头文件缺失，脚本会自动改用 `$(xcrun --show-sdk-path)/usr/include/c++/v1`。
>
> **只做 darwin-arm64**：脚本按 `$(uname -m)` 决定目标目录，且依赖 `/opt/homebrew` 下的 arm64 OSG；
> 要出 `darwin-x64` 必须换一个 x86_64 的 OSG 与 `uname -m` 为 x86_64 的环境（即上表的 Intel Mac 路线）。

### Windows

Windows 需要一个 Windows 构建环境（`dist:win` 在 macOS 上只能出 Electron 包，无法交叉编译原生程序）：

```powershell
# 依赖：VS 2022 Build Tools（含 C++ 工作负载）、CMake >= 3.20、Ninja、vcpkg
vcpkg install openscenegraph:x64-windows-static
cmake -S native/ive2glb -B native/ive2glb/build -G Ninja `
  -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" `
  -DVCPKG_TARGET_TRIPLET=x64-windows-static
cmake --build native/ive2glb/build
```

#### 放置与打包约定

```
vendor/ive2glb/win32-x64/
  ive2glb.exe            # build/bin/ive2glb.exe
  osgPlugins/            # 或 osgPlugins-3.6.5/ —— 两个名字之一，见下
    osgdb_ive.dll
    osgdb_serializers_osg.dll
```

- `src/ive.js::resolveIveHelper()` 的解析顺序（2026-09-22 起）是：`GLB_REPAIR_IVE2GLB`（指向 `.js` 时按 WASM 处理）→ **本平台原生目录** `vendor/ive2glb/<platform>-<arch>/ive2glb[.exe]` → **跨平台 WASM** `vendor/ive2glb/wasm/ive2glb.js`（打包后每步都先看 `app.asar.unpacked`）。原生助手**文件在却起不来**时由 `resolveWasmHelper()` 回退 WASM。因此下面的 Windows 目录若要生效，文件名必须是 `ive2glb.exe`；但**发布形态只带 WASM**，这个目录不会进安装包（REQ-012 标准 2）。
- `native/ive2glb/src/main.cpp::registerLocalPluginPath()` 只在**可执行文件同级**查找名为 `osgPlugins` 或 `osgPlugins-3.6.5` 的目录，并把它插到 `osgDB` 插件搜索路径的**最前面**（避免命中系统里装的 OSG）。目录名必须正好是这两个之一，换个名字插件就加载不到。
- **推荐静态三元组**（`x64-windows-static`）：`ive2glb.exe` 单文件即可。Windows 的 DLL 搜索路径只覆盖 exe 所在目录与系统目录，**没有 macOS 那样的 `@rpath/@executable_path/lib`**，所以不要照搬 macOS 的 `lib/` 约定——动态三元组下把 `osg*.dll`、`zlib*.dll`、`libpng*.dll`、`freetype*.dll` 等**直接放在 exe 旁边**。
- `package.json` 的 `files`/`asarUnpack` 现在**只覆盖 `vendor/ive2glb/wasm/**`**（TASK-031 起），所以 `win32-x64/` 即使建出来也不会被分发；`.gitignore` 刻意没有 `*.exe` 之类的一刀切规则（根锚定的打包目录除外），产物仍可正常入库供开发态使用。

#### 依赖闭包自检

```powershell
dumpbin /dependents vendor\ive2glb\win32-x64\ive2glb.exe
dumpbin /dependents vendor\ive2glb\win32-x64\osgPlugins\osgdb_ive.dll
```

- 期望：只出现系统 DLL（`KERNEL32.dll`、`USER32.dll`、`GDI32.dll`、`OPENGL32.dll`、`VCRUNTIME140*.dll`、`api-ms-win-*.dll` 等）。
- 若出现 `osg*.dll` / `zlib*.dll` / `libpng*.dll` / `freetype*.dll` / `OpenThreads*.dll`，说明用的是动态三元组：把这些 DLL 复制到 `ive2glb.exe` **同一目录**再复跑一次，直到只剩系统 DLL。

#### 不依赖 GUI 的自检（建议在打安装包之前先过这一步）

```powershell
# ① 原生助手能独立跑通：stdout 一行 JSON，退出码 0
vendor\ive2glb\win32-x64\ive2glb.exe o-model\蹲姿.ive $env:TEMP\ive2glb-selfcheck
#    期望：{"status":"ok","images":3,"binBytes":...}，且 %TEMP%\ive2glb-selfcheck\{scene.json,data.bin} 存在

# ② Node 侧全链路（与 macOS 的实测值比对）
node -e "const r=require('./src/ive').convertIveToGlb('o-model/蹲姿.ive', process.env.TEMP+'/ive2glb-glb'); console.log(r.status, r.worldSize, r.vertices, r.triangles, r.elapsedMs+'ms')"
#    期望：success [ 0.538, 1.364, 1.056 ] 11516 18924 …（世界盒容差 0.02）
```

> Windows 产物尚未在本仓库验证过（本机无 Windows 环境，也没有 wine 可交叉构建）；
> 上面两条自检是给具备 Windows 环境的人执行的最小判定路径。`src/ive.js` 在找不到助手时
> 会给出明确的中文错误并列出已查找路径，不会静默失败。

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
