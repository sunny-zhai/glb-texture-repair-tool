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
} = require('../src/convert')
const { readGlb } = require('../src/repair')
const { glbBounds } = require('../src/transform')

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

test('convert: 坏文件返回中文错误且不抛（批量不会中断）', { skip: convertSkipReason(fbxFixture) }, async () => {
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
    const geometry = countGeometry(parse(report.bytes).json)
    assert.equal(report.stats.vertices, geometry.vertices)
    assert.equal(report.stats.triangles, geometry.triangles)
    assert.equal(report.stats.bytesOut, report.bytes.length)
    assert.equal(report.stats.verticesBeforeWeld, 56772)
    assert.ok(report.stats.elapsedMs >= 0)
    assert.match(report.stats.generator, /assimp/)
  })
