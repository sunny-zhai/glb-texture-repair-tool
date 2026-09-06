const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function align4(value) {
  return (value + 3) & ~3
}

function readGlb(filePath) {
  const bytes = fs.readFileSync(filePath)
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`Unsupported GLB: ${filePath}`)
  }

  const jsonLength = bytes.readUInt32LE(12)
  const jsonStart = 20
  const jsonText = bytes.slice(jsonStart, jsonStart + jsonLength).toString('utf8').replace(/\0/g, '').trim()
  const json = JSON.parse(jsonText)
  const binHeader = jsonStart + align4(jsonLength)
  const binLength = bytes.readUInt32LE(binHeader)
  const binStart = binHeader + 8

  return {
    json,
    bin: Buffer.from(bytes.slice(binStart, binStart + binLength)),
  }
}

function writeGlb(filePath, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const paddedJson = Buffer.concat([
    jsonBytes,
    Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20),
  ])
  const paddedBin = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)])
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 4, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLength, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(paddedJson.length, 0)
  jsonHeader.write('JSON', 4, 4, 'ascii')
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(paddedBin.length, 0)
  binHeader.write('BIN\0', 4, 4, 'ascii')

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBin]))
}

function isPng(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

function decodeUriComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function externalImageName(uri) {
  const withoutQuery = uri.split(/[?#]/, 1)[0]
  const decoded = decodeUriComponent(withoutQuery).replace(/\\/g, '/')
  return path.posix.basename(decoded)
}

function findFileByName(rootDir, fileName) {
  const target = fileName.toLocaleLowerCase()
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile() && entry.name.toLocaleLowerCase() === target) {
        return fullPath
      }
    }
  }
  return null
}

function resolveExternalImage(inputPath, uri) {
  if (uri.startsWith('data:')) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(uri)
    if (!match) throw new Error('GLB 包含无法解析的图片 data URI。')
    return {
      bytes: match[2]
        ? Buffer.from(match[3], 'base64')
        : Buffer.from(decodeUriComponent(match[3]), 'utf8'),
      mimeType: match[1] || '',
      sourceName: 'embedded-data-uri',
    }
  }

  const modelDir = path.dirname(inputPath)
  const cleanUri = decodeUriComponent(uri.split(/[?#]/, 1)[0])
  const normalizedUri = cleanUri.replace(/\\/g, path.sep)
  const fileName = externalImageName(uri)
  const candidates = []

  if (path.isAbsolute(normalizedUri)) candidates.push(normalizedUri)
  if (!/^[A-Za-z]:[\\/]/.test(cleanUri)) candidates.push(path.resolve(modelDir, normalizedUri))
  candidates.push(path.join(modelDir, fileName))

  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    || findFileByName(modelDir, fileName)
  if (!sourcePath) {
    throw new Error(`找不到外部贴图“${fileName}”（原路径：${uri}）。请将贴图文件或其 .fbm 目录放到 GLB 同级目录后重试。`)
  }

  return {
    bytes: fs.readFileSync(sourcePath),
    mimeType: path.extname(sourcePath).toLowerCase() === '.png' ? 'image/png' : '',
    sourceName: sourcePath,
  }
}

function encodePng(inputPath, outputPath) {
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-frames:v', '1',
    '-c:v', 'png',
    outputPath,
  ])
}

function stripSpecularExtensions(json) {
  if (Array.isArray(json.extensionsUsed)) {
    json.extensionsUsed = json.extensionsUsed.filter((name) => name !== 'KHR_materials_specular')
    if (json.extensionsUsed.length === 0) delete json.extensionsUsed
  }
  if (Array.isArray(json.extensionsRequired)) {
    json.extensionsRequired = json.extensionsRequired.filter((name) => name !== 'KHR_materials_specular')
    if (json.extensionsRequired.length === 0) delete json.extensionsRequired
  }
  for (const material of json.materials || []) {
    if (!material.extensions) continue
    delete material.extensions.KHR_materials_specular
    if (Object.keys(material.extensions).length === 0) delete material.extensions
  }
}

function rebuildBinary(json, bin, replacements) {
  const views = Array.isArray(json.bufferViews) ? json.bufferViews : []
  const orderedViews = views
    .map((view, index) => ({ view, index, offset: view.byteOffset || 0 }))
    .sort((a, b) => a.offset - b.offset)

  const rebuilt = []
  let rebuiltLength = 0
  let cursor = 0

  for (const item of orderedViews) {
    const originalStart = item.offset
    const originalLength = item.view.byteLength || 0

    if (originalStart > cursor) {
      const gap = bin.subarray(cursor, originalStart)
      rebuilt.push(gap)
      rebuiltLength += gap.length
    }

    const alignedOffset = align4(rebuiltLength)
    if (alignedOffset > rebuiltLength) {
      const pad = Buffer.alloc(alignedOffset - rebuiltLength)
      rebuilt.push(pad)
      rebuiltLength = alignedOffset
    }

    const data = replacements.get(item.index) || bin.subarray(originalStart, originalStart + originalLength)
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
  if (Array.isArray(json.buffers) && json.buffers[0]) {
    json.buffers[0].byteLength = newBin.length
  }

  return newBin
}

function appendImageToBinary(json, bin, imageBytes) {
  const offset = align4(bin.length)
  const padding = Buffer.alloc(offset - bin.length)
  const bufferView = {
    buffer: 0,
    byteOffset: offset,
    byteLength: imageBytes.length,
  }
  if (!Array.isArray(json.bufferViews)) json.bufferViews = []
  json.bufferViews.push(bufferView)
  const newBin = Buffer.concat([bin, padding, imageBytes])
  if (!Array.isArray(json.buffers)) json.buffers = [{ byteLength: newBin.length }]
  json.buffers[0].byteLength = newBin.length
  return { bin: newBin, bufferView: json.bufferViews.length - 1 }
}

function repairGlbFile(inputPath, outputPath) {
  const oldBytes = fs.statSync(inputPath).size
  const { json, bin } = readGlb(inputPath)
  const replacements = new Map()
  const externalImages = []
  let imagesConverted = 0
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-texture-repair-'))

  try {
    for (const [imageIndex, image] of (json.images || []).entries()) {
      let original
      let sourceName
      if (typeof image.bufferView === 'number') {
        const view = json.bufferViews?.[image.bufferView]
        if (!view) continue
        const offset = view.byteOffset || 0
        original = bin.subarray(offset, offset + view.byteLength)
        sourceName = `${image.bufferView}`
      } else if (typeof image.uri === 'string') {
        const external = resolveExternalImage(inputPath, image.uri)
        original = external.bytes
        sourceName = `${imageIndex}-external`
      } else {
        continue
      }

      if (isPng(original)) {
        image.mimeType = 'image/png'
        if (typeof image.uri === 'string') externalImages.push({ image, bytes: original })
        continue
      }

      const sourceExt = image.mimeType === 'image/jpeg' ? 'jpg' : 'bin'
      const sourcePath = path.join(tempDir, `${sourceName}.${sourceExt}`)
      const pngPath = path.join(tempDir, `${sourceName}.png`)
      fs.writeFileSync(sourcePath, original)
      encodePng(sourcePath, pngPath)
      const converted = fs.readFileSync(pngPath)
      imagesConverted += 1
      if (typeof image.bufferView === 'number') {
        replacements.set(image.bufferView, converted)
      } else {
        externalImages.push({ image, bytes: converted })
      }
      image.mimeType = 'image/png'
    }

    stripSpecularExtensions(json)
    let newBin = rebuildBinary(json, bin, replacements)
    for (const external of externalImages) {
      const appended = appendImageToBinary(json, newBin, external.bytes)
      newBin = appended.bin
      external.image.bufferView = appended.bufferView
      external.image.mimeType = 'image/png'
      delete external.image.uri
    }
    writeGlb(outputPath, json, newBin)

    return {
      inputPath,
      outputPath,
      oldBytes,
      newBytes: fs.statSync(outputPath).size,
      imagesConverted,
      externalImagesEmbedded: externalImages.length,
      extensionsRemoved: ['KHR_materials_specular'],
      status: 'success',
    }
  } catch (error) {
    return {
      inputPath,
      outputPath,
      oldBytes,
      newBytes: 0,
      imagesConverted: 0,
      extensionsRemoved: [],
      status: 'error',
      error: error.message,
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function collectGlbEntries(inputPaths) {
  const entries = []
  for (const inputPath of inputPaths) {
    if (!inputPath) continue
    const stat = fs.statSync(inputPath)
    if (stat.isFile() && inputPath.toLowerCase().endsWith('.glb')) {
      entries.push({
        inputPath,
        relativePath: path.basename(inputPath),
      })
      continue
    }
    if (!stat.isDirectory()) continue

    const rootName = path.basename(inputPath)
    const stack = [{ current: inputPath, relativeBase: rootName }]
    while (stack.length > 0) {
      const { current, relativeBase } = stack.pop()
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)
        const relativePath = path.join(relativeBase, entry.name)
        if (entry.isDirectory()) {
          stack.push({ current: full, relativeBase: relativePath })
          continue
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
          entries.push({ inputPath: full, relativePath })
        }
      }
    }
  }
  return entries
}

function collectGlbFiles(inputPaths) {
  return collectGlbEntries(inputPaths).map((entry) => entry.inputPath)
}

function repairMany(inputPaths, outputDir) {
  const files = collectGlbEntries(inputPaths)
  const reports = []
  for (const entry of files) {
    const outputPath = path.join(outputDir, entry.relativePath)
    reports.push(repairGlbFile(entry.inputPath, outputPath))
  }
  return reports
}

module.exports = {
  align4,
  collectGlbEntries,
  collectGlbFiles,
  encodePng,
  readGlb,
  repairGlbFile,
  repairMany,
  stripSpecularExtensions,
  writeGlb,
}
