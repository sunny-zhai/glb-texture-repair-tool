const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { align4, collectGlbEntries, collectGlbFiles, encodePng, mergeUniquePaths, repairGlbFile, repairMany, readGlb, writeGlb } = require('../src/repair')

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
