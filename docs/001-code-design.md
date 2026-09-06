# GLB 贴图修复桌面工具 Code Design

## 1. 文档元信息

```yaml
document:
  doc_id: "GLB_TEXTURE_REPAIR_TOOL_CODE_DESIGN_V1"
  project_name: "GLB贴图修复桌面工具"
  version: "0.1.0"
  status: "草稿"
  owner: "Codex"
  created_at: "2026-09-05"
  updated_at: "2026-09-06"
  baseline_srs: "无"
  target_release: "v0.1.0"
  language: "zh-CN"
```

## 2. 设计概述

### 2.1 目标

- 将发黑 GLB 的修复动作封装为本地桌面工具。
- 支持单文件和批量目录修复。
- 输出 Cesium 可直接加载的修复版 GLB。

### 2.2 范围

- 覆盖：文件选择、批量处理、修复执行、结果导出、日志展示。
- 不覆盖：Java 服务、C++ 引擎、Cesium 渲染源码改造。

### 2.3 已确认修复策略

- 将模型内嵌图片统一转为 PNG。
- 解析 GLB 中的外部贴图 URI，在模型同级目录递归查找同名文件并嵌入输出 GLB。
- 清理 `KHR_materials_specular` 等 Cesium 不稳定扩展。
- 预览相机使用更保守的近裁剪面和更远的默认取景，降低人物模型切边。
- 使用无边框窗口和自定义标题栏，提供最小化、最大化、关闭按钮。
- 保留 GLB 结构与可用材质信息。

## 3. 模块实现设计

| 模块ID | 模块名称 | 职责 |
|---|---|---|
| MOD-001 | Electron 主进程 | 窗口创建、菜单、文件对话框、任务调度 |
| MOD-002 | 修复执行器 | 读取 GLB、修复贴图、重打包输出 |
| MOD-003 | 批处理队列 | 单文件/目录扫描、任务串行执行、失败继续 |
| MOD-004 | 结果面板 | 展示输入、输出、大小变化、错误信息 |

### 3.1 关键规则

| 规则ID | 规则描述 | 优先级 |
|---|---|---|
| BR-001 | 以原文件同名输出修复版文件 | P0 |
| BR-002 | 发现图片不是 PNG 时转码为 PNG | P0 |
| BR-003 | 发现 Cesium 兼容性扩展时移除相关扩展声明 | P0 |
| BR-004 | 批处理时单文件失败不阻断后续任务 | P1 |
| BR-005 | 外部贴图支持相对路径、Windows 绝对路径和 data URI；缺失时返回文件名与恢复指引 | P0 |

## 4. 接口设计

### 4.1 本地接口

| 接口ID | 提供方 | 调用方 | 说明 |
|---|---|---|---|
| API-IN-001 | 主进程 | 渲染进程 | 选择目录、启动修复、返回进度 |

### 4.2 输入输出

```yaml
input:
  format: ["glb"]
  mode: ["single", "batch"]
output:
  format: ["glb", "json"]
  artifacts:
    - repaired_glb
    - repair_report
```

## 5. 数据设计

### 5.1 修复报告

```json
{
  "inputPath": "",
  "outputPath": "",
  "oldBytes": 0,
  "newBytes": 0,
  "imagesConverted": 0,
  "externalImagesEmbedded": 0,
  "extensionsRemoved": [],
  "status": "success"
}
```

## 6. 测试要点

1. 用三个样本模型验证转码后 Cesium 不再黑贴图。
2. 验证批处理任务能连续处理多个文件。
3. 验证失败样本只报错不中断队列。
4. 验证输出文件可直接替换原模型。

## 7. 交付物

- Electron 桌面应用源码
- 修复脚本封装
- 样本模型验证集
- 修复报告导出

## 8. 已拷贝参考文件

- `refs/scripts/repair-casualty-glb-textures.cjs`
- `refs/scripts/normalize-casualty-glb.cjs`
- `refs/models/person-stand.glb`
- `refs/models/person-move.glb`
- `refs/models/蹲姿.glb`
