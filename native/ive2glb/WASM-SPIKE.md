# IVE → WASM 可行性记录（TASK-027 / REQ-012）

> 本文件是 spike 的原始记录：结论、复现命令、失败点与实测数字。
> 结论段同步写入 `docs/design/ADR-012`；可复现脚本见 `scripts/build-ive2glb-wasm.sh`。

## 一、结论

**路线 A（把 OSG + IVE 插件编成 WASM）可行，建议按它落地 TASK-028。**

四个待答问题全部有肯定答案，且**等价性达到了逐字节级别**：同一份 `src/ive.js` 代码，走 WASM 助手与走 darwin 原生助手，产出的 GLB **字节完全相同**。

| 问题 | 结论 | 关键证据 |
| :-- | :-- | :-- |
| ① 能否链接成功 | **能** | `wasm-ld` 严格模式（默认 `ERROR_ON_UNDEFINED_SYMBOLS=1`）退出码 0；OSG 630 个编译目标全部通过 |
| ② IVE 插件能否静态注册 | **能，且无需改动 OSG 源码** | `DYNAMIC_OPENSCENEGRAPH=OFF` 使插件本身成为静态库；`--whole-archive` 保住静态注册；实测 `Registry` 在 `dlopen` 之前就命中已注册的 reader |
| ③ 文件 IO 方案 | **`-sNODERAWFS=1` 即可**，不需要虚拟 FS 预加载 | 绝对路径、自动建输出目录、CWD 语义、退出码 0/1/2 全部与原生助手一致 |
| ④ 产物体积与耗时 | **2.91 MB / 单文件 100.2 ms** | 体积预算 30 MB、耗时预算 10 s，均大幅达标 |

等价性证据（详见第五节）：

- 助手产物 `scene.json` / `data.bin`：与 darwin 助手 **SHA-256 相同**
- 全链路 GLB（`convertIveToGlb`）：与 darwin 路径 **SHA-256 相同**
- 关键指标：世界盒 `0.538 × 1.364 × 1.056`、顶点 `11516`、三角面 `18924` —— 与 REQ-012 标准 1 完全一致
- `test/ive.test.js` 指向 WASM 助手：**21 通过 / 0 失败 / 3 跳过**（跳过项是缺 `person-move.ive` 夹具，与原生基线一致）

## 二、环境与复现

| 项 | 值 |
| :-- | :-- |
| Emscripten | **6.0.9**（`emsdk install latest` 于 2026-09-21） |
| OpenSceneGraph | **3.6.5**（tag `OpenSceneGraph-3.6.5`，与 `vendor/ive2glb/darwin-arm64` 的助手同版本） |
| 宿主 | macOS arm64（Darwin），Node v24.19.0 |
| CMake / Ninja | 4.4.2 / 1.13.2 |

一条命令复现（脚本会准备 emsdk、取 OSG 源码、编静态库、链接、自检）：

```bash
scripts/build-ive2glb-wasm.sh o-model/蹲姿.ive
# 改过桩或链接参数、只想重链：加 --skip-osg
```

自检期望输出（与原生助手逐字一致）：

```json
{"status": "success", "error": "", "images": 3, "materials": 3, "meshes": 3, "nodes": 73, "warnings": 0, "binBytes": 28782480}
```

## 三、问题②：静态注册是怎么成立的（无需改 OSG）

这是本次 spike 最关键的机制结论，三处事实合起来才成立：

1. **插件在静态构建下就是静态库。** `DYNAMIC_OPENSCENEGRAPH=OFF` 时，`src/osgPlugins/ive` 产出的是 `libosgdb_ive.a` 而不是 `.so`/`.dll`。
2. **注册靠静态初始化。** `include/osgDB/Registry:743` 的宏会生成一个 `extern "C" void osgdb_ive(void) {}` 和一个 `static RegisterReaderWriterProxy<ReaderWriterIVE>`，后者的构造函数在启动时把 reader 注册进 `Registry`；`REGISTER_OBJECT_WRAPPER`（`include/osgDB/ObjectWrapper:236`）同理，生成 `wrapper_serializer_<NAME>` 钩子。静态库里的这些目标**不被引用就会被链接器丢掉**，所以链接时必须 `-Wl,--whole-archive` 包住 `libosgdb_ive.a` 与 `libosgdb_serializers_osg.a`。
3. **`dlopen` 路径根本不会被走到。** `src/osgDB/Registry.cpp:873` 的 `getReaderWriterForExtension()` **先遍历已注册的 `_rwList`（第 881–887 行）并直接返回**，只有找不到时才走 `loadLibrary()` → `DynamicLibrary::loadLibrary()` → `dlopen`（`DynamicLibrary.cpp:132`）。因为第 2 步已把 IVE reader 注册好，`dlopen` 永远不会被调用。

实测印证：全仓库只有 `src/osgDB/DynamicLibrary.cpp` 一处用 `dlopen`，而链接结果里**没有任何非 GL 的未定义符号**——即 `dlopen`/`dlsym` 这条链连同它的平台依赖一起没有进入 wasm 的符号闭包，**不需要给 `dlopen` 打桩，也不需要改 OSG 源码**。

> 注意：这是"读 IVE"这一条路径的结论。若将来要读 `.osg`/`.osgt` 等需要另行动态加载插件的格式，`dlopen` 缺失就会变成阻塞点。

## 四、过程中撞到的失败点与修法（6 处）

按撞到的顺序记录，每一条都是"原命令 → 报错 → 修法"，便于排障。

| # | 现象 | 根因 | 修法 |
| :-- | :-- | :-- | :-- |
| 1 | `CMake Error: EGL_LIBRARY ... NOTFOUND`（18 个 target 都链接它） | `-DOPENGL_PROFILE=GLES2` 让 OSG 去找 EGL/GLES 库 | 改用 `-DOPENGL_PROFILE=GL2`。**附带好处**：GLES2/GLES3 分支会把 `OSG_CPP_EXCEPTIONS_AVAILABLE` 关掉（`CMakeLists.txt:532`），而助手的 `main.cpp` 用 `try/catch` 汇报遍历失败，GL2 才保得住异常 |
| 2 | `no member named 'mem_fun_ref' in namespace 'std'`（`osgUtil/tristripper/include/detail/graph_array.h:449`） | emscripten 的 clang 默认按 C++17 编译，`std::mem_fun_ref` 在 C++17 已被移除；OSG 3.6.5 内置的第三方 tri_stripper 仍在调用 | 不改 vendored 源码，改用 `-include native/ive2glb/wasm/cxx17-compat.h` 注入一个最小等价实现。全仓库扫描确认这是**唯一**一处需要处理的地方（`auto_ptr` 只在未编译的 ffmpeg/gdal/dae 插件与注释里，`ptr_fun` 只在未编译的 obj 插件里） |
| 3 | `fatal error: 'GL/glx.h' file not found`（`osgViewer/GraphicsWindowX11.cpp` 等） | 非 Apple 的 UNIX 平台下 OSG 默认 `OSG_WINDOWING_SYSTEM=X11`，会编出 X11/GLX 后端 | `-DOSG_WINDOWING_SYSTEM=None`。本工具不渲染，窗口系统整个不需要；`osgViewer/CMakeLists.txt` 对 `None` 不匹配任何分支，于是不编入窗口后端 |
| 4 | `undefined symbol: vtable for osgGA::GUIEventHandler`（`libosgVolume.a(Property.cpp.o)`） | `osgVolume` 依赖 `osgGA`，手工链接时漏了这个静态库 | 链接列表补上 `libosgGA.a`；并用 `-Wl,--start-group ... --end-group` 做迭代解析，避免逐个排库序 |
| 5 | 链接自动选了 `-lc++-noexcept` | emscripten **默认禁用异常捕获**（`DISABLE_EXCEPTION_CATCHING=1`） | 加 `-fexceptions`。链接随即切换到 `-lc++ -lc++abi` 并导出 `setThrew`。不加的后果是 `try/catch` 形同虚设，场景遍历失败会变成 abort 而不是中文错误 |
| 6 | 53 个未定义符号（`glNewList`、`glColor4f`、`glAlphaFunc` …） | OSG 的 `osg`/`osgText`/`osgSim`/`osgFX` 里编进了 OpenGL 固定管线调用点；原生构建靠链接系统 OpenGL 框架解决，WebGL/GLES2 没有这些入口 | 两级处理：`-sLEGACY_GL_EMULATION=1`（emscripten 的 GL 模拟层）覆盖其中大部分；剩下 **23 个** 由 `native/ive2glb/wasm/gl-trap-stubs.cpp` 显式补齐。**刻意不做静默空实现**：一旦被调用即打印中文错误并以退出码 3 终止 |

关于第 6 点的取舍：模拟层的覆盖面随 emscripten 版本变化（本次 `LEGACY_GL_EMULATION` 之后仍缺 23 个），所以**保留严格未定义符号检查**、把缺口显式列成桩，比放行未定义符号更可维护——符号缺口会随工具链升级而"报错暴露"，而不是悄悄变成空实现。23 个桩的原型由 `.spike/gen-trap-stubs.mjs` 从 emscripten 的 `GL/gl.h` 自动提取，避免手写签名与调用方不一致。

陷阱桩的有效性是**实测**的，不是声称的：另写一个直接调用 `glNewList` 的小程序链接同一份桩，运行输出

```
ive2glb(wasm)：不支持的 OpenGL 调用 glNewList。
本助手只做只读转换，不应触达渲染路径；出现此提示说明场景遍历用到了
WebGL 无法实现的立即模式/显示列表/像素传输功能，请报告该模型。
```

并返回退出码 **3**。

## 五、等价性证据

同一份 `src/ive.js`，唯一差别是把 `GLB_REPAIR_IVE2GLB` 指向哪个助手。

### 助手产物

| 文件 | darwin 助手 | WASM 助手 | 比对 |
| :-- | :-- | :-- | :-- |
| `scene.json`（19,399 B） | `a96011bcc2dcf8fd526cef436fe75fc9…` | `a96011bcc2dcf8fd526cef436fe75fc9…` | **相同** |
| `data.bin`（28,782,480 B） | `4b82fd205c328f0bda12a42fe7997849…` | `4b82fd205c328f0bda12a42fe7997849…` | **相同** |

两者输出的摘要行也逐字一致：

```json
{"status": "success", "error": "", "images": 3, "materials": 3, "meshes": 3, "nodes": 73, "warnings": 0, "binBytes": 28782480}
```

### 全链路 GLB

| 产物 | 大小 | SHA-256 | 比对 |
| :-- | --: | :-- | :-- |
| darwin 路径 | 2,544,480 B | `76e34b58fab0a1eaf7760bb291333259…` | — |
| WASM 路径 | 2,544,480 B | `76e34b58fab0a1eaf7760bb291333259…` | **相同** |

`convertIveToGlb('o-model/蹲姿.ive', …)` 在两条路径上的报告字段：`status: success`、`worldSize [0.538, 1.364, 1.056]`、`worldCenter [0, 0.682, 0]`、`vertices 11516`（焊接前 56772）、`triangles 18924`、`axisMode bake`。

### 既有回归套件（指向 WASM 助手）

```bash
GLB_REPAIR_IVE2GLB="$PWD/.spike/wasm/ive2glb.sh" node --test test/ive.test.js
# → tests 24 / pass 21 / fail 0 / skipped 3
```

3 个跳过项缺 `o-model/person-move.ive`，与原生基线一致，不是 WASM 引入的。

### CLI 契约（与原生助手逐项对齐）

| 场景 | WASM 退出码 | darwin 退出码 |
| :-- | --: | --: |
| 成功 | 0 | 0 |
| 输入文件不存在 | 1 | 1 |
| 非 `.ive` 扩展名 | 1 | 1 |
| 参数数量不正确 | 2 | 2 |

错误信息仍是同一批中文文案（`源文件不存在或不可读`、`仅支持 IVE 源文件`），因此 **`src/ive.js` 的 spawn/解析逻辑可以原样复用**，TASK-028 不需要改调用约定。

## 六、资源预算（对应 REQ-012 标准 7）

| 指标 | 预算 | 实测 | 判定 |
| :-- | :-- | :-- | :-- |
| 助手产物体积 | > 30 MB 需说明取舍 | `ive2glb.wasm` **2.66 MB** + `ive2glb.js` **0.25 MB** = **2.91 MB** | 达标（约为本机 darwin 助手目录 11 MB 的 1/4） |
| 单文件转换耗时 | > 10 s 需说明取舍 | WASM **100.2 ms** / darwin **59.4 ms**（`o-model/蹲姿.ive`，各 7 次取最好；WASM 含 Node 启动与实例化开销） | 达标 |

WASM 产物哈希：`ive2glb.wasm` = `cf56089e77dc4c2fa6d9dba16f126097…`，`ive2glb.js` = `81658ef03bdec0b838488b8224b80186…`（Emscripten 6.0.9 / OSG 3.6.5；换工具链版本产物会变，数字需重测）。

## 七、对 TASK-028 的建议与遗留项

**建议走路线 A（WASM）**，并据此重新评估 TASK-021/TASK-022：按 `TASKS.md` 的既有约定，spike 通过即意味着 **Windows 原生助手（TASK-021/022）被 REQ-012 取代**，应标为"已取消（被 REQ-012 取代）"，而不是继续等 Windows 环境。原先阻塞在外部环境的整条线因此解开。

落地时需要注意：

1. **产物形态与分发**：新增 `vendor/ive2glb/wasm/`（或等价位置）放 `ive2glb.js` + `ive2glb.wasm`，加入 `package.json` 的 `files` + `asarUnpack`（wasm 必须能按路径读到，与 assimpjs 同一套路）。**`vendor/ive2glb/<platform>-<arch>/` 是否保留**要显式决定：保留可作为排障回退，但与"不按平台分发二进制"的约定相冲，建议只留 darwin-arm64 作开发期对照或一并移除。
2. **调用方式**：`src/ive.js::resolveIveHelper()` 目前只认"可执行文件路径"，WASM 需要用 `node ive2glb.js` 起进程。可选做法是加一个"没有原生助手时回退到 WASM"的分支，并在产物里放一个与 `ive2glb.sh` 等价的小启动脚本（spike 里就是这个思路验证通过的）。**IVE 解析语义不需要任何改动。**
3. **必须补的验证**：`test/ive.test.js` 与 `test/ui-smoke.cjs` 在 GLB / IVE / FBX / OBJ 四格式上全绿；打包后 `app-capabilities` 报 `ive: true`；BR-012 缺助手降级不回归。本次只跑了 `test/ive.test.js`（单测层），**UI 冒烟与打包验证属 TASK-028**。
4. **本机样例限制**：本地只有 `o-model/蹲姿.ive` 一个 IVE 夹具（`person-move.ive` 不在），等价性是**在这一个模型上**达到逐字节一致的。建议 TASK-028 至少再补一个不同来源/含不同特性的 IVE 复核，避免"单模型偶然一致"。
5. **可复现性依赖网络**：脚本要从 GitHub 取 emsdk 与 OSG 源码，并在首次编译时由 emscripten 下载 freetype/zlib/libpng/libjpeg 端口。完全离线的构建环境需要预先缓存这些。
6. **emscripten 的 GL 模拟会打印警告**（`using emscripten GL emulation unsafe opts…`）。本次 GL 从未被调用，警告无实际影响；若要消除可评估 `-sGL_UNSAFE_OPTS=0`，代价未测。
7. **构建脚本的定位**：本脚本按 `TASKS.md` 属"spike 草稿"。若 TASK-028 采纳 WASM 路线，它需要从"草稿"转为正式发布流程的一环（含产物校验与版本记录），否则 `vendor/` 下的 wasm 就成了无法追溯来源的二进制。
