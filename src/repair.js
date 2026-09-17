const fs = require('node:fs')
const path = require('node:path')
const jpeg = require('jpeg-js')
const { PNG } = require('pngjs')

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

function localMatrixFromTRS(translation, rotation, scale) {
  const t = translation || [0, 0, 0]
  const r = rotation || [0, 0, 0, 1]
  const s = scale || [1, 1, 1]
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

function getNodeLocalMatrix(node) {
  if (Array.isArray(node.matrix)) return node.matrix.slice()
  return localMatrixFromTRS(node.translation, node.rotation, node.scale)
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

function computeNodeGlobalMatrices(json, localMatrices) {
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

  const localFor = (index) => (localMatrices ? localMatrices[index] : null) || getNodeLocalMatrix(nodes[index])

  const visit = (nodeIndex, parentMatrix) => {
    if (visited[nodeIndex]) return
    const local = localFor(nodeIndex)
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
    if (!matrices[index]) matrices[index] = localFor(index)
  }

  return matrices
}

// glTF animation sampling: freeze a skinned character at one animation frame
// so the skin-bake keeps an authored pose (e.g. a crouch) instead of the bind pose.

function slerpQuat(a, b, t) {
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
  if (dot < 0) {
    dot = -dot
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  if (dot > 0.9995) {
    return [
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]
  }
  const theta0 = Math.acos(dot)
  const sinTheta0 = Math.sin(theta0)
  const s0 = Math.sin((1 - t) * theta0) / sinTheta0
  const s1 = Math.sin(t * theta0) / sinTheta0
  return [a[0] * s0 + bx * s1, a[1] * s0 + by * s1, a[2] * s0 + bz * s1, a[3] * s0 + bw * s1]
}

function sampleAnimationChannel(json, bin, sampler, time) {
  const interpolation = sampler.interpolation || 'LINEAR'
  const times = readAccessorData(json, bin, sampler.input).typed
  const output = readAccessorData(json, bin, sampler.output)
  const comps = output.componentCount
  const values = output.typed
  const keyCount = times.length
  if (keyCount === 0 || comps === 0) return null

  const clamped = Math.max(times[0], Math.min(times[keyCount - 1], time))
  let k = 0
  while (k < keyCount - 2 && clamped > times[k + 1]) k += 1
  const frac = times[k + 1] > times[k] ? (clamped - times[k]) / (times[k + 1] - times[k]) : 0

  if (interpolation === 'LINEAR') {
    if (comps === 4) return slerpQuat(values.subarray(k * 4, k * 4 + 4), values.subarray((k + 1) * 4, (k + 1) * 4 + 4), frac)
    const head = values.subarray(k * comps, (k + 1) * comps)
    const tail = values.subarray((k + 1) * comps, (k + 2) * comps)
    return Array.from(head, (v, i) => v + (tail[i] - v) * frac)
  }
  // STEP (and any other interpolation): hold the current keyframe
  return Array.from(values.subarray(k * comps, (k + 1) * comps))
}

function computePosedLocalMatrices(json, bin, poseTime, animationIndex = 0) {
  const animations = json.animations
  if (!Array.isArray(animations) || animations.length === 0 || typeof poseTime !== 'number') return null
  const animation = animations[Math.max(0, Math.min(animationIndex, animations.length - 1))]
  const nodes = json.nodes || []
  const overrides = new Map()

  for (const channel of animation.channels || []) {
    const nodeIndex = channel.target.node
    const path = channel.target.path
    if (!['translation', 'rotation', 'scale'].includes(path)) continue
    const sampler = animation.samplers?.[channel.sampler]
    if (!sampler) continue
    const value = sampleAnimationChannel(json, bin, sampler, poseTime)
    if (!value) continue
    let entry = overrides.get(nodeIndex)
    if (!entry) {
      entry = {}
      overrides.set(nodeIndex, entry)
    }
    entry[path] = value
  }

  if (overrides.size === 0) return null
  const locals = new Array(nodes.length)
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const entry = overrides.get(index)
    if (!entry || Array.isArray(node.matrix)) {
      locals[index] = getNodeLocalMatrix(node)
      continue
    }
    locals[index] = localMatrixFromTRS(
      entry.translation || node.translation || [0, 0, 0],
      entry.rotation || node.rotation || [0, 0, 0, 1],
      entry.scale || node.scale || [1, 1, 1],
    )
  }
  return locals
}

function resolvePoseTime(json, bin, poseTime, animationIndex = 0) {
  if (typeof poseTime === 'number') return poseTime
  const animations = json.animations
  if (!Array.isArray(animations) || animations.length === 0 || (poseTime !== 'start' && poseTime !== 'end')) return null
  const animation = animations[Math.max(0, Math.min(animationIndex || 0, animations.length - 1))]
  let edge = poseTime === 'end' ? -Infinity : Infinity
  for (const sampler of animation.samplers || []) {
    if (sampler.input == null) continue
    const times = readAccessorData(json, bin, sampler.input).typed
    if (!times.length) continue
    edge = poseTime === 'end' ? Math.max(edge, times[times.length - 1]) : Math.min(edge, times[0])
  }
  return Number.isFinite(edge) ? edge : null
}

function bakeSkinnedMeshes(json, bin, replacements, options = {}) {
  const nodes = json.nodes || []
  const poseTime = resolvePoseTime(json, bin, options.poseTime, options.animationIndex)
  const nodeGlobals = poseTime != null
    ? computeNodeGlobalMatrices(json, computePosedLocalMatrices(json, bin, poseTime, options.animationIndex))
    : computeNodeGlobalMatrices(json)
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

// Pure in-memory PNG/JPEG handling so the packaged app has no external
// runtime dependency (previously shelled out to ffmpeg, which is absent on
// end-user Windows machines -> spawnSync ffmpeg ENOENT). Accepts PNG or JPEG
// bytes and returns PNG bytes; anything else raises a per-file error.
function encodePng(inputBytes) {
  if (isPng(inputBytes)) return inputBytes

  const isJpeg = inputBytes.length >= 3 && inputBytes[0] === 0xff && inputBytes[1] === 0xd8 && inputBytes[2] === 0xff
  if (!isJpeg) {
    throw new Error('不支持的图片格式：只能处理 PNG 或 JPEG，请先将其转换为 PNG 或 JPEG 再重试。')
  }

  let decoded
  try {
    decoded = jpeg.decode(inputBytes, { useTArray: true, formatAsRGBA: true })
  } catch (error) {
    throw new Error(`JPEG 转 PNG 失败：${error.message}`)
  }

  const png = new PNG({ width: decoded.width, height: decoded.height })
  png.data = Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength)
  return PNG.sync.write(png)
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

// 收集材质引用的全部 texCoord 索引（含扩展里的贴图槽）。
function collectMaterialTexCoords(material) {
  const coords = new Set()
  if (!material) return coords
  const add = (reference) => {
    if (reference && typeof reference.index === 'number') coords.add(reference.texCoord || 0)
  }
  const pbr = material.pbrMetallicRoughness || {}
  add(pbr.baseColorTexture)
  add(pbr.metallicRoughnessTexture)
  add(material.normalTexture)
  add(material.occlusionTexture)
  add(material.emissiveTexture)
  for (const extension of Object.values(material.extensions || {})) {
    if (!extension || typeof extension !== 'object') continue
    for (const [key, value] of Object.entries(extension)) {
      if (key.endsWith('Texture')) add(value)
    }
  }
  return coords
}

// 转置（法线矩阵需要 A⁻ᵀ，而 invertMatrix 只给出 A⁻¹）。
function transposeMatrix(matrix) {
  const out = new Array(16)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] = matrix[row * 4 + column]
    }
  }
  return out
}

// 世界矩阵 3x3 块的行列式，负数代表镜像变换（需要反转三角形绕序）。
function determinant3(matrix) {
  return matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6])
    - matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2])
    + matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2])
}

// 步骤：材质引用了贴图、但图元缺少对应 TEXCOORD_n 时，补一个全 0 的 float32 VEC2。
// Cesium 会为这类图元生成引用了未声明 varying 的着色器，编译失败后整个场景停止渲染。
function fillMissingTexCoords(json, workingBin, replacements) {
  let filled = 0
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const positionIndex = primitive.attributes?.POSITION
      const positionAccessor = typeof positionIndex === 'number' ? json.accessors?.[positionIndex] : null
      if (!positionAccessor) continue

      for (const texCoord of collectMaterialTexCoords(json.materials?.[primitive.material])) {
        const semantic = `TEXCOORD_${texCoord}`
        if (primitive.attributes[semantic] !== undefined) continue

        const bytes = Buffer.alloc(positionAccessor.count * 8)
        const appended = appendBufferViewToBinary(json, workingBin, bytes)
        workingBin = appended.bin
        replacements.set(appended.bufferView, bytes)

        if (!Array.isArray(json.accessors)) json.accessors = []
        json.accessors.push({
          bufferView: appended.bufferView,
          byteOffset: 0,
          componentType: 5126,
          count: positionAccessor.count,
          type: 'VEC2',
        })
        primitive.attributes[semantic] = json.accessors.length - 1
        filled += 1
      }
    }
  }
  return { filled, bin: workingBin }
}

// 计算世界矩阵，同时标出「从默认场景可达」的节点——不可达节点拿到的是局部矩阵，
// 直接烘焙会把局部坐标永久写死进文件。
function computeSceneMatrices(json) {
  const nodes = json.nodes || []
  const matrices = new Array(nodes.length)
  const reachable = new Set()
  const visited = new Array(nodes.length).fill(false)
  const roots = new Set()
  const sceneIndex = typeof json.scene === 'number' ? json.scene : 0

  if (Array.isArray(json.scenes) && json.scenes.length > 0) {
    for (const nodeIndex of json.scenes[sceneIndex]?.nodes || []) roots.add(nodeIndex)
  }

  const visit = (nodeIndex, parentMatrix) => {
    if (visited[nodeIndex]) return
    const global = multiplyMatrix(parentMatrix, getNodeLocalMatrix(nodes[nodeIndex]))
    matrices[nodeIndex] = global
    visited[nodeIndex] = true
    reachable.add(nodeIndex)
    for (const child of nodes[nodeIndex].children || []) visit(child, global)
  }
  for (const root of roots) visit(root, identityMatrix())

  return { matrices, reachable }
}

// 结构一致的图元才能合并：材质、属性格式、索引格式、绘制模式都要一致。
// TEXCOORD_n 的有无不参与分组——UV 缺失的一方在合并时补零即可（材质没有贴图时 UV 本就无用），
// 否则「有 UV」和「无 UV」会被拆成两个小分组，多数组只剩一个成员而无法合并。
function primitiveGroupKey(json, primitive) {
  const attributes = Object.keys(primitive.attributes || {})
    .filter((semantic) => !isTexCoordSemantic(semantic))
    .sort()
    .map((semantic) => {
      const accessor = json.accessors?.[primitive.attributes[semantic]] || {}
      return `${semantic}:${accessor.componentType}:${accessor.type}:${accessor.normalized ? 1 : 0}`
    })
    .join(',')
  const indices = typeof primitive.indices === 'number' ? json.accessors?.[primitive.indices] : null
  return `${primitive.material}|${attributes}|${primitive.mode ?? 4}|${indices ? indices.componentType : 'none'}`
}

function isTexCoordSemantic(semantic) {
  return /^TEXCOORD_\d+$/.test(semantic)
}

function accessorTypeForComponentCount(componentCount) {
  switch (componentCount) {
    case 1: return 'SCALAR'
    case 2: return 'VEC2'
    case 3: return 'VEC3'
    case 4: return 'VEC4'
    default: throw new Error(`不支持的顶点属性分量数：${componentCount}`)
  }
}

// 判断某个图元能否参与合并；返回中文原因表示不能合并。
function mergeBlocker(json, primitive, worldMatrix) {
  if (!worldMatrix) return '节点不在默认场景内'
  if (primitive.extensions?.KHR_draco_mesh_compression) return '图元使用了 Draco 压缩'
  if ((primitive.targets || []).length > 0) return '图元含 morph target'
  if ((primitive.mode ?? 4) !== 4) return '绘制模式不是 TRIANGLES'
  if (!determinant3(worldMatrix)) return '世界矩阵不可逆'

  // 顶点属性必须是 float32：合并按 float 重写；归一化 u8/i16 属性需要先反量化，暂不支持。
  for (const accessorIndex of Object.values(primitive.attributes || {})) {
    const accessor = json.accessors?.[accessorIndex]
    if (!accessor) return '图元引用了不存在的 accessor'
    if (accessor.componentType !== 5126) return '顶点属性不是 float32'
    const blocked = accessorViewBlocker(json, accessor)
    if (blocked) return blocked
  }

  // 索引允许 u8/u16/u32（合并后统一输出 u32），但同样不能是 sparse 或交错。
  if (typeof primitive.indices === 'number') {
    const indexAccessor = json.accessors?.[primitive.indices]
    if (!indexAccessor) return '图元引用了不存在的索引 accessor'
    if (![5121, 5123, 5125].includes(indexAccessor.componentType)) return '索引 componentType 不受支持'
    const blocked = accessorViewBlocker(json, indexAccessor)
    if (blocked) return blocked
  }
  return ''
}

function accessorViewBlocker(json, accessor) {
  if (accessor.sparse) return '图元使用了 sparse accessor'
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view) return 'accessor 引用了不存在的 bufferView'
  if (view.byteStride) return '顶点数据是交错存储的'
  return ''
}

// 步骤：按材质合并图元。Cesium 1.128 的加载耗时随图元数超线性增长，
// 数百个图元的模型实测永远加载不完；合并后同样的几何只需数秒。
function mergePrimitivesByMaterial(json, bin, workingBin, replacements, options = {}) {
  const threshold = typeof options.mergePrimitiveThreshold === 'number' ? options.mergePrimitiveThreshold : 100
  const meshes = json.meshes || []
  const nodes = json.nodes || []
  const noop = { merged: 0, bin: workingBin, groups: 0 }

  let primitiveTotal = 0
  for (const mesh of meshes) primitiveTotal += (mesh.primitives || []).length
  if (primitiveTotal <= threshold) return noop
  if ((json.buffers || []).length > 1) return noop
  if ((json.animations || []).length > 0) return noop
  for (const extension of json.extensionsRequired || []) {
    if (extension === 'KHR_draco_mesh_compression' || extension === 'EXT_meshopt_compression') return noop
  }

  const { matrices, reachable } = computeSceneMatrices(json)

  // 一个 mesh 只能归属一个组，且必须只被一个节点引用（实例化网格合并会丢副本）。
  const meshNodes = new Map()
  let instanced = false
  for (const [nodeIndex, node] of nodes.entries()) {
    if (typeof node.mesh !== 'number') continue
    if (meshNodes.has(node.mesh)) { instanced = true; continue }
    meshNodes.set(node.mesh, nodeIndex)
  }
  if (instanced) return noop

  const groups = new Map()
  for (const [meshIndex, nodeIndex] of meshNodes) {
    if (!reachable.has(nodeIndex)) continue
    const primitives = meshes[meshIndex].primitives || []
    if (primitives.length === 0) continue

    const keys = new Set(primitives.map((primitive) => primitiveGroupKey(json, primitive)))
    if (keys.size !== 1) continue // 同一 mesh 的图元跨多个组，放弃合并

    for (const primitive of primitives) {
      if (mergeBlocker(json, primitive, matrices[nodeIndex])) return noop
    }
    const key = [...keys][0]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ meshIndex, nodeIndex, world: matrices[nodeIndex] })
  }

  const mergedGroups = [...groups.values()].filter((members) => members.length > 1)
  if (mergedGroups.length === 0) return noop

  // 必须在清空 primitives 之前收集被消费的 view，否则后面就找不到它们了。
  const consumedViews = new Set()
  for (const members of mergedGroups) {
    for (const { meshIndex } of members) {
      for (const primitive of meshes[meshIndex].primitives || []) {
        const accessorIndices = Object.values(primitive.attributes || {})
        if (typeof primitive.indices === 'number') accessorIndices.push(primitive.indices)
        for (const accessorIndex of accessorIndices) {
          const accessor = json.accessors?.[accessorIndex]
          if (accessor && typeof accessor.bufferView === 'number') consumedViews.add(accessor.bufferView)
        }
      }
    }
  }

  const consumedMeshes = new Set()
  let mergedCount = 0
  const newMeshes = []

  for (const members of mergedGroups) {
    // 该组所有成员属性的并集：缺 TEXCOORD 的成员补零后即可与其它成员并入同一条流。
    const unionSemantics = new Set()
    const componentCounts = new Map()
    for (const { meshIndex } of members) {
      for (const [semantic, accessorIndex] of Object.entries(meshes[meshIndex].primitives[0].attributes)) {
        unionSemantics.add(semantic)
        if (!componentCounts.has(semantic)) {
          componentCounts.set(semantic, getAccessorComponentCount(json.accessors[accessorIndex].type))
        }
      }
    }
    for (const semantic of unionSemantics) {
      if (!componentCounts.has(semantic)) componentCounts.set(semantic, 2)
    }

    const streams = new Map()
    for (const semantic of unionSemantics) streams.set(semantic, [])
    const indices = []
    let vertexBase = 0

    for (const { meshIndex, nodeIndex, world } of members) {
      const primitive = meshes[meshIndex].primitives[0]
      const position = readAccessorData(json, bin, primitive.attributes.POSITION)
      const count = position.accessor.count
      const flipped = determinant3(world) < 0
      const normalMatrix = transposeMatrix(invertMatrix(world))

      // 按顶点遍历，逐语义取值，保证各条流严格对齐——缺 TEXCOORD 的成员在这里补零。
      const readers = new Map()
      for (const semantic of unionSemantics) {
        const accessorIndex = primitive.attributes[semantic]
        readers.set(semantic, typeof accessorIndex === 'number' ? readAccessorData(json, bin, accessorIndex) : null)
      }

      for (let i = 0; i < count; i += 1) {
        for (const semantic of unionSemantics) {
          const stream = streams.get(semantic)
          const data = readers.get(semantic)
          if (!data) {
            for (let component = 0; component < componentCounts.get(semantic); component += 1) stream.push(0)
            continue
          }
          const offset = i * data.componentCount
          if (semantic === 'POSITION') {
            stream.push(...transformPoint(world, [data.typed[offset], data.typed[offset + 1], data.typed[offset + 2]]))
          } else if (semantic === 'NORMAL') {
            stream.push(...transformVector(normalMatrix, [data.typed[offset], data.typed[offset + 1], data.typed[offset + 2]]))
          } else {
            for (let component = 0; component < data.componentCount; component += 1) {
              stream.push(data.typed[offset + component])
            }
          }
        }
      }

      // 镜像变换会反转三角形朝向；材质多为 doubleSided，几何不会消失但光照会反向。
      const indexData = readAccessorData(json, bin, primitive.indices)
      for (let triangle = 0; triangle < indexData.accessor.count; triangle += 3) {
        const a = indexData.typed[triangle] + vertexBase
        const b = indexData.typed[triangle + 1] + vertexBase
        const c = indexData.typed[triangle + 2] + vertexBase
        if (flipped) indices.push(a, c, b)
        else indices.push(a, b, c)
      }
      vertexBase += count
    }

    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const positions = streams.get('POSITION')
    for (let i = 0; i < positions.length; i += 3) {
      for (let component = 0; component < 3; component += 1) {
        min[component] = Math.min(min[component], positions[i + component])
        max[component] = Math.max(max[component], positions[i + component])
      }
    }

    const attributes = {}
    for (const [semantic, stream] of streams) {
      const values = Float32Array.from(stream)
      const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength)
      const appended = appendBufferViewToBinary(json, workingBin, bytes)
      workingBin = appended.bin
      replacements.set(appended.bufferView, bytes)

      const componentCount = componentCounts.get(semantic)
      const accessor = {
        bufferView: appended.bufferView,
        byteOffset: 0,
        componentType: 5126,
        count: values.length / componentCount,
        type: accessorTypeForComponentCount(componentCount),
      }
      if (semantic === 'POSITION') {
        accessor.min = min
        accessor.max = max
      }
      json.accessors.push(accessor)
      attributes[semantic] = json.accessors.length - 1
    }

    // 合并后的顶点数可能超过 65535，索引一律用 uint32。
    const indexValues = Uint32Array.from(indices)
    const indexBytes = Buffer.from(indexValues.buffer, indexValues.byteOffset, indexValues.byteLength)
    const appendedIndices = appendBufferViewToBinary(json, workingBin, indexBytes)
    workingBin = appendedIndices.bin
    replacements.set(appendedIndices.bufferView, indexBytes)
    json.accessors.push({
      bufferView: appendedIndices.bufferView,
      byteOffset: 0,
      componentType: 5125,
      count: indexValues.length,
      type: 'SCALAR',
    })

    for (const { meshIndex } of members) consumedMeshes.add(meshIndex)
    newMeshes.push({
      meshIndex: members[0].meshIndex,
      primitive: {
        attributes,
        indices: json.accessors.length - 1,
        material: meshes[members[0].meshIndex].primitives[0].material,
        mode: 4,
      },
    })
    mergedCount += 1
  }

  if (mergedCount === 0) return noop

  // 被消费的 mesh 全部清空图元：main.js 的 getPositionBounds 会并集所有 mesh 的
  // POSITION min/max 且不感知节点变换，残留的局部坐标会把包围球放大一个数量级。
  for (const meshIndex of consumedMeshes) meshes[meshIndex].primitives = []

  const mergedMeshIndices = new Set()
  for (const { meshIndex, primitive } of newMeshes) {
    meshes[meshIndex].primitives = [primitive]
    mergedMeshIndices.add(meshIndex)
  }

  // 原网格节点一律摘掉 mesh 引用（变换留在节点上，子节点不受影响）。
  for (const [, nodeIndex] of meshNodes) {
    if (typeof nodes[nodeIndex].mesh !== 'number') continue
    if (!consumedMeshes.has(nodes[nodeIndex].mesh)) continue
    delete nodes[nodeIndex].mesh
  }

  // 追加恒等根节点承载合并结果：不改变任何既有索引，因此无需重映射。
  const sceneIndex = typeof json.scene === 'number' ? json.scene : 0
  if (!Array.isArray(json.scenes) || !json.scenes[sceneIndex]) return noop
  for (const meshIndex of mergedMeshIndices) {
    json.nodes.push({ mesh: meshIndex })
    json.scenes[sceneIndex].nodes.push(json.nodes.length - 1)
  }

  reclaimConsumedViews(json, replacements, consumedViews)

  return { merged: mergedCount, bin: workingBin, groups: mergedGroups.length }
}

// 回收被消费图元独占、且已无幸存引用的 bufferView，避免合并后文件体积翻倍。
// 只要该 view 仍被任何 accessor/图片引用就原样保留。
function reclaimConsumedViews(json, replacements, consumedViews) {
  const stillReferenced = new Set()
  const collect = (accessorIndex) => {
    const accessor = json.accessors?.[accessorIndex]
    if (accessor && typeof accessor.bufferView === 'number') stillReferenced.add(accessor.bufferView)
  }
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      for (const accessorIndex of Object.values(primitive.attributes || {})) collect(accessorIndex)
      if (typeof primitive.indices === 'number') collect(primitive.indices)
      for (const target of primitive.targets || []) {
        for (const accessorIndex of Object.values(target)) collect(accessorIndex)
      }
    }
  }
  for (const skin of json.skins || []) collect(skin.inverseBindMatrices)
  for (const animation of json.animations || []) {
    for (const sampler of animation.samplers || []) {
      collect(sampler.input)
      collect(sampler.output)
    }
  }
  const imageViews = new Set((json.images || []).map((image) => image.bufferView))

  for (const viewIndex of consumedViews) {
    if (replacements.has(viewIndex)) continue
    if (stillReferenced.has(viewIndex) || imageViews.has(viewIndex)) continue
    replacements.set(viewIndex, Buffer.alloc(0))
  }
}

// 把一段新字节追加到 BIN 末尾并登记一个 bufferView（不含 accessor）。
// 追加不会改动任何既有偏移，因此调用方可以安全地继续按原偏移读取。
function appendBufferViewToBinary(json, bin, bytes) {
  const offset = align4(bin.length)
  const padding = Buffer.alloc(offset - bin.length)
  const bufferView = {
    buffer: 0,
    byteOffset: offset,
    byteLength: bytes.length,
  }
  if (!Array.isArray(json.bufferViews)) json.bufferViews = []
  json.bufferViews.push(bufferView)
  const newBin = Buffer.concat([bin, padding, bytes])
  if (!Array.isArray(json.buffers)) json.buffers = [{ byteLength: newBin.length }]
  json.buffers[0].byteLength = newBin.length
  return { bin: newBin, bufferView: json.bufferViews.length - 1 }
}

function repairGlbFile(inputPath, outputPath, options = {}) {
  const replacements = new Map()
  const externalImages = []
  let imagesConverted = 0
  let oldBytes = 0

  try {
    // statSync / readGlb 也必须留在 try 内：损坏或非 GLB 的文件会在这里抛错，
    // 只有转成 error report 才能让 repairMany 继续处理批次里的其余文件。
    oldBytes = fs.statSync(inputPath).size
    const { json, bin } = readGlb(inputPath)
    // 追加型步骤（补 TEXCOORD、合并图元）会把新字节续到 bin 末尾，累积在 workingBin 上；
    // 既有偏移不受影响，所以读取仍可按原偏移进行。
    let workingBin = bin
    const skinnedMeshesBaked = bakeSkinnedMeshes(json, bin, replacements, options)

    for (const [imageIndex, image] of (json.images || []).entries()) {
      let original
      if (typeof image.bufferView === 'number') {
        const view = json.bufferViews?.[image.bufferView]
        if (!view) continue
        const offset = view.byteOffset || 0
        original = bin.subarray(offset, offset + view.byteLength)
      } else if (typeof image.uri === 'string') {
        original = resolveExternalImage(inputPath, image.uri).bytes
      } else {
        continue
      }

      if (isPng(original)) {
        image.mimeType = 'image/png'
        if (typeof image.uri === 'string') externalImages.push({ image, bytes: original })
        continue
      }

      const converted = encodePng(original)
      imagesConverted += 1
      if (typeof image.bufferView === 'number') {
        replacements.set(image.bufferView, converted)
      } else {
        externalImages.push({ image, bytes: converted })
      }
      image.mimeType = 'image/png'
    }

    stripSpecularExtensions(json)

    // 补 TEXCOORD 必须在合并之前：否则缺 UV 的图元会被冻结成独立的组，着色器问题依旧。
    // 两者都往 workingBin 末尾追加数据并登记进 replacements，由 rebuildBinary 统一落盘。
    const texCoords = fillMissingTexCoords(json, workingBin, replacements)
    workingBin = texCoords.bin

    // 合并要读取「补过 TEXCOORD 之后」的 bin，因此读写都用 workingBin。
    // 烘焙过蒙皮时不合并：bakeSkinnedMeshes 只写 replacements 不写 bin，
    // 这时直接读 bin 会拿到烘焙前的绑定姿势顶点。
    const merge = skinnedMeshesBaked > 0
      ? { merged: 0, bin: workingBin }
      : mergePrimitivesByMaterial(json, workingBin, workingBin, replacements, options)
    workingBin = merge.bin

    let newBin = rebuildBinary(json, workingBin, replacements)
    for (const external of externalImages) {
      const appended = appendBufferViewToBinary(json, newBin, external.bytes)
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
      texCoordsFilled: texCoords.filled,
      primitivesMerged: merge.merged,
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
      externalImagesEmbedded: 0,
      texCoordsFilled: 0,
      primitivesMerged: 0,
      extensionsRemoved: [],
      status: 'error',
      error: error.message,
    }
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

function emitProgress(onProgress, event) {
  if (!onProgress) return
  try {
    onProgress(event)
  } catch {
    // 进度回调只用于界面展示，回调出错不应中断批量修复。
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

// 批量修复。每修复一个文件都会通过 options.onProgress 上报进度事件：
//   { phase: 'scanning' }
//   { phase: 'start', total }
//   { phase: 'file-start', index, total, relativePath }
//   { phase: 'file-done', index, total, completed, relativePath, status, error }
//   { phase: 'done', total, completed, failed }
// onProgress 是异步回调之外的旁路通道：它不会出现在传给 repairGlbFile 的 options 里。
async function repairMany(inputPaths, outputDir, options = {}) {
  const { onProgress = null, ...fileOptions } = options
  emitProgress(onProgress, { phase: 'scanning' })

  const files = collectGlbEntries(inputPaths)
  emitProgress(onProgress, { phase: 'start', total: files.length })

  const reports = []
  let failed = 0
  for (const [index, entry] of files.entries()) {
    const outputPath = path.join(outputDir, entry.relativePath)
    emitProgress(onProgress, {
      phase: 'file-start',
      index,
      total: files.length,
      inputPath: entry.inputPath,
      relativePath: entry.relativePath,
    })

    const report = repairGlbFile(entry.inputPath, outputPath, fileOptions)
    reports.push(report)
    if (report.status === 'error') failed += 1

    emitProgress(onProgress, {
      phase: 'file-done',
      index,
      total: files.length,
      completed: index + 1,
      inputPath: entry.inputPath,
      relativePath: entry.relativePath,
      status: report.status,
      error: report.error || '',
    })

    // 修复本身是同步 CPU 操作，会让主进程无法处理事件循环；在每个文件之间让出一次，
    // 进度事件才能及时送达渲染进程。
    await yieldToEventLoop()
  }

  emitProgress(onProgress, { phase: 'done', total: files.length, completed: reports.length, failed })
  return reports
}

module.exports = {
  align4,
  collectGlbEntries,
  collectGlbFiles,
  createGlbBuffer,
  encodePng,
  fillMissingTexCoords,
  mergePrimitivesByMaterial,
  readGlb,
  repairGlbFile,
  repairMany,
  stripSpecularExtensions,
  writeGlb,
}
