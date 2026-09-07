const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function align4(value) {
  return (value + 3) & ~3
}

function identityMatrix() {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

function multiplyMatrix(a, b) {
  const out = new Array(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        out[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index]
      }
    }
  }
  return out
}

function transformPoint(matrix, value) {
  const x = value[0]
  const y = value[1]
  const z = value[2]
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / (w || 1),
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / (w || 1),
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / (w || 1),
  ]
}

function transformVector(matrix, value) {
  return normalizeVector(transformVectorRaw(matrix, value))
}

function transformVectorRaw(matrix, value) {
  const x = value[0]
  const y = value[1]
  const z = value[2]
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z,
  ]
}

function normalizeVector(value) {
  const length = Math.hypot(value[0], value[1], value[2])
  if (!length) return [0, 0, 1]
  return [value[0] / length, value[1] / length, value[2] / length]
}

function invertMatrix(matrix) {
  const m = matrix
  const out = []
  out[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10]
  out[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10]
  out[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9]
  out[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9]
  out[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10]
  out[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10]
  out[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9]
  out[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9]
  out[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6]
  out[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6]
  out[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5]
  out[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5]
  out[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6]
  out[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6]
  out[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5]
  out[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5]
  const determinant = m[0] * out[0] + m[1] * out[4] + m[2] * out[8] + m[3] * out[12]
  if (!determinant) return identityMatrix()
  return out.map((value) => value / determinant)
}

function getNodeLocalMatrix(node) {
  if (Array.isArray(node.matrix)) return node.matrix.slice()
  const t = node.translation || [0, 0, 0]
  const r = node.rotation || [0, 0, 0, 1]
  const s = node.scale || [1, 1, 1]
  const [x, y, z, w] = r
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2

  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}

function getTypedArrayConstructor(componentType) {
  switch (componentType) {
    case 5120: return Int8Array
    case 5121: return Uint8Array
    case 5122: return Int16Array
    case 5123: return Uint16Array
    case 5125: return Uint32Array
    case 5126: return Float32Array
    default:
      throw new Error(`Unsupported accessor component type: ${componentType}`)
  }
}

function getAccessorComponentCount(type) {
  switch (type) {
    case 'SCALAR': return 1
    case 'VEC2': return 2
    case 'VEC3': return 3
    case 'VEC4': return 4
    case 'MAT2': return 4
    case 'MAT3': return 9
    case 'MAT4': return 16
    default:
      throw new Error(`Unsupported accessor type: ${type}`)
  }
}

function readAccessorData(json, bin, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex]
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`)
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view) throw new Error(`Missing bufferView ${accessor.bufferView}`)
  if (view.byteStride) throw new Error(`Interleaved bufferViews are not supported for accessor ${accessorIndex}`)
  const ComponentArray = getTypedArrayConstructor(accessor.componentType)
  const componentCount = getAccessorComponentCount(accessor.type)
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  const elementCount = accessor.count * componentCount
  const byteLength = elementCount * ComponentArray.BYTES_PER_ELEMENT
  const slice = bin.subarray(byteOffset, byteOffset + byteLength)
  const typed = new ComponentArray(slice.buffer, slice.byteOffset, elementCount)
  return { accessor, view, viewIndex: accessor.bufferView, typed, componentCount }
}

function writeFloatAccessorBytes(values) {
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength)
}

function computeNodeGlobalMatrices(json) {
  const nodes = json.nodes || []
  const matrices = new Array(nodes.length)
  const visited = new Array(nodes.length).fill(false)
  const roots = new Set()

  if (Array.isArray(json.scenes) && json.scenes.length > 0) {
    const sceneIndex = typeof json.scene === 'number' ? json.scene : 0
    for (const nodeIndex of json.scenes[sceneIndex]?.nodes || []) {
      roots.add(nodeIndex)
    }
  }

  if (roots.size === 0) {
    for (let index = 0; index < nodes.length; index += 1) roots.add(index)
    for (const node of nodes) {
      for (const child of node.children || []) roots.delete(child)
    }
  }

  const visit = (nodeIndex, parentMatrix) => {
    if (visited[nodeIndex]) return
    const local = getNodeLocalMatrix(nodes[nodeIndex])
    const global = multiplyMatrix(parentMatrix, local)
    matrices[nodeIndex] = global
    visited[nodeIndex] = true
    for (const child of nodes[nodeIndex].children || []) {
      visit(child, global)
    }
  }

  for (const root of roots) {
    visit(root, identityMatrix())
  }

  for (let index = 0; index < nodes.length; index += 1) {
    if (!matrices[index]) matrices[index] = getNodeLocalMatrix(nodes[index])
  }

  return matrices
}

function bakeSkinnedMeshes(json, bin, replacements) {
  const nodes = json.nodes || []
  const nodeGlobals = computeNodeGlobalMatrices(json)
  const skinCache = new Map()
  let bakedMeshes = 0

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex]
    if (typeof node.mesh !== 'number' || typeof node.skin !== 'number') continue
    const skin = json.skins?.[node.skin]
    const mesh = json.meshes?.[node.mesh]
    if (!skin || !mesh) continue

    const skinKey = node.skin
    if (!skinCache.has(skinKey)) {
      const inverseBindMatrices = typeof skin.inverseBindMatrices === 'number'
        ? readAccessorData(json, bin, skin.inverseBindMatrices).typed
        : null
      skinCache.set(skinKey, {
        joints: skin.joints || [],
        inverseBindMatrices,
      })
    }
    const skinInfo = skinCache.get(skinKey)
    const inverseMeshMatrix = invertMatrix(nodeGlobals[nodeIndex])

    for (const primitive of mesh.primitives || []) {
      const positionIndex = primitive.attributes?.POSITION
      const jointsIndex = primitive.attributes?.JOINTS_0
      const weightsIndex = primitive.attributes?.WEIGHTS_0
      if (typeof positionIndex !== 'number' || typeof jointsIndex !== 'number' || typeof weightsIndex !== 'number') {
        continue
      }

      const positionData = readAccessorData(json, bin, positionIndex)
      const jointData = readAccessorData(json, bin, jointsIndex)
      const weightData = readAccessorData(json, bin, weightsIndex)
      const normalIndex = primitive.attributes?.NORMAL
      const normalData = typeof normalIndex === 'number' ? readAccessorData(json, bin, normalIndex) : null
      const positionAccessor = json.accessors[positionIndex]
      const normalAccessor = normalData ? json.accessors[normalIndex] : null
      const vertexCount = positionAccessor.count
      const jointStride = jointData.componentCount
      const weightStride = weightData.componentCount
      const positionStride = positionData.componentCount
      const normalStride = normalData ? normalData.componentCount : 0

      const bakedPositions = new Float32Array(vertexCount * 3)
      const bakedNormals = normalData ? new Float32Array(vertexCount * 3) : null
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const px = positionData.typed[vertex * positionStride]
        const py = positionData.typed[vertex * positionStride + 1]
        const pz = positionData.typed[vertex * positionStride + 2]
        const sourcePosition = [px, py, pz]
        const sourceNormal = normalData
          ? [
              normalData.typed[vertex * normalStride],
              normalData.typed[vertex * normalStride + 1],
              normalData.typed[vertex * normalStride + 2],
            ]
          : null

        const joint0 = jointData.typed[vertex * jointStride]
        const joint1 = jointData.typed[vertex * jointStride + 1]
        const joint2 = jointData.typed[vertex * jointStride + 2]
        const joint3 = jointData.typed[vertex * jointStride + 3]
        const weight0 = weightData.typed[vertex * weightStride]
        const weight1 = weightData.typed[vertex * weightStride + 1]
        const weight2 = weightData.typed[vertex * weightStride + 2]
        const weight3 = weightData.typed[vertex * weightStride + 3]
        const joints = [joint0, joint1, joint2, joint3]
        const weights = [weight0, weight1, weight2, weight3]
        let skinnedPosition = [0, 0, 0]
        let skinnedNormal = [0, 0, 0]

        for (let influence = 0; influence < 4; influence += 1) {
          const weight = weights[influence]
          if (!weight) continue
          const jointIndex = joints[influence]
          const jointNodeIndex = skinInfo.joints[jointIndex]
          const jointMatrix = nodeGlobals[jointNodeIndex] || identityMatrix()
          const inverseBindMatrix = skinInfo.inverseBindMatrices
            ? Array.from(skinInfo.inverseBindMatrices.subarray(jointIndex * 16, jointIndex * 16 + 16))
            : identityMatrix()
          const localPosition = transformPoint(inverseBindMatrix, sourcePosition)
          const jointPosition = transformPoint(jointMatrix, localPosition)
          const worldPosition = transformPoint(inverseMeshMatrix, jointPosition)
          skinnedPosition = [
            skinnedPosition[0] + worldPosition[0] * weight,
            skinnedPosition[1] + worldPosition[1] * weight,
            skinnedPosition[2] + worldPosition[2] * weight,
          ]

          if (sourceNormal) {
            const localNormal = transformVectorRaw(inverseBindMatrix, sourceNormal)
            const jointNormal = transformVectorRaw(jointMatrix, localNormal)
            const worldNormal = transformVectorRaw(inverseMeshMatrix, jointNormal)
            skinnedNormal = [
              skinnedNormal[0] + worldNormal[0] * weight,
              skinnedNormal[1] + worldNormal[1] * weight,
              skinnedNormal[2] + worldNormal[2] * weight,
            ]
          }
        }

        bakedPositions[vertex * 3] = skinnedPosition[0]
        bakedPositions[vertex * 3 + 1] = skinnedPosition[1]
        bakedPositions[vertex * 3 + 2] = skinnedPosition[2]
        min[0] = Math.min(min[0], skinnedPosition[0])
        min[1] = Math.min(min[1], skinnedPosition[1])
        min[2] = Math.min(min[2], skinnedPosition[2])
        max[0] = Math.max(max[0], skinnedPosition[0])
        max[1] = Math.max(max[1], skinnedPosition[1])
        max[2] = Math.max(max[2], skinnedPosition[2])

        if (bakedNormals) {
          const normalized = normalizeVector(skinnedNormal)
          bakedNormals[vertex * 3] = normalized[0]
          bakedNormals[vertex * 3 + 1] = normalized[1]
          bakedNormals[vertex * 3 + 2] = normalized[2]
        }
      }

      replacements.set(positionData.viewIndex, writeFloatAccessorBytes(bakedPositions))
      positionAccessor.min = min
      positionAccessor.max = max
      if (normalData) {
        replacements.set(normalData.viewIndex, writeFloatAccessorBytes(bakedNormals))
      }

      delete primitive.attributes.JOINTS_0
      delete primitive.attributes.WEIGHTS_0
      bakedMeshes += 1
    }

    delete node.skin
  }

  if (bakedMeshes > 0) {
    delete json.skins
    delete json.animations
  }

  return bakedMeshes
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

function createGlbBuffer(json, bin) {
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

  return Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBin])
}

function writeGlb(filePath, json, bin) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, createGlbBuffer(json, bin))
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
    const skinnedMeshesBaked = bakeSkinnedMeshes(json, bin, replacements)

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
      skinnedMeshesBaked,
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
      skinnedMeshesBaked: 0,
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
  createGlbBuffer,
  encodePng,
  readGlb,
  repairGlbFile,
  repairMany,
  stripSpecularExtensions,
  writeGlb,
}
