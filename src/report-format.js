// 体检报告的界面格式化（纯函数，无 Electron/DOM/fs 依赖）。
//
// 存在的理由：src/inspect.js 的报告是给程序看的（数字、枚举、英文 code），界面要的是中文
// 一行话。把这段拼装抽成纯函数，是为了能在 node --test 里直接覆盖——尤其是"文案不能自相
// 矛盾"这条：上一版功能曾对 `sizeRatio = centerOffsetRatio = 1` 的正常模型打印出
// "两种盒相差 1 倍"的自我矛盾结论（见 deviationText 的守卫与对应用例）。
//
// 全局规则：**报告可以降级，界面不能崩**。任何导出函数都必须容忍字段缺失/类型错误/整个
// 报告为 undefined，绝不抛异常，也绝不把 undefined 渲染进界面。
//
// 整个文件包在 IIFE 里：它是**普通 <script>**（不是 ES module / CommonJS 模块），而普通
// <script> 共享同一个全局词法作用域——裸露的顶层 `const`/`function` 会与同页其它脚本相撞
// （实测 preview-transform.js 的同名 `const api` 就让它整体抛 SyntaxError 而完全不执行）。
// 包壳后各文件互不干扰，全局只留下 window.reportFormat 一个入口。
;(function () {
  const ISSUE_LEVELS = ['error', 'warn', 'info']

  const AXIS_LABELS = { X: 'X 轴', Y: 'Y 轴', Z: 'Z 轴', unknown: '未知' }
  const CONFIDENCE_LABELS = {
    high: '高置信度',
    medium: '中等置信度',
    low: '低置信度',
    none: '无法判定',
  }

  const PLACEHOLDER = '—'

  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

  /** @description 米制数值：三位小数；非有限值（含字符串、缺失）给占位符。 */
  function formatMeters(value) {
    return isFiniteNumber(value) ? value.toFixed(3) : PLACEHOLDER
  }

  /** @description 三个分量的校验：必须都是长度为 3 的有限数值数组。 */
  function isTriple(value) {
    return Array.isArray(value) && value.length >= 3 && [0, 1, 2].every((axis) => isFiniteNumber(value[axis]))
  }

  function isBox(box) {
    return Boolean(box) && isTriple(box.min) && isTriple(box.max)
  }

  /** @description 每个轴的尺寸（max − min）；盒畸形、或 min/max 倒挂时为 null。 */
  function boxSize(box) {
    if (!isBox(box)) return null
    const size = [0, 1, 2].map((axis) => box.max[axis] - box.min[axis])
    // min > max 说明盒本身结构错误：宁可给占位符，也不要把负尺寸当"尺寸"印在界面上
    return size.some((value) => value < 0) ? null : size
  }

  /** @description 每个轴的中心（(min + max) ÷ 2）；盒畸形时为 null。 */
  function boxCenter(box) {
    if (!isBox(box)) return null
    return [0, 1, 2].map((axis) => (box.min[axis] + box.max[axis]) / 2)
  }

  /**
   * @description 盒的尺寸行，例如 `0.538 × 1.364 × 1.056 m`。
   *   尺寸**必须**按 max − min 逐轴算，不能直接打印 max（那是坐标不是尺寸）。
   */
  function formatBox(box) {
    const size = boxSize(box)
    if (!size) return PLACEHOLDER
    return `${size.map((value) => formatMeters(value)).join(' × ')} m`
  }

  /** @description 盒的中心行，例如 `0.000, 0.000, 0.000 m`。 */
  function formatCenter(box) {
    const center = boxCenter(box)
    if (!center) return PLACEHOLDER
    return `${center.map((value) => formatMeters(value)).join(', ')} m`
  }

  /**
   * @description 偏差的告警档位：< 10 正常，10 ~ 1000 告警，≥ 1000 错误。
   *   非有限值（没有盒/没有偏差）按正常处理——缺数据不是"错"，界面另有文案说明缺盒原因。
   */
  function deviationLevel(factor) {
    if (!isFiniteNumber(factor)) return 'ok'
    if (factor < 10) return 'ok'
    if (factor < 1000) return 'warn'
    return 'error'
  }

  function formatRatio(value) {
    return isFiniteNumber(value) ? String(Number(value.toFixed(3))) : null
  }

  /**
   * @description 偏差行的中文说明。两条守卫：
   *   1) 世界盒/accessor 盒缺失时**说清缺哪个、为什么**，而不是编造一个比值；
   *   2) 只点名**真正超过 1** 的分量——两个分量都是 1 时绝不能声称"不一致"，只超一个时
   *      不能把另一个也写成问题（旧实现打印两个相同的盒却说 "≠"）。
   * @param {object} report inspect() 的报告（可以是残缺的）。
   */
  function deviationText(report) {
    const bounds = report?.bounds
    if (!bounds || typeof bounds !== 'object') return '报告里没有包围盒数据，无法比较偏差。'

    const hasWorld = isBox(bounds.world)
    const hasAccessor = isBox(bounds.accessorUnion)
    if (!hasWorld && !hasAccessor) {
      return '世界盒与 accessor 盒都无法计算（文件没有可渲染的默认场景），无法给出偏差。'
    }
    if (!hasWorld) {
      return '世界盒无法计算（文件没有可渲染的默认场景），无法与 accessor 盒比较偏差。'
    }
    if (!hasAccessor) {
      return 'accessor 盒无法计算（图元缺少 POSITION min/max），无法与世界盒比较偏差。'
    }

    const sizeRatio = formatRatio(bounds.deviationParts?.sizeRatio)
    const centerRatio = formatRatio(bounds.deviationParts?.centerOffsetRatio)

    // 没有分解数据时只能退回总量：一致就不提偏差，避免无中生有的告警。
    if (sizeRatio === null && centerRatio === null) {
      const factor = formatRatio(bounds.deviationFactor)
      return factor === null || Number(factor) <= 1
        ? '世界盒与 accessor 盒一致，未发现取景偏差。'
        : `世界盒与 accessor 盒相差 ${factor} 倍，按 accessor 盒取景会错位。`
    }

    // 只对**报告实际给出的**分量下判断：缺一个分量时绝不替它断言"一致"（BR-025 不编造）。
    const parts = []
    const exceeding = []
    const consistent = []
    if (sizeRatio !== null) {
      parts.push(`尺寸比 ${sizeRatio}${Number(sizeRatio) > 1 ? ' 倍' : ''}`)
      if (Number(sizeRatio) > 1) exceeding.push(`尺寸比 ${sizeRatio} 倍`)
      else consistent.push(`尺寸比 ${sizeRatio}`)
    }
    if (centerRatio !== null) {
      const text = `中心偏移比 ${centerRatio}`
      parts.push(text)
      if (Number(centerRatio) > 1) exceeding.push(`中心位置相差 ${centerRatio} 倍体对角线`)
      else consistent.push(text)
    }

    if (!exceeding.length) return `世界盒与 accessor 盒一致（${parts.join('、')}）。`
    const factor = formatRatio(bounds.deviationFactor)
    if (factor === null) {
      return `世界盒与 accessor 盒存在偏差（${exceeding.join('、')}），但报告没有给出偏差倍数。`
    }
    // 文案必须与 `deviationLevel` 的档位一致：ok 档不能说"会错位"，否则界面会出现
    // "正常配色的文字在报严重问题"这种自相矛盾的组合（偏差 <10 倍属"未到告警门槛"）。
    if (deviationLevel(Number(factor)) === 'ok') {
      return `世界盒与 accessor 盒相差 ${factor} 倍，未到告警门槛（10 倍）：${parts.join('、')}。`
    }
    const note = consistent.length ? `（${consistent.join('、')}）` : ''
    return `世界盒与 accessor 盒相差 ${factor} 倍：${exceeding.join('、')}${note}，按 accessor 盒取景会错位。`
  }

  /** @description 按 level 统计问题条数；未知 level 忽略，非数组视为空。 */
  function issueCounts(issues) {
    const counts = { error: 0, warn: 0, info: 0 }
    for (const issue of Array.isArray(issues) ? issues : []) {
      const level = issue?.level
      if (ISSUE_LEVELS.includes(level)) counts[level] += 1
    }
    return counts
  }

  /** @description 问题排序：error → warn → info，同一级别保持原顺序（稳定）。 */
  function sortIssues(issues) {
    return (Array.isArray(issues) ? issues : [])
      .map((issue, index) => ({ issue, index }))
      .sort((left, right) => {
        const byLevel = issueRank(left.issue) - issueRank(right.issue)
        return byLevel !== 0 ? byLevel : left.index - right.index
      })
      .map((entry) => entry.issue)
  }

  function issueRank(issue) {
    const rank = ISSUE_LEVELS.indexOf(issue?.level)
    return rank === -1 ? ISSUE_LEVELS.length : rank
  }

  function pushRow(rows, label, parts) {
    if (parts.length) rows.push({ label, value: parts.join(' · ') })
  }

  function geometryRow(rows, geometry) {
    const parts = []
    if (isFiniteNumber(geometry?.vertices)) parts.push(`顶点 ${geometry.vertices}`)
    if (isFiniteNumber(geometry?.triangles)) parts.push(`三角面 ${geometry.triangles}`)
    // 顶点 ÷ 三角面：3.0 ≈ 三角汤，0.61 是焊接良好的参考件
    if (isFiniteNumber(geometry?.vertexReuseRatio)) parts.push(`顶点/面比 ${geometry.vertexReuseRatio}`)
    pushRow(rows, '几何', parts)
  }

  function structureRow(rows, counts) {
    const parts = []
    if (isFiniteNumber(counts?.nodes)) parts.push(`节点 ${counts.nodes}`)
    if (isFiniteNumber(counts?.meshes)) parts.push(`网格 ${counts.meshes}`)
    if (isFiniteNumber(counts?.primitives)) parts.push(`图元 ${counts.primitives}`)
    pushRow(rows, '结构', parts)
  }

  function textureRow(rows, counts, textures, images, samplers) {
    const parts = []
    // 单位分开写：counts.textures 是贴图对象数（「个」），内嵌数是图片（「张」）
    if (isFiniteNumber(counts?.textures)) parts.push(`贴图 ${counts.textures} 个`)
    if (images.length) {
      parts.push(`内嵌图片 ${images.filter((image) => isFiniteNumber(image?.bufferView)).length} 张`)
    }
    if (isFiniteNumber(textures?.placeholders)) parts.push(`1×1 占位 ${textures.placeholders} 张`)
    const npot = images.filter((image) => image?.npot === true).length
    if (npot > 0) parts.push(`非 2 次幂 ${npot} 张`)
    // NPOT 本身不致命，致命的是"NPOT + REPEAT + mipmap"这个 WebGL1 不完整组合
    const repeatMipmapped = samplers.filter((sampler) => sampler?.repeats === true && sampler?.mipmapped === true).length
    if (npot > 0 && repeatMipmapped > 0) parts.push(`REPEAT+mipmap 采样器 ${repeatMipmapped} 个`)
    pushRow(rows, '贴图', parts)
  }

  function samplingRow(rows, counts, textures) {
    const parts = []
    if (isFiniteNumber(textures?.sampledImages)) parts.push(`被采样贴图 ${textures.sampledImages} 张`)
    if (isFiniteNumber(counts?.materials)) parts.push(`材质 ${counts.materials} 个`)
    pushRow(rows, '采样', parts)
  }

  function axisRow(rows, axes) {
    if (!axes || typeof axes !== 'object') return
    // 用 hasOwn 查表：对象下标会把 '__proto__'/'constructor' 这类键解析成原型成员，
    // 渲染出 `[object Object]（function Object() …）` 这种垃圾（真实报告不会给出这些值，
    // 但面板对任何输入都不该输出这种东西）
    const axisLabel = Object.hasOwn(AXIS_LABELS, axes.axis) ? AXIS_LABELS[axes.axis] : undefined
    const confidenceLabel = Object.hasOwn(CONFIDENCE_LABELS, axes.confidence)
      ? CONFIDENCE_LABELS[axes.confidence]
      : undefined
    if (!axisLabel && !confidenceLabel) return
    const head = `${axisLabel ?? String(axes.axis)}（${confidenceLabel ?? String(axes.confidence)}）`
    const reason = typeof axes.reason === 'string' && axes.reason ? `—— ${axes.reason}` : ''
    rows.push({ label: '上轴', value: `${head}${reason}` })
  }

  /**
   * @description 比例尺行。`inspect.js` 只在"中位节点缩放 <0.01 或 >100"时给 `hint`，而
   *   多数正常资产都是 1 倍缩放，于是"比例尺"这一行会整行消失——那正是本任务要求展示的
   *   事实之一。所以 hint 为空时退化成"中位节点缩放 + 带非单位缩放的节点数"，仍然只报有
   *   的数据，绝不编造。
   */
  function scaleRow(rows, scale) {
    if (!scale || typeof scale !== 'object') return
    if (typeof scale.hint === 'string' && scale.hint) {
      rows.push({ label: '比例尺', value: scale.hint })
      return
    }
    const parts = []
    if (isFiniteNumber(scale.medianNodeScale)) parts.push(`中位节点缩放 ${scale.medianNodeScale}`)
    if (isFiniteNumber(scale.scaledNodeCount) && scale.scaledNodeCount > 0) {
      parts.push(`${scale.scaledNodeCount} 个节点不是单位缩放`)
    }
    if (parts.length) rows.push({ label: '比例尺', value: `${parts.join(' · ')}（未见异常缩放）` })
  }

  /**
   * @description 面板用的中文键值行。只输出**有数据**的行：任何一个字段缺失都不会在界面上
   *   变出 `undefined`（"报告可以降级，界面不能崩"）。
   * @param {object} report inspect() 的报告（可以是残缺的）。
   * @returns {{label: string, value: string}[]}
   */
  function factRows(report) {
    const rows = []
    const source = report && typeof report === 'object' ? report : {}
    const counts = source.counts && typeof source.counts === 'object' ? source.counts : {}
    const textures = source.textures && typeof source.textures === 'object' ? source.textures : {}
    const images = Array.isArray(source.images) ? source.images.filter(Boolean) : []
    const samplers = Array.isArray(source.samplers) ? source.samplers.filter(Boolean) : []
    geometryRow(rows, source.geometry)
    structureRow(rows, counts)
    textureRow(rows, counts, textures, images, samplers)
    samplingRow(rows, counts, textures)
    axisRow(rows, source.axes)
    scaleRow(rows, source.scale)
    return rows
  }

  const api = {
    deviationLevel,
    deviationText,
    factRows,
    formatBox,
    formatCenter,
    formatMeters,
    issueCounts,
    sortIssues,
  }

  // 同一份文件两用：node --test 里 require 它，渲染进程里以普通 <script> 加载后读 window。
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.reportFormat = api
})()
