#!/usr/bin/env bash
#
# 构建 native/ive2glb 并把可执行文件、依赖动态库与 OSG 插件打包为自包含目录：
#   vendor/ive2glb/<platform>-<arch>/{ive2glb,lib/*.dylib,osgPlugins/*.so}
# 这样 Electron 侧无需用户安装 OpenSceneGraph。
#
# 用法：scripts/build-ive2glb.sh
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${project_dir}/native/ive2glb"
build_dir="${source_dir}/build"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "该脚本当前只支持 macOS；Windows 构建步骤见 native/ive2glb/README.md。" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) platform_arch="arm64" ;;
  x86_64) platform_arch="x64" ;;
  *) echo "未识别的 CPU 架构：$(uname -m)" >&2; exit 1 ;;
esac
vendor_dir="${project_dir}/vendor/ive2glb/darwin-${platform_arch}"
# 部分机器的 CommandLineTools 缺少 libc++ 头文件路径，此时回退到 SDK 内的副本。
extra_flags=()
sdk_path="$(xcrun --show-sdk-path)"
if [[ ! -f /Library/Developer/CommandLineTools/usr/include/c++/v1/string && -d "${sdk_path}/usr/include/c++/v1" ]]; then
  extra_flags+=("-DCMAKE_CXX_FLAGS=-I${sdk_path}/usr/include/c++/v1")
  echo "提示：本机 CommandLineTools 缺少 libc++ 头文件，已改用 ${sdk_path} 中的副本。"
fi

echo "==> 配置并构建 ive2glb"
cmake -S "$source_dir" -B "$build_dir" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release "${extra_flags[@]+"${extra_flags[@]}"}"
cmake --build "$build_dir"

binary="${build_dir}/bin/ive2glb"
if [[ ! -x "$binary" ]]; then
  echo "构建产物不存在：${binary}" >&2
  exit 1
fi

echo "==> 打包到 ${vendor_dir#"${project_dir}/"}"
rm -rf "$vendor_dir"
mkdir -p "${vendor_dir}/lib" "${vendor_dir}/osgPlugins"
cp "$binary" "${vendor_dir}/ive2glb"

# OSG 的插件目录与库目录同前缀，从可执行文件的依赖里推导出来。
osg_lib_dir=""
for candidate in /opt/homebrew/opt/open-scene-graph/lib /opt/homebrew/lib /usr/local/lib; do
  if [[ -d "${candidate}/osgPlugins-3.6.5" ]]; then
    osg_lib_dir="$candidate"
    break
  fi
done
if [[ -z "$osg_lib_dir" ]]; then
  echo "未找到 OpenSceneGraph 的 osgPlugins 目录。" >&2
  exit 1
fi
plugin_dir="${osg_lib_dir}/osgPlugins-3.6.5"

# IVE 读取只需要 ive 插件；serializers_osg 供 .osgt/.osgb 使用，一并带上以防依赖。
plugins=(osgdb_ive.so osgdb_serializers_osg.so)
for plugin in "${plugins[@]}"; do
  if [[ -f "${plugin_dir}/${plugin}" ]]; then
    cp -L "${plugin_dir}/${plugin}" "${vendor_dir}/osgPlugins/${plugin}"
  fi
done

# 递归收集非系统动态库，按 basename 放进 lib/。
collect_dependencies() {
  local file="$1"
  local dep name source
  while read -r dep; do
    case "$dep" in
      /usr/lib/*|/System/*|@executable_path/*) continue ;;
    esac
    name="$(basename "$dep")"
    [[ -f "${vendor_dir}/lib/${name}" ]] && continue
    if [[ "$dep" == @rpath/* ]]; then
      source="${osg_lib_dir}/${name}"
    else
      source="$dep"
    fi
    [[ -f "$source" ]] || continue
    cp -L "$source" "${vendor_dir}/lib/${name}"
    collect_dependencies "${vendor_dir}/lib/${name}"
  done < <(otool -L "$file" | tail -n +2 | awk '{print $1}')
}

echo "==> 收集动态库依赖"
collect_dependencies "${vendor_dir}/ive2glb"
for plugin in "${vendor_dir}"/osgPlugins/*.so; do
  [[ -f "$plugin" ]] && collect_dependencies "$plugin"
done

# 统一改写为 @rpath 引用，并让可执行文件通过 @executable_path/lib 解析。
rewrite_references() {
  local file="$1"
  local dep name
  while read -r dep; do
    case "$dep" in
      /usr/lib/*|/System/*|@rpath/*|@executable_path/*) continue ;;
    esac
    name="$(basename "$dep")"
    [[ -f "${vendor_dir}/lib/${name}" ]] || continue
    install_name_tool -change "$dep" "@rpath/${name}" "$file"
  done < <(otool -L "$file" | tail -n +2 | awk '{print $1}')
}

echo "==> 重写 rpath 与 install name"
install_name_tool -add_rpath "@executable_path/lib" "${vendor_dir}/ive2glb"
rewrite_references "${vendor_dir}/ive2glb"
for library in "${vendor_dir}"/lib/*.dylib; do
  [[ -f "$library" ]] || continue
  install_name_tool -id "@rpath/$(basename "$library")" "$library"
  rewrite_references "$library"
  codesign --force --sign - --timestamp=none "$library" >/dev/null 2>&1 || true
done
for plugin in "${vendor_dir}"/osgPlugins/*.so; do
  [[ -f "$plugin" ]] || continue
  rewrite_references "$plugin"
  codesign --force --sign - --timestamp=none "$plugin" >/dev/null 2>&1 || true
done
# 修改 Mach-O 会让原有签名失效，必须重新做临时签名，否则 arm64 上会被系统直接杀掉。
codesign --force --sign - --timestamp=none "${vendor_dir}/ive2glb" >/dev/null 2>&1 || true

echo "==> 冒烟验证"
if ! smoke_output="$("${vendor_dir}/ive2glb" 2>&1)"; then :; fi
if [[ "$smoke_output" != *"用法"* ]]; then
  echo "警告：打包后的可执行文件无法运行：${smoke_output}" >&2
fi
if ! otool -L "${vendor_dir}/ive2glb" | grep -q "@rpath/libosg"; then
  echo "警告：可执行文件仍存在非 @rpath 的 OSG 依赖。" >&2
fi

total="$(du -sh "$vendor_dir" | awk '{print $1}')"
echo "完成：${vendor_dir#"${project_dir}/"}（${total}）"
ls -1 "${vendor_dir}" "${vendor_dir}/lib" "${vendor_dir}/osgPlugins" | sed 's/^/  /'
