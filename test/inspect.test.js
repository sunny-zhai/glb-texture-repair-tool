const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { formatReport, guessUpAxis, imageDimensions, inspect } = require('../src/inspect')
const {
  accessorUnionBounds,
  boundsSize,
  deviationFactor,
  worldBounds,
} = require('../src/transform')
const { writeGlb } = require('../src/repair')

const projectRoot = path.join(__dirname, '..')
const corpusDirs = ['o-model', 'model'].map((name) => path.join(projectRoot, name))
const personReference = path.join(projectRoot, 'model', '蹲姿.glb')
const truckFixture = path.join(projectRoot, 'o-model', '运输车.glb')
const heavyFixture = path.join(projectRoot, 'o-model', 'M1A2艾布拉姆斯坦克.glb')

// 1×1 RGBA PNG：用来构造"占位贴图"场景
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAQbT8WQAAAABJRU5ErkJggg==',
  'base64',
)

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inspect-test-'))
}

/** @description 收集样例集里实际存在的 GLB（样本数按磁盘为准，不写死）。 */
function corpusFiles() {
  const files = []
  for (const dir of corpusDirs) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.glb')) files.push(path.join(dir, name))
    }
  }
  return files
}

function corpusSkipReason() {
  const files = corpusFiles()
  return files.length ? false : `缺少样例 GLB（${corpusDirs.join('、')}）`
}

/**
 * @description 构造一个最小 GLB：一个三角形网格由节点矩阵（平移 + 均匀缩放）变换。
 *   accessor min/max 故意写成放大后的值，用来制造 accessor 盒与真实世界盒的失真。
 */
function writeScaledTriangleGlb(outputPath, { accessorSize = 1000, nodeScale = 0.001, withTexCoord = true } = {}) {
  const attributes = { POSITION: 0 }
  if (withTexCoord) attributes.TEXCOORD_0 = 1
  const accessors = [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [accessorSize, accessorSize, accessorSize] },
  ]
  const bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 36 }]
  if (withTexCoord) {
    accessors.push({ bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' })
    bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 24 })
  }
  accessors.push({ bufferView: 2, componentType: 5125, count: 3, type: 'SCALAR' })
  bufferViews.push({ buffer: 0, byteOffset: 60, byteLength: 12 })

  const json = {
    asset: { version: '2.0' },
    accessors,
    bufferViews,
    buffers: [{ byteLength: 72 }],
    meshes: [{ primitives: [{ attributes, indices: accessors.length - 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    nodes: [{
      mesh: 0,
      matrix: [nodeScale, 0, 0, 0, 0, nodeScale, 0, 0, 0, 0, nodeScale, 0, 5, 6, 7, 1],
    }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }
  // 图片字节单独占一个 bufferView
  const bin = Buffer.concat([Buffer.alloc(72), TINY_PNG])
  json.bufferViews.push({ buffer: 0, byteOffset: 72, byteLength: TINY_PNG.length })
  json.buffers = [{ byteLength: bin.length }]
  writeGlb(outputPath, json, bin)
}

// ---------------------------------------------------------------- 纯单元测试

test('inspect: imageDimensions 从 PNG/JPEG 头读出宽高', () => {
  assert.deepEqual(imageDimensions(TINY_PNG, 'image/png'), { width: 1, height: 1 })
  assert.equal(imageDimensions(Buffer.from('not an image'), 'image/png'), null)
  assert.equal(imageDimensions(Buffer.alloc(0), 'image/jpeg'), null)
})

test('inspect: guessUpAxis 有导出器签名时给 Y 轴中等置信度，否则不下结论', () => {
  const bounds = { min: [0, 0, 0], max: [1, 2, 1] }
  const signed = guessUpAxis(bounds, 'FBX2glTF v0.9.7')
  assert.equal(signed.axis, 'Y')
  assert.equal(signed.confidence, 'medium')

  const unsigned = guessUpAxis(bounds, null)
  assert.equal(unsigned.axis, 'unknown')
  assert.equal(unsigned.confidence, 'low')
  assert.match(unsigned.reason, /不足以判定上轴/)
})

test('transform: worldBounds 累乘节点矩阵，accessorUnionBounds 不含变换', () => {
  const json = {
    accessors: [{ min: [0, 0, 0], max: [10, 10, 10] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0, matrix: [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 1, 2, 3, 1] }],
    scenes: [{ nodes: [0] }],
  }
  const localBounds = [{ min: [0, 0, 0], max: [10, 10, 10] }]
  const world = worldBounds(json.nodes, json.scenes, localBounds)
  assert.deepEqual(world.min, [1, 2, 3])
  assert.deepEqual(world.max, [6, 7, 8])

  // accessor 并集仍是原样的 10×10×10 —— 这正是"失真"的来源
  assert.deepEqual(boundsSize(accessorUnionBounds(json)), [10, 10, 10])
  assert.equal(deviationFactor(accessorUnionBounds(json), world), 2)
})

test('transform: deviationFactor 取三轴中最坏的一轴', () => {
  const left = { min: [0, 0, 0], max: [100, 1, 1] }
  const right = { min: [0, 0, 0], max: [1, 1, 1] }
  assert.equal(deviationFactor(left, right), 100)
  assert.equal(deviationFactor(null, right), null)
})

// ---------------------------------------------------------------- 合成 GLB

test('inspect: 合成 GLB 的报告含几何统计与三角汤判定', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'scaled.glb')
    writeScaledTriangleGlb(file, { accessorSize: 1000, nodeScale: 0.001 })
    const report = inspect(file)

    assert.equal(report.ok, true)
    assert.equal(report.counts.meshes, 1)
    assert.equal(report.counts.primitives, 1)
    assert.equal(report.geometry.vertices, 3)
    assert.equal(report.geometry.triangles, 1)
    assert.equal(report.geometry.vertexReuseRatio, 3) // 3 顶点/面 = 三角汤
    assert.ok(report.issues.some((issue) => issue.code === 'TRIANGLE_SOUP'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 报告世界盒而非 accessor 盒，并按倍数告警', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'scaled.glb')
    writeScaledTriangleGlb(file, { accessorSize: 1000, nodeScale: 0.001 })
    const report = inspect(file)

    // accessor 盒 1000³，被 0.001 的节点缩放还原成 1³
    assert.deepEqual(report.bounds.accessorUnionSize, [1000, 1000, 1000])
    assert.deepEqual(report.bounds.worldSize, [1, 1, 1])
    assert.equal(report.bounds.deviationFactor, 1000)
    assert.ok(report.bounds.deviationFactor > 10)
    const issue = report.issues.find((item) => item.code === 'ACCESSOR_BOUNDS_UNRELIABLE')
    assert.ok(issue, '应给出 accessor 盒不可信的告警')
    assert.match(issue.message, /相差 1000 倍/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 识别 1×1 占位贴图', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'scaled.glb')
    writeScaledTriangleGlb(file)
    const report = inspect(file)
    assert.equal(report.images[0].width, 1)
    assert.equal(report.images[0].height, 1)
    assert.equal(report.textures.placeholders, 1)
    assert.ok(report.issues.some((issue) => issue.code === 'TEXTURE_1X1_PLACEHOLDER'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 材质采样贴图但缺 TEXCOORD_n 时报错级问题', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'no-uv.glb')
    writeScaledTriangleGlb(file, { withTexCoord: false })
    const report = inspect(file)
    const issue = report.issues.find((item) => item.code === 'MISSING_TEXCOORD')
    assert.ok(issue, '缺 UV 必须被查出（否则 Cesium 整个场景不渲染）')
    assert.equal(issue.level, 'error')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 异常输入给出可读条目而不是抛异常', () => {
  const workDir = makeTempDir()
  try {
    const textFile = path.join(workDir, 'note.txt')
    fs.writeFileSync(textFile, 'hello')
    const notGlb = inspect(textFile)
    assert.equal(notGlb.ok, false)
    assert.equal(notGlb.issues[0].code, 'NOT_A_GLB')

    const missing = inspect(path.join(workDir, 'nope.glb'))
    assert.equal(missing.ok, false)
    assert.equal(missing.issues[0].code, 'FILE_UNREADABLE')

    const broken = path.join(workDir, 'broken.glb')
    fs.writeFileSync(broken, 'not a glb at all')
    const parseFailed = inspect(broken)
    assert.equal(parseFailed.ok, false)
    assert.equal(parseFailed.issues[0].code, 'GLB_PARSE_FAILED')

    // 报告渲染不能因为失败而抛异常
    assert.match(formatReport(notGlb), /体检失败/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 外部贴图缺失时报错并给出路径', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'external.glb')
    writeGlb(file, {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: 'missing.fbm/Body.jpg' }],
      meshes: [],
      nodes: [],
      scenes: [{ nodes: [] }],
    }, Buffer.alloc(0))

    const report = inspect(file)
    const issue = report.issues.find((item) => item.code === 'EXTERNAL_IMAGE_MISSING')
    assert.ok(issue, '外部贴图不存在必须被查出')
    assert.equal(issue.level, 'error')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 材质数 > 0 但无贴图被采样时告警', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'no-texture.glb')
    writeGlb(file, {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 0 }],
      materials: [{ name: 'm0' }, { name: 'm1' }],
      meshes: [],
      nodes: [],
      scenes: [{ nodes: [] }],
    }, Buffer.alloc(0))

    const report = inspect(file)
    assert.equal(report.counts.materials, 2)
    assert.equal(report.textures.sampledImages, 0)
    assert.ok(report.issues.some((issue) => issue.code === 'NO_SAMPLED_TEXTURE'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------- 真实样本（缺样例时跳过）

test('inspect: 运输车的世界盒与 accessor 盒失真（M1 退出标准 1）', { skip: fs.existsSync(truckFixture) ? false : '缺少 o-model/运输车.glb' }, () => {
  const report = inspect(truckFixture)
  assert.equal(report.ok, true)

  // 真实世界盒 2.59 × 4.10 × 5.98 m（对照 docs/002 M1 退出标准）
  const size = report.bounds.worldSize
  assert.ok(Math.abs(size[0] - 2.59) < 0.02, `X 期望 ≈2.59，实际 ${size[0]}`)
  assert.ok(Math.abs(size[1] - 4.10) < 0.02, `Y 期望 ≈4.10，实际 ${size[1]}`)
  assert.ok(Math.abs(size[2] - 5.98) < 0.02, `Z 期望 ≈5.98，实际 ${size[2]}`)

  // accessor 盒荒谬（上万米），偏差必须远超阈值
  assert.ok(report.bounds.deviationFactor > 1000, `偏差 ${report.bounds.deviationFactor} 应 > 1000`)
  assert.ok(report.bounds.accessorUnionSize[0] > 10000)
  assert.ok(report.issues.some((issue) => issue.code === 'ACCESSOR_BOUNDS_UNRELIABLE'))
})

test('inspect: person 参考件的顶点复用率为 0.61（M1 退出标准 3）', { skip: fs.existsSync(personReference) ? false : '缺少 model/蹲姿.glb' }, () => {
  const report = inspect(personReference)
  assert.equal(report.ok, true)
  assert.equal(report.geometry.vertices, 11516)
  assert.equal(report.geometry.triangles, 18924)
  // 定义为 顶点数 ÷ 三角面数：焊接良好 ≈0.61，三角汤会到 3.0
  assert.equal(report.geometry.vertexReuseRatio, 0.6085)
  assert.equal(report.geometry.trianglesMatch, true)
  assert.ok(!report.issues.some((issue) => issue.code === 'TRIANGLE_SOUP'))
})

test('inspect: 样例集全部体检通过且远快于 2s 上限（M1 退出标准 2）', { skip: corpusSkipReason() }, () => {
  const files = corpusFiles()
  assert.ok(files.length >= 20, `样例集应有 20 个以上 GLB，实际 ${files.length}`)

  const failures = []
  let slowest = { name: '', ms: 0 }
  for (const file of files) {
    const report = inspect(file)
    if (!report.ok) failures.push(`${path.basename(file)}: ${report.issues[0]?.code}`)
    // 判据：三角面数与 Σ(indices.count)/3 全等
    if (report.ok && !report.geometry.trianglesMatch) failures.push(`${path.basename(file)}: 三角面数不匹配`)
    if (report.elapsedMs > slowest.ms) slowest = { name: path.basename(file), ms: report.elapsedMs }
  }
  assert.deepEqual(failures, [], `体检失败的文件：${failures.join('、')}`)
  assert.ok(slowest.ms < 2000, `最慢 ${slowest.name} 用了 ${slowest.ms}ms，应 < 2000ms`)
})
