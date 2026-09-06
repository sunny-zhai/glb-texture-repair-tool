const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { collectGlbEntries, collectGlbFiles, repairGlbFile, readGlb, writeGlb } = require('../src/repair')

test('readGlb and writeGlb preserve a valid GLB container', () => {
  const fixture = path.join(__dirname, '..', 'refs', 'models', 'person-stand.glb')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-roundtrip-'))
  const output = path.join(tempDir, 'roundtrip.glb')
  const { json, bin } = readGlb(fixture)

  writeGlb(output, json, bin)

  assert.ok(fs.existsSync(output))
  const stat = fs.statSync(output)
  assert.ok(stat.size > 0)
})

test('collectGlbFiles finds nested glb files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-collect-'))
  const nested = path.join(root, 'nested')
  fs.mkdirSync(nested, { recursive: true })
  fs.copyFileSync(path.join(__dirname, '..', 'refs', 'models', 'person-move.glb'), path.join(nested, 'sample.glb'))

  const files = collectGlbFiles([root])
  assert.equal(files.length, 1)
  assert.ok(files[0].endsWith(path.join('nested', 'sample.glb')))
})

test('collectGlbEntries preserves directory structure under batch roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-entries-'))
  const nested = path.join(root, 'inner')
  fs.mkdirSync(nested, { recursive: true })
  fs.copyFileSync(path.join(__dirname, '..', 'refs', 'models', 'person-move.glb'), path.join(nested, 'sample.glb'))

  const entries = collectGlbEntries([root])
  assert.equal(entries.length, 1)
  assert.equal(entries[0].relativePath, path.join(path.basename(root), 'inner', 'sample.glb'))
})

test('repairGlbFile writes an output file', () => {
  const fixture = path.join(__dirname, '..', 'refs', 'models', '蹲姿.glb')
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
