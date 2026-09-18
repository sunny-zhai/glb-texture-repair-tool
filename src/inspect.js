// 模型体检：对任意 GLB（含 IVE 转换产物）产出一份**只读**参数报告。
//
// 存在的理由：用户需要"模型多大、多少点面、贴图什么规格、中心点在哪、默认方向对不对、
// 比例尺是多少"，而这些信息此前只散落在转换日志的一行尺寸里。更要紧的是那些**看着对、
// 摆进去不对**的问题——accessor 盒与真实世界盒差 9 万倍、几何是三角汤、贴图是 1×1 占位、
// 33 个材质却 0 张贴图被采样——只有把参数摆出来才看得见。
//
// 本模块只读：不改写任何输入文件，不依赖 Electron，可在纯 node 下跑。
// 命令行：node src/inspect.js <file.glb>
const fs = require('node:fs')
const path = require('node:path')

const { readGlb } = require('./repair')
const { boundsSize, glbBounds } = require('./transform')

// 采样器常量（glTF 枚举）
const WRAP_REPEAT = 10497
const MIPMAP_FILTERS = new Set([9984, 9985, 9986, 9987]) // NEAREST/LINEAR_MIPMAP_*

const ISSUE_LEVELS = { error: '错误', warn: '警告', info: '提示' }

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0
}

/**
 * @description 只读图片头解析出宽高（不解码像素）。PNG 读 IHDR；JPEG 扫 SOF 段。
 *   两条路径都只读前面几百字节，因此体检大贴图也不会拖慢。
 */
function imageDimensions(bytes, mimeType) {
  if (!bytes || bytes.length < 8) return null
  if (mimeType === 'image/png' || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
    // 签名(8) + 长度(4) + 'IHDR'(4) + 宽(4) + 高(4)
    if (bytes.length < 24) return null
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (mimeType === 'image/jpeg' || (bytes[0] === 0xff && bytes[1] === 0xd8)) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      // SOF0..SOF15，排除 DHT(C4)/JPG(C8)/DAC(CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
      }
      const length = bytes.readUInt16BE(offset + 2)
      if (length <= 0) return null
      offset += 2 + length
    }
    return null
  }
  return null
}

/** @description 从任意 `*Texture` 槽位取出 `{ texture, texCoord }`，用于统计"被采样"与缺 UV。 */
function collectTextureSlots(material) {
  const slots = []
  const visit = (holder) => {
    if (!holder || typeof holder !== 'object') return
    for (const [key, value] of Object.entries(holder)) {
      if (/Texture$/.test(key) && value && typeof value.index === 'number') {
        slots.push({ key, texture: value.index, texCoord: value.texCoord ?? 0 })
      }
    }
  }
  visit(material?.pbrMetallicRoughness)
  visit(material)
  visit(material?.extensions)
  return slots
}

/** @description 沿节点链统计网格节点的矩阵病态：镜像、奇异（塌缩）、非均匀、单位缩放异常。 */
function nodeMatrixStats(json) {
  const stats = {
    meshNodes: 0, mirrored: 0, singular: 0, nonUniform: 0, unitScaled: 0, scales: [],
  }
  const visiting = new Set()
  const { getNodeLocalMatrix, identityMatrix, multiplyMatrix } = require('./repair')

  const columnLength = (matrix, column) => Math.hypot(
    matrix[column * 4], matrix[column * 4 + 1], matrix[column * 4 + 2],
  )
  const determinant = (matrix) => {
    const [a, b, c] = [matrix[0], matrix[1], matrix[2]]
    const [d, e, f] = [matrix[4], matrix[5], matrix[6]]
    const [g, h, i] = [matrix[8], matrix[9], matrix[10]]
    return a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e)
  }

  const walk = (index, parentMatrix) => {
    const node = json.nodes?.[index]
    if (!node || visiting.has(index)) return
    visiting.add(index)
    const world = multiplyMatrix(parentMatrix, getNodeLocalMatrix(node))
    if (typeof node.mesh === 'number') {
      stats.meshNodes += 1
      const det = determinant(world)
      if (det < 0) stats.mirrored += 1
      if (Math.abs(det) < 1e-12) stats.singular += 1
      const lengths = [0, 1, 2].map((column) => columnLength(world, column))
      const average = lengths.reduce((sum, value) => sum + value, 0) / 3
      const spread = average > 0 ? (Math.max(...lengths) - Math.min(...lengths)) / average : 0
      if (spread > 0.01) stats.nonUniform += 1
      if (average > 0) stats.scales.push(average)
      if (average > 0 && (average > 1.01 || average < 0.99)) stats.unitScaled += 1
    }
    for (const child of node.children ?? []) walk(child, world)
    visiting.delete(index)
  }

  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? []
  for (const root of roots) walk(root, identityMatrix())
  stats.scales.sort((left, right) => left - right)
  stats.medianScale = stats.scales.length
    ? Number(stats.scales[Math.floor(stats.scales.length / 2)].toPrecision(4))
    : null
  return stats
}

/**
 * @description 推断上轴。**只做保守推断**：包围盒本身无法判定朝向（002 §6 问题 3 的结论），
 *   所以这里给出猜测 + 置信度 + 依据，置信度不足时由界面弹手动三态，绝不静默改写。
 */
function guessUpAxis(bounds, generator) {
  const size = boundsSize(bounds)
  if (!size) return { axis: 'unknown', confidence: 'none', reason: '没有几何，无法判定' }
  const sorted = [...size].sort((left, right) => left - right)
  const extents = { X: Number(size[0].toFixed(3)), Y: Number(size[1].toFixed(3)), Z: Number(size[2].toFixed(3)) }

  if (/fbx2gltf|assimp|khronos|gltf-pipeline|blender/i.test(generator ?? '')) {
    return {
      axis: 'Y',
      confidence: 'medium',
      reason: `生成器 "${generator}" 属于标准 glTF 导出链，按 Y-up 约定输出`,
      extents,
    }
  }
  // 无生成器签名时只报事实：哪个轴最长、哪个最短，并明确说不足以判定。
  const longest = ['X', 'Y', 'Z'][size.indexOf(sorted[2])]
  const shortest = ['X', 'Y', 'Z'][size.indexOf(sorted[0])]
  return {
    axis: 'unknown',
    confidence: 'low',
    reason: `无导出器签名；仅知最长轴 ${longest}、最短轴 ${shortest}。包围盒不足以判定上轴，需人工确认`,
    extents,
  }
}

function addIssue(issues, level, code, message, detail) {
  issues.push({ level, code, message, ...(detail === undefined ? {} : { detail }) })
}

/**
 * @description 体检一个 GLB。**不抛异常**：任何异常都变成报告里的错误条目。
 * @param {string} filePath
 * @returns {object} 报告对象；`ok: false` 表示连读取/解析都没成功。
 */
function inspect(filePath) {
  const startedAt = Date.now()
  const report = {
    ok: false,
    inputPath: filePath,
    fileName: path.basename(filePath ?? ''),
    fileBytes: null,
    issues: [],
    elapsedMs: 0,
  }

  try {
    report.fileBytes = fs.statSync(filePath).size
  } catch (error) {
    addIssue(report.issues, 'error', 'FILE_UNREADABLE', `无法读取文件：${error.message}`)
    report.elapsedMs = Date.now() - startedAt
    return report
  }

  if (path.extname(filePath).toLowerCase() !== '.glb') {
    addIssue(report.issues, 'error', 'NOT_A_GLB', `只支持 .glb（当前：${path.extname(filePath)}）。其他格式请先转换`)
    report.elapsedMs = Date.now() - startedAt
    return report
  }

  let json
  let bin
  try {
    ;({ json, bin } = readGlb(filePath))
  } catch (error) {
    addIssue(report.issues, 'error', 'GLB_PARSE_FAILED', `GLB 解析失败：${error.message}`)
    report.elapsedMs = Date.now() - startedAt
    return report
  }

  report.ok = true
  report.asset = { version: json.asset?.version ?? null, generator: json.asset?.generator ?? null }
  report.extensions = {
    used: json.extensionsUsed ?? [],
    required: json.extensionsRequired ?? [],
  }

  // ---- 数量 ----
  const meshes = json.meshes ?? []
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? [])
  let vertices = 0
  let indexTotal = 0
  let triangleIndexTotal = 0
  let nonIndexed = 0
  let missingTexCoord = 0
  for (const primitive of primitives) {
    const position = json.accessors?.[primitive.attributes?.POSITION]
    vertices += position?.count ?? 0
    if (typeof primitive.indices === 'number') {
      const indices = json.accessors?.[primitive.indices]
      indexTotal += indices?.count ?? 0
      triangleIndexTotal += indices?.count ?? 0
    } else {
      nonIndexed += 1
      triangleIndexTotal += position?.count ?? 0
    }
    const material = json.materials?.[primitive.material]
    for (const slot of collectTextureSlots(material)) {
      if (!primitive.attributes?.[`TEXCOORD_${slot.texCoord}`]) missingTexCoord += 1
    }
  }
  // 先累加整数、最后只除一次，避免逐图元除 3 后再求和出现浮点不等（判据要求二者全等）
  const triangles = triangleIndexTotal / 3
  const trianglesFromIndices = indexTotal / 3

  report.counts = {
    scenes: json.scenes?.length ?? 0,
    nodes: json.nodes?.length ?? 0,
    meshes: meshes.length,
    primitives: primitives.length,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    images: json.images?.length ?? 0,
    samplers: json.samplers?.length ?? 0,
    skins: json.skins?.length ?? 0,
    animations: json.animations?.length ?? 0,
    accessors: json.accessors?.length ?? 0,
  }
  report.geometry = {
    vertices,
    triangles,
    trianglesFromIndices,
    // 判据来自 002 M1：三角面数必须与索引数/3 全等，否则统计口径有 bug
    trianglesMatch: triangles === trianglesFromIndices,
    indexedPrimitives: primitives.length - nonIndexed,
    nonIndexedPrimitives: nonIndexed,
    // 顶点数 ÷ 三角面数：三角汤 ≈ 3.0，焊接良好 ≈ 0.6（参考件 0.61）
    vertexReuseRatio: triangles > 0 ? Number((vertices / triangles).toFixed(4)) : null,
  }

  // ---- 图片与采样器 ----
  const images = (json.images ?? []).map((image, index) => {
    const record = { index, mimeType: image.mimeType ?? null, uri: image.uri ?? null, external: typeof image.uri === 'string' }
    if (typeof image.bufferView === 'number') {
      const view = json.bufferViews?.[image.bufferView]
      if (view) {
        record.bytes = view.byteLength
        const start = (view.byteOffset ?? 0)
        const slice = bin.subarray(start, Math.min(start + 1024, start + view.byteLength))
        const dims = imageDimensions(slice, record.mimeType)
        if (dims) {
          record.width = dims.width
          record.height = dims.height
          record.npot = !isPowerOfTwo(dims.width) || !isPowerOfTwo(dims.height)
        }
      }
    } else if (record.external) {
      const resolved = path.isAbsolute(image.uri) ? image.uri : path.join(path.dirname(filePath), image.uri)
      record.resolved = resolved
      record.exists = fs.existsSync(resolved)
    }
    return record
  })

  const usedImageIndexes = new Set()
  for (const material of json.materials ?? []) {
    for (const slot of collectTextureSlots(material)) {
      const texture = json.textures?.[slot.texture]
      if (typeof texture?.source === 'number') usedImageIndexes.add(texture.source)
    }
  }
  report.images = images
  report.textures = {
    total: json.textures?.length ?? 0,
    sampledImages: usedImageIndexes.size,
    placeholders: images.filter((image) => image.width === 1 && image.height === 1).length,
  }

  // ---- 问题清单 ----
  if (json.materials?.length && usedImageIndexes.size === 0) {
    addIssue(report.issues, 'warn', 'NO_SAMPLED_TEXTURE',
      `${json.materials.length} 个材质，但没有任何贴图被材质采样`,
      '模型在 Cesium 里会呈现纯色（常见于车辆类"有材质无贴图"的资产）')
  }
  for (const image of images) {
    if (image.external && image.exists === false) {
      addIssue(report.issues, 'error', 'EXTERNAL_IMAGE_MISSING',
        `贴图 ${image.index} 是外部路径且文件不存在：${image.uri}`,
        'Cesium 拿不到本机文件，必须内嵌（用本工具的修复功能）')
    } else if (image.external) {
      addIssue(report.issues, 'warn', 'EXTERNAL_IMAGE',
        `贴图 ${image.index} 是外部路径：${image.uri}`, '需要内嵌后才能在任何环境加载')
    }
    if (image.width === 1 && image.height === 1) {
      addIssue(report.issues, 'warn', 'TEXTURE_1X1_PLACEHOLDER',
        `贴图 ${image.index} 是 1×1 占位图`, '多半是资产制作时的残留，视觉上无意义，可考虑剔除')
    }
  }
  const samplerList = json.samplers ?? []
  report.samplers = samplerList.map((sampler, index) => ({
    index,
    wrapS: sampler.wrapS ?? WRAP_REPEAT,
    wrapT: sampler.wrapT ?? WRAP_REPEAT,
    minFilter: sampler.minFilter ?? null,
    repeats: (sampler.wrapS ?? WRAP_REPEAT) === WRAP_REPEAT || (sampler.wrapT ?? WRAP_REPEAT) === WRAP_REPEAT,
    mipmapped: MIPMAP_FILTERS.has(sampler.minFilter),
  }))
  const usesRepeatMipmap = report.samplers.some((sampler) => sampler.repeats && sampler.mipmapped)
  const hasNpot = images.some((image) => image.npot)
  if (usesRepeatMipmap && hasNpot) {
    addIssue(report.issues, 'warn', 'NPOT_WITH_REPEAT_MIPMAP',
      '存在非 2 次幂贴图，但采样器同时使用 REPEAT + mipmap',
      'WebGL1 下这种组合不完整（Cesium 可能显示异常），需改为 CLAMP_TO_EDGE + LINEAR')
  }
  if (missingTexCoord > 0) {
    addIssue(report.issues, 'error', 'MISSING_TEXCOORD',
      `${missingTexCoord} 个图元采样了贴图但缺少对应 TEXCOORD_n`,
      'Cesium 会因着色器编译失败而停止整个场景的渲染，必须补零 UV（本工具可自动修复）')
  }
  if (json.skins?.length) {
    addIssue(report.issues, 'info', 'HAS_SKINS',
      `含 ${json.skins.length} 个蒙皮，${json.animations?.length ?? 0} 个动画`,
      'Cesium 对蒙皮件支持不稳，修复时会烘焙为静态网格（可选冻结到动画某帧）')
  }
  if (nonIndexed > 0) {
    addIssue(report.issues, 'info', 'NON_INDEXED_PRIMITIVES', `${nonIndexed} 个图元没有索引`, '顶点复用率会偏低')
  }

  // ---- 包围盒与失真 ----
  report.bounds = glbBounds(json)
  if (report.bounds.deviationFactor && report.bounds.deviationFactor > 10) {
    addIssue(report.issues, 'warn', 'ACCESSOR_BOUNDS_UNRELIABLE',
      `accessor 并集盒与真实世界盒相差 ${report.bounds.deviationFactor} 倍`,
      `accessor 盒 ${JSON.stringify(report.bounds.accessorUnionSize)} ≠ 真实 ${JSON.stringify(report.bounds.worldSize)}；`
      + '只看 accessor min/max 取景会明显错位（保存文件内没有独立的"包围盒"字段，只能自己算）')
  }
  if (report.geometry.vertexReuseRatio !== null && report.geometry.vertexReuseRatio >= 2.9) {
    addIssue(report.issues, 'info', 'TRIANGLE_SOUP',
      `顶点/面比 ${report.geometry.vertexReuseRatio}（≈3 顶点/面）`,
      '几何是未焊接的三角汤，顶点缓冲可压缩到约 1/5')
  }

  // ---- 节点矩阵病态 ----
  const nodeStats = nodeMatrixStats(json)
  report.nodes = nodeStats
  if (nodeStats.mirrored > 0) {
    addIssue(report.issues, 'info', 'MIRRORED_NODES', `${nodeStats.mirrored} 个网格节点是镜像（世界矩阵 det < 0）`, '合并图元时必须逐图元反转绕序，否则光照反向')
  }
  if (nodeStats.singular > 0) {
    addIssue(report.issues, 'warn', 'SINGULAR_NODES', `${nodeStats.singular} 个网格节点世界矩阵接近奇异（几何被压塌）`, '这类节点在视图中几乎不可见，可能是资产问题')
  }
  if (nodeStats.nonUniform > 0) {
    addIssue(report.issues, 'info', 'NON_UNIFORM_SCALE', `${nodeStats.nonUniform} 个网格节点存在非均匀缩放`, '法线需用逆转置矩阵变换')
  }

  // ---- 上轴与比例尺 ----
  report.axes = guessUpAxis(report.bounds.world, report.asset.generator)
  if (report.axes.confidence === 'low') {
    addIssue(report.issues, 'info', 'UP_AXIS_UNCERTAIN',
      '无法从上轴/包围盒可靠判定默认方向', report.axes.reason)
  }
  report.scale = {
    medianNodeScale: nodeStats.medianScale,
    scaledNodeCount: nodeStats.unitScaled,
    worldSizeMeters: report.bounds.worldSize,
    hint: nodeStats.medianScale && (nodeStats.medianScale < 0.01 || nodeStats.medianScale > 100)
      ? `多数节点带 ${nodeStats.medianScale} 倍缩放，疑似单位修正（毫米/厘米 → 米）`
      : null,
  }

  report.elapsedMs = Date.now() - startedAt
  return report
}

/** @description 把报告渲染成便于人读的中文摘要（命令行与日志共用）。 */
function formatReport(report) {
  if (!report.ok) {
    return [
      `体检失败：${report.fileName}`,
      ...report.issues.map((issue) => `  [${ISSUE_LEVELS[issue.level]}] ${issue.message}`),
    ].join('\n')
  }
  const size = (values) => (values ? values.map((value) => value.toFixed(2)).join(' × ') : '—')
  const lines = [
    `模型体检：${report.fileName}（${(report.fileBytes / 1048576).toFixed(2)} MB，${report.elapsedMs} ms）`,
    `  资产：glTF ${report.asset.version ?? '?'}${report.asset.generator ? ` · ${report.asset.generator}` : ''}`,
    `  结构：${report.counts.nodes} 节点 / ${report.counts.meshes} 网格 / ${report.counts.primitives} 图元 / `
      + `${report.counts.materials} 材质 / ${report.counts.textures} 贴图`,
    `  几何：${report.geometry.vertices} 顶点 / ${report.geometry.triangles} 三角面`
      + `（顶点/面比 ${report.geometry.vertexReuseRatio}）`,
    `  世界盒：${size(report.bounds.worldSize)} m，中心 ${size(report.bounds.worldCenter)}`,
    `  accessor 盒：${size(report.bounds.accessorUnionSize)}（偏差 ${report.bounds.deviationFactor} 倍）`,
    `  上轴：${report.axes.axis}（${report.axes.confidence}）—— ${report.axes.reason}`,
  ]
  if (report.scale.hint) lines.push(`  比例尺：${report.scale.hint}`)
  if (report.issues.length) {
    lines.push('  问题：')
    for (const issue of report.issues) {
      lines.push(`    [${ISSUE_LEVELS[issue.level]}] ${issue.code}：${issue.message}`)
    }
  } else {
    lines.push('  问题：无')
  }
  return lines.join('\n')
}

module.exports = {
  formatReport,
  guessUpAxis,
  imageDimensions,
  inspect,
  nodeMatrixStats,
}

if (require.main === module) {
  const target = process.argv[2]
  if (!target) {
    console.error('用法：node src/inspect.js <file.glb>')
    process.exit(2)
  }
  const result = inspect(target)
  console.log(formatReport(result))
  process.exit(result.ok ? 0 : 1)
}
