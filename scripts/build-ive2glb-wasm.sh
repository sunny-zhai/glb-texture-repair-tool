#!/usr/bin/env bash
#
# 把 ive2glb（OSG 的 IVE 读取能力）编成 WebAssembly，供所有桌面平台共用一份产物。
#
# 背景与完整实测记录见 native/ive2glb/WASM-SPIKE.md（TASK-027 / REQ-012）。
# 本脚本把那次 spike 的命令固化成可复现的步骤：
#   ① 准备 emsdk（Emscripten 6.0.9 实测通过）
#   ② 取 OSG 3.6.5 源码（与 vendor/ive2glb/darwin-arm64 的助手同版本）
#   ③ 用 emscripten 交叉编译 OSG 的静态库 + IVE 插件（插件在 DYNAMIC_OPENSCENEGRAPH=OFF
#      下本身就是静态库，静态注册因此成立，无需改动 OSG 源码）
#   ④ 链接成 ive2glb.js + ive2glb.wasm
#   ⑤ 自检：对给定 IVE 跑一遍并打印助手输出的 JSON
#
# 用法：
#   scripts/build-ive2glb-wasm.sh [--skip-osg] [<样例.ive>]
#     --skip-osg   复用已有的 OSG 构建目录，只重跑链接（改桩/改链接参数时用）
#
# 可用环境变量覆盖路径：EMSDK_DIR / OSG_SRC / BUILD_DIR / OUT_DIR
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-$ROOT/.emsdk}"
OSG_SRC="${OSG_SRC:-$ROOT/.spike/osg}"
BUILD_DIR="${BUILD_DIR:-$ROOT/.spike/build-osg}"
OUT_DIR="${OUT_DIR:-$ROOT/.spike/wasm}"

# 与 vendor/ive2glb/**/osgPlugins 里的 osgPlugins-3.6.5 保持一致；换版本要同步改这个值。
OSG_VERSION="3.6.5"
OSG_TAG="OpenSceneGraph-$OSG_VERSION"
EMSDK_VERSION="6.0.9"

SKIP_OSG=0
IVE_SAMPLE=""
for argument in "$@"; do
  case "$argument" in
    --skip-osg) SKIP_OSG=1 ;;
    -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) IVE_SAMPLE="$argument" ;;
  esac
done

log() { printf '\n== %s\n' "$*"; }
die() { printf '错误：%s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- ① emsdk
log "① 准备 emsdk（期望版本 ${EMSDK_VERSION}）"
if [ ! -x "$EMSDK_DIR/emsdk" ]; then
  log "   克隆 emsdk 到 $EMSDK_DIR"
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
fi
if [ ! -d "$EMSDK_DIR/upstream/emscripten" ]; then
  log "   安装并激活 SDK"
  (cd "$EMSDK_DIR" && ./emsdk install latest && ./emsdk activate latest)
fi

# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
command -v em++ >/dev/null 2>&1 || die "emsdk 激活后仍找不到 em++，请检查 $EMSDK_DIR"

ACTUAL_EMCC="$(emcc --version | head -1 | sed -E 's/.*\) ([0-9.]+) .*/\1/')"
log "   实际 emcc 版本：${ACTUAL_EMCC}（脚本按 ${EMSDK_VERSION} 验证；版本不同不必然失败，但结论需重测）"

# ---------------------------------------------------------------- ② OSG 源码
log "② 准备 OSG $OSG_VERSION 源码"
if [ ! -d "$OSG_SRC/src/osg" ]; then
  log "   克隆 $OSG_TAG 到 $OSG_SRC"
  git clone --depth 1 --branch "$OSG_TAG" https://github.com/openscenegraph/OpenSceneGraph.git "$OSG_SRC"
else
  log "   复用已有源码 $OSG_SRC"
fi

# ---------------------------------------------------------------- ③ 交叉编译 OSG
if [ "$SKIP_OSG" -eq 0 ]; then
  log "③ 用 emscripten 配置并编译 OSG 静态库"
  log "   配置（要点：无窗口系统、静态库、只编 ive 插件、C++17 兼容头）"
  COMPAT="$ROOT/native/ive2glb/wasm/cxx17-compat.h"
  # -DOSG_WINDOWING_SYSTEM=None：绕开 osgViewer 的 X11/GLX 后端（本工具不需要窗口）
  # -DDYNAMIC_OPENSCENEGRAPH=OFF：插件随之变成静态库，静态注册的前提
  # -DBUILD_OSG_PLUGINS_BY_DEFAULT=OFF + BUILD_OSG_PLUGIN_IVE=1：只编 IVE 插件
  # -include cxx17-compat.h：补上 OSG 3.6.5 内置 tri_stripper 用到的 std::mem_fun_ref
  emcmake cmake -S "$OSG_SRC" -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DOSG_WINDOWING_SYSTEM=None \
    -DBUILD_OSG_APPLICATIONS=OFF \
    -DBUILD_OSG_EXAMPLES=OFF \
    -DDYNAMIC_OPENSCENEGRAPH=OFF \
    -DDYNAMIC_OPENTHREADS=OFF \
    -DOPENGL_PROFILE=GL2 \
    -DBUILD_OSG_PLUGINS=ON \
    -DBUILD_OSG_PLUGINS_BY_DEFAULT=OFF \
    -DBUILD_OSG_PLUGIN_IVE=1 \
    -DBUILD_OSG_DEPRECATED_SERIALIZERS=OFF \
    -DOSG_USE_LOCAL_LUA_SOURCE=OFF \
    -DBUILD_DOCUMENTATION=OFF \
    -DCMAKE_CXX_FLAGS="-include $COMPAT -sUSE_ZLIB=1 -sUSE_LIBPNG=1 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1" \
    -DCMAKE_C_FLAGS="-sUSE_ZLIB=1 -sUSE_LIBPNG=1 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1"

  log "   编译 IVE 插件与它的依赖闭包（约 330 个目标）"
  cmake --build "$BUILD_DIR" --target \
    osgdb_ive osgdb_serializers_osg \
    osgVolume osgTerrain osgSim osgFX osgText osgGA osgUtil osgDB osg OpenThreads
else
  log "③ 跳过 OSG 编译（--skip-osg）"
  [ -f "$BUILD_DIR/lib/libosgdb_ive.a" ] || die "缺少 $BUILD_DIR/lib/libosgdb_ive.a，不能跳过编译"
fi

# ---------------------------------------------------------------- ④ 链接助手
log "④ 链接 ive2glb.js + ive2glb.wasm"
mkdir -p "$OUT_DIR"
LIB="$BUILD_DIR/lib"

# 链接要点：
#   --whole-archive 包住 IVE 插件与 osg 序列化器：它们的注册靠静态初始化，
#     不被引用就会被链接器整个丢掉，静态注册随即失效。
#   -sLEGACY_GL_EMULATION=1：提供大部分 OSG 会引用到的固定管线 GL 入口点。
#   gl-trap-stubs.cpp：补上 emscripten 也未实现的 23 个入口点，被调用即报错退出。
#   -fexceptions：emscripten 默认禁用异常捕获，而助手用 try/catch 汇报遍历失败。
#   -sNODERAWFS=1：直接读写 Node 的真实文件系统，无需预加载虚拟 FS。
em++ -O2 -std=c++20 -fexceptions \
  -include "$ROOT/native/ive2glb/wasm/cxx17-compat.h" \
  -I "$OSG_SRC/include" -I "$BUILD_DIR/include" \
  -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=node -sEXIT_RUNTIME=1 \
  -sLEGACY_GL_EMULATION=1 \
  -sUSE_ZLIB=1 -sUSE_LIBPNG=1 -sUSE_FREETYPE=1 -sUSE_LIBJPEG=1 \
  "$ROOT/native/ive2glb/src/main.cpp" \
  "$ROOT/native/ive2glb/wasm/gl-trap-stubs.cpp" \
  -Wl,--whole-archive "$LIB/libosgdb_ive.a" "$LIB/libosgdb_serializers_osg.a" -Wl,--no-whole-archive \
  -Wl,--start-group \
    "$LIB/libosgVolume.a" "$LIB/libosgTerrain.a" "$LIB/libosgSim.a" "$LIB/libosgFX.a" \
    "$LIB/libosgText.a" "$LIB/libosgGA.a" "$LIB/libosgUtil.a" "$LIB/libosgDB.a" \
    "$LIB/libosg.a" "$LIB/libOpenThreads.a" \
  -Wl,--end-group \
  -o "$OUT_DIR/ive2glb.js"

log "   产物："
# 用 ls -l（字节数）而不是 -lh，否则 $5 是 "271K" 这类字符串，换算 MB 会恒为 0。
ls -l "$OUT_DIR/ive2glb.js" "$OUT_DIR/ive2glb.wasm" | awk '{printf "     %s  %.2f MB\n", $9, $5/1048576}'

# ---------------------------------------------------------------- ⑤ 自检
if [ -n "$IVE_SAMPLE" ]; then
  log "⑤ 自检：$IVE_SAMPLE"
  [ -f "$IVE_SAMPLE" ] || die "样例不存在：$IVE_SAMPLE"
  SELF_CHECK_DIR="$(mktemp -d)"
  trap 'rm -rf "$SELF_CHECK_DIR"' EXIT
  node "$OUT_DIR/ive2glb.js" "$(cd "$(dirname "$IVE_SAMPLE")" && pwd)/$(basename "$IVE_SAMPLE")" "$SELF_CHECK_DIR"
  log "   期望（以 o-model/蹲姿.ive 为样例）：images 3 / meshes 3 / binBytes 28782480"
else
  log "⑤ 未提供样例，跳过自检（传入一个 .ive 路径即可自检）"
fi

log "完成。产物在 $OUT_DIR/"
