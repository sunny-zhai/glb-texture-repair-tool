const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  collectTextureSlots,
  formatReport,
  guessUpAxis,
  imageDimensions,
  inspect,
  nodeMatrixStats,
} = require('../src/inspect')
const {
  accessorUnionBounds,
  boundsCenter,
  boundsDiagonal,
  boundsSize,
  defaultSceneOf,
  deviationFactor,
  glbBounds,
  meshLocalBoundsFromAccessors,
  reachableMeshIndexes,
  worldBounds,
} = require('../src/transform')
const { writeGlb } = require('../src/repair')

const projectRoot = path.join(__dirname, '..')
const corpusDirs = ['o-model', 'model'].map((name) => path.join(projectRoot, name))
const personReference = path.join(projectRoot, 'model', '蹲姿.glb')
const truckFixture = path.join(projectRoot, 'o-model', '运输车.glb')

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
  return corpusFiles().length ? false : `缺少样例 GLB（${corpusDirs.join('、')}）；样例不入库，恢复方法见 docs/testing/TEST_PLAN.md 的「夹具」行`
}

/** @description 造一个 APP1(Exif) 段超过 1KB 的 JPEG —— 头部扫描若被截断就读不到宽高。 */
function jpegWithLargeApp1(width = 3, height = 2, app1Bytes = 3200) {
  const app1 = Buffer.alloc(app1Bytes)
  app1[0] = 0xff
  app1[1] = 0xe1
  app1.writeUInt16BE(app1Bytes - 2, 2) // 长度字段含自身 2 字节
  app1.write('Exif\0\0', 4, 'binary')
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00])
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof, Buffer.from([0xff, 0xd9])])
}

/** @description 最小 GLB 构造器：只填体检会读的元数据。 */
function glb(extra) {
  return {
    asset: { version: '2.0' },
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
    meshes: [],
    nodes: [],
    scenes: [{ nodes: [] }],
    ...extra,
  }
}

const triangleAccessor = (min = [0, 0, 0], max = [1, 1, 1]) => ({
  min, max, count: 3, type: 'VEC3', componentType: 5126,
})

function writeTemp(dir, name, json, bin = Buffer.alloc(0)) {
  const target = path.join(dir, name)
  writeGlb(target, json, bin)
  return target
}

/**
 * @description 一个三角形的 GLB：网格由节点矩阵（平移 + 均匀缩放）变换。
 *   accessor min/max 故意写成放大后的值，用来制造 accessor 盒与真实世界盒的失真。
 */
function writeScaledTriangleGlb(outputPath, { accessorSize = 1000, nodeScale = 0.001, withTexCoord = true } = {}) {
  const attributes = { POSITION: 0 }
  if (withTexCoord) attributes.TEXCOORD_0 = 1
  const accessors = [{
    bufferView: 0, componentType: 5126, count: 3, type: 'VEC3',
    min: [0, 0, 0], max: [accessorSize, accessorSize, accessorSize],
  }]
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

test('inspect: imageDimensions 能跳过超过 1KB 的 APP1(Exif) 段', () => {
  // 审查实测：截断在 1024 字节时样例集 62% 的内嵌贴图读不到宽高
  const jpeg = jpegWithLargeApp1(7, 5, 3200)
  assert.ok(jpeg.length > 3200, 'SOF 应在 1KB 之后')
  assert.deepEqual(imageDimensions(jpeg, 'image/jpeg'), { width: 7, height: 5 })
  // 对照：只给前 1024 字节就应当读不出来（证明该用例真的在守卫这个行为）
  assert.equal(imageDimensions(jpeg.subarray(0, 1024), 'image/jpeg'), null)
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

test('inspect: collectTextureSlots 收集 pbrMetallicRoughness 与 extensions 下的纹理槽', () => {
  const slots = collectTextureSlots({
    pbrMetallicRoughness: { baseColorTexture: { index: 3 }, metallicRoughnessTexture: { index: 4, texCoord: 1 } },
    normalTexture: { index: 5 },
    extensions: { KHR_materials_clearcoat: { clearcoatTexture: { index: 6 } } },
  })
  assert.deepEqual(slots.map((slot) => slot.texture).sort(), [3, 4, 5, 6])
  assert.equal(slots.find((slot) => slot.texture === 4).texCoord, 1)
  assert.deepEqual(collectTextureSlots(null), [])
  assert.deepEqual(collectTextureSlots({ pbrMetallicRoughness: { baseColorTexture: {} } }), [])
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

  assert.deepEqual(boundsSize(accessorUnionBounds(json)), [10, 10, 10])
  assert.deepEqual(boundsCenter(world), [3.5, 4.5, 5.5])
  assert.equal(Number(boundsDiagonal(world).toFixed(4)), Number(Math.hypot(5, 5, 5).toFixed(4)))
})

test('transform: 空 scenes 不再把每个节点当根（父子变换不能丢）', () => {
  const json = {
    accessors: [{ min: [0, 0, 0], max: [1, 1, 1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1], children: [1] }, { mesh: 0 }],
    scenes: [],
  }
  const local = meshLocalBoundsFromAccessors(json)
  // 只给空场景 → 没有可渲染内容 → null（而不是把子节点当根算出 101 宽的错误盒）
  assert.equal(worldBounds(json.nodes, [], local), null)
  assert.equal(worldBounds(json.nodes, undefined, local), null)
  // 显式给场景时父级平移生效
  const withScene = worldBounds(json.nodes, [{ nodes: [0] }], local)
  assert.deepEqual(withScene.min, [100, 0, 0])
  assert.deepEqual(withScene.max, [101, 1, 1])
})

test('transform: defaultSceneOf 按 json.scene 取默认场景，缺失返回 null', () => {
  assert.equal(defaultSceneOf({ scenes: [] }), null)
  assert.equal(defaultSceneOf({}), null)
  const scenes = [{ nodes: [0] }, { nodes: [1] }]
  assert.deepEqual(defaultSceneOf({ scenes }), scenes[0])
  assert.deepEqual(defaultSceneOf({ scenes, scene: 1 }), scenes[1])
})

test('transform: reachableMeshIndexes 只认默认场景可达的网格', () => {
  const nodes = [{ mesh: 0, children: [1] }, { mesh: 1 }, { mesh: 2 }]
  assert.deepEqual([...reachableMeshIndexes(nodes, { nodes: [0] })].sort(), [0, 1])
  assert.deepEqual([...reachableMeshIndexes(nodes, null)], [])
})

test('transform: deviationFactor 同时覆盖尺寸与位置', () => {
  const left = { min: [0, 0, 0], max: [100, 1, 1] }
  const right = { min: [0, 0, 0], max: [1, 1, 1] }
  assert.equal(deviationFactor(left, right), 100)
  assert.equal(deviationFactor(null, right), null)

  // 纯平移：尺寸完全相同，但位置差 1000 —— 旧实现恒为 1，取景却明显错位
  const size = { min: [0, 0, 0], max: [1, 1, 1] }
  const moved = { min: [1000, 1000, 1000], max: [1001, 1001, 1001] }
  assert.ok(deviationFactor(size, moved) > 1000, `实际 ${deviationFactor(size, moved)}`)
})

test('inspect: nodeMatrixStats 用与量纲无关的判据识别塌陷', () => {
  const meshNode = (matrix) => ({
    nodes: [{ mesh: 0, matrix }],
    scenes: [{ nodes: [0] }],
  })
  const uniform = (scale) => [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1]

  // 正常的微小均匀缩放不是"塌陷"（|det|=1e-15 会被旧判据误报）
  assert.equal(nodeMatrixStats(meshNode(uniform(1e-5))).singular, 0)
  assert.equal(nodeMatrixStats(meshNode(uniform(1e-3))).singular, 0)
  // 单轴压扁才是塌陷（旧判据 det=1e-9 会漏报）
  const squashed = [1e-9, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  assert.equal(nodeMatrixStats(meshNode(squashed)).singular, 1)
  // 镜像
  assert.equal(nodeMatrixStats(meshNode([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).mirrored, 1)
  // 偶数个缩放要取真中位数：两个节点都必须**是网格节点**才会被记录（审查指出原用例
  // 只让节点 0 可达，实际只统计到一个缩放，断言 1 是碰巧通过）
  const twoMeshNodes = {
    nodes: [{ mesh: 0, matrix: uniform(1) }, { mesh: 0, matrix: uniform(4) }],
    scenes: [{ nodes: [0, 1] }],
  }
  const both = nodeMatrixStats(twoMeshNodes)
  assert.equal(both.meshNodes, 2)
  assert.equal(both.medianScale, 2.5)
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

test('inspect: 报告世界盒而非 accessor 盒，并按倍数告警（含尺寸/位置分解）', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'scaled.glb')
    writeScaledTriangleGlb(file, { accessorSize: 1000, nodeScale: 0.001 })
    const report = inspect(file)

    assert.deepEqual(report.bounds.accessorUnionSize, [1000, 1000, 1000])
    assert.deepEqual(report.bounds.worldSize, [1, 1, 1])
    assert.equal(report.bounds.deviationFactor, 1000)
    const issue = report.issues.find((item) => item.code === 'ACCESSOR_BOUNDS_UNRELIABLE')
    assert.ok(issue, '应给出 accessor 盒不可信的告警')
    assert.match(issue.detail, /尺寸比 1000/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 纯平移也能被偏差倍数发现', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'translate.glb', glb({
      accessors: [triangleAccessor()],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1000, 1000, 1000, 1] }],
      scenes: [{ nodes: [0] }],
    }))
    const report = inspect(file)
    assert.ok(report.bounds.deviationFactor > 1000, `实际 ${report.bounds.deviationFactor}`)
    assert.equal(report.bounds.deviationParts.sizeRatio, 1)
    assert.ok(report.bounds.deviationParts.centerOffsetRatio >= 1000, `实际 ${report.bounds.deviationParts.centerOffsetRatio}`)
    // 文案不能自相矛盾：尺寸相同时必须说清"差在位置"（原实现会打印两个相同的盒说"≠"）
    const detail = report.issues.find((item) => item.code === 'ACCESSOR_BOUNDS_UNRELIABLE').detail
    assert.match(detail, /尺寸相同/)
    assert.match(detail, /中心位置相差/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 全部被引用的文件不得报 UNREFERENCED_MESHES（调用点漏传 scene 的回归）', () => {
  // 这条用例是冲着调用点来的：`reachableMeshIndexes(nodes, scene)` 少传第二个参数就恒为空集，
  // 于是**任何**含网格的文件都会误报；上面那条用例直接按两参数测函数本身，抓不到调用点。
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'all-referenced.glb', glb({
      accessors: [triangleAccessor(), triangleAccessor()],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 1 } }] },
      ],
      nodes: [{ mesh: 0 }, { mesh: 1 }],
      scenes: [{ nodes: [0, 1] }],
    }))
    const report = inspect(file)
    assert.equal(report.ok, true, JSON.stringify(report.issues))
    assert.equal(report.bounds.deviationFactor, 1)
    assert.deepEqual(
      report.issues.filter((issue) => issue.code === 'UNREFERENCED_MESHES'),
      [],
      `两个网格都被默认场景引用，不该报未引用：${JSON.stringify(report.issues)}`,
    )
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 只在非默认场景里的网格仍要报 UNREFERENCED_MESHES（修调用点后不得漏报）', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'other-scene-only.glb', glb({
      scene: 0,
      accessors: [triangleAccessor(), triangleAccessor()],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 1 } }] },
      ],
      nodes: [{ mesh: 0 }, { mesh: 1 }],
      scenes: [{ nodes: [0] }, { nodes: [1] }],
    }))
    const report = inspect(file)
    const issue = report.issues.find((entry) => entry.code === 'UNREFERENCED_MESHES')
    assert.ok(issue, `只在非默认场景里的网格必须被提示：${JSON.stringify(report.issues)}`)
    assert.match(issue.message, /1 个网格/)
    // 只有默认场景可达的网格进盒：两个三角形都是 1³，这里主要锁"数量对得上"而不是偏差
    assert.equal(report.counts.meshes, 2)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 未被场景引用的网格不制造假偏差，且被单独提示', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'unreferenced.glb', glb({
      accessors: [triangleAccessor(), triangleAccessor([0, 0, 0], [1000, 1000, 1000])],
      meshes: [
        { primitives: [{ attributes: { POSITION: 0 } }] },
        { primitives: [{ attributes: { POSITION: 1 } }] },
      ],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    }))
    const report = inspect(file)
    assert.equal(report.bounds.deviationFactor, 1, '未引用的 1000³ 网格不该带来偏差')
    assert.ok(report.issues.some((issue) => issue.code === 'UNREFERENCED_MESHES'))
    assert.equal(report.counts.meshes, 2)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 没有 scene 的文件给出 null 盒并提示不会被渲染', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'no-scene.glb', glb({
      accessors: [triangleAccessor()],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [],
    }))
    const report = inspect(file)
    assert.equal(report.ok, true)
    assert.equal(report.bounds.world, null)
    assert.ok(report.issues.some((issue) => issue.code === 'NO_DEFAULT_SCENE'))
    // 报告渲染不能因为缺盒而抛异常或打印裸 null
    assert.doesNotMatch(formatReport(report), /偏差 null 倍/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 多场景只按默认场景统计（与 Cesium 取景口径一致）', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'multi-scene.glb', glb({
      accessors: [triangleAccessor()],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [
        { mesh: 0 },
        { mesh: 0, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 0, 1] },
      ],
      scenes: [{ nodes: [0] }, { nodes: [1] }],
      scene: 0,
    }))
    const report = inspect(file)
    assert.equal(report.bounds.sceneIndex, 0)
    assert.equal(report.bounds.sceneCount, 2)
    assert.deepEqual(report.bounds.worldSize, [1, 1, 1], '不能把第二个场景并进来')
    assert.equal(report.nodes.meshNodes, 1)
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

test('inspect: 内嵌 JPEG 即使 APP1 段很长也能读出宽高并判定 NPOT', () => {
  const workDir = makeTempDir()
  try {
    const jpeg = jpegWithLargeApp1(3, 2, 3200) // 3×2 非 2 次幂
    const bin = Buffer.concat([Buffer.alloc(0), jpeg])
    const file = path.join(workDir, 'exif.glb')
    writeGlb(file, {
      asset: { version: '2.0' },
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: jpeg.length }],
      buffers: [{ byteLength: bin.length }],
      images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
      textures: [{ source: 0, sampler: 0 }],
      samplers: [{ wrapS: 10497, wrapT: 10497, minFilter: 9987 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [],
      nodes: [],
      scenes: [{ nodes: [] }],
    }, bin)

    const report = inspect(file)
    assert.equal(report.images[0].width, 3)
    assert.equal(report.images[0].height, 2)
    assert.equal(report.images[0].npot, true)
    // NPOT + REPEAT + mipmap 必须被报出来（截断扫描时这里会静默失效）
    assert.ok(report.issues.some((issue) => issue.code === 'NPOT_WITH_REPEAT_MIPMAP'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

// 多张贴图的最小 GLB：sizes 给每张图的 [宽, 高]（用带长 APP1 的 JPEG，模拟真实"SOF 在后面"），
// textures/samplers 由调用方给，用来精确构造 NPOT × 采样器的绑定关系。
function glbWithTextures({ sizes, textures, samplers }) {
  let bin = Buffer.alloc(0)
  const bufferViews = []
  const images = []
  for (const [width, height] of sizes) {
    const jpeg = jpegWithLargeApp1(width, height, 3200)
    bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: jpeg.length })
    images.push({ bufferView: bufferViews.length - 1, mimeType: 'image/jpeg' })
    bin = Buffer.concat([bin, jpeg])
  }
  const json = glb({
    bufferViews,
    buffers: [{ byteLength: bin.length }],
    images,
    textures,
    ...(samplers ? { samplers } : {}),
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  })
  return { json, bin }
}

test('inspect: 完全没写采样器的 NPOT 贴图也算 REPEAT + mipmap（规范默认值），不得漏报', () => {
  const workDir = makeTempDir()
  try {
    // glTF 规范：sampler 缺省 ⇒ wrapS/wrapT = REPEAT、minFilter = LINEAR_MIPMAP_LINEAR
    const { json, bin } = glbWithTextures({ sizes: [[3, 2]], textures: [{ source: 0 }] })
    const file = writeTemp(workDir, 'default-sampler.glb', json, bin)

    const report = inspect(file)

    assert.ok(report.issues.some((issue) => issue.code === 'NPOT_WITH_REPEAT_MIPMAP'))
    assert.deepEqual(report.npotSamplerBindings, [{ texture: 0, image: 0, sampler: null }])
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 写了采样器但漏写 minFilter 的 NPOT 贴图同样是 mipmap 路径，不得漏报', () => {
  const workDir = makeTempDir()
  try {
    const { json, bin } = glbWithTextures({
      sizes: [[3, 2]],
      textures: [{ source: 0, sampler: 0 }],
      samplers: [{ wrapS: 10497, wrapT: 10497 }],
    })
    const file = writeTemp(workDir, 'no-min-filter.glb', json, bin)

    const report = inspect(file)

    assert.equal(report.samplers[0].mipmapped, true)
    assert.ok(report.issues.some((issue) => issue.code === 'NPOT_WITH_REPEAT_MIPMAP'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: REPEAT + mipmap 属于另一张 POT 贴图时不得误报 NPOT_WITH_REPEAT_MIPMAP', () => {
  const workDir = makeTempDir()
  try {
    // 这正是旧口径的场景：文件里既有 NPOT 贴图、又有 REPEAT+mipmap 采样器，但两者并不相干。
    // POT 贴图用 REPEAT+mipmap 完全合法，NPOT 那张已经退化为 CLAMP_TO_EDGE + LINEAR。
    const { json, bin } = glbWithTextures({
      sizes: [[4, 4], [3, 2]],
      textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 1 }],
      samplers: [
        { wrapS: 10497, wrapT: 10497, minFilter: 9987 },
        { wrapS: 33071, wrapT: 33071, minFilter: 9729 },
      ],
    })
    const file = writeTemp(workDir, 'pot-shares-sampler.glb', json, bin)

    const report = inspect(file)

    assert.equal(report.issues.some((issue) => issue.code === 'NPOT_WITH_REPEAT_MIPMAP'), false)
    assert.deepEqual(report.npotSamplerBindings, [])
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 同一文件里 NPOT 贴图逐个绑定判定，只报真正非法的那条', () => {
  const workDir = makeTempDir()
  try {
    const { json, bin } = glbWithTextures({
      sizes: [[3, 2], [5, 3]],
      textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 1 }],
      samplers: [
        { wrapS: 10497, wrapT: 10497, minFilter: 9987 },
        { wrapS: 33071, wrapT: 33071, minFilter: 9729 },
      ],
    })
    const file = writeTemp(workDir, 'per-binding.glb', json, bin)

    const report = inspect(file)

    assert.deepEqual(report.npotSamplerBindings, [{ texture: 0, image: 0, sampler: 0 }])
    const issue = report.issues.find((entry) => entry.code === 'NPOT_WITH_REPEAT_MIPMAP')
    assert.ok(issue)
    assert.match(issue.message, /1 张贴图/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

// 图元只有 TEXCOORD_0，而材质经 KHR_texture_transform 以 texCoord: 1 采样贴图。
// 这类文件在旧口径下"看着没问题"（检查的是 TEXCOORD_0，它存在），实际 Cesium 会因为缺
// TEXCOORD_1 让着色器编译失败并停止整个场景渲染——正是要钉住的漏报（REQ-008 验收标准 9）。
function glbWithTextureTransform(extensions) {
  const bin = Buffer.concat([Buffer.alloc(72), TINY_PNG])
  const json = glb({
    accessors: [triangleAccessor(), { count: 3, type: 'VEC2', componentType: 5126 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
      { buffer: 0, byteOffset: 72, byteLength: TINY_PNG.length },
    ],
    buffers: [{ byteLength: bin.length }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorTexture: extensions ? { index: 0, extensions } : { index: 0 },
      },
    }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 2, mimeType: 'image/png' }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  })
  return { json, bin }
}

test('inspect: KHR_texture_transform.texCoord 覆盖必须被采纳，漏报会让整个场景不渲染', () => {
  const workDir = makeTempDir()
  try {
    const overridden = glbWithTextureTransform({ KHR_texture_transform: { texCoord: 1 } })
    const file = writeTemp(workDir, 'transform-texcoord-1.glb', overridden.json, overridden.bin)

    const report = inspect(file)
    const issue = report.issues.find((entry) => entry.code === 'MISSING_TEXCOORD')

    assert.ok(issue, '实际采样 TEXCOORD_1 而图元只有 TEXCOORD_0，必须报 MISSING_TEXCOORD')
    assert.equal(issue.level, 'error')
    assert.match(issue.message, /TEXCOORD_1/)

    // 对照：同一模型去掉扩展覆盖后，采样的就是存在的 TEXCOORD_0，不得报（防止断言恒真）
    const plain = glbWithTextureTransform(null)
    const plainFile = writeTemp(workDir, 'transform-plain.glb', plain.json, plain.bin)
    assert.equal(
      inspect(plainFile).issues.some((entry) => entry.code === 'MISSING_TEXCOORD'),
      false,
    )
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 槽位自身 texCoord 存在但没有扩展覆盖时，报的是槽位那个通道', () => {
  const workDir = makeTempDir()
  try {
    // 槽位写 texCoord: 1（无扩展），图元只有 TEXCOORD_0 → 同样要报 TEXCOORD_1
    const { json, bin } = glbWithTextureTransform(null)
    json.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord = 1
    const file = writeTemp(workDir, 'slot-texcoord-1.glb', json, bin)

    const report = inspect(file)
    const issue = report.issues.find((entry) => entry.code === 'MISSING_TEXCOORD')
    assert.ok(issue)
    assert.match(issue.message, /TEXCOORD_1/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 外部贴图文件存在时读出宽高，缺失时报错', () => {
  const workDir = makeTempDir()
  try {
    fs.writeFileSync(path.join(workDir, 'Body.png'), TINY_PNG)
    const present = writeTemp(workDir, 'external-ok.glb', glb({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: 'Body.png', mimeType: 'image/png' }],
    }))
    const ok = inspect(present)
    assert.equal(ok.images[0].external, true)
    assert.equal(ok.images[0].exists, true)
    assert.equal(ok.images[0].width, 1, '外部贴图也要能读出宽高')
    assert.ok(!ok.issues.some((issue) => issue.code === 'EXTERNAL_IMAGE_MISSING'))

    const missing = writeTemp(workDir, 'external-bad.glb', glb({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: 'missing.fbm/Body.jpg' }],
    }))
    const absent = inspect(missing)
    const issue = absent.issues.find((item) => item.code === 'EXTERNAL_IMAGE_MISSING')
    assert.ok(issue)
    assert.equal(issue.level, 'error')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: data URI 贴图不被当成缺失的外部文件，且能读出宽高', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'data-uri.glb', glb({
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ uri: `data:image/png;base64,${TINY_PNG.toString('base64')}` }],
    }))
    const report = inspect(file)
    assert.equal(report.images[0].dataUri, true)
    assert.equal(report.images[0].external, false)
    assert.ok(!report.issues.some((issue) => issue.code === 'EXTERNAL_IMAGE_MISSING'))
    assert.equal(report.images[0].width, 1)
    assert.equal(report.textures.placeholders, 1)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 材质采样贴图但缺 TEXCOORD_n 时报错级问题（按图元计数）', () => {
  const workDir = makeTempDir()
  try {
    const file = path.join(workDir, 'no-uv.glb')
    writeScaledTriangleGlb(file, { withTexCoord: false })
    const report = inspect(file)
    const issue = report.issues.find((item) => item.code === 'MISSING_TEXCOORD')
    assert.ok(issue, '缺 UV 必须被查出（否则 Cesium 整个场景不渲染）')
    assert.equal(issue.level, 'error')
    assert.match(issue.message, /1 个图元/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 非索引图元的三角面单独上报，且索引数整除不变量可判定', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'non-indexed.glb', glb({
      accessors: [triangleAccessor()],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    }))
    const report = inspect(file)
    assert.equal(report.geometry.trianglesIndexed, 0)
    assert.equal(report.geometry.trianglesNonIndexed, 1)
    assert.equal(report.geometry.triangles, 1)
    assert.equal(report.geometry.nonIndexedPrimitives, 1)
    assert.equal(report.geometry.indexCountDivisibleBy3, null) // 非索引图元没有 mode=4 索引数可判
    assert.ok(report.issues.some((issue) => issue.code === 'NON_INDEXED_PRIMITIVES'))
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

    assert.match(formatReport(notGlb), /体检失败/)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 结构畸形的 GLB 不抛异常（BR-020 回归）', () => {
  const workDir = makeTempDir()
  try {
    // 审查实测这 5 类结构畸形曾让 inspect() 抛 TypeError、CLI 直接崩栈
    const malformed = {
      'meshes-null-element.glb': glb({ meshes: [null] }),
      'samplers-null-element.glb': glb({ samplers: [null] }),
      'materials-object.glb': glb({ materials: {} }),
      'images-object.glb': glb({ images: {} }),
      'meshes-object.glb': glb({ meshes: {} }),
    }
    for (const [name, json] of Object.entries(malformed)) {
      const file = writeTemp(workDir, name, json)
      let report
      assert.doesNotThrow(() => { report = inspect(file) }, `${name} 不应抛异常`)
      assert.equal(report.ok, true, `${name} 应给出报告`)
      // 这些形状修复后**不应**再让分析段抛错，因此不应降级为 partial
      // （审查指出原先的 `if (report.partial)` 对这 5 个形状恒不成立，是死代码；
      //   analyze 的 catch 现在是纯安全网，由下面的非数组用例间接覆盖）
      assert.notEqual(report.partial, true, `${name} 不应降级为 partial`)
      assert.doesNotThrow(() => formatReport(report))
    }
    // 不存在的路径同样只报错
    assert.doesNotThrow(() => inspect(path.join(workDir, 'nothing-here.glb')))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 材质数 > 0 但无贴图被采样时告警', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'no-texture.glb', glb({
      materials: [{ name: 'm0' }, { name: 'm1' }],
    }))
    const report = inspect(file)
    assert.equal(report.counts.materials, 2)
    assert.equal(report.textures.sampledImages, 0)
    assert.ok(report.issues.some((issue) => issue.code === 'NO_SAMPLED_TEXTURE'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('transform: glbBounds 汇总两种盒、默认场景与偏差分解', () => {
  const json = {
    accessors: [{ min: [0, 0, 0], max: [1, 1, 1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  }
  const bounds = glbBounds(json)
  assert.deepEqual(bounds.worldSize, [1, 1, 1])
  assert.deepEqual(bounds.accessorUnionSize, [1, 1, 1])
  assert.equal(bounds.deviationFactor, 1)
  assert.equal(bounds.deviationParts.centerOffsetRatio, 0)
  assert.equal(bounds.sceneIndex, 0)
  assert.equal(bounds.sceneCount, 1)
})

test('inspect: 非数组的 scene.nodes / node.children 不再让报告降级（BR-020 回归）', () => {
  const workDir = makeTempDir()
  try {
    // 审查用 400 次 fuzz 发现 66 次 partial 全由这类形状引起（"5 is not iterable"）
    const cases = {
      'scene-nodes-number.glb': glb({ nodes: [{ mesh: 0 }], scenes: [{ nodes: 5 }] }),
      'children-number.glb': glb({
        accessors: [triangleAccessor()],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ children: 5 }, { mesh: 0 }],
        scenes: [{ nodes: [0] }],
      }),
      'children-object.glb': glb({
        accessors: [triangleAccessor()],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        nodes: [{ children: { 0: 1 }, mesh: 0 }],
        scenes: [{ nodes: [0] }],
      }),
    }
    for (const [name, json] of Object.entries(cases)) {
      const file = writeTemp(workDir, name, json)
      let report
      assert.doesNotThrow(() => { report = inspect(file) })
      assert.notEqual(report.partial, true, `${name} 不应 partial`)
      assert.ok(report.bounds, `${name} 报告仍应有 bounds 段`)
      assert.ok(report.geometry, `${name} 报告仍应有 geometry 段`)
      assert.ok(report.axes, `${name} 报告仍应有 axes 段`)
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: scene 索引越界时给出 SCENE_INDEX_OUT_OF_RANGE', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'scene-oor.glb', glb({
      accessors: [triangleAccessor()],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 7,
    }))
    const report = inspect(file)
    assert.equal(report.bounds.world, null)
    // 不能只是"默默没有盒"：必须说明 scene 索引无效（与"没有 scene"是两种不同损坏）
    assert.ok(report.issues.some((issue) => issue.code === 'SCENE_INDEX_OUT_OF_RANGE'))
    assert.ok(!report.issues.some((issue) => issue.code === 'NO_DEFAULT_SCENE'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 三角面按 primitive.mode 统计，非三角形图元不计', () => {
  const workDir = makeTempDir()
  try {
    const build = (mode, count, name) => writeTemp(workDir, name, glb({
      accessors: [triangleAccessor([0, 0, 0], [1, 1, 1])],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, ...(mode === null ? {} : { mode }) }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    }))
    // 用一个顶点数足够的 accessor 来区分各 mode 的公式
    const withCount = (mode, count, name) => {
      const json = glb({
        accessors: [{ min: [0, 0, 0], max: [1, 1, 1], count, type: 'VEC3', componentType: 5126 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, ...(mode === null ? {} : { mode }) }] }],
        nodes: [{ mesh: 0 }],
        scenes: [{ nodes: [0] }],
      })
      return inspect(writeTemp(workDir, name, json))
    }

    const triangles = withCount(4, 6, 'mode-triangles.glb')
    assert.equal(triangles.geometry.trianglesNonIndexed, 2)
    assert.equal(triangles.geometry.nonTrianglePrimitives, 0)

    const strip = withCount(5, 6, 'mode-strip.glb')
    assert.equal(strip.geometry.trianglesNonIndexed, 4, 'STRIP: n−2')

    const fan = withCount(6, 5, 'mode-fan.glb')
    assert.equal(fan.geometry.trianglesNonIndexed, 3, 'FAN: n−2')

    const points = withCount(0, 7, 'mode-points.glb')
    assert.equal(points.geometry.trianglesNonIndexed, 0, 'POINTS 没有三角面')
    assert.equal(points.geometry.nonTrianglePrimitives, 1)
    assert.equal(points.geometry.modeHistogram.POINTS, 1)

    // 0 个索引时整除不变量必须为 null（`0 % 3 === 0` 恒真，不能当证据）
    const zeroIndices = withCount(4, 0, 'mode-zero.glb')
    assert.equal(zeroIndices.geometry.indexCountDivisibleBy3, null)
    void build
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 图片头必须结构自洽，垃圾字节不给荒诞宽高', () => {
  // 垃圾 JPEG 头
  assert.equal(imageDimensions(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(64, 7)]), 'image/jpeg'), null)
  // SOF 段长与分量数不匹配（0x20 vs 3 分量应有的 17）
  const badLength = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x20, 0x08, 0xab, 0xcd, 0xd1, 0xc2, 0x03, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(imageDimensions(badLength, 'image/jpeg'), null)
  // 非法分量数
  const badComponents = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0xab, 0xcd, 0xd1, 0xc2, 0x09, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(imageDimensions(badComponents, 'image/jpeg'), null)
  // 自洽的头仍要能读出（不能因为校验过严而误杀）
  const good = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x07, 0x03, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.deepEqual(imageDimensions(good, 'image/jpeg'), { width: 7, height: 5 })
  // 标错 mimeType 的 PNG 不该被当成 PNG（只看魔数）
  assert.equal(imageDimensions(Buffer.alloc(32, 3), 'image/png'), null)
})

test('inspect: 读不出宽高时给出可见条目，而不是静默', () => {
  const workDir = makeTempDir()
  try {
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(64, 7)])
    const file = path.join(workDir, 'undimensioned.glb')
    writeGlb(file, {
      asset: { version: '2.0' },
      accessors: [triangleAccessor()],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: junk.length }],
      buffers: [{ byteLength: junk.length }],
      images: [{ bufferView: 0, mimeType: 'image/jpeg' }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    }, junk)

    const report = inspect(file)
    assert.equal(report.textures.dimensionsKnown, 0)
    assert.equal(report.images.length, 1)
    assert.ok(report.issues.some((issue) => issue.code === 'TEXTURE_DIMENSIONS_UNKNOWN'),
      'BR-022 要治的是「静默失效」，读不出宽高必须有条目')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 缺 POSITION min/max 时给出 POSITION_MINMAX_MISSING', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'no-minmax.glb', glb({
      accessors: [{ count: 3, type: 'VEC3', componentType: 5126 }], // 故意不给 min/max
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    }))
    const report = inspect(file)
    assert.equal(report.bounds.world, null)
    assert.equal(report.geometry.missingPositionBounds, 1)
    // 用户必须能看到"为什么没有盒"，而不是只有无关提示
    assert.ok(report.issues.some((issue) => issue.code === 'POSITION_MINMAX_MISSING'))
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('inspect: 采样统计只认被图元使用的材质', () => {
  const workDir = makeTempDir()
  try {
    const file = writeTemp(workDir, 'unused-material.glb', glb({
      accessors: [triangleAccessor()],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], // 图元不引用任何材质
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], // 有材质但没人用
      textures: [{ source: 0 }],
      images: [{ uri: `data:image/png;base64,${TINY_PNG.toString('base64')}` }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
    }))
    const report = inspect(file)
    // 若把"未使用材质的贴图"算作已采样，NO_SAMPLED_TEXTURE 会假阴性
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

  const size = report.bounds.worldSize
  assert.ok(Math.abs(size[0] - 2.59) < 0.02, `X 期望 ≈2.59，实际 ${size[0]}`)
  assert.ok(Math.abs(size[1] - 4.10) < 0.02, `Y 期望 ≈4.10，实际 ${size[1]}`)
  assert.ok(Math.abs(size[2] - 5.98) < 0.02, `Z 期望 ≈5.98，实际 ${size[2]}`)

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
  assert.equal(report.geometry.indexCountDivisibleBy3, true)
  assert.ok(!report.issues.some((issue) => issue.code === 'TRIANGLE_SOUP'))
})

test('inspect: 样例集全部体检通过、尺寸可读且远快于 2s 上限（M1 退出标准 2）', { skip: corpusSkipReason() }, () => {
  // 样例模型不入库（.gitignore），本地语料规模会变：断言只要求"至少有一个可体检的 GLB"，
  // 覆盖面随本地样例增减，不硬编码数量（曾因硬编码 ≥20 在样例被清理后直接失败）
  const files = corpusFiles()
  assert.ok(files.length >= 1, `样例集应至少有 1 个 GLB，实际 ${files.length}`)

  const failures = []
  let slowest = { name: '', ms: 0 }
  let embeddedImages = 0
  let unreadableEmbedded = 0
  for (const file of files) {
    const report = inspect(file)
    const name = path.basename(file)
    if (!report.ok) { failures.push(`${name}: ${report.issues[0]?.code}`); continue }
    // 可判定的不变量：索引数必须是 3 的倍数
    if (report.geometry.indexCountDivisibleBy3 === false) failures.push(`${name}: 索引数不是 3 的倍数`)
    if (report.partial) failures.push(`${name}: 报告不完整（${report.issues[0]?.code}）`)
    // 内嵌 PNG/JPEG 必须都能读出宽高（审查实测曾被 1KB 截断让 62% 静默失效）
    for (const image of report.images) {
      // 内嵌 = 有 bufferView、非外部 uri、非 data URI，且是 PNG/JPEG
      const embedded = image.bufferView !== null && !image.external && !image.dataUri
        && ['image/png', 'image/jpeg'].includes(image.mimeType)
      if (!embedded) continue
      embeddedImages += 1
      if (typeof image.width !== 'number') unreadableEmbedded += 1
    }
    if (report.elapsedMs > slowest.ms) slowest = { name, ms: report.elapsedMs }
  }
  assert.deepEqual(failures, [], `体检失败的文件：${failures.join('、')}`)
  assert.ok(slowest.ms < 2000, `最慢 ${slowest.name} 用了 ${slowest.ms}ms，应 < 2000ms`)
  // 只要内嵌 PNG/JPEG 存在，就必须全部读出宽高（BR-022 回归）；数量本身随语料规模变化
  assert.equal(unreadableEmbedded, 0, `${unreadableEmbedded}/${embeddedImages} 张内嵌贴图读不出宽高`)
  console.log(`  [语料] ${files.length} 个 GLB、${embeddedImages} 张内嵌贴图，最慢 ${slowest.name} ${slowest.ms}ms`)
})
