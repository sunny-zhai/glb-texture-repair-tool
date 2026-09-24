const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { align4, collectGlbEntries, collectGlbFiles, downsamplePng, encodePng, mergeUniquePaths, repairGlbFile, repairMany, readGlb, writeGlb } = require('../src/repair')
const { inspect } = require('../src/inspect')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// 夹具是 gitignore 的样例模型，新克隆里没有；缺了就跳过并给出恢复命令，
// 而不是让整个文件以 ENOENT 报错（那样看起来像代码坏了）。
const fixtureDir = path.join(__dirname, '..', 'refs', 'models')
const REQUIRED_FIXTURES = ['person-move.glb', 'person-stand.glb', '蹲姿.glb']

function fixtureSkipReason() {
  const missing = REQUIRED_FIXTURES.filter((name) => !fs.existsSync(path.join(fixtureDir, name)))
  if (missing.length) {
    return `缺少测试夹具 refs/models/{${missing.join('、')}}；恢复：mkdir -p refs/models && cp o-model/*.glb refs/models/`
  }
  return false
}

// A real 2x2 JPEG captured from ffmpeg; exercises the pure-JS transcode path
// so repair does not depend on an external ffmpeg binary (packaged apps have none).
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMgD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAE1/f//Z',
  'base64',
)

test('encodePng converts a JPEG buffer to PNG without external tools', () => {
  const png = encodePng(TINY_JPEG)
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE))
  // 2x2 RGBA PNG should decode back to a PNG with the same pixel area.
  const { PNG } = require('pngjs')
  const decoded = PNG.sync.read(png)
  assert.equal(decoded.width, 2)
  assert.equal(decoded.height, 2)
})

test('encodePng passes an already-PNG buffer through unchanged', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAQbT8WQAAAABJRU5ErkJggg==',
    'base64',
  )
  assert.equal(encodePng(png).equals(png), true)
})

test('encodePng rejects unknown image formats with a per-file error', () => {
  assert.throws(() => encodePng(Buffer.from('not an image at all')), /不支持的图片格式/)
})

test('readGlb and writeGlb preserve a valid GLB container', { skip: fixtureSkipReason() }, () => {
  const fixture = path.join(fixtureDir, 'person-stand.glb')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-roundtrip-'))
  const output = path.join(tempDir, 'roundtrip.glb')
  const { json, bin } = readGlb(fixture)

  writeGlb(output, json, bin)

  assert.ok(fs.existsSync(output))
  const stat = fs.statSync(output)
  assert.ok(stat.size > 0)
})

test('mergeUniquePaths 累加去重并保序（界面「选择文件」不会顶掉上次选择）', () => {
  // 这是「选择文件」逐个点选的行为基础：后一次选择必须叠加，而不是替换，
  // 否则用户看到的现象就是"一次只能选一个模型"
  assert.deepEqual(mergeUniquePaths(['a.glb'], ['b.glb']), ['a.glb', 'b.glb'])
  assert.deepEqual(mergeUniquePaths(['a.glb'], ['a.glb', 'b.glb']), ['a.glb', 'b.glb'], '重复路径不应出现两次')
  assert.deepEqual(mergeUniquePaths([], ['a.glb']), ['a.glb'])
  assert.deepEqual(mergeUniquePaths(['a.glb'], []), ['a.glb'], '取消对话框应保留原选择')
  // 保序：先选的在前
  assert.deepEqual(mergeUniquePaths(['b.glb', 'a.glb'], ['c.glb']), ['b.glb', 'a.glb', 'c.glb'])
  // 容错：非数组与空值被忽略
  assert.deepEqual(mergeUniquePaths(null, ['a.glb']), ['a.glb'])
  assert.deepEqual(mergeUniquePaths(['a.glb'], undefined), ['a.glb'])
  assert.deepEqual(mergeUniquePaths(['a.glb', ''], ['', null, 'b.glb']), ['a.glb', 'b.glb'])
})

test('collectGlbFiles finds nested glb files', { skip: fixtureSkipReason() }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-collect-'))
  const nested = path.join(root, 'nested')
  fs.mkdirSync(nested, { recursive: true })
  fs.copyFileSync(path.join(fixtureDir, 'person-move.glb'), path.join(nested, 'sample.glb'))

  const files = collectGlbFiles([root])
  assert.equal(files.length, 1)
  assert.ok(files[0].endsWith(path.join('nested', 'sample.glb')))
})

test('collectGlbEntries preserves directory structure under batch roots', { skip: fixtureSkipReason() }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-entries-'))
  const nested = path.join(root, 'inner')
  fs.mkdirSync(nested, { recursive: true })
  fs.copyFileSync(path.join(fixtureDir, 'person-move.glb'), path.join(nested, 'sample.glb'))

  const entries = collectGlbEntries([root])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].relativePath, path.join(path.basename(root), 'inner', 'sample.glb'))
})

test('repairGlbFile writes an output file', { skip: fixtureSkipReason() }, () => {
  const fixture = path.join(fixtureDir, '蹲姿.glb')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-repair-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  fs.copyFileSync(fixture, input)

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  assert.ok(fs.existsSync(output))
  assert.ok(report.newBytes > 0)
})

test('repairGlbFile embeds an external PNG found beside the model', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-external-image-'))
  const textureDir = path.join(tempDir, 'character.fbm')
  const input = path.join(tempDir, 'character.glb')
  const output = path.join(tempDir, 'output.glb')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgQIAQbT8WQAAAABJRU5ErkJggg==', 'base64')
  fs.mkdirSync(textureDir)
  fs.writeFileSync(path.join(textureDir, 'Body_D.png'), png)
  writeGlb(input, {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 0 }],
    images: [{ uri: 'E:\\old-project\\character.fbm\\Body_D.png' }],
  }, Buffer.alloc(0))

  const report = repairGlbFile(input, output)
  const repaired = readGlb(output)

  assert.equal(report.status, 'success')
  assert.equal(report.externalImagesEmbedded, 1)
  assert.equal(repaired.json.images[0].uri, undefined)
  assert.equal(typeof repaired.json.images[0].bufferView, 'number')
  assert.equal(repaired.json.images[0].mimeType, 'image/png')
  const view = repaired.json.bufferViews[repaired.json.images[0].bufferView]
  assert.ok(repaired.bin.subarray(view.byteOffset, view.byteOffset + view.byteLength).equals(png))
})

test('repairGlbFile reports a missing external texture with recovery guidance', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-missing-image-'))
  const input = path.join(tempDir, 'character.glb')
  const output = path.join(tempDir, 'output.glb')
  writeGlb(input, {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 0 }],
    images: [{ uri: 'E:\\old-project\\character.fbm\\Missing_D.jpg' }],
  }, Buffer.alloc(0))

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'error')
  assert.match(report.error, /Missing_D\.jpg/)
  assert.match(report.error, /GLB 同级目录/)
  assert.equal(fs.existsSync(output), false)
})

test('repairGlbFile reports an unreadable file instead of throwing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-corrupt-'))
  const input = path.join(tempDir, 'broken.glb')
  const output = path.join(tempDir, 'broken-out.glb')
  fs.writeFileSync(input, 'this is not a glb container')

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'error')
  assert.match(report.error, /Unsupported GLB/)
  assert.equal(fs.existsSync(output), false)
})

test('repairMany continues past a corrupt file and reports per-file progress', { skip: fixtureSkipReason() }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-batch-'))
  const inputDir = path.join(tempDir, 'in')
  const outputDir = path.join(tempDir, 'out')
  fs.mkdirSync(inputDir, { recursive: true })
  fs.writeFileSync(path.join(inputDir, 'a-broken.glb'), 'not a glb')
  fs.copyFileSync(path.join(fixtureDir, 'person-stand.glb'), path.join(inputDir, 'b-good.glb'))

  const events = []
  const reports = await repairMany([inputDir], outputDir, {
    onProgress: (event) => events.push(event),
  })

  // The corrupt file must not abort the batch: the good file is still repaired.
  assert.equal(reports.length, 2)
  assert.deepEqual(reports.map((report) => report.status).sort(), ['error', 'success'])

  assert.equal(events[0].phase, 'scanning')
  assert.equal(events[1].phase, 'start')
  assert.equal(events[1].total, 2)

  const fileStarts = events.filter((event) => event.phase === 'file-start')
  assert.equal(fileStarts.length, 2)
  assert.deepEqual(fileStarts.map((event) => event.index), [0, 1])

  const fileDones = events.filter((event) => event.phase === 'file-done')
  assert.deepEqual(fileDones.map((event) => event.completed), [1, 2])
  assert.equal(fileDones[0].status, 'error')
  assert.equal(fileDones[1].status, 'success')
  assert.ok(fileDones[0].error)

  const done = events.at(-1)
  assert.equal(done.phase, 'done')
  assert.equal(done.completed, 2)
  assert.equal(done.failed, 1)
})

// Builds a two-mesh glTF by hand: same material, POSITION-only primitives, one node
// translated +10 on X. Merging them is the minimal case for the primitive-merge step.
function writeMergeFixture(input) {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = Uint16Array.from([0, 1, 2])
  const bin = Buffer.concat([
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
  ])
  writeGlb(input, {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, translation: [10, 0, 0] }, { mesh: 1 }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 2 }, indices: 3, material: 0 }] },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 3, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 36 },
      { buffer: 0, byteOffset: 80, byteLength: 6 },
    ],
    buffers: [{ byteLength: bin.length }],
  }, bin)
}

test('mergePrimitivesByMaterial merges same-material primitives across nodes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-merge-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeMergeFixture(input)

  const report = repairGlbFile(input, output, { mergePrimitiveThreshold: 1 })

  assert.equal(report.status, 'success')
  assert.equal(report.primitivesMerged, 1)

  const { json } = readGlb(output)
  const primitives = json.meshes.flatMap((mesh) => mesh.primitives)
  assert.equal(primitives.length, 1)

  // 两个 3 顶点图元合并成 6 顶点，且世界变换已烘焙：min.x 来自未平移的那个。
  const position = json.accessors[primitives[0].attributes.POSITION]
  assert.equal(position.count, 6)
  assert.deepEqual(position.min, [0, 0, 0])
  assert.deepEqual(position.max, [11, 1, 0])
})

test('mergePrimitivesByMaterial is a no-op below the primitive threshold', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-merge-threshold-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeMergeFixture(input)

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  assert.equal(report.primitivesMerged, 0)

  const { json } = readGlb(output)
  assert.equal(json.meshes.flatMap((mesh) => mesh.primitives).length, 2)
})

test('fillMissingTexCoords adds a zero UV set when the material samples a texture', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-texcoord-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = Uint16Array.from([0, 1, 2])
  writeGlb(input, {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ uri: 'data:image/png;base64,iVBORw0KGgo=' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ byteLength: 48 }],
  }, Buffer.concat([
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
  ]))

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  assert.equal(report.texCoordsFilled, 1)

  const { json, bin } = readGlb(output)
  const primitive = json.meshes[0].primitives[0]
  const uvAccessor = json.accessors[primitive.attributes.TEXCOORD_0]
  assert.equal(uvAccessor.type, 'VEC2')
  assert.equal(uvAccessor.count, 3)
  // 全 0 的 UV 必须真的写进了 BIN，而不是只挂了一个空 bufferView。
  const view = json.bufferViews[uvAccessor.bufferView]
  const uvBytes = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)
  assert.equal(uvBytes.equals(Buffer.alloc(uvBytes.length)), true)
})

test('repairMany keeps onProgress out of the per-file options', { skip: fixtureSkipReason() }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-options-'))
  const inputDir = path.join(tempDir, 'in')
  fs.mkdirSync(inputDir, { recursive: true })
  fs.copyFileSync(path.join(fixtureDir, 'person-stand.glb'), path.join(inputDir, 'sample.glb'))

  const seen = []
  const reports = await repairMany([inputDir], path.join(tempDir, 'out'), {
    poseTime: 'start',
    onProgress: (event) => seen.push(event.phase),
  })

  // A bare array of phase names cannot leak the callback into repairGlbFile's options.
  assert.deepEqual(reports.map((report) => report.status), ['success'])
  assert.ok(seen.includes('done'))
})

// 构造一个 SOF 段：SOI + SOF0(高1 宽1, nf 个分量)。
function makeSofHeader(componentCount) {
  const header = Buffer.alloc(12 + 3 * componentCount)
  header[0] = 0xff
  header[1] = 0xd8 // SOI
  header[2] = 0xff
  header[3] = 0xc0 // SOF0
  header.writeUInt16BE(8 + 3 * componentCount, 4)
  header[6] = 0x08 // 精度
  header.writeUInt16BE(1, 7) // 高
  header.writeUInt16BE(1, 9) // 宽
  header[11] = componentCount
  return header
}

// 一张 JPEG 贴图内嵌在 BIN 里的最小模型：材质经 baseColorTexture 引用它。
function writeJpegTextureFixture(input, jpegBytes) {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = Uint16Array.from([0, 1, 2])
  const uvs = Float32Array.from([0, 0, 1, 0, 0, 1])
  const head = Buffer.concat([
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
    Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength),
  ])
  const imageOffset = align4(head.length)
  const bin = Buffer.concat([head, Buffer.alloc(imageOffset - head.length), jpegBytes])
  writeGlb(input, {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/jpeg' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
      { buffer: 0, byteOffset: imageOffset, byteLength: jpegBytes.length },
    ],
    buffers: [{ byteLength: bin.length }],
  }, bin)
}

test('repairGlbFile converts an embedded JPEG texture to PNG', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-jpeg-to-png-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeJpegTextureFixture(input, TINY_JPEG)

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  // 贴图统一转 PNG，不再有「原样保留 JPEG」的分支。
  assert.equal(report.imagesConverted, 1)
  assert.equal(report.imagesKeptJpeg, undefined)

  const { json, bin } = readGlb(output)
  assert.equal(json.images[0].mimeType, 'image/png')
  const view = json.bufferViews[json.images[0].bufferView]
  assert.equal(bin.subarray(view.byteOffset, view.byteOffset + 8).equals(PNG_SIGNATURE), true)
})

test('repairGlbFile always converts JPEG to PNG regardless of leftover keepJpeg option', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-keep-jpeg-noop-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeJpegTextureFixture(input, TINY_JPEG)

  // keepJpeg 已从接口移除；万一调用方还传着旧参数，行为也必须一致（回退到统一转 PNG）。
  const report = repairGlbFile(input, output, { keepJpeg: true })

  assert.equal(report.status, 'success')
  assert.equal(report.imagesConverted, 1)
  const { json } = readGlb(output)
  assert.equal(json.images[0].mimeType, 'image/png')
})

test('repairGlbFile embeds an external JPEG as PNG', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-external-jpeg-'))
  const input = path.join(tempDir, 'character.glb')
  const output = path.join(tempDir, 'output.glb')
  fs.writeFileSync(path.join(tempDir, 'Body_D.jpg'), TINY_JPEG)
  writeGlb(input, {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 0 }],
    images: [{ uri: 'E:\\old-project\\character.fbm\\Body_D.jpg' }],
  }, Buffer.alloc(0))

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  assert.equal(report.externalImagesEmbedded, 1)

  const repaired = readGlb(output)
  assert.equal(repaired.json.images[0].mimeType, 'image/png')
  assert.equal(repaired.json.images[0].uri, undefined)
  const view = repaired.json.bufferViews[repaired.json.images[0].bufferView]
  assert.equal(repaired.bin.subarray(view.byteOffset, view.byteOffset + 8).equals(PNG_SIGNATURE), true)
})

test('repairGlbFile reports a JPEG it cannot transcode instead of embedding a broken texture', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-cmyk-jpeg-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  // 只有文件头、没有可解码的扫描数据（四分量 CMYK 也是这条路径），
  // 必须明确报错，而不是静默产出一张坏贴图。
  writeJpegTextureFixture(input, makeSofHeader(4))

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'error')
  assert.equal(report.imagesConverted, 0)
  assert.match(report.error, /JPEG 转 PNG 失败/)
})

// ---- BR-031 / REQ-008：NPOT × REPEAT × mipmap 的采样器退化 ----

const REPEAT_MIPMAP = { wrapS: 10497, wrapT: 10497, minFilter: 9987 }
const CLAMP_LINEAR = { wrapS: 33071, wrapT: 33071, minFilter: 9729 }
const NPOT_REPAIR_PNG_CACHE = new Map()

// 真 PNG（不是伪造头）——修复路径会用 jpeg-js/pngjs 真解码，伪造头走不到采样器那一步。
function pngOfSize(width, height) {
  const key = `${width}x${height}`
  if (!NPOT_REPAIR_PNG_CACHE.has(key)) {
    const { PNG } = require('pngjs')
    const png = new PNG({ width, height })
    for (let index = 0; index < width * height; index += 1) {
      png.data[index * 4] = index % 251
      png.data[index * 4 + 1] = (index * 7) % 253
      png.data[index * 4 + 2] = 200
      png.data[index * 4 + 3] = 255
    }
    NPOT_REPAIR_PNG_CACHE.set(key, PNG.sync.write(png))
  }
  return NPOT_REPAIR_PNG_CACHE.get(key)
}

// 几何固定、贴图与采样器可配的最小模型：一张 baseColorTexture 采纹理 0，
// 但 textures/samplers 由调用方给，用来精确构造"哪张贴图配哪个采样器"。
function writeTextureFixture(input, { images, textures, samplers }) {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = Uint16Array.from([0, 1, 2])
  const uvs = Float32Array.from([0, 0, 1, 0, 0, 1])
  let bin = Buffer.concat([
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
    Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength),
  ])
  const bufferViews = [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 6 },
    { buffer: 0, byteOffset: 44, byteLength: 24 },
  ]
  const imageEntries = images.map((image) => {
    const offset = align4(bin.length)
    bin = Buffer.concat([bin, Buffer.alloc(offset - bin.length), image.bytes])
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: image.bytes.length })
    return { bufferView: bufferViews.length - 1, mimeType: image.mimeType || 'image/png' }
  })
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: textures.map((texture) => ({ ...texture })),
    images: imageEntries,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  }
  if (samplers) json.samplers = samplers
  writeGlb(input, json, bin)
}

function hasNpotIssue(filePath) {
  return inspect(filePath).issues.some((issue) => issue.code === 'NPOT_WITH_REPEAT_MIPMAP')
}

test('repairGlbFile 把 NPOT + REPEAT + mipmap 的采样器退化为 CLAMP_TO_EDGE + LINEAR（BR-031）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-npot-sampler-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(512, 341) }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ ...REPEAT_MIPMAP }],
  })
  // 先证明夹具真的命中了那条问题（否则下面的"不再报"是自我满足）
  assert.equal(hasNpotIssue(input), true)

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  assert.equal(report.samplersNormalized, 1)
  const { json } = readGlb(output)
  assert.deepEqual(json.samplers[0], CLAMP_LINEAR)
  assert.equal(hasNpotIssue(output), false)
  assert.deepEqual(inspect(output).npotSamplerBindings, [])
})

test('repairGlbFile 不动 POT 贴图的 REPEAT + mipmap 采样器（BR-031 不误伤）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-pot-sampler-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(256, 256) }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ ...REPEAT_MIPMAP }],
  })

  const report = repairGlbFile(input, output)

  assert.equal(report.samplersNormalized, 0)
  const { json } = readGlb(output)
  assert.deepEqual(json.samplers[0], REPEAT_MIPMAP)
})

test('repairGlbFile 不动已经合法的 NPOT 采样器（CLAMP_TO_EDGE + LINEAR 原样保留）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-npot-legal-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(512, 341) }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ ...CLAMP_LINEAR }],
  })

  const report = repairGlbFile(input, output)

  assert.equal(report.samplersNormalized, 0)
  assert.deepEqual(readGlb(output).json.samplers[0], CLAMP_LINEAR)
})

test('repairGlbFile 在采样器被 POT 贴图共用时复制一份退化采样器，不误伤 POT（BR-031）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-shared-sampler-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(256, 256) }, { bytes: pngOfSize(512, 341) }],
    textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
    samplers: [{ ...REPEAT_MIPMAP }],
  })

  const report = repairGlbFile(input, output)

  assert.equal(report.samplersNormalized, 1)
  assert.equal(report.samplersCloned, 1)
  const { json } = readGlb(output)
  // 共用采样器不能被原地改：POT 贴图仍指向它，且它仍是 REPEAT + mipmap
  assert.equal(json.textures[0].sampler, 0)
  assert.deepEqual(json.samplers[0], REPEAT_MIPMAP)
  // NPOT 贴图改指一份退化后的采样器
  const npotSampler = json.textures[1].sampler
  assert.notEqual(npotSampler, 0)
  assert.deepEqual(json.samplers[npotSampler], CLAMP_LINEAR)
  // 这正是旧口径会误报的场景：POT 贴图合法地用 REPEAT+mipmap，产物必须不再报该问题
  assert.equal(hasNpotIssue(output), false)
})

test('repairGlbFile 给缺省采样器的 NPOT 贴图新建显式 CLAMP_TO_EDGE + LINEAR 采样器（BR-031）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-default-sampler-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(300, 300) }],
    textures: [{ source: 0 }],
  })
  // glTF 规范：缺省采样器就是 REPEAT + LINEAR_MIPMAP_LINEAR，因此这同样是非法组合
  assert.equal(hasNpotIssue(input), true)

  const report = repairGlbFile(input, output)

  assert.equal(report.samplersNormalized, 1)
  const { json } = readGlb(output)
  assert.equal(typeof json.textures[0].sampler, 'number')
  assert.deepEqual(json.samplers[json.textures[0].sampler], CLAMP_LINEAR)
  assert.equal(hasNpotIssue(output), false)
})

test('repairGlbFile 的 NPOT 采样器退化对多张 NPOT 贴图共用一份退化采样器（去重）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-npot-dedup-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(512, 341) }, { bytes: pngOfSize(300, 200) }],
    textures: [{ source: 0 }, { source: 1 }],
  })

  const report = repairGlbFile(input, output)

  assert.equal(report.samplersNormalized, 2)
  const { json } = readGlb(output)
  assert.equal(json.textures[0].sampler, json.textures[1].sampler)
  assert.equal(json.samplers.length, 1)
  assert.deepEqual(json.samplers[0], CLAMP_LINEAR)
})

// ---- BR-032 / REQ-008：贴图降采样 ----

// 给定尺寸与像素生成函数，产出真 PNG（复用 pngOfSize 的缓存思路，但内容可自定义）。
function pngFromPixels(width, height, pixelAt) {
  const { PNG } = require('pngjs')
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y)
      const offset = (y * width + x) * 4
      png.data[offset] = r
      png.data[offset + 1] = g
      png.data[offset + 2] = b
      png.data[offset + 3] = a
    }
  }
  return PNG.sync.write(png)
}

test('downsamplePng: 2048×2048 → 1024×1024，逐像素等于 2×2 盒式平均（BR-032）', () => {
  const { PNG } = require('pngjs')
  const source = pngFromPixels(2048, 2048, (x, y) => [
    (x * 13 + y * 7) % 256,
    (x * 3 + y * 29) % 256,
    (x * 17 + y * 5) % 256,
    255,
  ])

  const scaled = downsamplePng(source, 1024)

  assert.equal(scaled.width, 1024)
  assert.equal(scaled.height, 1024)
  assert.equal(scaled.sourceWidth, 2048)
  assert.equal(scaled.sourceHeight, 2048)
  // 期望值由**解码后的源像素**算出（不是复用实现里的公式），因此这是独立校验
  const decodedSource = PNG.sync.read(source)
  const decodedTarget = PNG.sync.read(scaled.bytes)
  let mismatches = 0
  for (let y = 0; y < 1024; y += 1) {
    for (let x = 0; x < 1024; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        const at = (sx, sy) => decodedSource.data[((sy * 2048 + sx) * 4) + channel]
        const expected = Math.round(
          (at(x * 2, y * 2) + at(x * 2 + 1, y * 2) + at(x * 2, y * 2 + 1) + at(x * 2 + 1, y * 2 + 1)) / 4,
        )
        if (decodedTarget.data[((y * 1024 + x) * 4) + channel] !== expected) mismatches += 1
      }
    }
  }
  assert.equal(mismatches, 0)
})

test('downsamplePng: 透明像素按 alpha 预乘，不把颜色拉黑（BR-032）', () => {
  const { PNG } = require('pngjs')
  // 一个完全透明的红 + 三个不透明白：颜色均值必须仍是白，alpha 均值是 191
  const source = pngFromPixels(2, 2, (x, y) => (x === 0 && y === 0 ? [255, 0, 0, 0] : [255, 255, 255, 255]))

  const scaled = downsamplePng(source, 1)
  const target = PNG.sync.read(scaled.bytes)

  assert.equal(target.width, 1)
  assert.equal(target.height, 1)
  assert.equal(target.data[0], 255)
  assert.equal(target.data[1], 255)
  assert.equal(target.data[2], 255)
  assert.equal(target.data[3], Math.round((0 + 255 + 255 + 255) / 4))
})

test('downsamplePng: 尺寸已达标或读不出宽高时返回 null（不做无谓重编码）', () => {
  assert.equal(downsamplePng(pngOfSize(256, 256), 1024), null)
  assert.equal(downsamplePng(pngOfSize(1024, 1024), 1024), null)
  assert.equal(downsamplePng(Buffer.from('not a png'), 1024), null)
})

test('repairGlbFile: 目标 1024 时 3000×1000 贴图等比缩到 1024×341（BR-032）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-downsample-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(3000, 1000) }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ ...REPEAT_MIPMAP }],
  })

  const report = repairGlbFile(input, output, { maxTextureSize: 1024 })

  assert.equal(report.status, 'success')
  assert.equal(report.maxTextureSize, 1024)
  assert.equal(report.texturesDownsampled, 1)
  assert.ok(report.textureBytesAfter < report.textureBytesBefore)

  const { json, bin } = readGlb(output)
  const view = json.bufferViews[json.images[0].bufferView]
  const png = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)
  const { PNG } = require('pngjs')
  const decoded = PNG.sync.read(png)
  assert.equal(decoded.width, 1024)
  assert.equal(decoded.height, 341)
  // ADR-009 决策 d 的顺序证明：降采样把 POT(3000×1000) 变成了 NPOT(1024×341)，
  // 采样器规范化必须在降采样**之后**跑，才能把这条 REPEAT+mipmap 采样器退化为合法组合。
  assert.equal(report.samplersNormalized, 1)
  assert.deepEqual(json.samplers[0], CLAMP_LINEAR)
  assert.deepEqual(inspect(output).npotSamplerBindings, [])
})

test('repairGlbFile: 默认「不降」时贴图字节与几何字节都逐字节不变（BR-032 回归基线）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-no-downsample-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  const texture = pngOfSize(2048, 2048)
  writeTextureFixture(input, { images: [{ bytes: texture }], textures: [{ source: 0 }] })

  const withoutOption = repairGlbFile(input, path.join(tempDir, 'plain.glb'))
  const explicitZero = repairGlbFile(input, path.join(tempDir, 'zero.glb'), { maxTextureSize: 0 })
  const bogus = repairGlbFile(input, path.join(tempDir, 'bogus.glb'), { maxTextureSize: -5 })

  for (const report of [withoutOption, explicitZero, bogus]) {
    assert.equal(report.maxTextureSize, 0)
    assert.equal(report.texturesDownsampled, 0)
    // 「未降采样」必须是有内容的陈述，而不是静默省略
    assert.equal(report.textureBytesAfter, report.textureBytesBefore)
    assert.ok(report.textureBytesBefore > 0)
  }

  const before = readGlb(input)
  const after = readGlb(output.replace('output.glb', 'plain.glb'))
  const imageView = before.json.bufferViews[before.json.images[0].bufferView]
  const afterImageView = after.json.bufferViews[after.json.images[0].bufferView]
  assert.equal(
    before.bin.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength)
      .equals(after.bin.subarray(afterImageView.byteOffset, afterImageView.byteOffset + afterImageView.byteLength)),
    true,
  )
})

test('repairGlbFile: 降采样只动贴图，几何 bufferView 逐字节不变（BR-032）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-downsample-geometry-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, { images: [{ bytes: pngOfSize(2048, 2048) }], textures: [{ source: 0 }] })
  const before = readGlb(input)

  const report = repairGlbFile(input, output, { maxTextureSize: 1024 })
  assert.equal(report.texturesDownsampled, 1)

  const after = readGlb(output)
  // 几何是前三个 bufferView（POSITION / 索引 / TEXCOORD_0）：字节必须完全一致
  for (const index of [0, 1, 2]) {
    const beforeView = before.json.bufferViews[index]
    const afterView = after.json.bufferViews[index]
    assert.equal(
      before.bin.subarray(beforeView.byteOffset, beforeView.byteOffset + beforeView.byteLength)
        .equals(after.bin.subarray(afterView.byteOffset, afterView.byteOffset + afterView.byteLength)),
      true,
      `bufferView ${index} 必须逐字节不变`,
    )
  }
  // 几何统计也不受影响
  assert.deepEqual(after.json.accessors[0].min, before.json.accessors[0].min)
  assert.deepEqual(after.json.accessors[0].max, before.json.accessors[0].max)
  assert.equal(after.json.accessors[0].count, before.json.accessors[0].count)
})

test('repairGlbFile: 外部贴图同样参与降采样，且落盘的是缩过的字节（BR-032）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-downsample-external-'))
  const input = path.join(tempDir, 'model.glb')
  const output = path.join(tempDir, 'output.glb')
  const external = path.join(tempDir, 'Body.png')
  fs.writeFileSync(external, pngOfSize(2048, 2048))
  writeGlb(input, {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ uri: 'Body.png', mimeType: 'image/png' }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    buffers: [{ byteLength: 36 }],
  }, Buffer.from(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer))

  const report = repairGlbFile(input, output, { maxTextureSize: 512 })

  assert.equal(report.texturesDownsampled, 1)
  assert.equal(report.externalImagesEmbedded, 1)
  const { json, bin } = readGlb(output)
  assert.equal(json.images[0].uri, undefined)
  const view = json.bufferViews[json.images[0].bufferView]
  const { PNG } = require('pngjs')
  const decoded = PNG.sync.read(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength))
  assert.equal(decoded.width, 512)
  assert.equal(decoded.height, 512)
  // 落盘的确实是缩小后的字节，而不是"报告说降了、文件里还是原图"
  assert.ok(view.byteLength < fs.statSync(external).size)
})

// REQ-008 验收标准 6 的本地等价基线。样例集不入库，夹具缺失时按既有门控模式跳过。
const LOCAL_PERSON_STAND = path.join(__dirname, '..', 'model', 'person-stand.glb')

test('repairGlbFile: person-stand 本地基线——降采样后体积只降不升、贴图与几何不回退（BR-032）', {
  skip: fs.existsSync(LOCAL_PERSON_STAND) ? false : `缺少 ${LOCAL_PERSON_STAND}（样例模型不入库）`,
}, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-person-stand-downsample-'))
  const plainOutput = path.join(tempDir, 'plain.glb')
  const reducedOutput = path.join(tempDir, 'reduced.glb')

  const plain = repairGlbFile(LOCAL_PERSON_STAND, plainOutput)
  const reduced = repairGlbFile(LOCAL_PERSON_STAND, reducedOutput, { maxTextureSize: 1024 })

  assert.equal(plain.status, 'success')
  assert.equal(reduced.status, 'success')
  assert.equal(plain.texturesDownsampled, 0)
  assert.ok(reduced.texturesDownsampled > 0, 'person-stand 的贴图必须真的被降采样')
  // 「体积只降不升」：同一输入下，降采样档位的产物必须小于不降档
  assert.ok(reduced.newBytes < plain.newBytes, `${reduced.newBytes} 应小于 ${plain.newBytes}`)

  const before = inspect(LOCAL_PERSON_STAND)
  const after = inspect(reducedOutput)
  assert.equal(after.images.length, before.images.length, '贴图张数不得回退')
  assert.equal(after.geometry.triangles, before.geometry.triangles, '三角面数不得回退')
  assert.equal(after.geometry.vertices, before.geometry.vertices, '顶点数不得回退')
  assert.deepEqual(after.npotSamplerBindings, [], '降采样后的产物不得留下 NPOT × REPEAT × mipmap 绑定')
})

// ---- BR-033 / REQ-008：KHR_texture_transform.texCoord 覆盖 ----

// 图元只有 TEXCOORD_0，材质经 KHR_texture_transform 以 texCoord: 1 采样贴图。
function writeTextureTransformFixture(input) {
  const positions = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = Uint16Array.from([0, 1, 2])
  const uvs = Float32Array.from([0, 0, 1, 0, 0, 1])
  const png = pngOfSize(4, 4)
  const head = Buffer.concat([
    Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
    Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength),
  ])
  const imageOffset = align4(head.length)
  const bin = Buffer.concat([head, Buffer.alloc(imageOffset - head.length), png])
  writeGlb(input, {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 }] }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0, extensions: { KHR_texture_transform: { texCoord: 1 } } },
      },
    }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 24 },
      { buffer: 0, byteOffset: imageOffset, byteLength: png.length },
    ],
    buffers: [{ byteLength: bin.length }],
  }, bin)
}

test('repairGlbFile: 按 KHR_texture_transform.texCoord 补出 TEXCOORD_1 而不是 TEXCOORD_0（BR-033）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-transform-texcoord-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureTransformFixture(input)

  // 先证明体检在修复前确实报了这条（否则"修复后不报"没有意义）
  const beforeIssue = inspect(input).issues.find((issue) => issue.code === 'MISSING_TEXCOORD')
  assert.ok(beforeIssue, '修复前必须报 MISSING_TEXCOORD')
  assert.match(beforeIssue.message, /TEXCOORD_1/)

  const report = repairGlbFile(input, output)

  assert.equal(report.status, 'success')
  assert.equal(report.texCoordsFilled, 1)

  const { json, bin } = readGlb(output)
  const primitive = json.meshes[0].primitives[0]
  // 补的是被扩展点名的通道，而不是默认的 TEXCOORD_0
  assert.equal(typeof primitive.attributes.TEXCOORD_1, 'number', '必须补出 TEXCOORD_1')
  assert.equal(primitive.attributes.TEXCOORD_0, 2, '原有的 TEXCOORD_0 必须原样保留')
  const accessor = json.accessors[primitive.attributes.TEXCOORD_1]
  assert.equal(accessor.type, 'VEC2')
  assert.equal(accessor.componentType, 5126)
  assert.equal(accessor.count, 3)
  const view = json.bufferViews[accessor.bufferView]
  const bytes = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)
  assert.equal(bytes.length, 24)
  assert.equal(bytes.every((byte) => byte === 0), true, '补出的 UV 必须是全 0')

  // 修复后体检不得再报这条（漏报被闭环）
  assert.equal(
    inspect(output).issues.some((issue) => issue.code === 'MISSING_TEXCOORD'),
    false,
  )
})

test('repairGlbFile: 没有扩展覆盖时仍按槽位自身的 texCoord 补 UV（不回归）', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-slot-texcoord-'))
  const input = path.join(tempDir, 'input.glb')
  const output = path.join(tempDir, 'output.glb')
  writeTextureFixture(input, {
    images: [{ bytes: pngOfSize(4, 4) }],
    textures: [{ source: 0 }],
  })
  // writeTextureFixture 的图元已带 TEXCOORD_0：先删掉，让补 UV 逻辑必须工作
  const original = readGlb(input)
  delete original.json.meshes[0].primitives[0].attributes.TEXCOORD_0
  writeGlb(input, original.json, original.bin)

  const report = repairGlbFile(input, output)

  assert.equal(report.texCoordsFilled, 1)
  const { json } = readGlb(output)
  assert.equal(typeof json.meshes[0].primitives[0].attributes.TEXCOORD_0, 'number')
  assert.equal(json.meshes[0].primitives[0].attributes.TEXCOORD_1, undefined)
})
