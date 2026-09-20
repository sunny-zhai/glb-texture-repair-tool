/**
 * FBX / OBJ → 自包含 GLB 的转换内核（REQ-007 / ADR-008）。
 *
 * 纯 Node（CommonJS），**不依赖 Electron**：assimpjs（assimp 的 emscripten/WASM 构建）在
 * 进程内把 FBX/OBJ 转成 GLB，随后本模块补上 assimp 不做的三件事：
 *
 *   ① **焊接三角汤**——assimp 产出的顶点:面实测是 3:1（`蹲姿` 56,772 顶点 / 18,924 面），
 *      这里复用 `src/ive.js` 已导出的 `weldVertices`（键覆盖全部属性，UV 缝与硬边得以保留）；
 *   ② **内嵌外部贴图**——真机 spike 实测：assimp 对 OBJ **只写 `images[].uri`，不内嵌**
 *      （即使把贴图文件一起喂进 FileList，连相对路径也仍输出为外部引用）。而预览走的是
 *      data URL，Cesium 读不到外部文件，所以必须在这里用既有的 `resolveExternalImage`
 *      （相对路径 / 同级同名 / `.fbm` 目录 / 乱码路径兜底）解析后写进 BIN；
 *   ③ **解析不到的贴图不静默丢**——换成 1×1 占位并记 `warnings`（原始 uri 一并带上），
 *      既不留读不到的 `uri`（否则模型必然加载失败），也不假装贴图还在。
 *
 * 产物直接进现有「修复 → 体检 → 预览」管线，与 IVE 完全同构；轴/贴地/蒙皮/贴图规范化
 * 全部沿用既有代码，本模块只负责"产出 GLB"。
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { PNG } = require('pngjs')

const { align4, createGlbBuffer, encodePng, readGlb, resolveExternalImage } = require('./repair')
const { weldVertices } = require('./ive')

const SOURCE_EXTENSIONS = ['.fbx', '.obj']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.tga', '.bmp', '.dds', '.tif', '.tiff', '.webp']
const COMPONENTS_BY_TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const TYPE_BY_COMPONENTS = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' }
// 焊接支持的 componentType（与 ive.js 的 COMPONENT_ARRAYS 对齐）：蒙皮图元带 JOINTS_0/WEIGHTS_0
// 这类整型属性，必须按原类型解码/回写，否则 FBX 那种带蒙皮的产物一个顶点都焊不动。
const WELDABLE_COMPONENT_TYPES = new Set([5120, 5121, 5122, 5123, 5125, 5126])
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const TRIANGLES_MODE = 4
const FLOAT = 5126
const UINT32 = 5125

function asArray(value) {
  return Array.isArray(value) ? value : []
}

/** @description 是否是本模块负责转换的源格式（FBX / OBJ）。 */
function isConvertiblePath(filePath) {
  return typeof filePath === 'string' && SOURCE_EXTENSIONS.includes(path.extname(filePath).toLowerCase())
}

let assimpFactory
let assimpLoadError = null

function resolveAssimpModule() {
  if (assimpFactory !== undefined) return assimpFactory
  try {
    assimpFactory = require('assimpjs')
  } catch (error) {
    assimpLoadError = error
    assimpFactory = null
  }
  return assimpFactory
}

/** @description assimpjs（及其 wasm）是否可用；未探测过时退化为"模块能否 require"。 */
function assimpAvailable() {
  if (assimpProbe) return assimpProbe.ok
  return typeof resolveAssimpModule() === 'function'
}

function missingAssimpMessage() {
  const reason = assimpLoadError ? assimpLoadError.message : '未安装 assimpjs 依赖'
  return `当前环境无法加载 assimpjs，FBX/OBJ 无法转换（${reason}）。请先执行 npm install 安装依赖。`
}

let assimpInstance = null
let assimpProbe = null

/**
 * @description **真正**尝试加载一次 wasm 并缓存结果。能力探测不能只看 JS 模块能否 require：
 *   实测（冷审）glue 能 require 但 `assimpjs.wasm` 读不到时，只查模块会给出假阳性——界面显示
 *   "支持 FBX/OBJ"，而每次转换必然失败。
 */
async function probeAssimp() {
  if (assimpProbe) return assimpProbe
  try {
    const factory = resolveAssimpModule()
    if (typeof factory !== 'function') throw new Error(missingAssimpMessage())
    assimpInstance = await factory()
    assimpProbe = { ok: true, error: '' }
  } catch (error) {
    assimpLoadError = error
    assimpInstance = null
    assimpProbe = { ok: false, error: error.message }
  }
  return assimpProbe
}

async function loadAssimp() {
  if (assimpInstance) return assimpInstance
  const probe = await probeAssimp()
  if (!probe.ok) throw new Error(missingAssimpMessage())
  return assimpInstance
}

function safeReadDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    return []
  }
}

/** @description 从 OBJ 文本里读 `mtllib` 声明（3ds Max 等导出器常写非 UTF-8，只取文件名部分）。 */
function readDeclaredMaterials(inputPath) {
  if (path.extname(inputPath).toLowerCase() !== '.obj') return []
  let text
  try {
    text = fs.readFileSync(inputPath, 'latin1')
  } catch (error) {
    return []
  }
  const names = []
  for (const match of text.matchAll(/^[ \t]*mtllib[ \t]+(.+?)[ \t]*$/gim)) {
    const raw = match[1].trim().replace(/["']/g, '')
    const base = raw.split(/[\\/]/).pop()
    if (base) names.push(base)
  }
  return names
}

/**
 * @description 收集要一起喂给 assimp 的 sidecar：主文件 + `.mtl` + 同目录（含任意 `*.fbm`
 *   子目录）里的贴图。**按 basename 加入**——assimp 靠文件名互相引用，OBJ/MTL 里那些
 *   Windows 绝对路径不可能在本机命中，同名文件才是唯一有机会被用上的形式。
 */
function collectSidecarFiles(inputPath) {
  const dir = path.dirname(inputPath)
  const stem = path.basename(inputPath, path.extname(inputPath))
  const files = new Map()
  const add = (filePath) => {
    const base = path.basename(filePath)
    if (!files.has(base)) files.set(base, filePath)
  }

  add(inputPath)
  for (const name of readDeclaredMaterials(inputPath)) {
    const declared = path.join(dir, name)
    if (fs.existsSync(declared)) add(declared)
  }
  const sameStemMtl = path.join(dir, `${stem}.mtl`)
  if (fs.existsSync(sameStemMtl)) add(sameStemMtl)

  const textureDirs = [dir]
  for (const entry of safeReadDir(dir)) {
    if (entry.isDirectory() && entry.name.toLowerCase().endsWith('.fbm')) {
      textureDirs.push(path.join(dir, entry.name))
    }
  }
  for (const textureDir of textureDirs) {
    for (const entry of safeReadDir(textureDir)) {
      if (entry.isFile() && IMAGE_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        add(path.join(textureDir, entry.name))
      }
    }
  }

  return [...files.entries()].map(([name, filePath]) => ({ name, filePath }))
}

function onePixelPng() {
  const png = new PNG({ width: 1, height: 1 })
  png.data[0] = 255
  png.data[1] = 255
  png.data[2] = 255
  png.data[3] = 255
  return PNG.sync.write(png)
}

/** @description 追加式 bufferView 写入器：每次追加都补齐 4 字节对齐，并返回新 view 的下标。 */
function createAppender(json, chunks) {
  let offset = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  return {
    addView(bytes, target) {
      const byteOffset = offset
      chunks.push(bytes)
      offset += bytes.length
      const padding = align4(offset) - offset
      if (padding > 0) {
        chunks.push(Buffer.alloc(padding))
        offset += padding
      }
      const view = { buffer: 0, byteOffset, byteLength: bytes.length }
      if (target) view.target = target
      json.bufferViews.push(view)
      return json.bufferViews.length - 1
    },
  }
}

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

/** @description 取某个 accessor 自己的字节区间（**必须**算上 `accessor.byteOffset`）。 */
function accessorBytes(bin, view, accessor) {
  const bytesPerComponent = COMPONENT_BYTES[accessor.componentType] || 0
  const components = COMPONENTS_BY_TYPE[accessor.type] || 0
  const length = bytesPerComponent * components * accessor.count
  const start = view.byteOffset + (accessor.byteOffset || 0)
  return bin.subarray(start, start + length)
}

function positionMinMax(bytes, count) {
  const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let vertex = 0; vertex < count; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = values[vertex * 3 + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  return { min, max }
}

/**
 * @description 焊接所有三角形图元的顶点（复用 `weldVertices`）。新数据追加为新 bufferView，
 *   并**原地改写**图元自己那几个 accessor（而不是新增 accessor）——否则旧 accessor 仍然引用
 *   旧 bufferView，`compactBufferViews` 就回收不掉旧顶点数据（实测 FBX 会从 4.7MB 涨到 5.6MB）。
 *
 *   **保守跳过**（原地改写的前提是"这些 accessor 只属于这一个图元、且没有偏移"）：被多个图元
 *   引用、被动画 sampler / skins / morph targets 引用、`accessor.byteOffset` 非 0、一个
 *   bufferView 被多个 accessor 共用、或图元带 morph targets 的，一律原样保留。
 *   冷审给过两个可复现反例：`byteOffset:4` 的 POSITION 会被读错并写出错位几何；
 *   POSITION 兼作动画 output 时会被连动画一起改坏（count 6→4）。
 *   只处理**非交错**图元；不满足条件（或没有可合并顶点）时原样保留。
 * @returns {{welded:number, before:number, after:number, primitives:number}}
 * @remarks 导出仅供单测直接构造反例（正常调用只走 `convertToGlb`）。
 */
function weldPrimitives(json, chunks) {
  const appender = createAppender(json, chunks)
  const stats = { welded: 0, before: 0, after: 0, primitives: 0 }
  const accessors = json.accessors || []
  const bufferViews = json.bufferViews || []
  const bin = chunks[0]

  // accessor 的引用计数：>1 说明被别处共享，原地改写会波及别人。
  // 必须把**所有**引用方都数进来——冷审的反例就是只数了图元、漏了动画 sampler。
  const usage = new Map()
  const countUsage = (index) => {
    if (!Number.isInteger(index)) return
    usage.set(index, (usage.get(index) || 0) + 1)
  }
  for (const mesh of asArray(json.meshes)) {
    for (const primitive of asArray(mesh && mesh.primitives)) {
      for (const accessorIndex of Object.values((primitive && primitive.attributes) || {})) countUsage(accessorIndex)
      countUsage(primitive && primitive.indices)
      for (const target of asArray(primitive && primitive.targets)) {
        for (const accessorIndex of Object.values(target || {})) countUsage(accessorIndex)
      }
    }
  }
  for (const animation of asArray(json.animations)) {
    for (const sampler of asArray(animation && animation.samplers)) {
      countUsage(sampler && sampler.input)
      countUsage(sampler && sampler.output)
    }
  }
  for (const skin of asArray(json.skins)) countUsage(skin && skin.inverseBindMatrices)

  // 一个 bufferView 被多个 accessor 共用时，追加新 view 并改写其一会让另一个错位
  const accessorsPerView = new Map()
  for (const accessor of accessors) {
    if (!Number.isInteger(accessor && accessor.bufferView)) continue
    accessorsPerView.set(accessor.bufferView, (accessorsPerView.get(accessor.bufferView) || 0) + 1)
  }

  for (const mesh of asArray(json.meshes)) {
    for (const primitive of asArray(mesh && mesh.primitives)) {
      if (!primitive || !primitive.attributes) continue
      if (primitive.mode !== undefined && primitive.mode !== TRIANGLES_MODE) continue
      if (!Number.isInteger(primitive.indices)) continue
      // morph targets 是逐顶点的增量，焊接会改变顶点数 —— 一律跳过
      if (asArray(primitive.targets).length > 0) continue

      const entries = Object.entries(primitive.attributes)
      if (entries.some(([, accessorIndex]) => usage.get(accessorIndex) !== 1)) continue
      if (usage.get(primitive.indices) !== 1) continue

      const streams = []
      let supported = true
      for (const [name, accessorIndex] of entries) {
        const accessor = accessors[accessorIndex]
        const view = accessor ? bufferViews[accessor.bufferView] : null
        const components = accessor ? COMPONENTS_BY_TYPE[accessor.type] : 0
        if (!accessor || !view || view.byteStride || !components
          || !WELDABLE_COMPONENT_TYPES.has(accessor.componentType)
          // 有偏移或与别的 accessor 共用 view 时不改写（改写只保证"独占且无偏移"这一种形状）
          || accessor.byteOffset
          || accessorsPerView.get(accessor.bufferView) !== 1) {
          supported = false
          break
        }
        streams.push({
          name,
          components,
          count: accessor.count,
          bytes: accessorBytes(bin, view, accessor),
          componentType: accessor.componentType,
          normalized: accessor.normalized === true,
        })
      }
      const indexAccessor = accessors[primitive.indices]
      const indexView = indexAccessor ? bufferViews[indexAccessor.bufferView] : null
      if (!supported || !streams.length || !indexAccessor || !indexView || indexAccessor.componentType !== UINT32) continue
      if (indexAccessor.byteOffset || accessorsPerView.get(indexAccessor.bufferView) !== 1) continue

      stats.before += streams[0].count
      const welded = weldVertices(streams, accessorBytes(bin, indexView, indexAccessor), indexAccessor.count)
      if (!welded) {
        stats.after += streams[0].count
        continue
      }

      for (const attribute of welded.attributes) {
        const sourceStream = streams.find((stream) => stream.name === attribute.name)
        const accessor = accessors[primitive.attributes[attribute.name]]
        accessor.bufferView = appender.addView(attribute.bytes, ARRAY_BUFFER)
        accessor.componentType = attribute.componentType || FLOAT
        accessor.count = attribute.count
        accessor.type = TYPE_BY_COMPONENTS[attribute.components]
        if (sourceStream && sourceStream.normalized) accessor.normalized = true
        else delete accessor.normalized
        if (attribute.name === 'POSITION' && accessor.componentType === FLOAT) {
          Object.assign(accessor, positionMinMax(attribute.bytes, attribute.count))
        } else {
          delete accessor.min
          delete accessor.max
        }
      }
      // 焊接后的索引一律 uint32（`weldVertices` 的约定），类型与长度都要跟着改
      indexAccessor.bufferView = appender.addView(welded.indices.bytes, ELEMENT_ARRAY_BUFFER)
      indexAccessor.componentType = UINT32
      indexAccessor.count = welded.indices.count

      stats.after += welded.after
      stats.primitives += 1
      stats.welded += 1
    }
  }
  return stats
}

/**
 * @description 把产物里的外部贴图解析并内嵌。解析不到的**换成 1×1 占位**并记 warning：
 *   留一个读不到的 `uri` 会让 Cesium 必然加载失败，直接删掉又等于静默丢贴图。
 */
function embedExternalImages(inputPath, json, chunks) {
  const appender = createAppender(json, chunks)
  const warnings = []
  const stats = { embedded: 0, replaced: 0 }
  const images = asArray(json.images)

  for (const image of images) {
    if (!image || typeof image.uri !== 'string') continue
    const originalUri = image.uri
    try {
      const resolved = resolveExternalImage(inputPath, originalUri)
      const bytes = encodePng(resolved.bytes)
      image.bufferView = appender.addView(bytes)
      image.mimeType = 'image/png'
      delete image.uri
      stats.embedded += 1
    } catch (error) {
      image.bufferView = appender.addView(onePixelPng())
      image.mimeType = 'image/png'
      image.name = `missing:${originalUri}`
      delete image.uri
      stats.replaced += 1
      warnings.push(`贴图“${path.basename(originalUri)}”未能解析，已用 1×1 占位替换（原路径：${originalUri}）。${error.message}`)
    }
  }
  return { warnings, stats }
}

/** @description 丢掉不再被 accessor / image 引用的 bufferView，并重编下标（焊接后的旧数据靠它回收）。 */
function compactBufferViews(json, bin) {
  const accessors = asArray(json.accessors)
  const images = asArray(json.images)
  const used = new Set()
  for (const accessor of accessors) {
    if (Number.isInteger(accessor && accessor.bufferView)) used.add(accessor.bufferView)
    // sparse accessor 的 indices/values 也引用 bufferView——漏掉会把它们回收掉
    for (const part of [accessor && accessor.sparse && accessor.sparse.indices, accessor && accessor.sparse && accessor.sparse.values]) {
      if (Number.isInteger(part && part.bufferView)) used.add(part.bufferView)
    }
  }
  for (const image of images) {
    if (Number.isInteger(image && image.bufferView)) used.add(image.bufferView)
  }
  // 注意：Draco / meshopt 的压缩数据靠 extensions 里的 bufferView 引用，assimp 的 glb2 不产出，
  // 一旦将来接入这类产物，这里必须把 extensions 里的引用也补进 used，否则会回收掉压缩数据。

  const oldViews = asArray(json.bufferViews)
  const newViews = []
  const chunks = []
  const remap = new Map()
  let offset = 0
  for (const oldIndex of [...used].sort((a, b) => a - b)) {
    const view = oldViews[oldIndex]
    if (!view) continue
    const bytes = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)
    const newView = { ...view, buffer: 0, byteOffset: offset, byteLength: bytes.length }
    chunks.push(bytes)
    offset += bytes.length
    const padding = align4(offset) - offset
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding))
      offset += padding
    }
    remap.set(oldIndex, newViews.length)
    newViews.push(newView)
  }

  for (const accessor of accessors) {
    if (Number.isInteger(accessor && accessor.bufferView)) accessor.bufferView = remap.get(accessor.bufferView)
  }
  for (const image of images) {
    if (Number.isInteger(image && image.bufferView)) image.bufferView = remap.get(image.bufferView)
  }
  json.bufferViews = newViews
  json.buffers = [{ byteLength: offset }]
  return Buffer.concat(chunks, offset)
}

/** @description 以 glTF 口径统计几何（顶点 = POSITION 的 count，面 = 索引数 / 3）。 */
function geometryStats(json) {
  const accessors = asArray(json.accessors)
  let vertices = 0
  let triangles = 0
  let meshes = 0
  let primitives = 0
  for (const mesh of asArray(json.meshes)) {
    meshes += 1
    for (const primitive of asArray(mesh && mesh.primitives)) {
      primitives += 1
      const position = primitive && primitive.attributes ? primitive.attributes.POSITION : undefined
      if (Number.isInteger(position)) vertices += (accessors[position] && accessors[position].count) || 0
      if (Number.isInteger(primitive && primitive.indices)) {
        triangles += Math.round(((accessors[primitive.indices] && accessors[primitive.indices].count) || 0) / 3)
      }
    }
  }
  return { vertices, triangles, meshes, primitives }
}

/** @description 把内存里的 GLB 字节解析成 { json, bin }（`readGlb` 只吃路径，这里借临时文件复用同一套解析）。 */
function parseGlbBytes(bytes) {
  const tempFile = path.join(os.tmpdir(), `glb-convert-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.glb`)
  try {
    // writeFileSync 也放进 try：只写了一半就失败时同样要清掉这个临时文件
    fs.writeFileSync(tempFile, bytes)
    return readGlb(tempFile)
  } finally {
    fs.rmSync(tempFile, { force: true })
  }
}

/**
 * @description 把一个 FBX/OBJ 转成**自包含** GLB。**永不抛**（与 `repairGlbFile` 同风格）：
 *   失败时返回 `status:'error'` 与中文原因，批量转换才能继续跑后面的文件。
 * @param {string} inputPath FBX / OBJ 的绝对路径
 * @param {{weld?: boolean}} [options] `weld:false` 关闭焊接（默认开启）
 * @returns {Promise<{status:'success'|'error', bytes?:Buffer, warnings:string[], stats?:object, error?:string}>}
 * @remarks **已知代价（冷审实测）**：`ConvertFileList` 是同步 wasm，单个 FBX 约 4~6 秒会独占
 *   主进程（期间窗口按钮无响应）；实例常驻复用，重复转换时 wasm 侧内存会增长（OBJ×15 实测
 *   48→135MB 无平台期，FBX×5 到 ~107MB 后趋平）。几十个 FBX 的批量应做一次 soak，
 *   后续可考虑挪到 utilityProcess/worker 里跑。
 */
async function convertToGlb(inputPath, options = {}) {
  const result = { status: 'error', warnings: [] }
  if (!isConvertiblePath(inputPath)) {
    result.error = `只支持 FBX / OBJ 转换：${inputPath}`
    return result
  }
  if (!fs.existsSync(inputPath)) {
    result.error = `文件不存在：${inputPath}`
    return result
  }

  try {
    const assimp = await loadAssimp()
    const sidecars = collectSidecarFiles(inputPath)
    const fileList = new assimp.FileList()
    for (const file of sidecars) {
      fileList.AddFile(file.name, new Uint8Array(fs.readFileSync(file.filePath)))
    }

    const started = Date.now()
    const converted = assimp.ConvertFileList(fileList, 'glb2')
    if (!converted.IsSuccess() || converted.FileCount() === 0) {
      result.error = `assimp 转换失败（errorCode=${converted.GetErrorCode()}）：${path.basename(inputPath)}`
      return result
    }
    const raw = Buffer.from(converted.GetFile(0).GetContent())
    const { json, bin } = parseGlbBytes(raw)
    json.bufferViews = asArray(json.bufferViews)
    json.accessors = asArray(json.accessors)
    json.meshes = asArray(json.meshes)
    json.images = asArray(json.images)

    const chunks = [bin]
    const weld = options.weld === false
      ? { before: 0, after: 0, primitives: 0 }
      : weldPrimitives(json, chunks)

    const embedded = embedExternalImages(inputPath, json, chunks)
    result.warnings.push(...embedded.warnings)

    const finalBin = compactBufferViews(json, Buffer.concat(chunks))
    const bytes = createGlbBuffer(json, finalBin)
    const geometry = geometryStats(json)

    result.status = 'success'
    result.bytes = bytes
    result.stats = {
      ...geometry,
      weldedPrimitives: weld.primitives,
      verticesBeforeWeld: weld.before || geometry.vertices,
      bytesIn: fs.statSync(inputPath).size,
      bytesOut: bytes.length,
      elapsedMs: Date.now() - started,
      sidecars: sidecars.length,
      // 产物里的贴图总数（FBX 的贴图本来就内嵌，embeddedImages 会是 0，不能拿它当"贴图张数"）
      images: asArray(json.images).length,
      embeddedImages: embedded.stats.embedded,
      replacedImages: embedded.stats.replaced,
      generator: (json.asset && json.asset.generator) || '',
    }
    return result
  } catch (error) {
    result.error = `FBX/OBJ 转换失败：${error.message}`
    return result
  }
}

/**
 * @description 批量转换：逐个文件调用 `convertToGlb`，**单个失败不中断**（与 `repairMany` 同语义）。
 * @returns {Promise<Array<object>>} 每项含 `inputPath` 与 `convertToGlb` 的结果字段
 */
async function convertManyToGlb(inputPaths, options = {}) {
  const reports = []
  for (const inputPath of inputPaths) {
    const converted = await convertToGlb(inputPath, options)
    reports.push({ inputPath, ...converted })
  }
  return reports
}

module.exports = {
  assimpAvailable,
  collectSidecarFiles,
  convertManyToGlb,
  convertToGlb,
  isConvertiblePath,
  missingAssimpMessage,
  // 能力探测：真正加载一次 wasm（只查模块会有假阳性）
  probeAssimp,
  // 仅供单测直接构造"不该焊接"的反例（正常路径只走 convertToGlb）
  weldPrimitives,
}
