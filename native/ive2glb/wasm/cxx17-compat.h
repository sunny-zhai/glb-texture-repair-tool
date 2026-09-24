// Emscripten 的 clang 默认按 C++17 编译，而 std::mem_fun_ref 在 C++17 已被移除。
// OSG 3.6.5 内置的第三方 tri_stripper 仍在调用它：
//   src/osgUtil/tristripper/include/detail/graph_array.h:449
//     std::for_each(G.begin(), G.end(), std::mem_fun_ref(&graph_array<N>::node::unmark));
// 通过在命令行 -include 本头注入一个最小等价实现，避免修改 vendored 的 OSG 源码。
// 只在本 TU 的 C++ 标准为 C++17 及以上时才注入（C++14 及以下的 libc++ 自带该函数）。
#pragma once

#if __cplusplus >= 201703L

#include <functional>

namespace std {

// 只覆盖 group_array.h 用到的那一种形态：无参、返回 void 的成员函数。
template <class T>
inline auto mem_fun_ref(void (T::*method)()) {
  return [method](T& object) { (object.*method)(); };
}

}  // namespace std

#endif  // __cplusplus >= 201703L
