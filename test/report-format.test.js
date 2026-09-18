const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  deviationLevel,
  deviationText,
  factRows,
  formatBox,
  formatCenter,
  formatMeters,
  issueCounts,
  sortIssues,
} = require('../src/report-format')
const { inspect } = require('../src/inspect')
const { writeGlb } = require('../src/repair')

/** @description 一份字段齐全的报告，用来验证 factRows 真的读的是 inspect.js 的字段名。 */
function fullReport() {
  return {
    ok: true,
    fileName: 'sample.glb',
    elapsedMs: 12,
    counts: { scenes: 1, nodes: 7, meshes: 3, primitives: 5, materials: 4, textures: 3, images: 3, samplers: 2 },
    geometry: { vertices: 11516, triangles: 18924, vertexReuseRatio: 0.6085 },
    images: [
      { index: 0, bufferView: 4, mimeType: 'image/png', width: 512, height: 512, npot: false },
      { index: 1, bufferView: 5, mimeType: 'image/jpeg', width: 3, height: 2, npot: true },
      { index: 2, bufferView: null, uri: 'spare.png', external: true, width: 1, height: 1, npot: false },
    ],
    textures: { total: 3, sampledImages: 2, placeholders: 1, dimensionsKnown: 3 },
    samplers: [{ index: 0, wrapS: 10497, wrapT: 10497, minFilter: 9987, repeats: true, mipmapped: true }],
    bounds: {
      world: { min: [0, 0, -0.528], max: [0.538, 1.364, 0.528] },
      accessorUnion: { min: [0, 0, -0.528], max: [0.538, 1.364, 0.528] },
      worldSize: [0.538, 1.364, 1.056],
      worldCenter: [0.269, 0.682, 0],
      deviationFactor: 1,
      deviationParts: { factor: 1, sizeRatio: 1, centerOffsetRatio: 0 },
    },
    axes: { axis: 'Y', confidence: 'medium', reason: '生成器 "FBX2glTF" 按 Y-up 约定输出' },
    scale: { medianNodeScale: 0.01, scaledNodeCount: 7, hint: '多数节点带 0.01 倍缩放，疑似单位修正（毫米/厘米 → 米）' },
    issues: [
      { level: 'info', code: 'UNREFERENCED_MESHES', message: '1 个网格没有被默认场景引用' },
      { level: 'error', code: 'MISSING_TEXCOORD', message: '1 个图元采样了贴图但缺少对应 TEXCOORD_n' },
      { level: 'warn', code: 'TEXTURE_1X1_PLACEHOLDER', message: '贴图 2 是 1×1 占位图' },
    ],
  }
}

test('report-format: formatMeters 保留三位小数，非有限值给占位符', () => {
  assert.equal(formatMeters(0.5384), '0.538')
  assert.equal(formatMeters(-1.2), '-1.200')
  assert.equal(formatMeters(0), '0.000')
  assert.equal(formatMeters(NaN), '—')
  assert.equal(formatMeters(Infinity), '—')
  assert.equal(formatMeters(undefined), '—')
  assert.equal(formatMeters(null), '—')
  assert.equal(formatMeters('0.5'), '—')
})

test('report-format: formatBox 按 max − min 求尺寸', () => {
  assert.equal(
    formatBox({ min: [0.1, 0, 0], max: [0.638, 1.364, 1.056] }),
    '0.538 × 1.364 × 1.056 m',
  )
  // 零厚度（薄板）要报 0.000 而不是被当成缺数据
  assert.equal(
    formatBox({ min: [0, 0, 0], max: [2, 0, 3] }),
    '2.000 × 0.000 × 3.000 m',
  )
})

test('report-format: formatBox/formatCenter 对 null 与畸形盒给占位符而不是抛异常', () => {
  for (const malformed of [
    null,
    undefined,
    {},
    { min: [0, 0, 0] },
    { min: [0, 0, 0], max: [1, 1] },
    { min: 'x', max: [1, 1, 1] },
    { min: [0, NaN, 0], max: [1, 1, 1] },
    { min: [0, 0, 0], max: [1, 1, 'z'] },
    { min: [3, 3, 3], max: [1, 1, 1] }, // min/max 倒挂：尺寸会是负数，中心也没有意义
    'box',
  ]) {
    assert.equal(formatBox(malformed), '—', `${JSON.stringify(malformed)} 应给占位符`)
    assert.equal(formatCenter(malformed), '—', `${JSON.stringify(malformed)} 应给占位符`)
  }
})

test('report-format: formatCenter 由 (min + max) ÷ 2 求中心', () => {
  assert.equal(
    formatCenter({ min: [0.1, 0, 0], max: [0.638, 1.364, 1.056] }),
    '0.369, 0.682, 0.528 m',
  )
  assert.equal(formatCenter({ min: [-1, -2, -3], max: [1, 2, 3] }), '0.000, 0.000, 0.000 m')
})

test('report-format: deviationLevel 的门槛是 10 与 1000', () => {
  assert.equal(deviationLevel(1), 'ok')
  assert.equal(deviationLevel(9.99), 'ok')
  assert.equal(deviationLevel(10), 'warn')
  assert.equal(deviationLevel(999.99), 'warn')
  assert.equal(deviationLevel(1000), 'error')
  assert.equal(deviationLevel(229713), 'error')
  // 缺数据（没有盒 / 没有偏差）不是"错"：按正常处理，界面另有文案解释缺盒原因
  assert.equal(deviationLevel(NaN), 'ok')
  assert.equal(deviationLevel(Infinity), 'ok')
  assert.equal(deviationLevel(undefined), 'ok')
  assert.equal(deviationLevel(null), 'ok')
  assert.equal(deviationLevel('10'), 'ok')
})

test('report-format: deviationText 在两个分量都不超过 1 时不谎报不一致', () => {
  // 上一版功能正是在这里自相矛盾：打印两个相同的盒却说"≠"
  const text = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [0, 0, 0], max: [1, 1, 1] },
      deviationFactor: 1,
      deviationParts: { factor: 1, sizeRatio: 1, centerOffsetRatio: 0 },
    },
  })
  assert.equal(text, '世界盒与 accessor 盒一致（尺寸比 1、中心偏移比 0）。')

  // 边界：中心偏移比恰好为 1（不是 > 1）仍属"一致"档，且两个数字都照实打印
  const boundary = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [1, 0, 0], max: [2, 1, 1] },
      deviationFactor: 2,
      deviationParts: { factor: 2, sizeRatio: 1, centerOffsetRatio: 1 },
    },
  })
  assert.equal(deviationLevel(2), 'ok', '偏差 2 不该上告警色')
  assert.match(boundary, /一致/)
  assert.match(boundary, /中心偏移比 1/)
  assert.doesNotMatch(boundary, /相差/)
  assert.doesNotMatch(boundary, /错位/)
  assert.doesNotMatch(boundary, /undefined|null/)
})

test('report-format: 偏差档位与文案必须一致（颜色不能和文字互相打脸）', () => {
  const build = (deviationFactor, deviationParts) => ({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [0, 0, 0], max: [2, 2, 2] },
      deviationFactor,
      deviationParts,
    },
  })
  const cases = [
    { factor: 1, parts: { sizeRatio: 1, centerOffsetRatio: 0 }, level: 'ok' },
    { factor: 9.99, parts: { sizeRatio: 9.99, centerOffsetRatio: 0 }, level: 'ok' },
    { factor: 10, parts: { sizeRatio: 10, centerOffsetRatio: 0 }, level: 'warn' },
    { factor: 999.99, parts: { sizeRatio: 1, centerOffsetRatio: 998.99 }, level: 'warn' },
    { factor: 1000, parts: { sizeRatio: 1000, centerOffsetRatio: 0 }, level: 'error' },
    // 只有总量、没有分量分解时也必须过档位（冷审实测这一支曾漏判，ok 档却写"会错位"）
    { factor: 1, parts: null, level: 'ok' },
    { factor: 5, parts: null, level: 'ok' },
    { factor: 9.99, parts: null, level: 'ok' },
    { factor: 10, parts: null, level: 'warn' },
    { factor: 5000, parts: null, level: 'error' },
  ]
  for (const item of cases) {
    const report = build(item.factor, item.parts)
    assert.equal(deviationLevel(item.factor), item.level, `偏差 ${item.factor} 的档位`)
    const text = deviationText(report)
    if (item.level === 'ok') {
      // ok 档的文字里绝不能出现"错位"，否则面板会出现"正常配色的文字在报严重问题"
      assert.doesNotMatch(text, /错位/, `偏差 ${item.factor}（parts=${JSON.stringify(item.parts)}）是 ok 档：${text}`)
      assert.match(text, item.factor > 1 ? /未到告警门槛/ : /一致/, `偏差 ${item.factor} 的文案：${text}`)
    } else {
      assert.match(text, /相差/, `偏差 ${item.factor} 是 ${item.level} 档，文案必须点出偏差：${text}`)
      assert.match(text, /错位/, `偏差 ${item.factor} 的文案必须说明取景后果：${text}`)
    }
    assert.doesNotMatch(text, /undefined|null|NaN/)
  }
})

test('report-format: deviationText 只点名真正超过 1 的分量，未超的照实附注', () => {
  const sizeOnly = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [0, 0, 0], max: [1000, 1000, 1000] },
      deviationFactor: 1000,
      deviationParts: { factor: 1000, sizeRatio: 1000, centerOffsetRatio: 0 },
    },
  })
  assert.equal(sizeOnly, '世界盒与 accessor 盒相差 1000 倍：尺寸比 1000 倍（中心偏移比 0），按 accessor 盒取景会错位。')

  const centerOnly = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [1000, 1000, 1000], max: [1001, 1001, 1001] },
      deviationFactor: 1001,
      deviationParts: { factor: 1001, sizeRatio: 1, centerOffsetRatio: 1000 },
    },
  })
  assert.equal(centerOnly, '世界盒与 accessor 盒相差 1001 倍：中心位置相差 1000 倍体对角线（尺寸比 1），按 accessor 盒取景会错位。')

  const both = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [10, 10, 10], max: [20, 20, 20] },
      deviationFactor: 30,
      deviationParts: { factor: 30, sizeRatio: 10, centerOffsetRatio: 29 },
    },
  })
  assert.equal(both, '世界盒与 accessor 盒相差 30 倍：尺寸比 10 倍、中心位置相差 29 倍体对角线，按 accessor 盒取景会错位。')
})

test('report-format: deviationParts 残缺时只报已知分量，绝不替缺失分量断言', () => {
  const onlySize = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [0, 0, 0], max: [20, 20, 20] },
      deviationFactor: 20,
      deviationParts: { sizeRatio: 20 },
    },
  })
  // 只说尺寸：不得凭空说"中心位置基本一致"
  assert.equal(onlySize, '世界盒与 accessor 盒相差 20 倍：尺寸比 20 倍，按 accessor 盒取景会错位。')
  assert.doesNotMatch(onlySize, /中心/)

  const onlyCenter = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [50, 0, 0], max: [51, 1, 1] },
      deviationFactor: 60,
      deviationParts: { centerOffsetRatio: 50 },
    },
  })
  assert.equal(onlyCenter, '世界盒与 accessor 盒相差 60 倍：中心位置相差 50 倍体对角线，按 accessor 盒取景会错位。')
  assert.doesNotMatch(onlyCenter, /尺寸/)

  // 低于告警门槛时同样只报已知分量，且不谎称"会错位"
  const okLevel = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [0, 0, 0], max: [2, 2, 2] },
      deviationFactor: 2,
      deviationParts: { sizeRatio: 2 },
    },
  })
  assert.equal(okLevel, '世界盒与 accessor 盒相差 2 倍，未到告警门槛（10 倍）：尺寸比 2 倍。')

  // 连偏差倍数都没有：说清缺什么，不编
  const noFactor = deviationText({
    bounds: {
      world: { min: [0, 0, 0], max: [1, 1, 1] },
      accessorUnion: { min: [0, 0, 0], max: [3, 3, 3] },
      deviationFactor: null,
      deviationParts: { sizeRatio: 3 },
    },
  })
  assert.equal(noFactor, '世界盒与 accessor 盒存在偏差（尺寸比 3 倍），但报告没有给出偏差倍数。')
})

test('report-format: deviationText 在缺盒时说明原因而不是编造比值', () => {
  const noWorld = deviationText({
    bounds: {
      world: null,
      accessorUnion: { min: [0, 0, 0], max: [1, 1, 1] },
      deviationFactor: null,
      deviationParts: null,
    },
  })
  assert.match(noWorld, /世界盒无法计算/)
  assert.match(noWorld, /默认场景/)
  assert.doesNotMatch(noWorld, /undefined|null/)

  const noBoxAtAll = deviationText({ bounds: { world: null, accessorUnion: null } })
  assert.match(noBoxAtAll, /都无法计算/)

  const noBounds = deviationText({ ok: true })
  assert.equal(noBounds, '报告里没有包围盒数据，无法比较偏差。')
  assert.equal(deviationText(undefined), '报告里没有包围盒数据，无法比较偏差。')
  assert.equal(deviationText(null), '报告里没有包围盒数据，无法比较偏差。')
  assert.equal(deviationText('report'), '报告里没有包围盒数据，无法比较偏差。')
})

test('report-format: issueCounts 按 level 计数并容忍畸形输入', () => {
  const counts = issueCounts(fullReport().issues)
  assert.deepEqual(counts, { error: 1, warn: 1, info: 1 })

  assert.deepEqual(issueCounts([]), { error: 0, warn: 0, info: 0 })
  assert.deepEqual(issueCounts(undefined), { error: 0, warn: 0, info: 0 })
  assert.deepEqual(issueCounts('issues'), { error: 0, warn: 0, info: 0 })
  // 未知/缺失 level 不计入（且不能因为 'toString' 之类原型键而崩）
  assert.deepEqual(
    issueCounts([{ level: 'fatal' }, { level: 'toString' }, null, {}, { level: 'error' }]),
    { error: 1, warn: 0, info: 0 },
  )
})

test('report-format: sortIssues 按 error → warn → info 排序且同级稳定', () => {
  const issues = fullReport().issues
  const sorted = sortIssues(issues)
  assert.deepEqual(sorted.map((issue) => issue.level), ['error', 'warn', 'info'])
  // 稳定：同级保持原有相对顺序
  const sameLevel = [
    { level: 'info', code: 'A' },
    { level: 'error', code: 'B' },
    { level: 'info', code: 'C' },
    { level: 'error', code: 'D' },
  ]
  assert.deepEqual(sortIssues(sameLevel).map((issue) => issue.code), ['B', 'D', 'A', 'C'])
  // 返回新数组，不改动入参
  assert.notEqual(sorted, issues)
  assert.deepEqual(issues.map((issue) => issue.code), ['UNREFERENCED_MESHES', 'MISSING_TEXCOORD', 'TEXTURE_1X1_PLACEHOLDER'])
  assert.deepEqual(sortIssues(null), [])
})

test('report-format: factRows 用真实报告字段生成中文行', () => {
  const rows = factRows(fullReport())
  const byLabel = new Map(rows.map((row) => [row.label, row.value]))
  assert.deepEqual([...byLabel.keys()], ['几何', '结构', '贴图', '采样', '上轴', '比例尺'])

  assert.equal(byLabel.get('几何'), '顶点 11516 · 三角面 18924 · 顶点/面比 0.6085')
  assert.equal(byLabel.get('结构'), '节点 7 · 网格 3 · 图元 5')
  assert.equal(byLabel.get('贴图'), '贴图 3 个 · 内嵌图片 2 张 · 1×1 占位 1 张 · 非 2 次幂 1 张 · REPEAT+mipmap 采样器 1 个')
  assert.equal(byLabel.get('采样'), '被采样贴图 2 张 · 材质 4 个')
  assert.match(byLabel.get('上轴'), /^Y 轴（中等置信度）/)
  assert.match(byLabel.get('比例尺'), /疑似单位修正/)

  for (const row of rows) {
    assert.equal(typeof row.label, 'string')
    assert.equal(typeof row.value, 'string')
    assert.doesNotMatch(row.value, /undefined|null|NaN/)
  }
})

test('report-format: factRows 对残缺报告降级而不是渲染 undefined', () => {
  // 完全没有数据 → 一行都不给（而不是给"顶点 undefined"）
  assert.deepEqual(factRows(undefined), [])
  assert.deepEqual(factRows(null), [])
  assert.deepEqual(factRows({}), [])
  assert.deepEqual(factRows('report'), [])

  // 只有一部分字段 → 只出这一行，且值照实
  assert.deepEqual(factRows({ geometry: { vertices: 3 } }), [{ label: '几何', value: '顶点 3' }])
  assert.deepEqual(factRows({ counts: { nodes: 2 } }), [{ label: '结构', value: '节点 2' }])

  for (const malformed of [{ counts: null, geometry: 'x', images: 'x' }, { images: [null, 3] }, { axes: 5, scale: [] }]) {
    let rows
    assert.doesNotThrow(() => { rows = factRows(malformed) })
    assert.ok(Array.isArray(rows))
    for (const row of rows) {
      assert.doesNotMatch(row.value, /undefined|null|NaN/, `${JSON.stringify(malformed)} 渲染出了空值`)
    }
  }
  // 没有上轴数据就不给"上轴"行，而不是给一行"undefined（undefined）"
  assert.deepEqual(factRows({ axes: {} }), [])
  // 原型键不得被当成轴名渲染成 [object Object] / function ...
  assert.deepEqual(factRows({ axes: { axis: '__proto__', confidence: 'constructor' } }), [])
})

test('report-format: 比例尺行在 hint 为空时退化为中位缩放（否则这一行永远不出现）', () => {
  // inspect.js 只在 <0.01 或 >100 时给 hint，正常资产会整行消失——那正是要展示的事实之一
  assert.deepEqual(
    factRows({ scale: { medianNodeScale: 1, scaledNodeCount: 0, hint: null } }),
    [{ label: '比例尺', value: '中位节点缩放 1（未见异常缩放）' }],
  )
  // 有非单位缩放节点时只摆事实：inspect.js 的门槛是严格 >100，100 恰好"不算异常"，
  // 再并排印一句"未见异常缩放"会读着别扭
  assert.deepEqual(
    factRows({ scale: { medianNodeScale: 100, scaledNodeCount: 3 } }),
    [{ label: '比例尺', value: '中位节点缩放 100 · 3 个节点不是单位缩放' }],
  )
  // 有 hint 时优先用 hint（那是 inspect.js 的结论）
  assert.deepEqual(
    factRows({ scale: { medianNodeScale: 0.001, hint: '疑似毫米 → 米' } }),
    [{ label: '比例尺', value: '疑似毫米 → 米' }],
  )
  // 什么缩放数据都没有 → 不给这一行
  assert.deepEqual(factRows({ scale: {} }), [])
})

test('report-format: 对真实 inspect() 报告（合成 GLB）不渲染空值并能生成完整行', () => {
  // 这条用例的作用是**锁住字段名**：fixture 是手写的，只有真跑一遍 inspect() 才能发现
  // inspect.js 改了字段名而 report-format.js 没跟上。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-format-test-'))
  const file = path.join(dir, 'triangle.glb')
  const bin = Buffer.alloc(36)
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0]
  positions.forEach((value, index) => bin.writeFloatLE(value, index * 4))
  writeGlb(file, {
    asset: { version: '2.0', generator: 'unit-test' },
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    nodes: [{ mesh: 0, name: 'tri' }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }, bin)

  const report = inspect(file)
  assert.equal(report.ok, true, JSON.stringify(report.issues))
  assert.equal(report.geometry.vertices, 3)
  assert.equal(report.geometry.triangles, 1)

  const rows = factRows(report)
  const byLabel = new Map(rows.map((row) => [row.label, row.value]))
  assert.deepEqual([...byLabel.keys()], ['几何', '结构', '贴图', '采样', '上轴', '比例尺'])
  assert.equal(byLabel.get('几何'), '顶点 3 · 三角面 1 · 顶点/面比 3')
  assert.equal(byLabel.get('结构'), '节点 1 · 网格 1 · 图元 1')
  // 0 张贴图也要显示：这正是"材质在、贴图不在"这类问题的证据
  assert.equal(byLabel.get('贴图'), '贴图 0 个 · 1×1 占位 0 张')
  assert.equal(byLabel.get('采样'), '被采样贴图 0 张 · 材质 1 个')
  // 无导出器签名 → 保守给出 unknown/low，并且不给"比例尺"编数字
  assert.match(byLabel.get('上轴'), /^未知（低置信度）/)
  assert.match(byLabel.get('比例尺'), /^中位节点缩放 1/)

  // 这个模型的两种盒一致：档位必须是 ok，文案里不能出现"相差/错位"
  assert.equal(deviationLevel(report.bounds.deviationFactor), 'ok')
  const text = deviationText(report)
  assert.doesNotMatch(text, /相差|错位/)
  assert.equal(issueCounts(report.issues).error, 0)

  for (const row of rows) assert.doesNotMatch(row.value, /undefined|null|NaN/)
  assert.doesNotMatch(text, /undefined|null|NaN/)
  fs.rmSync(dir, { recursive: true, force: true })
})
