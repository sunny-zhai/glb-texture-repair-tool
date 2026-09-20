const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  buildGlb,
  convertIveToGlb,
  createAxisConversion,
  iveConversionAvailable,
  isIvePath,
  meshLocalBounds,
  pruneMeshlessSubtrees,
  readImagePixels,
  resolveIveHelper,
  rotateVector,
  weldVertices,
  worldBounds,
} = require('../src/ive')
const { multiplyMatrix, readGlb, repairGlbFile } = require('../src/repair')

const projectRoot = path.join(__dirname, '..')
const iveFixture = path.join(projectRoot, 'o-model', 'person-move.ive')
const crouchFixture = path.join(projectRoot, 'o-model', '蹲姿.ive')

function fixtureSkipReason() {
  if (!fs.existsSync(iveFixture)) return `缺少 IVE 样例：${iveFixture}`
  if (!iveConversionAvailable()) return `当前平台缺少 ive2glb 助手（${resolveIveHelper().searched.join('、')}）`
  return false
}

// 蹲姿相关用例只依赖蹲姿.ive —— 不要复用 fixtureSkipReason()（那个查的是 person-move.ive），
// 否则样例被局部清理时，明明还在的蹲姿金标准用例也会被一起跳过
function crouchSkipReason() {
  if (!fs.existsSync(crouchFixture)) return `缺少 IVE 样例：${crouchFixture}`
  if (!iveConversionAvailable()) return `当前平台缺少 ive2glb 助手（${resolveIveHelper().searched.join('、')}）`
  return false
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ive-test-'))
}

// ---------------------------------------------------------------- 纯单元测试

test('ive: isIvePath 只认 .ive 扩展名且不区分大小写', () => {
  assert.equal(isIvePath('/tmp/a.ive'), true)
  assert.equal(isIvePath('C:\\models\\a.IVE'), true)
  assert.equal(isIvePath('/tmp/a.glb'), false)
  assert.equal(isIvePath(undefined), false)
})

test('ive: readImagePixels 把 BOTTOM_LEFT 像素翻转为自上而下', () => {
  // 两行两列的 RGB：raw 第一行是红色、第二行是蓝色。
  const bin = Buffer.from([
    255, 0, 0, 255, 0, 0,
    0, 0, 255, 0, 0, 255,
  ])
  const record = {
    width: 2,
    height: 2,
    rowBytes: 6,
    offset: 0,
    length: bin.length,
    pixelFormat: 6407,
    dataType: 5121,
    origin: 'BOTTOM_LEFT',
  }

  const { rgba, hasAlpha } = readImagePixels(record, bin)
  // 翻转后第一行应来自 raw 的最后一行（蓝色）。
  assert.deepEqual([...rgba.subarray(0, 4)], [0, 0, 255, 255])
  assert.deepEqual([...rgba.subarray(4, 8)], [0, 0, 255, 255])
  // 第二行应是红色。
  assert.deepEqual([...rgba.subarray(8, 12)], [255, 0, 0, 255])
  assert.equal(hasAlpha, false)
})

test('ive: readImagePixels 保留 TOP_LEFT 像素顺序并识别 alpha 通道', () => {
  const bin = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80])
  const record = {
    width: 2,
    height: 1,
    rowBytes: 8,
    offset: 0,
    length: bin.length,
    pixelFormat: 6408,
    dataType: 5121,
    origin: 'TOP_LEFT',
  }

  const { rgba, hasAlpha } = readImagePixels(record, bin)
  assert.deepEqual([...rgba], [10, 20, 30, 40, 50, 60, 70, 80])
  assert.equal(hasAlpha, true)
})

test('ive: readImagePixels 拒绝非 8 位通道的贴图', () => {
  const record = {
    width: 1,
    height: 1,
    rowBytes: 6,
    offset: 0,
    length: 6,
    pixelFormat: 6407,
    dataType: 5123,
    origin: 'BOTTOM_LEFT',
  }
  assert.throws(() => readImagePixels(record, Buffer.alloc(6)), /仅支持 8 位通道/)
})

test('ive: pruneMeshlessSubtrees 剪掉不含网格的骨骼子树', () => {
  const scene = {
    // 0 根节点 -> 1 有网格、2 骨骼子树（3 -> 4），2 整棵应被剪掉。
    nodes: [
      { name: 'root', children: [1, 2] },
      { name: 'mesh-node', mesh: 0, children: [] },
      { name: 'hips', children: [3] },
      { name: 'spine', children: [4] },
      { name: 'head', children: [] },
    ],
    scenes: [{ nodes: [0] }],
  }

  const pruned = pruneMeshlessSubtrees(scene)
  assert.equal(pruned.prunedCount, 3)
  assert.deepEqual(pruned.nodes.map((node) => node.name), ['root', 'mesh-node'])
  assert.deepEqual(pruned.nodes[0].children, [1])
  assert.deepEqual(pruned.scenes, [{ nodes: [0] }])
})

test('ive: 助手缺失时给出包含查找路径的中文错误', () => {
  const report = convertIveToGlb(path.join(projectRoot, 'o-model', '不存在.ive'), '/tmp/never.glb')
  assert.equal(report.status, 'error')
  assert.match(report.error, /IVE 源文件不存在/)
})

test('ive: 拒绝非 IVE 输入', () => {
  const report = convertIveToGlb(path.join(projectRoot, 'package.json'), '/tmp/never.glb')
  assert.equal(report.status, 'error')
  assert.match(report.error, /只能转换 IVE 文件/)
})

// ---------------------------------------------------- 坐标约定转换（Z-up → Y-up）

test('ive: multiplyMatrix 按列主序相乘且保持平移组合', () => {
  const translate = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  assert.deepEqual(multiplyMatrix(identity, translate), translate)
  assert.deepEqual(multiplyMatrix(translate, identity), translate)
  const twice = multiplyMatrix(translate, translate)
  assert.deepEqual(twice.slice(12, 15), [20, 40, 60])
})

test('ive: Z-up 旋转把 +Z 抬到 +Y、+Y 转到 -Z', () => {
  const zUpToYUp = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]
  assert.deepEqual(rotateVector(zUpToYUp, [0, 0, 1]), [0, 1, 0], '头顶方向必须朝上，否则模型会倒立')
  assert.deepEqual(rotateVector(zUpToYUp, [0, 1, 0]), [0, 0, -1], 'OSG 的 +Y 落到 glTF 的 -Z')
  assert.deepEqual(rotateVector(zUpToYUp, [1, 0, 0]), [1, 0, 0])
})

test('ive: worldBounds 会累乘节点平移（回归：曾有 matrix 字段被整体丢弃）', () => {
  const scene = makeSyntheticScene()
  const bounds = worldBounds(scene, scene.nodes, scene.scenes)
  // 三角形在 z=0 平面，节点把它抬到 z=1，所以世界盒的 z 必须落在 [1, 1]。
  assert.deepEqual(bounds.min.map((v) => +v.toFixed(6)), [0, 0, 1])
  assert.deepEqual(bounds.max.map((v) => +v.toFixed(6)), [1, 1, 1])
})

test('ive: meshLocalBounds 忽略 -1 等无效网格索引', () => {
  const scene = makeSyntheticScene()
  const boxes = meshLocalBounds(scene)
  assert.equal(boxes.length, 1)
  assert.deepEqual(boxes[0].min, [0, 0, 0])
  assert.deepEqual(boxes[0].max, [1, 1, 0])
})

test('ive: 烘焙模式写出的 GLB 保留节点矩阵并把几何贴地归心', () => {
  const scene = makeSyntheticScene()
  const built = buildGlb(scene, {})

  assert.equal(built.conversion.mode, 'bake')
  assert.equal(built.conversion.label, 'Z-up→Y-up + 贴地 + 水平归心')

  // 节点的平移量必须出现在输出里，并且跟着转轴：(0,0,1) → (0,1,0)。
  const node = built.json.nodes[1]
  assert.ok(Array.isArray(node.matrix), '节点矩阵不能丢')
  assert.deepEqual(node.matrix.slice(12, 15).map((v) => +v.toFixed(6)), [0, 1, 0])

  // 局部顶点：R·p + T，T = (-0.5, -1, 0.5)。
  const position = built.json.accessors.find((a) => a.type === 'VEC3' && a.min)
  assert.deepEqual(position.min.map((v) => +v.toFixed(6)), [-0.5, -1, -0.5])
  assert.deepEqual(position.max.map((v) => +v.toFixed(6)), [0.5, -1, 0.5])

  // 世界盒 = 节点平移 + 局部顶点，必须正好落在 y=0 且水平居中。
  const shifted = position.min.map((value, axis) => +(value + node.matrix[12 + axis]).toFixed(6))
  assert.deepEqual(shifted, [-0.5, 0, -0.5])
  assert.deepEqual(built.conversion.after.min.map((v) => +v.toFixed(6)), [-0.5, 0, -0.5])
  assert.deepEqual(built.conversion.after.max.map((v) => +v.toFixed(6)), [0.5, 0, 0.5])

  // 法线只旋转不平移：(0,0,1) → (0,1,0)。
  const normalAccessor = built.json.accessors.find((a) => a.type === 'VEC3' && !a.min)
  const normalView = built.json.bufferViews[normalAccessor.bufferView]
  const normals = new Float32Array(built.bin.buffer, built.bin.byteOffset + normalView.byteOffset, 9)
  assert.deepEqual([...normals].map((v) => +v.toFixed(6)), [0, 1, 0, 0, 1, 0, 0, 1, 0])
})

test('ive: 节点带旋转时退化为挂转换根节点，顶点保持原样', () => {
  const scene = makeSyntheticScene()
  // 换成一个线性部分非单位的矩阵（绕 Z 轴 90°），bake 前提就不成立了。
  scene.nodes[1].matrix = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1]

  const built = buildGlb(scene, {})
  assert.equal(built.conversion.mode, 'root')

  const position = built.json.accessors.find((a) => a.type === 'VEC3' && a.min)
  assert.deepEqual(position.min, [0, 0, 0], 'root 模式不应改写顶点')
  assert.deepEqual(position.max, [1, 1, 0])

  const wrapper = built.json.nodes[built.json.nodes.length - 1]
  assert.deepEqual(wrapper.children, [0])
  assert.deepEqual(built.json.scenes, [{ name: 'scene', nodes: [built.json.nodes.length - 1] }])
  // 该节点旋转把局部盒转到 x∈[-1,0] y∈[0,1]，再加平移 z=1；
  // 轴转换后 x∈[-1,0] y=1 z∈[-1,0]，因此贴地归心的平移量为 (0.5, -1, 0.5)。
  assert.deepEqual(wrapper.matrix.slice(12, 15).map((v) => +v.toFixed(6)), [0.5, -1, 0.5])
})

test('ive: axisConversion:false 关闭改写但仍给出实测包围盒', () => {
  const scene = makeSyntheticScene()
  const built = buildGlb(scene, { axisConversion: false })
  assert.equal(built.conversion.mode, 'none')
  assert.equal(built.conversion.label, '')
  assert.deepEqual(built.json.accessors.find((a) => a.min).min, [0, 0, 0])
  assert.deepEqual(built.conversion.after.min, [0, 0, 1])
})

test('ive: ground/centerXZ 可单独关闭', () => {
  const off = createAxisConversion(makeSyntheticScene(), makeSyntheticScene().nodes, makeSyntheticScene().scenes,
    { ground: false, centerXZ: false })
  assert.deepEqual(off.translation, [0, 0, 0])
  assert.equal(off.label, 'Z-up→Y-up')

  const grounded = createAxisConversion(makeSyntheticScene(), makeSyntheticScene().nodes, makeSyntheticScene().scenes,
    { centerXZ: false })
  assert.deepEqual(grounded.translation.map((v) => +v.toFixed(6)), [0, -1, 0])
})

/**
 * @description 构造一个最小中间产物：z=0 平面上的一三角形，由节点抬到 z=1（OSG 的 up 方向）。
 */
function makeSyntheticScene() {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
  const indices = new Uint32Array([0, 1, 2])
  const positionBytes = Buffer.from(positions.buffer)
  const normalBytes = Buffer.from(normals.buffer)
  const indexBytes = Buffer.from(indices.buffer)

  return {
    bin: Buffer.concat([positionBytes, normalBytes, indexBytes]),
    meshes: [{
      name: 'flat-triangle',
      primitives: [{
        attributes: {
          POSITION: { offset: 0, length: positionBytes.length, components: 3, count: 3 },
          NORMAL: { offset: positionBytes.length, length: normalBytes.length, components: 3, count: 3 },
        },
        indices: {
          offset: positionBytes.length + normalBytes.length,
          length: indexBytes.length,
          count: 3,
        },
        material: -1,
      }],
    }],
    materials: [],
    images: [],
    warnings: [],
    nodes: [
      { name: 'root', mesh: -1, children: [1] },
      {
        name: 'geo',
        mesh: 0,
        children: [],
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1],
      },
    ],
    scenes: [{ name: 'scene', nodes: [0] }],
  }
}

// ------------------------------------------------------------ 顶点焊接（D3）

/**
 * @description 两个共享一条边的三角形，按"三角汤"写成 6 个顶点（v1≡v3、v2≡v5）。
 */
function makeSoupStreams(uvOfLastVertex = [0, 1]) {
  const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
  const normal = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
  const texcoord = new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, ...uvOfLastVertex])
  return {
    streams: [
      { name: 'POSITION', components: 3, count: 6, bytes: Buffer.from(position.buffer) },
      { name: 'NORMAL', components: 3, count: 6, bytes: Buffer.from(normal.buffer) },
      { name: 'TEXCOORD_0', components: 2, count: 6, bytes: Buffer.from(texcoord.buffer) },
    ],
    indices: { bytes: Buffer.from(new Uint32Array([0, 1, 2, 3, 4, 5]).buffer), count: 6 },
  }
}

test('ive: weldVertices 合并属性完全相同的顶点并重建索引', () => {
  const { streams, indices } = makeSoupStreams()
  const welded = weldVertices(streams, indices.bytes, indices.count)

  assert.ok(welded, '应当发生合并')
  assert.equal(welded.before, 6)
  assert.equal(welded.after, 4)
  // 索引重映射：v1→1、v3→1、v2→2、v5→2。
  assert.deepEqual([...new Uint32Array(welded.indices.bytes.buffer)], [0, 1, 2, 1, 3, 2])
  for (const attribute of welded.attributes) {
    assert.equal(attribute.count, 4)
    assert.equal(attribute.bytes.length, 4 * attribute.components * 4)
  }
  // 顶点数据本身不变：新表就是"首次出现"的那批顶点。
  const position = new Float32Array(welded.attributes[0].bytes.buffer)
  assert.deepEqual([...position], [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])
})

test('ive: weldVertices 不合并 UV 不同的顶点（接缝必须保留）', () => {
  // 最后一个顶点位置/法线都与 v2 相同，只有 UV 不同 —— 就是一条 UV 接缝。
  const { streams, indices } = makeSoupStreams([0.5, 0.5])
  const welded = weldVertices(streams, indices.bytes, indices.count)

  assert.equal(welded.after, 5, 'UV 不同就不能合并，否则贴图接缝会被拉伸')
  assert.deepEqual([...new Uint32Array(welded.indices.bytes.buffer)], [0, 1, 2, 1, 3, 4])
})

test('ive: weldVertices 无可合并或索引越界时返回 null', () => {
  const distinct = makeSoupStreams()
  // 原本 v1≡v3、v2≡v5；把 v3、v5 的位置改掉，6 个顶点互不相同 → 不该改写数据。
  const positions = new Float32Array(distinct.streams[0].bytes.buffer)
  positions[9] = 5
  positions[15] = 6
  assert.equal(weldVertices(distinct.streams, distinct.indices.bytes, distinct.indices.count), null)

  const { streams, indices } = makeSoupStreams()
  const bad = Buffer.from(new Uint32Array([0, 1, 2, 3, 4, 99]).buffer)
  assert.equal(weldVertices(streams, bad, 6), null, '索引越界说明中间产物不可信，宁可原样输出')
})

test('ive: weldVertices 把 -0 与 0 视为同一个值', () => {
  const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -0, 0])
  const streams = [
    { name: 'POSITION', components: 3, count: 4, bytes: Buffer.from(position.buffer) },
  ]
  const indices = Buffer.from(new Uint32Array([0, 1, 2, 3, 2, 1]).buffer)
  const welded = weldVertices(streams, indices, 6)
  // 轴转换会把 0 变成 -0；若按位比较，这里就会白白多出一个顶点。
  assert.equal(welded.after, 3)
})

// ---------------------------------------------------------------- 端到端测试

test('ive: IVE 转换为自包含 GLB 且结构可解析', { skip: fixtureSkipReason() }, () => {
  const workDir = makeTempDir()
  try {
    const outputPath = path.join(workDir, 'person-move.glb')
    const report = convertIveToGlb(iveFixture, outputPath, { keepJpeg: true })

    assert.equal(report.status, 'success', report.error)
    assert.ok(report.newBytes > 0)
    assert.ok(report.newBytes < report.oldBytes)
    assert.equal(report.images, 3)
    assert.equal(report.meshes, 3)
    assert.ok(report.prunedNodes > 0, '应剪掉骨骼空节点')

    const { json, bin } = readGlb(outputPath)
    assert.equal(json.asset.version, '2.0')
    assert.equal(json.meshes.length, 3)
    assert.equal(json.images.length, 3)
    assert.equal(json.buffers[0].byteLength, bin.length)

    // 贴图必须内嵌为 JPEG/PNG，不能留外部 uri。
    for (const image of json.images) {
      assert.equal(typeof image.bufferView, 'number')
      assert.equal(image.uri, undefined)
      assert.ok(['image/jpeg', 'image/png'].includes(image.mimeType))
      const view = json.bufferViews[image.bufferView]
      assert.equal(view.target, undefined, '图片 bufferView 不应带 target')
    }

    // 每个 primitive 都要有合法的 POSITION 与 min/max，供 Cesium 取景使用。
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION]
        assert.equal(accessor.type, 'VEC3')
        assert.equal(accessor.componentType, 5126)
        assert.equal(accessor.min.length, 3)
        assert.equal(accessor.max.length, 3)
        const indices = json.accessors[primitive.indices]
        assert.equal(indices.componentType, 5125)
        assert.ok(indices.count % 3 === 0, '索引数应为 3 的倍数')
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('ive: 关闭「保留 JPEG」时贴图转为 PNG', { skip: fixtureSkipReason() }, () => {
  const workDir = makeTempDir()
  try {
    const outputPath = path.join(workDir, 'person-move.glb')
    const report = convertIveToGlb(iveFixture, outputPath, { keepJpeg: false })
    assert.equal(report.status, 'success', report.error)

    const { json } = readGlb(outputPath)
    assert.ok(json.images.every((image) => image.mimeType === 'image/png'))
    assert.ok(report.newBytes > 0)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('ive: IVE 转换结果与 Blender/FBX 参考件同轴同尺度', { skip: crouchSkipReason() }, () => {
  const workDir = makeTempDir()
  try {
    const outputPath = path.join(workDir, '蹲姿.glb')
    const report = convertIveToGlb(crouchFixture, outputPath, { keepJpeg: true })
    assert.equal(report.status, 'success', report.error)

    // 参考件 model/蹲姿.glb 实测世界盒为 0.538 × 1.364 × 1.056（宽 × 高 × 前后深）。
    // 轴转换前本工具会得到 0.538 × 1.056 × 1.171：Y/Z 互换，而且因为节点平移被丢弃，
    // 高度只有 1.171（头顶部件没抬起来）。所以这三轴同时匹配才算两个缺陷都修好。
    const close = (actual, expected) => assert.ok(
      Math.abs(actual - expected) < 0.02,
      `期望 ${expected}，实际 ${actual}（整盒 ${JSON.stringify(report.worldSize)}）`,
    )
    close(report.worldSize[0], 0.538)
    close(report.worldSize[1], 1.364)
    close(report.worldSize[2], 1.056)

    // 贴地 + 水平归心。
    assert.equal(report.worldMin[1], 0)
    assert.ok(Math.abs(report.worldCenter[0]) < 1e-6)
    assert.ok(Math.abs(report.worldCenter[2]) < 1e-6)
    assert.equal(report.axisMode, 'bake')

    const { json } = readGlb(outputPath)
    assert.ok(json.nodes.filter((node) => Array.isArray(node.matrix)).length >= 3, '节点平移不能丢')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('ive: 顶点焊接把三角汤压到参考件量级且几何不变', { skip: crouchSkipReason() }, () => {
  const workDir = makeTempDir()
  try {
    const welded = convertIveToGlb(crouchFixture, path.join(workDir, 'welded.glb'), { keepJpeg: true })
    assert.equal(welded.status, 'success', welded.error)
    const raw = convertIveToGlb(crouchFixture, path.join(workDir, 'raw.glb'), { keepJpeg: true, weldVertices: false })
    assert.equal(raw.status, 'success', raw.error)

    // IVE 出来的是三角汤：18,924 面 = 56,772 顶点，1 顶点/面。
    assert.equal(raw.verticesBefore, 56772)
    assert.equal(raw.vertices, 56772, '关掉焊接时应保持原样')

    // 焊接后应与 FBX2glTF 参考件完全同量级（参考件 11,516 顶点），并满足 M2 的 ≤13,800。
    assert.equal(welded.verticesBefore, 56772)
    assert.ok(welded.vertices <= 13800, `顶点应降到 13,800 以内，实际 ${welded.vertices}`)
    assert.equal(welded.vertices, 11516, '与参考件顶点数一致说明既没漏合也没多合')

    // 面数与贴图不能回退。
    assert.equal(welded.triangles, 18924)
    assert.equal(welded.images, 3)

    // 体积必须真的变小，且几何没被挪动。
    assert.ok(welded.newBytes < raw.newBytes * 0.75,
      `焊接后应明显更小：${raw.newBytes} → ${welded.newBytes}`)
    assert.deepEqual(welded.worldSize, raw.worldSize)

    const { json } = readGlb(path.join(workDir, 'welded.glb'))
    const indexCount = json.meshes.reduce((total, mesh) => total
      + mesh.primitives.reduce((sum, primitive) => sum + json.accessors[primitive.indices].count, 0), 0)
    assert.equal(indexCount, 56772, '索引数（= 3 × 面数）不应变化')
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})

test('ive: 转换产物可继续进入修复管线', { skip: fixtureSkipReason() }, () => {
  const workDir = makeTempDir()
  try {
    const intermediatePath = path.join(workDir, 'person-move.glb')
    const converted = convertIveToGlb(iveFixture, intermediatePath, { keepJpeg: true })
    assert.equal(converted.status, 'success', converted.error)

    const repairedPath = path.join(workDir, 'person-move-repaired.glb')
    const repaired = repairGlbFile(intermediatePath, repairedPath, { keepJpeg: true })
    assert.equal(repaired.status, 'success', repaired.error)

    const { json } = readGlb(repairedPath)
    assert.equal(json.meshes.length, 3)
    assert.equal(json.images.length, 3)
    assert.equal(json.buffers[0].byteLength > 0, true)
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
})
