// 模型体检：对任意 GLB（含 IVE 转换产物）产出一份**只读**参数报告。
//
// 存在的理由：用户需要"模型多大、多少点面、贴图什么规格、中心点在哪、默认方向对不对、
// 比例尺是多少"，而这些信息此前只散落在转换日志的一行尺寸里。更要紧的是那些**看着对、
// 摆进去不对**的问题——accessor 盒与真实世界盒差 20 万倍、几何是三角汤、贴图是 1×1 占位、
// 33 个材质却 0 张贴图被采样——只有把参数摆出来才看得见。
//
// 两条硬约束（BR-020 / REQ-005 验收 5）：
//   1) **只读**——不改写任何输入文件；本模块不出现任何写操作。
//   2) **绝不抛异常**——文件不可读、非 GLB、解析失败、结构畸形（`meshes:[null]` 之类）
//      一律转成报告里的中文问题条目。审查实测过 5 类畸形 GLB 曾让本函数抛 TypeError，
//      因此分析段整体包在 try/catch 里，且元素级访问统一走 asArray()/可选链。
//
// 命令行：node src/inspect.js <file.glb>
const fs = require('node:fs')
const path = require('node:path')

const {
  getNodeLocalMatrix,
  identityMatrix,
  multiplyMatrix,
  readGlb,
} = require('./repair')
const { boundsSize, glbBounds } = require('./transform')

// 采样器常量（glTF 枚举）
const WRAP_REPEAT = 10497
const MIPMAP_FILTERS = new Set([9984, 9985, 9986, 9987]) // NEAREST/LINEAR_MIPMAP_*

const ISSUE_LEVELS = { error: '错误', warn: '警告', info: '提示' }

/** 外部图片做头部解析时最多读多少字节；Exif/ICC 可能上万字节，给足余量。 */
const IMAGE_HEAD_BYTES = 256 * 1024

const asArray = (value) => (Array.isArray(value) ? value : [])

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0
}

function isDataUri(uri) {
  return typeof uri === 'string' && uri.startsWith('data:')
}

/**
 * @description 只读图片头解析出宽高（不解码像素）。PNG 读 IHDR；JPEG 顺序跳过各段直到 SOF。
 *   **不做 1KB 之类的截断**：SOF 常在 APP1/Exif 之后（审查实测 M2A3 的 APP1 段就有 3221
 *   字节），截断会让 62% 的内嵌贴图读不到宽高，使 NPOT/占位检测静默失效。
 *   JPEG 扫描按段长前进，是 O(段数) 而非 O(字节数)，因此对整段数据扫描也不慢。
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
        const height = bytes.readUInt16BE(offset + 5)
        const width = bytes.readUInt16BE(offset + 7)
        return width > 0 && height > 0 ? { width, height } : null
      }
      // 填充段（FF00）与无长度段跳过；其余按长度前进
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2
        continue
      }
      const length = bytes.readUInt16BE(offset + 2)
      if (length <= 1) return null
      offset += 2 + length
    }
    return null
  }
  return null
}

/** @description 从 `data:` URI 解出头部若干字节（只解码前缀，不解整张图）。 */
function dataUriHead(uri, limit = 4096) {
  const comma = uri.indexOf(',')
  if (comma < 0) return null
  const payload = uri.slice(comma + 1)
  if (!uri.slice(0, comma).includes('base64')) return null
  // base64 每 4 字符 → 3 字节，按上限截断，避免解一张超大图
  const chars = Math.ceil(limit / 3) * 4
  try {
    return Buffer.from(payload.slice(0, chars), 'base64')
  } catch {
    return null
  }
}

/**
 * @description 从任意 `*Texture` 槽位取出 `{ texture, texCoord }`，用于统计"被采样"与缺 UV。
 *   需要**递归一层**进扩展对象：`KHR_materials_clearcoat` 之类的贴图藏在扩展值内部，
 *   只遍历顶层键会漏掉它们（漏掉的后果是"有材质无贴图"误报、缺 UV 漏检）。
 */
function collectTextureSlots(material) {
  const slots = []
  const seen = new Set()
  // 单次遍历即可覆盖 pbrMetallicRoughness 与 extensions 里的槽位；重复遍历会重复计数
  const visit = (holder, depth) => {
    if (!holder || typeof holder !== 'object' || depth > 3) return
    for (const [key, value] of Object.entries(holder)) {
      if (/Texture$/.test(key) && value && typeof value.index === 'number') {
        const texCoord = value.texCoord ?? 0
        const identity = `${key}:${value.index}:${texCoord}`
        if (seen.has(identity)) continue
        seen.add(identity)
        slots.push({ key, texture: value.index, texCoord })
      } else if (value && typeof value === 'object') {
        visit(value, depth + 1)
      }
    }
  }
  visit(material, 0)
  return slots
}

function determinant3(matrix) {
  const [a, b, c] = [matrix[0], matrix[1], matrix[2]]
  const [d, e, f] = [matrix[4], matrix[5], matrix[6]]
  const [g, h, i] = [matrix[8], matrix[9], matrix[10]]
  return a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e)
}

/**
 * @description 沿节点链统计网格节点的矩阵病态：镜像、奇异（几何被压塌）、非均匀、单位缩放异常。
 *   只走**默认场景**，与 worldBounds/glbBounds 口径一致——否则报告里的盒与节点统计会互相矛盾。
 *   奇异性用**三列长度比**判定而不是 `|det|`：行列式是体积量纲，`|det| < 1e-12` 会把
 *   正常的微小均匀缩放（1e-5 → det=1e-15）误报为"压塌"，又会漏掉单轴压扁（det=1e-9）。
 */
function nodeMatrixStats(json) {
  const stats = {
    meshNodes: 0, mirrored: 0, singular: 0, nonUniform: 0, unitScaled: 0, scales: [],
  }
  const visiting = new Set()
  const nodes = asArray(json?.nodes)
  const scenes = asArray(json?.scenes)
  const scene = scenes[Number.isInteger(json?.scene) ? json.scene : 0]

  const walk = (index, parentMatrix) => {
    const node = nodes[index]
    if (!node || visiting.has(index)) return
    visiting.add(index)
    const world = multiplyMatrix(parentMatrix, getNodeLocalMatrix(node))
    if (typeof node.mesh === 'number') {
      stats.meshNodes += 1
      if (determinant3(world) < 0) stats.mirrored += 1
      const lengths = [0, 1, 2].map((column) => Math.hypot(
        world[column * 4], world[column * 4 + 1], world[column * 4 + 2],
      ))
      const shortest = Math.min(...lengths)
      const longest = Math.max(...lengths)
      // 几何压塌：某一轴比最长轴小 6 个数量级以上
      if (longest > 0 && shortest / longest < 1e-6) stats.singular += 1
      const average = lengths.reduce((sum, value) => sum + value, 0) / 3
      const spread = average > 0 ? (longest - shortest) / average : 0
      if (spread > 0.01) stats.nonUniform += 1
      if (average > 0) stats.scales.push(average)
      if (average > 0 && (average > 1.01 || average < 0.99)) stats.unitScaled += 1
    }
    for (const child of asArray(node.children)) walk(child, world)
    visiting.delete(index)
  }

  for (const root of asArray(scene?.nodes)) walk(root, identityMatrix())
  const sorted = [...stats.scales].sort((left, right) => left - right)
  if (sorted.length) {
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    stats.medianScale = Number(median.toPrecision(4))
  } else {
    stats.medianScale = null
  }
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

function finish(report, startedAt) {
  report.elapsedMs = Date.now() - startedAt
  return report
}

/** @description 图片记录：内嵌读 bufferView 头部，外链读文件头部，data URI 解前缀。 */
function describeImage(json, bin, image, index, filePath) {
  const record = {
    index,
    bufferView: typeof image?.bufferView === 'number' ? image.bufferView : null,
    mimeType: image?.mimeType ?? null,
    uri: typeof image?.uri === 'string' ? image.uri : null,
    external: typeof image?.uri === 'string' && !isDataUri(image.uri),
    dataUri: isDataUri(image?.uri),
  }
  let head = null
  if (typeof image?.bufferView === 'number') {
    const view = json?.bufferViews?.[image.bufferView]
    if (view && typeof view.byteLength === 'number') {
      record.bytes = view.byteLength
      const start = view.byteOffset ?? 0
      head = bin.subarray(start, Math.min(start + view.byteLength, start + IMAGE_HEAD_BYTES))
    }
  } else if (record.dataUri) {
    head = dataUriHead(image.uri)
  } else if (record.external) {
    // 相对路径按 GLB 所在目录解析；Windows 绝对路径（E:\...）在 POSIX 上 isAbsolute 为 false，
    // 这里只做尽力而为的解析，找不到就报"缺失"，不抛异常。
    const resolved = path.isAbsolute(image.uri) ? image.uri : path.join(path.dirname(filePath), image.uri)
    record.resolved = resolved
    record.exists = fs.existsSync(resolved)
    if (record.exists) {
      try {
        const handle = fs.openSync(resolved, 'r')
        try {
          const buffer = Buffer.alloc(IMAGE_HEAD_BYTES)
          const read = fs.readSync(handle, buffer, 0, IMAGE_HEAD_BYTES, 0)
          head = buffer.subarray(0, read)
          record.bytes = fs.fstatSync(handle).size
        } finally {
          fs.closeSync(handle)
        }
      } catch {
        head = null
      }
    }
  }
  if (head) {
    const dims = imageDimensions(head, record.mimeType)
    if (dims) {
      record.width = dims.width
      record.height = dims.height
      record.npot = !isPowerOfTwo(dims.width) || !isPowerOfTwo(dims.height)
    }
  }
  return record
}

/** @description 默认场景可达的网格索引集合（包围盒与统计都只认这些网格）。 */
function reachableMeshIndexes(json) {
  const meshIndexes = new Set()
  const nodes = asArray(json?.nodes)
  const scene = asArray(json?.scenes)[Number.isInteger(json?.scene) ? json.scene : 0]
  const visiting = new Set()
  const walk = (index) => {
    const node = nodes[index]
    if (!node || visiting.has(index)) return
    visiting.add(index)
    if (typeof node.mesh === 'number' && node.mesh >= 0) meshIndexes.add(node.mesh)
    for (const child of asArray(node.children)) walk(child)
    visiting.delete(index)
  }
  for (const root of asArray(scene?.nodes)) walk(root)
  return meshIndexes
}

/** @description 生成报告主体。调用方保证 json/bin 已解析成功。 */
function analyze(report, json, bin, filePath) {
  const issues = report.issues
  report.asset = { version: json?.asset?.version ?? null, generator: json?.asset?.generator ?? null }
  report.extensions = { used: asArray(json?.extensionsUsed), required: asArray(json?.extensionsRequired) }

  // ---- 数量与几何 ----
  const meshes = asArray(json?.meshes)
  const primitives = meshes.flatMap((mesh) => asArray(mesh?.primitives))
  let vertices = 0
  let indexTotal = 0
  let nonIndexedVertexTotal = 0
  let nonIndexed = 0
  let missingTexCoordPrimitives = 0
  for (const primitive of primitives) {
    const position = json?.accessors?.[primitive?.attributes?.POSITION]
    vertices += position?.count ?? 0
    if (typeof primitive?.indices === 'number') {
      indexTotal += json?.accessors?.[primitive.indices]?.count ?? 0
    } else {
      nonIndexed += 1
      nonIndexedVertexTotal += position?.count ?? 0
    }
    const material = json?.materials?.[primitive?.material]
    // 按**图元**计数（同一图元的多个纹理槽共用 UV，按槽位计数会重复报数）
    if (collectTextureSlots(material).some((slot) => !primitive?.attributes?.[`TEXCOORD_${slot.texCoord}`])) {
      missingTexCoordPrimitives += 1
    }
  }
  const trianglesIndexed = indexTotal / 3
  const trianglesNonIndexed = nonIndexedVertexTotal / 3
  const triangles = trianglesIndexed + trianglesNonIndexed

  report.counts = {
    scenes: asArray(json?.scenes).length,
    nodes: asArray(json?.nodes).length,
    meshes: meshes.length,
    primitives: primitives.length,
    materials: asArray(json?.materials).length,
    textures: asArray(json?.textures).length,
    images: asArray(json?.images).length,
    samplers: asArray(json?.samplers).length,
    skins: asArray(json?.skins).length,
    animations: asArray(json?.animations).length,
    accessors: asArray(json?.accessors).length,
  }
  report.geometry = {
    vertices,
    triangles,
    trianglesIndexed,
    trianglesNonIndexed,
    // 真正有证明力的不变量：索引数必须是 3 的倍数（审查指出原先的
    // 「triangles === Σ(indices.count)/3」在无非索引图元时是恒等式、有非索引时必然为 false，
    // 作为证据没有意义，故改为分别上报两类三角面 + 这条可判定的整除不变量）
    indexCountDivisibleBy3: indexTotal % 3 === 0,
    indexedPrimitives: primitives.length - nonIndexed,
    nonIndexedPrimitives: nonIndexed,
    // 顶点数 ÷ 三角面数：三角汤 ≈ 3.0，焊接良好 ≈ 0.6（参考件 0.61）
    vertexReuseRatio: triangles > 0 ? Number((vertices / triangles).toFixed(4)) : null,
  }

  // ---- 图片、采样器与采样关系 ----
  const images = asArray(json?.images).map((image, index) => describeImage(json, bin, image, index, filePath))
  const materials = asArray(json?.materials)
  const textures = asArray(json?.textures)
  const usedImageIndexes = new Set()
  for (const material of materials) {
    for (const slot of collectTextureSlots(material)) {
      const source = textures[slot.texture]?.source
      if (typeof source === 'number') usedImageIndexes.add(source)
    }
  }
  const meshIndexes = reachableMeshIndexes(json)
  report.images = images
  report.textures = {
    total: textures.length,
    sampledImages: usedImageIndexes.size,
    placeholders: images.filter((image) => image.width === 1 && image.height === 1).length,
    dimensionsKnown: images.filter((image) => typeof image.width === 'number').length,
  }

  report.samplers = asArray(json?.samplers).map((sampler, index) => ({
    index,
    wrapS: sampler?.wrapS ?? WRAP_REPEAT,
    wrapT: sampler?.wrapT ?? WRAP_REPEAT,
    minFilter: sampler?.minFilter ?? null,
    repeats: (sampler?.wrapS ?? WRAP_REPEAT) === WRAP_REPEAT || (sampler?.wrapT ?? WRAP_REPEAT) === WRAP_REPEAT,
    mipmapped: MIPMAP_FILTERS.has(sampler?.minFilter),
  }))

  // ---- 问题清单 ----
  if (report.counts.scenes === 0) {
    addIssue(issues, 'warn', 'NO_DEFAULT_SCENE',
      '文件里没有任何 scene —— glTF 规范下这样的模型不会被渲染',
      '体检无法给出包围盒与节点统计；这类文件在 Cesium 里通常表现为"加载成功但看不见"')
  }
  const unreferenced = meshes.length - meshIndexes.size
  if (unreferenced > 0) {
    addIssue(issues, 'info', 'UNREFERENCED_MESHES',
      `${unreferenced} 个网格没有被默认场景引用`,
      '这些网格不会渲染；包围盒与 accessor 盒都只统计可达网格，避免被它们带偏')
  }
  if (materials.length && usedImageIndexes.size === 0) {
    addIssue(issues, 'warn', 'NO_SAMPLED_TEXTURE',
      `${materials.length} 个材质，但没有任何贴图被材质采样`,
      '模型在 Cesium 里会呈现纯色（常见于车辆类"有材质无贴图"的资产）')
  }
  for (const image of images) {
    if (image.external && image.exists === false) {
      addIssue(issues, 'error', 'EXTERNAL_IMAGE_MISSING',
        `贴图 ${image.index} 是外部路径且文件不存在：${image.uri}`,
        'Cesium 拿不到本机文件，必须内嵌（用本工具的修复功能）')
    } else if (image.external) {
      addIssue(issues, 'warn', 'EXTERNAL_IMAGE',
        `贴图 ${image.index} 是外部路径：${image.uri}`, '需要内嵌后才能在任何环境加载')
    }
    if (image.width === 1 && image.height === 1) {
      addIssue(issues, 'warn', 'TEXTURE_1X1_PLACEHOLDER',
        `贴图 ${image.index} 是 1×1 占位图`, '多半是资产制作时的残留，视觉上无意义，可考虑剔除')
    }
  }
  const usesRepeatMipmap = report.samplers.some((sampler) => sampler.repeats && sampler.mipmapped)
  const npotImages = images.filter((image) => image.npot)
  if (usesRepeatMipmap && npotImages.length) {
    addIssue(issues, 'warn', 'NPOT_WITH_REPEAT_MIPMAP',
      `${npotImages.length} 张非 2 次幂贴图，但采样器同时使用 REPEAT + mipmap`,
      'WebGL1 下这种组合不完整（Cesium 可能显示异常），需改为 CLAMP_TO_EDGE + LINEAR')
  }
  if (missingTexCoordPrimitives > 0) {
    addIssue(issues, 'error', 'MISSING_TEXCOORD',
      `${missingTexCoordPrimitives} 个图元采样了贴图但缺少对应 TEXCOORD_n`,
      'Cesium 会因着色器编译失败而停止整个场景的渲染，必须补零 UV（本工具可自动修复）')
  }
  if (report.counts.skins) {
    addIssue(issues, 'info', 'HAS_SKINS',
      `含 ${report.counts.skins} 个蒙皮，${report.counts.animations} 个动画`,
      'Cesium 对蒙皮件支持不稳，修复时会烘焙为静态网格（可选冻结到动画某帧）')
  }
  if (nonIndexed > 0) {
    addIssue(issues, 'info', 'NON_INDEXED_PRIMITIVES', `${nonIndexed} 个图元没有索引`, '顶点复用率会偏低')
  }

  // ---- 包围盒与失真 ----
  report.bounds = glbBounds(json)
  const parts = report.bounds.deviationParts
  if (report.bounds.deviationFactor && report.bounds.deviationFactor > 10) {
    addIssue(issues, 'warn', 'ACCESSOR_BOUNDS_UNRELIABLE',
      `accessor 并集盒与真实世界盒相差 ${report.bounds.deviationFactor} 倍`,
      `accessor 盒 ${JSON.stringify(report.bounds.accessorUnionSize)} ≠ 真实 ${JSON.stringify(report.bounds.worldSize)}`
      + (parts ? `（尺寸比 ${parts.sizeRatio}、中心偏移比 ${parts.centerOffsetRatio}）` : '')
      + '；只看 accessor min/max 取景会明显错位（文件里没有独立的"包围盒"字段，只能自己算）')
  }
  if (report.geometry.vertexReuseRatio !== null && report.geometry.vertexReuseRatio >= 2.9) {
    addIssue(issues, 'info', 'TRIANGLE_SOUP',
      `顶点/面比 ${report.geometry.vertexReuseRatio}（≈3 顶点/面）`,
      '几何是未焊接的三角汤，顶点缓冲可压缩到约 1/5')
  }

  // ---- 节点矩阵病态 ----
  const nodeStats = nodeMatrixStats(json)
  report.nodes = nodeStats
  if (nodeStats.mirrored > 0) {
    addIssue(issues, 'info', 'MIRRORED_NODES',
      `${nodeStats.mirrored} 个网格节点是镜像（世界矩阵 det < 0）`,
      '合并图元时必须逐图元反转绕序，否则光照反向')
  }
  if (nodeStats.singular > 0) {
    addIssue(issues, 'warn', 'SINGULAR_NODES',
      `${nodeStats.singular} 个网格节点某一轴被压扁到 1e-6 以下（几何接近塌陷）`,
      '这类节点在视图中几乎不可见，可能是资产问题')
  }
  if (nodeStats.nonUniform > 0) {
    addIssue(issues, 'info', 'NON_UNIFORM_SCALE',
      `${nodeStats.nonUniform} 个网格节点存在非均匀缩放`, '法线需用逆转置矩阵变换')
  }

  // ---- 上轴与比例尺 ----
  report.axes = guessUpAxis(report.bounds.world, report.asset.generator)
  if (report.axes.confidence === 'low') {
    addIssue(issues, 'info', 'UP_AXIS_UNCERTAIN',
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
  return report
}

/**
 * @description 体检一个 GLB。**绝不抛异常**：任何异常都变成报告里的错误条目。
 * @param {string} filePath
 * @returns {object} 报告对象；`ok: false` 表示连读取/解析都没成功。
 */
function inspect(filePath) {
  const startedAt = Date.now()
  const report = {
    ok: false,
    inputPath: filePath,
    fileName: path.basename(typeof filePath === 'string' ? filePath : ''),
    fileBytes: null,
    issues: [],
    elapsedMs: 0,
  }

  // 外层兜底：连 statSync/extname 都可能因怪异输入抛错
  try {
    try {
      report.fileBytes = fs.statSync(filePath).size
    } catch (error) {
      addIssue(report.issues, 'error', 'FILE_UNREADABLE', `无法读取文件：${error.message}`)
      return finish(report, startedAt)
    }

    if (path.extname(filePath).toLowerCase() !== '.glb') {
      addIssue(report.issues, 'error', 'NOT_A_GLB', `只支持 .glb（当前：${path.extname(filePath)}）。其他格式请先转换`)
      return finish(report, startedAt)
    }

    let json
    let bin
    try {
      ;({ json, bin } = readGlb(filePath))
    } catch (error) {
      addIssue(report.issues, 'error', 'GLB_PARSE_FAILED', `GLB 解析失败：${error.message}`)
      return finish(report, startedAt)
    }

    report.ok = true
    try {
      analyze(report, json, bin, filePath)
    } catch (error) {
      // 结构畸形（如 meshes:[null]）不应让体检崩溃：报告标记为不完整，问题清单说明原因
      addIssue(report.issues, 'error', 'INSPECT_FAILED',
        `体检过程中出错，报告可能不完整：${error.message}`, '该文件结构异常，建议先用修复功能规整后再体检')
      report.partial = true
    }
    return finish(report, startedAt)
  } catch (error) {
    addIssue(report.issues, 'error', 'INSPECT_FAILED', `体检过程中出错：${error.message}`)
    report.partial = true
    return finish(report, startedAt)
  }
}

/** @description 把报告渲染成便于人读的中文摘要（命令行与日志共用）。 */
function formatReport(report) {
  if (!report?.ok) {
    return [
      `体检失败：${report?.fileName ?? ''}`,
      ...asArray(report?.issues).map((issue) => `  [${ISSUE_LEVELS[issue.level]}] ${issue.message}`),
    ].join('\n')
  }
  const triple = (values, digits = 2) => (values
    ? values.map((value) => value.toFixed(digits)).join(' × ')
    : '—')
  const lines = [
    `模型体检：${report.fileName}（${((report.fileBytes ?? 0) / 1048576).toFixed(2)} MB，${report.elapsedMs} ms）`,
    `  资产：glTF ${report.asset?.version ?? '?'}${report.asset?.generator ? ` · ${report.asset.generator}` : ''}`,
    `  结构：${report.counts?.nodes ?? 0} 节点 / ${report.counts?.meshes ?? 0} 网格 / ${report.counts?.primitives ?? 0} 图元 / `
      + `${report.counts?.materials ?? 0} 材质 / ${report.counts?.textures ?? 0} 贴图`,
    `  几何：${report.geometry?.vertices ?? 0} 顶点 / ${report.geometry?.triangles ?? 0} 三角面`
      + `（其中非索引 ${report.geometry?.trianglesNonIndexed ?? 0}；顶点/面比 ${report.geometry?.vertexReuseRatio ?? '—'}）`,
    `  世界盒：${triple(report.bounds?.worldSize)} m，中心 ${triple(report.bounds?.worldCenter)}`,
    `  accessor 盒：${triple(report.bounds?.accessorUnionSize)}（偏差 ${report.bounds?.deviationFactor ?? '—'} 倍）`,
    `  上轴：${report.axes?.axis ?? '—'}（${report.axes?.confidence ?? '—'}）—— ${report.axes?.reason ?? ''}`,
  ]
  if (report.scale?.hint) lines.push(`  比例尺：${report.scale.hint}`)
  if (report.partial) lines.push('  ⚠ 报告不完整（结构异常，详见下方问题）')
  if (asArray(report.issues).length) {
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
  collectTextureSlots,
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
