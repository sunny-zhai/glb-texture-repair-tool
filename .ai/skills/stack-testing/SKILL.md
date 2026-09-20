---
name: stack-testing
description: 分栈测试方案 — Web / 小程序 / C++ / React Native / 后端 各自的单测、集成、E2E、静态分析与性能工具链。触发词：小程序测试、C++测试、单测工具、sanitizer、覆盖率、E2E。
---

# Stack Testing — 分栈测试方案

`testing` 技能给出**通用策略**；本技能给出**各技术栈具体工具与命令**。按项目技术栈取用。

## Web 前端（Vue 3 / React）

| 目的 | 工具 | 说明 |
| :-- | :-- | :-- |
| 单元 | Vitest（Vue）/ Jest（React） | 工具函数、composable/hook |
| 组件 | @vue/test-utils、@testing-library/* | 空/加载/异常态必测 |
| 契约 | OpenAPI 校验（`scripts/check-contract.mjs`） | 与后端一致 |
| E2E | **Playwright** | 核心路径（登录/主流程） |
| 视觉回归 | **Playwright toHaveScreenshot** | 见 `visual-regression` 技能 |
| a11y | @axe-core/playwright、Lighthouse CI | 对比度/键盘可达 |
| 性能 | Lighthouse CI | LCP/INP/包体，对齐 `PERF_BUDGET.md` |

## 小程序（微信 / 支付宝 / uni-app / Taro）

| 目的 | 工具 | 说明 |
| :-- | :-- | :-- |
| 单元 | Jest/Vitest + `miniprogram-simulate`（微信官方） | 自定义组件逻辑与属性/事件 |
| uni-app/Taro | `@tarojs/test-utils` / `vitest` + `@vue/test-utils` | 跨端组件单测 |
| 自动化 E2E | **`miniprogram-automator`** 驱动微信开发者工具 | 真机/模拟器自动化：页面跳转、数据断言、截图 |
| 视觉回归 | automator 截图 + 像素比对（或云测平台） | 需屏蔽动态区域；多机型矩阵 |
| 兼容矩阵 | 基础库最低版本 + iOS/Android 各主力机型 | 小程序差异主要在基础库与真机 |
| 性能预算 | 包体积（主包/分包）、冷启动耗时、setData 次数 | 超预算阻断发布 |
| 常见坑 | `setData` 过大、分包未懒加载、`onLoad` 重复请求、组件未按需注入 | 纳入评审清单 |

命令示例（微信小程序）：
```bash
npm i -D miniprogram-automator jest miniprogram-simulate
npx jest                      # 组件单测
node e2e/miniprogram.test.mjs # automator 脚本（需本机微信开发者工具 + 服务端口开启）
```

**小程序要点**：不能只靠 H5 端 E2E 代替——真机渲染与基础库行为不同；关键路径必须在**开发者工具自动化或真机**上验证。

## C++

| 目的 | 工具 | 说明 |
| :-- | :-- | :-- |
| 单元/BDD | **GoogleTest** / Catch2 / doctest | `CMake + CTest` 组织 |
| 动态检查 | **ASan / UBSan / TSan**（gcc/clang `-fsanitize=`） | 内存越界、未定义行为、数据竞争 |
| 内存泄漏 | Valgrind（Linux）/ DrMemory（Windows） | 无 sanitizer 环境时的兜底 |
| 覆盖率 | `gcov/lcov`（gcc）、`llvm-cov`（clang） | 门槛见 `testing` 技能 |
| 静态分析 | clang-tidy、cppcheck；clang-format 统一格式 | 纳入 CI，阻断新增告警 |
| 模糊测试 | libFuzzer / AFL++ | 解析器、协议、边界输入 |
| 性能 | google/benchmark | 基准 + 回归阈值 |
| 构建矩阵 | 多编译器（gcc/clang/MSVC）× 标准（C++17/20）× Debug/Release | Debug 开 sanitizer，Release 跑性能 |

CMake 示例：
```cmake
enable_testing()
add_executable(unit_tests tests/unit_tests.cpp)
target_link_libraries(unit_tests PRIVATE GTest::gtest_main my_lib)
add_test(NAME unit COMMAND unit_tests)
```
```bash
cmake -B build -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer"
cmake --build build && ctest --test-dir build --output-on-failure
```

**C++ 要点**：Debug+sanitizer 与 Release 两套构建都要跑；UB/内存问题**必须**由 sanitizer 兜住，不能靠肉眼；接口变更后跑 ABI/兼容检查（如 `abi-compliance-checker`）。

## React Native

| 目的 | 工具 |
| :-- | :-- |
| 单元/Hook | Jest + React Native Testing Library |
| 组件 | RNTL（快照 + 交互） |
| E2E | Detox（模拟器真机）或 Maestro |
| 性能 | Flipper / Hermes profiler；FlatList 长列表与内存实测 |

## 后端（Spring Boot / Python）

| 目的 | 工具 |
| :-- | :-- |
| 单元 | JUnit + Mockito / pytest |
| 集成 | @MybatisTest、Testcontainers |
| 契约 | OpenAPI 校验 + 消费者驱动契约（Pact 可选） |
| 性能 | JMeter / k6 / locust，对齐 `PERF_BUDGET.md` |
| 安全 | 依赖漏洞（pip-audit / OWASP Dependency-Check）+ SAST |

## 通用要求

- 测试分层与覆盖率门槛遵循 `testing` 技能；**没有验证结果不算完成**。
- 每栈至少一条可在 CI 复现的命令（写进 `docs/testing/TEST_PLAN.md`）。
- 工具未安装时先补齐工具链，不要以"环境没有"为由跳过验证。
