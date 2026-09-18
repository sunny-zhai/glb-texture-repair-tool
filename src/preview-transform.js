// 预览侧的方向/缩放/上轴修正（纯函数，无 Electron/DOM/Cesium 依赖）。
//
// 为什么只改预览（ADR-004）：预览拖一下就改写源资产会同时带来两个后果——不可逆地修改
// 用户文件，以及"看到的"与"存下来的"不一致而无人察觉。因此这里的输出只喂给 Cesium 的
// modelMatrix，最终矩阵写进日志，写回必须是另一个**显式**操作（当前不存在）。
//
// 为什么方向只绕 Y 轴：体检与 IVE 转换已经把模型贴地（min.y = 0）并水平归心，绕原点转 Y 轴
// 不会把它转出地面；绕 X/Z 转会让脚部陷进或浮出地面，反而制造"看着不对"的假象。唯一的
// 例外是**上轴三态**里用户显式选了 `Z-up → Y-up`（ADR-002：推断绝不自作主张，由人点一次），
// 此时先绕 X 轴 −90° 把模型转正，方向/缩放再叠在它之后。
//
// 矩阵按**列主序**（16 个数、列优先）输出：Cesium.Matrix4.fromArray 与 glTF 矩阵同序。
// 无平移分量——平移会破坏"贴地 + 归心"这个既有前提。
//
// 整个文件包在 IIFE 里：它是**普通 <script>**（不是 ES module / CommonJS 模块），而普通
// <script> 共享同一个全局词法作用域。原先裸写的 `const api` 与 report-format.js 的同名
// 声明相撞，实测让本文件整体抛 `SyntaxError: Identifier 'api' has already been declared`
// 而**完全不执行**（预览控件静默失效，只在控制台留一行错）。包壳后各文件互不干扰，全局只
// 留下 window.previewTransform 一个入口。
;(function () {
  const PREVIEW_DEFAULT = { yawDeg: 0, scale: 1, axis: 'auto' }

  const YAW_RANGE = 360
  const SCALE_MIN = 0.05
  const SCALE_MAX = 20
  const DEG_TO_RAD = Math.PI / 180

  // 上轴三态（ADR-002）：auto/y 都不额外旋转，z 表示"这份数据其实是 Z-up"，
  // 预览里绕 X 轴 −90° 转正（与 src/ive.js 的轴转换同向、同角度）。
  const AXIS_OPTIONS = ['auto', 'y', 'z']
  const AXIS_LABELS = {
    auto: '自动（按推断展示，不额外旋转）',
    y: 'Y-up（不额外旋转）',
    z: 'Z-up → Y-up（预览绕 X 轴 −90°）',
  }
  // 列主序的 Rx(−90°)：Z-up 的 +Z 映射到 Y-up 的 +Y，+Y 映射到 −Z。
  const Z_UP_TO_Y_UP = [
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ]

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  /** @description 把任意角度规整到 [0, 360)；-0 也归一成 0，避免日志出现「-0°」。 */
  function normalizeYaw(value) {
    const wrapped = ((value % YAW_RANGE) + YAW_RANGE) % YAW_RANGE
    return wrapped === 0 ? 0 : wrapped
  }

  /** @description 列主序 4×4 相乘（与 Cesium.Matrix4.multiply 同序）：结果 = left × right。 */
  function multiply(left, right) {
    const result = new Array(16).fill(0)
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0
        for (let k = 0; k < 4; k += 1) sum += left[k * 4 + row] * right[column * 4 + k]
        result[column * 4 + row] = sum
      }
    }
    return result
  }

  /**
   * @description 把界面/外部传来的方向、缩放与上轴规整成合法值。缺字段、非数字、NaN、
   *   Infinity 一律退回默认值，方向折回 [0, 360)，缩放夹到 [0.05, 20]，上轴只认三态枚举。
   * @param {{yawDeg?: number, scale?: number, axis?: string}|null|undefined} input
   * @returns {{yawDeg: number, scale: number, axis: string}}
   */
  function clampPreview(input) {
    const source = input && typeof input === 'object' ? input : {}
    const yaw = Number(source.yawDeg)
    const scale = Number(source.scale)
    return {
      yawDeg: Number.isFinite(yaw) ? normalizeYaw(yaw) : PREVIEW_DEFAULT.yawDeg,
      scale: Number.isFinite(scale) ? clamp(scale, SCALE_MIN, SCALE_MAX) : PREVIEW_DEFAULT.scale,
      axis: AXIS_OPTIONS.includes(source.axis) ? source.axis : PREVIEW_DEFAULT.axis,
    }
  }

  /**
   * @description 预览矩阵：均匀缩放 × 绕 Y 轴旋转（可选的 Z-up→Y-up 绕 X −90° 在最内层），
   *   无平移。列主序 16 元素数组，直接交给 Cesium.Matrix4.fromArray。默认输入得到单位矩阵。
   * @param {{yawDeg?: number, scale?: number, axis?: string}|null|undefined} input
   * @returns {number[]} 16 个元素（列优先：第 0 列在前）
   */
  function previewMatrix(input) {
    const { yawDeg, scale, axis } = clampPreview(input)
    const radians = yawDeg * DEG_TO_RAD
    const cos = Math.cos(radians) * scale
    const sin = Math.sin(radians) * scale
    // -sin 在 0°/180° 处会得到 -0，矩阵组合后还会留下 ±1e-16 量级的浮点残渣：矩阵本身没问题，
    // 但日志与断言里"-0.0000"很难看，且 deepStrictEqual 会把 -0 与 0 判为不同，所以统一归零。
    const clean = (value) => (Math.abs(value) < 1e-12 ? 0 : value)
    const scaleAndYaw = [
      clean(cos), 0, clean(-sin), 0,
      0, scale, 0, 0,
      clean(sin), 0, clean(cos), 0,
      0, 0, 0, 1,
    ]
    if (axis !== 'z') return scaleAndYaw
    // 先转正再旋转/缩放：M = S·Ry·Rx（点按 Rx → Ry → S 的顺序被作用）
    return multiply(scaleAndYaw, Z_UP_TO_Y_UP).map(clean)
  }

  function formatYaw(yawDeg) {
    return `${Number(yawDeg.toFixed(1))}°`
  }

  function formatScale(scale) {
    return `${scale.toFixed(2)}×`
  }

  /**
   * @description 一行中文摘要，例如 `方向 90° · 缩放 2.00× · 上轴 Z-up → Y-up（预览绕 X 轴 −90°）`；
   *   等于默认值时明确标注默认。
   */
  function describePreview(input) {
    const preview = clampPreview(input)
    const parts = [`方向 ${formatYaw(preview.yawDeg)}`, `缩放 ${formatScale(preview.scale)}`]
    if (preview.axis !== PREVIEW_DEFAULT.axis) parts.push(`上轴 ${AXIS_LABELS[preview.axis]}`)
    const isDefault = preview.yawDeg === PREVIEW_DEFAULT.yawDeg
      && preview.scale === PREVIEW_DEFAULT.scale
      && preview.axis === PREVIEW_DEFAULT.axis
    const summary = parts.join(' · ')
    return isDefault ? `默认（${summary}）` : summary
  }

  /** @description 上轴三态的界面选项（值 + 中文标签），供渲染进程渲染 <select>。 */
  function axisOptions() {
    return AXIS_OPTIONS.map((value) => ({ value, label: AXIS_LABELS[value] }))
  }

  const api = {
    PREVIEW_DEFAULT,
    axisOptions,
    clampPreview,
    describePreview,
    previewMatrix,
  }

  // 同一份文件两用：node --test 里 require 它，渲染进程里以普通 <script> 加载后读 window。
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.previewTransform = api
})()
