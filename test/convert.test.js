// FBX / OBJ 转换内核（REQ-007 / ADR-008）。样例不入库，缺失时按既有 `fixtureSkipReason()`
// 模式跳过并打印恢复命令，而不是硬失败（见 CLAUDE.md 的 fixture 约定）。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  assimpAvailable,
  collectSidecarFiles,
  convertToGlb,
  isConvertiblePath,
  missingAssimpMessage,
  weldPrimitives,
} = require('../src/convert')
const { readGlb } = require('../src/repair')
const { glbBounds } = require('../src/transform')
const { inspect } = require('../src/inspect')

const projectRoot = path.join(__dirname, '..')
const fbxFixture = path.join(projectRoot, 'o-model', '蹲姿.fbx')
const objFixture = path.join(projectRoot, 'o-model', '蹲姿.obj')
// 两个参考件的姿态不同，别混用（实测）：
//   o-model/蹲姿.glb = 1.8937 × 1.8483 × 0.3804 —— 绑定/平举姿态，与 FBX 产物同源
//   model/蹲姿.glb   = 0.5382 × 1.3643 × 1.0559 —— 蹲姿，与 OBJ 产物同源
const bindPoseReference = path.join(projectRoot, 'o-model', '蹲姿.glb')
const crouchReference = path.join(projectRoot, 'model', '蹲姿.glb')

function convertSkipReason(fixture) {
  if (!fs.existsSync(fixture)) return `缺少样例：${fixture}`
  if (!assimpAvailable()) return `assimpjs 不可用：${missingAssimpMessage()}`
  return false
}

function parse(bytes) {
  const tempFile = path.join(require('node:os').tmpdir(), `convert-test-${process.pid}-${Math.random().toString(16).slice(2)}.glb`)
  fs.writeFileSync(tempFile, bytes)
  try {
    return readGlb(tempFile)
  } finally {
    fs.rmSync(tempFile, { force: true })
  }
}

const countGeometry = (json) => {
  const accessors = json.accessors || []
  let vertices = 0
  let triangles = 0
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const position = primitive.attributes?.POSITION
      if (Number.isInteger(position)) vertices += accessors[position]?.count || 0
      if (Number.isInteger(primitive.indices)) triangles += Math.round((accessors[primitive.indices]?.count || 0) / 3)
    }
  }
  return { vertices, triangles }
}

const worldSize = (json) => {
  const bounds = glbBounds(json)
  const world = bounds?.world
  if (!world) return null
  return world.max.map((value, axis) => value - world.min[axis])
}

/** @description 与某个参考件比对三轴（容差 0.02）；参考件缺席时返回 null 表示"没得比"。 */
function compareWithReference(size, referencePath) {
  if (!fs.existsSync(referencePath)) return null
  const world = glbBounds(readGlb(referencePath).json)?.world
  if (!world) return null
  const referenceSize = world.max.map((value, axis) => value - world.min[axis])
  return size.map((value, axis) => Math.abs(value - referenceSize[axis]))
}

test('convert: 只认 FBX / OBJ 扩展名', () => {
  assert.equal(isConvertiblePath('a.fbx'), true)
  assert.equal(isConvertiblePath('a.FBX'), true)
  assert.equal(isConvertiblePath('a.obj'), true)
  assert.equal(isConvertiblePath('a.glb'), false)
  assert.equal(isConvertiblePath('a.ive'), false)
  assert.equal(isConvertiblePath(undefined), false)
})

test('convert: sidecar 收集把同目录与 .fbm 里的贴图按 basename 带上', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'convert-sidecar-'))
  try {
    fs.writeFileSync(path.join(dir, 'm.obj'), 'mtllib model.mtl\nv 0 0 0\n')
    fs.writeFileSync(path.join(dir, 'model.mtl'), 'newmtl a\nmap_Kd tex.png\n')
    fs.writeFileSync(path.join(dir, 'tex.png'), 'x')
    fs.mkdirSync(path.join(dir, 'model.fbm'))
    fs.writeFileSync(path.join(dir, 'model.fbm', 'extra.jpg'), 'x')
    const files = collectSidecarFiles(path.join(dir, 'm.obj')).map((file) => file.name).sort()
    assert.deepEqual(files, ['extra.jpg', 'm.obj', 'model.mtl', 'tex.png'].sort())
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('convert: 不存在的文件与不可转换的格式都返回中文错误而不是抛异常', async () => {
  const missing = await convertToGlb(path.join(projectRoot, 'o-model', '不存在.fbx'))
  assert.equal(missing.status, 'error')
  assert.match(missing.error, /文件不存在/)

  const wrong = await convertToGlb(path.join(projectRoot, 'package.json'))
  assert.equal(wrong.status, 'error')
  assert.match(wrong.error, /只支持 FBX \/ OBJ/)
})

test('convert: 坏文件返回中文错误且不抛（批量不会中断）', async () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'convert-bad-'))
  try {
    const broken = path.join(dir, 'broken.fbx')
    fs.writeFileSync(broken, 'this is definitely not an fbx')
    const report = await convertToGlb(broken)
    assert.equal(report.status, 'error')
    assert.match(report.error, /转换失败/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('convert: FBX 转成自包含 GLB（面数与参考件一致、贴图内嵌、保留蒙皮与动画）',
  { skip: convertSkipReason(fbxFixture) }, async () => {
    const report = await convertToGlb(fbxFixture)
    assert.equal(report.status, 'success', report.error)
    const { json } = parse(report.bytes)

    const geometry = countGeometry(json)
    assert.equal(geometry.triangles, 18924, '面数必须与 FBX2glTF 参考件一致')
    const embedded = (json.images || []).filter((image) => Number.isInteger(image.bufferView))
    assert.ok(embedded.length >= 3, `至少 3 张贴图必须内嵌，实测 ${embedded.length}`)
    assert.equal((json.images || []).filter((image) => image.uri).length, 0, '不得残留外部 uri')
    assert.equal((json.skins || []).length, 1)
    assert.equal((json.animations || []).length, 1)
    assert.match(json.asset.generator, /assimp/)
    assert.equal(report.warnings.length, 0)

    // FBX 携带绑定/平举姿态 + 动画，世界盒应与 o-model/蹲姿.glb 同尺度同轴向
    const deltas = compareWithReference(worldSize(json), bindPoseReference)
    if (deltas) {
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(deltas[axis] < 0.02, `第 ${axis} 轴与 o-model/蹲姿.glb 差 ${deltas[axis]}`)
      }
    }
  })

test('convert: OBJ 转成自包含 GLB，世界盒与 FBX2glTF 参考件三轴一致',
  { skip: convertSkipReason(objFixture) }, async () => {
    const report = await convertToGlb(objFixture)
    assert.equal(report.status, 'success', report.error)
    const { json } = parse(report.bytes)

    assert.equal(countGeometry(json).triangles, 18924)
    assert.equal((json.images || []).filter((image) => image.uri).length, 0, '不得残留外部 uri')

    const size = worldSize(json)
    assert.ok(size, '必须能算出世界盒')
    // 参考件（model/蹲姿.glb，蹲姿）: 0.5382 × 1.3643 × 1.0559
    assert.ok(Math.abs(size[0] - 0.5382) < 0.02, `X 轴 ${size[0]}`)
    assert.ok(Math.abs(size[1] - 1.3643) < 0.02, `Y 轴 ${size[1]}`)
    assert.ok(Math.abs(size[2] - 1.0559) < 0.02, `Z 轴 ${size[2]}`)

    const deltas = compareWithReference(size, crouchReference)
    if (deltas) {
      for (let axis = 0; axis < 3; axis += 1) {
        assert.ok(deltas[axis] < 0.02, `第 ${axis} 轴与 model/蹲姿.glb 差 ${deltas[axis]}`)
      }
    }
  })

test('convert: MTL 里解析不到的贴图用 1×1 占位并在 warnings 里给出原始路径',
  { skip: convertSkipReason(objFixture) }, async () => {
    const report = await convertToGlb(objFixture)
    assert.equal(report.status, 'success', report.error)
    // 样例的 MTL 指向 E:\... 的乱码绝对路径，本机没有该文件 —— 必须被如实报出来
    assert.ok(report.warnings.length >= 1, '解析不到的贴图必须产生 warning')
    assert.match(report.warnings.join('\n'), /WuYanZu_Hat_D\.jpg|未能解析/)
    const { json } = parse(report.bytes)
    const placeholders = (json.images || []).filter((image) => String(image.name || '').startsWith('missing:'))
    assert.ok(placeholders.length >= 1, '占位贴图要留下 missing: 名字，便于体检识别')

    // I-1：体检的**问题清单**也必须能看到原始 uri（只留在日志里不够）
    const os = require('node:os')
    const tempFile = path.join(os.tmpdir(), `convert-inspect-${process.pid}-${Math.random().toString(16).slice(2)}.glb`)
    fs.writeFileSync(tempFile, report.bytes)
    try {
      const inspection = inspect(tempFile)
      const placeholderIssue = (inspection.issues || []).find((issue) => issue.code === 'TEXTURE_1X1_PLACEHOLDER')
      assert.ok(placeholderIssue, '体检必须报出 1×1 占位')
      assert.match(placeholderIssue.message, /WuYanZu_Hat_D\.jpg/, `占位 issue 必须带出原始 uri，实际：${placeholderIssue.message}`)
      assert.match(String(placeholderIssue.detail || ''), /放到模型同级目录/, '占位 issue 要给出可操作的恢复建议')
    } finally {
      fs.rmSync(tempFile, { force: true })
    }
  })

test('convert: 焊接把三角汤压到参考件量级且面数不变',
  { skip: convertSkipReason(objFixture) }, async () => {
    const welded = await convertToGlb(objFixture)
    const raw = await convertToGlb(objFixture, { weld: false })
    assert.equal(welded.status, 'success', welded.error)
    assert.equal(raw.status, 'success', raw.error)

    const weldedGeometry = countGeometry(parse(welded.bytes).json)
    const rawGeometry = countGeometry(parse(raw.bytes).json)
    assert.equal(rawGeometry.vertices, 56772, '未焊接时是三角汤（每面 3 个顶点）')
    assert.ok(weldedGeometry.vertices < rawGeometry.vertices / 3,
      `焊接后顶点应显著下降，实测 ${rawGeometry.vertices} → ${weldedGeometry.vertices}`)
    assert.equal(weldedGeometry.triangles, rawGeometry.triangles, '焊接不得改变面数')
    assert.ok(welded.bytes.length < raw.bytes.length, '焊接后文件必须更小（旧顶点数据要被回收）')
    assert.equal(welded.stats.weldedPrimitives, 3)
  })

test('convert: 汇总统计与写出的 GLB 自洽（顶点/面/贴图）',
  { skip: convertSkipReason(fbxFixture) }, async () => {
    const report = await convertToGlb(fbxFixture)
    assert.equal(report.status, 'success', report.error)
    const { json } = parse(report.bytes)
    // 与**独立常量**比对：同一份 json 两边算出来的相等属同义反复，证明不了读的是产物
    assert.equal(report.stats.vertices, 11516)
    assert.equal(report.stats.triangles, 18924)
    assert.equal(report.stats.images, 3, '产物里的贴图总数（FBX 本来就内嵌，不能拿 embeddedImages 当张数）')
    assert.equal(report.stats.bytesOut, report.bytes.length)
    assert.equal(report.stats.verticesBeforeWeld, 56772)
    assert.ok(report.stats.elapsedMs >= 0)
    assert.match(report.stats.generator, /assimp/)
    // 产物里每个图片都必须是内嵌的 bufferView（stats.images 与之一致）
    assert.equal((json.images || []).filter((image) => Number.isInteger(image.bufferView)).length, 3)
  })

test('convert: 贴图解析顺序覆盖「相对路径 / 同等目录同名 / .fbm 内同名」三种', async () => {
  const os = require('node:os')
  const { PNG } = require(path.join(projectRoot, 'node_modules', 'pngjs'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'convert-resolve-'))
  const png = new PNG({ width: 2, height: 2 })
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 255; png.data[i + 3] = 255 }
  const pngBytes = PNG.sync.write(png)
  const geometry = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
  const cases = []

  try {
    // ① MTL 写相对路径，贴图就在旁边
    const relDir = path.join(dir, 'rel')
    fs.mkdirSync(relDir)
    fs.writeFileSync(path.join(relDir, 'm.obj'), `mtllib m.mtl\n${geometry}`)
    fs.writeFileSync(path.join(relDir, 'm.mtl'), 'newmtl a\nmap_Kd tex.png\n')
    fs.writeFileSync(path.join(relDir, 'tex.png'), pngBytes)
    cases.push(['相对路径', path.join(relDir, 'm.obj')])

    // ② MTL 写别的机器的反斜杠路径，但同名贴图就在旁边（按 basename 命中）
    const sameDir = path.join(dir, 'same')
    fs.mkdirSync(sameDir)
    fs.writeFileSync(path.join(sameDir, 'm.obj'), `mtllib m.mtl\n${geometry}`)
    fs.writeFileSync(path.join(sameDir, 'm.mtl'), 'newmtl a\nmap_Kd E:\\zxb\\somewhere\\tex.png\n')
    fs.writeFileSync(path.join(sameDir, 'tex.png'), pngBytes)
    cases.push(['同级同名', path.join(sameDir, 'm.obj')])

    // ③ 贴图只在 .fbm 子目录里（MTL 依旧写绝对路径）
    const fbmDir = path.join(dir, 'fbm')
    fs.mkdirSync(path.join(fbmDir, 'model.fbm'), { recursive: true })
    fs.writeFileSync(path.join(fbmDir, 'm.obj'), `mtllib m.mtl\n${geometry}`)
    fs.writeFileSync(path.join(fbmDir, 'm.mtl'), 'newmtl a\nmap_Kd D:\\art\\model.fbm\\tex.png\n')
    fs.writeFileSync(path.join(fbmDir, 'model.fbm', 'tex.png'), pngBytes)
    cases.push(['.fbm 内同名', path.join(fbmDir, 'm.obj')])

    for (const [label, objPath] of cases) {
      assert.deepEqual(
        collectSidecarFiles(objPath).map((file) => file.name).includes('tex.png'), true,
        `${label}：sidecar 必须带上 tex.png`,
      )
      const report = await convertToGlb(objPath)
      assert.equal(report.status, 'success', `${label}：${report.error}`)
      assert.equal(report.warnings.length, 0, `${label} 不该有告警：${report.warnings.join(' | ')}`)
      const { json } = parse(report.bytes)
      assert.equal((json.images || []).filter((image) => Number.isInteger(image.bufferView)).length, 1, `${label}：贴图必须内嵌`)
      assert.equal((json.images || []).filter((image) => image.uri).length, 0, `${label}：不得残留 uri`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/** @description 造一个最小的三角汤 GLB 形状（2 个三角形 / 6 条顶点记录 / 4 个唯一顶点）。 */
function syntheticSoup({ positionByteOffset = 0, withAnimation = false } = {}) {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 1, 1, 0,
  ])
  const normals = new Float32Array(18).fill(0)
  for (let i = 2; i < 18; i += 3) normals[i] = 1
  const indices = new Uint32Array([0, 1, 2, 3, 4, 5])
  const pad = Buffer.alloc(positionByteOffset)
  const positionBytes = Buffer.from(positions.buffer)
  const chunk0 = Buffer.concat([pad, positionBytes])
  const chunk1 = Buffer.from(normals.buffer)
  const chunk2 = Buffer.from(indices.buffer)
  const bin = Buffer.concat([chunk0, chunk1, chunk2])
  const json = {
    asset: { version: '2.0' },
    accessors: [
      { bufferView: 0, byteOffset: positionByteOffset || undefined, componentType: 5126, count: 6, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 6, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: 6, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: chunk0.length, target: 34962 },
      { buffer: 0, byteOffset: chunk0.length, byteLength: chunk1.length, target: 34962 },
      { buffer: 0, byteOffset: chunk0.length + chunk1.length, byteLength: chunk2.length, target: 34963 },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }] }],
    buffers: [{ byteLength: bin.length }],
  }
  if (withAnimation) {
    json.animations = [{ samplers: [{ input: 2, output: 0 }], channels: [] }]
  }
  return { json, bin }
}

test('convert: 焊接对"带 byteOffset 的 accessor"保守跳过（冷审反例 I-5①）', () => {
  const { json, bin } = syntheticSoup({ positionByteOffset: 4 })
  const stats = weldPrimitives(json, [bin])
  assert.equal(stats.welded, 0, 'byteOffset≠0 时必须跳过，否则会读出错位几何')
  assert.equal(json.accessors[0].count, 6, '原始 accessor 必须原样保留')
  assert.equal(json.accessors[0].byteOffset, 4)
})

test('convert: 焊接对"被动画 sampler 复用的 accessor"保守跳过（冷审反例 I-5②）', () => {
  const { json, bin } = syntheticSoup({ withAnimation: true })
  const stats = weldPrimitives(json, [bin])
  assert.equal(stats.welded, 0, 'POSITION 兼作动画 output 时不能原地改写，否则会连动画一起改坏')
  assert.equal(json.accessors[0].count, 6)
})

test('convert: 正常形状仍然焊接（守卫不能把该焊的也挡掉）', () => {
  const { json, bin } = syntheticSoup()
  const stats = weldPrimitives(json, [bin])
  assert.equal(stats.welded, 1)
  assert.equal(stats.before, 6)
  assert.equal(stats.after, 4, '2 个三角形共享 2 个顶点 → 6 条记录应焊成 4 个顶点')
  assert.equal(json.accessors[0].count, 4)
  assert.equal(json.accessors[2].count, 6, '索引数量不变（面数不变）')
})
