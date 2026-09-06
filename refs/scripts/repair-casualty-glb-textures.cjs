const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const modelDir = path.resolve(__dirname, '..', 'Bin/Data/Model/Target')
const modelNames = ['person-stand.glb', 'person-move.glb', '蹲姿.glb']
const tempDir = fs.mkdtempSync('/tmp/repair-casualty-glb-')

function align4(value) {
  return (value + 3) & ~3
}

function readGlb(filePath) {
  const source = fs.readFileSync(filePath)
  if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) {
    throw new Error(`不是 glTF 2.0 GLB: ${filePath}`)
  }

  const jsonLength = source.readUInt32LE(12)
  const jsonStart = 20
  const json = JSON.parse(
    source.subarray(jsonStart, jsonStart + jsonLength).toString('utf8').replace(/\0/g, '').trim()
  )
  const binHeader = jsonStart + jsonLength
  if (source.readUInt32LE(binHeader + 4) !== 0x004e4942) {
    throw new Error(`GLB 缺少 BIN chunk: ${filePath}`)
  }
  const binLength = source.readUInt32LE(binHeader)
  const binStart = binHeader + 8
  return { json, bin: source.subarray(binStart, binStart + binLength) }
}

function encodePng(inputPath, outputPath) {
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-frames:v', '1',
    '-c:v', 'png',
    outputPath
  ])
}

function rebuildModel(fileName) {
  const filePath = path.join(modelDir, fileName)
  const oldBytes = fs.statSync(filePath).size
  const { json, bin } = readGlb(filePath)
  const replacements = new Map()

  for (const image of json.images || []) {
    const view = json.bufferViews[image.bufferView]
    const original = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
    const sourcePath = path.join(tempDir, `${fileName}-${image.bufferView}.jpg`)
    const pngPath = path.join(tempDir, `${fileName}-${image.bufferView}.png`)
    fs.writeFileSync(sourcePath, original)
    encodePng(sourcePath, pngPath)
    replacements.set(image.bufferView, fs.readFileSync(pngPath))
    image.mimeType = 'image/png'
  }

  if (Array.isArray(json.extensionsUsed)) {
    json.extensionsUsed = json.extensionsUsed.filter((name) => name !== 'KHR_materials_specular')
    if (json.extensionsUsed.length === 0) delete json.extensionsUsed
  }
  if (Array.isArray(json.extensionsRequired)) {
    json.extensionsRequired = json.extensionsRequired.filter((name) => name !== 'KHR_materials_specular')
    if (json.extensionsRequired.length === 0) delete json.extensionsRequired
  }
  for (const material of json.materials || []) {
    delete material.extensions
  }

  const views = json.bufferViews || []
  const rebuilt = []
  let rebuiltLength = 0
  let cursor = 0
  const orderedViews = views
    .map((view, index) => ({ view, index, offset: view.byteOffset || 0 }))
    .sort((a, b) => a.offset - b.offset)

  for (const item of orderedViews) {
    const originalStart = item.offset
    if (originalStart > cursor) {
      const gap = bin.subarray(cursor, originalStart)
      rebuilt.push(gap)
      rebuiltLength += gap.length
    }

    const alignedOffset = align4(rebuiltLength)
    if (alignedOffset > rebuiltLength) {
      const alignment = Buffer.alloc(alignedOffset - rebuiltLength)
      rebuilt.push(alignment)
      rebuiltLength = alignedOffset
    }

    const originalLength = item.view.byteLength
    const data = replacements.get(item.index) || bin.subarray(
      originalStart,
      originalStart + originalLength
    )
    item.view.byteOffset = rebuiltLength
    item.view.byteLength = data.length
    rebuilt.push(data)
    rebuiltLength += data.length
    cursor = originalStart + originalLength
  }

  if (cursor < bin.length) {
    const trailing = bin.subarray(cursor)
    rebuilt.push(trailing)
    rebuiltLength += trailing.length
  }
  const newBin = Buffer.concat(rebuilt)
  json.buffers[0].byteLength = newBin.length

  const jsonBuffer = Buffer.from(JSON.stringify(json))
  const paddedJsonLength = align4(jsonBuffer.length)
  const paddedBinLength = align4(newBin.length)
  const output = Buffer.alloc(12 + 8 + paddedJsonLength + 8 + paddedBinLength, 0)
  output.writeUInt32LE(0x46546c67, 0)
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(paddedJsonLength, 12)
  output.writeUInt32LE(0x4e4f534a, 16)
  jsonBuffer.copy(output, 20)
  output.writeUInt32LE(paddedBinLength, 20 + paddedJsonLength)
  output.writeUInt32LE(0x004e4942, 24 + paddedJsonLength)
  newBin.copy(output, 28 + paddedJsonLength)
  fs.writeFileSync(filePath, output)

  return {
    fileName,
    oldBytes,
    newBytes: output.length,
    images: (json.images || []).length,
    extensions: json.extensionsUsed || []
  }
}

for (const name of modelNames) {
  console.log(JSON.stringify(rebuildModel(name)))
}
