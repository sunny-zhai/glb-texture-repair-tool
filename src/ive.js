// IVE（OpenSceneGraph 场景格式）→ GLB 转换。
//
// IVE 是 OpenSceneGraph 的私有序列化格式，纯 JS 生态没有解析器，因此这里调用
// native/ive2glb 编译出的原生助手完成"读取 IVE"，再由本模块把中间产物组装为
// 自包含的 GLB。这样格式生成与贴图编码仍留在 Node 侧，与 repair.js 手写 GLB
// 的约定保持一致，也便于用 node --test 直接覆盖。
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const jpeg = require('jpeg-js')
const { PNG } = require('pngjs')
const {
  align4,
  identityMatrix,
  transformPoint,
  writeGlb,
} = require('./repair')
const { worldBounds: transformWorldBounds } = require('./transform')

// ---------------------------------------------------------------- 常量

const GL = {
  UNSIGNED_BYTE: 5121,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  FLOAT: 5126,
  RGB: 6407,
  RGBA: 6408,
  RED: 6403,
  LUMINANCE: 6409,
  ALPHA: 6410,
  LUMINANCE_ALPHA: 6411,
  BGR: 32992,
  BGRA: 32993,
  RG: 33319,
}

const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

// 每个像素格式对应的字节通道顺序，用于展开为 RGBA。
const PIXEL_CHANNELS = {
  [GL.RGB]: 'RGB',
  [GL.BGR]: 'BGR',
  [GL.RGBA]: 'RGBA',
  [GL.BGRA]: 'BGRA',
  [GL.RED]: 'R',
  [GL.LUMINANCE]: 'R',
  [GL.ALPHA]: 'A',
  [GL.RG]: 'RG',
  [GL.LUMINANCE_ALPHA]: 'RA',
}

const IMAGE_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
}

// ---------------------------------------------------------------- 助手定位

function platformDirectory() {
  return `${process.platform}-${process.arch}`
}

/**
 * @description 列出查找 vendored 助手的根目录，**unpacked 优先**。
 *
 * 打包后 `asarUnpack` 的文件在 asar 索引里仍然可见，`fs.statSync` 对 asar 内路径也会成功，
 * 但 asar 内的文件**不能被执行**（`spawnSync` 直接报 ENOTDIR）。所以必须先看
 * `app.asar.unpacked`；开发态两个根目录是同一个路径，此时只查一次，避免 searched 出现重复项。
 */
function vendorRootsFor(dirname) {
  const vendorRoot = path.join(dirname, '..', 'vendor', 'ive2glb')
  const unpackedRoot = vendorRoot.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  return unpackedRoot === vendorRoot ? [vendorRoot] : [unpackedRoot, vendorRoot]
}

/**
 * @description 建一个"查助手"的小工具集，供 resolveIveHelper / resolveWasmHelper 共用。
 *
 * `isFile` 会对同一个候选去重：覆盖值先按文件校验、再按"成对存在"复核时会被查两次，
 * 不去重的话 `searched` 里会出现重复路径（BR-012 要求"逐条列出已查找路径"，
 * 重复项看起来像缺陷）。
 */
function makeHelperResolver() {
  const searched = []
  const roots = vendorRootsFor(__dirname)

  const isFile = (candidate) => {
    if (!searched.includes(candidate)) searched.push(candidate)
    try {
      return fs.statSync(candidate).isFile()
    } catch {
      return false
    }
  }

  const nativeHelper = (file) => ({ kind: 'native', path: file, command: file, prefixArgs: [], available: true, searched })
  // WASM 助手由 Node 起进程；.wasm 必须与 .js 成对存在，只检查 .js 会得到一个
  // 起得来但读不到模块的「假可用」，错误信息也会指向别处。
  const wasmHelper = (script) => ({ kind: 'wasm', path: script, command: process.execPath, prefixArgs: [script], available: true, searched })
  const wasmHelperUsable = (script) => {
    const binary = path.join(path.dirname(script), 'ive2glb.wasm')
    const scriptPresent = isFile(script)
    const binaryPresent = isFile(binary)
    return scriptPresent && binaryPresent
  }

  return { searched, roots, isFile, nativeHelper, wasmHelper, wasmHelperUsable }
}

/**
 * @description 解析 IVE 转换助手，兼容源码运行、asar 打包与非默认安装位置。
 *
 * 两种形态，优先级从高到低：
 *   ① 本平台的原生可执行文件 `vendor/ive2glb/<platform>-<arch>/ive2glb[.exe]`
 *   ② 跨平台的 WASM 助手 `vendor/ive2glb/wasm/ive2glb.js` + `ive2glb.wasm`
 * WASM 需要由 Node 起进程（打包态是 Electron 的 Node，见 runHelper），因此
 * win32-x64 / linux-x64 / darwin-x64 不再需要各自的预编译助手（REQ-012 / ADR-012）。
 *
 * 解析顺序是**开发态**的取舍：原生助手更快且本机已实测与 WASM 逐字节等价，所以先试它。
 * **发布形态**只带 WASM（`package.json` 的 files/asarUnpack 只放 `vendor/ive2glb/wasm/**`），
 * 因此安装后的应用不会看到原生助手，标准 2「包内不含平台相关的原生可执行文件」由此成立。
 *
 * @returns {{ kind: 'native'|'wasm'|'', path: string, command: string, prefixArgs: string[],
 *   available: boolean, searched: string[] }}
 */
function resolveIveHelper() {
  const executable = process.platform === 'win32' ? 'ive2glb.exe' : 'ive2glb'
  const { searched, roots, isFile, nativeHelper, wasmHelper, wasmHelperUsable } = makeHelperResolver()

  const missing = { kind: '', path: '', command: '', prefixArgs: [], available: false, searched }

  // 显式覆盖优先。覆盖值无效时继续按内置路径查找（保持既有语义，不因写错就整条不可用）；
  // 指向 .js 时按 WASM 助手处理——这是测试与排障时钉住实现的手段。
  if (process.env.GLB_REPAIR_IVE2GLB && isFile(process.env.GLB_REPAIR_IVE2GLB)) {
    const override = process.env.GLB_REPAIR_IVE2GLB
    if (/\.js$/i.test(override)) {
      if (wasmHelperUsable(override)) return wasmHelper(override)
    } else {
      return nativeHelper(override)
    }
  }

  for (const root of roots) {
    const candidate = path.join(root, platformDirectory(), executable)
    if (isFile(candidate)) {
      return nativeHelper(candidate)
    }
  }

  for (const root of roots) {
    const script = path.join(root, 'wasm', 'ive2glb.js')
    if (wasmHelperUsable(script)) return wasmHelper(script)
  }

  return missing
}

/**
 * @description 只解析跨平台的 WASM 助手（不看平台原生目录），用于"原生助手存在却起不来"时的回退。
 *
 * 场景：原生助手的文件在、但进程起不来（未签名/被隔离/部分解包/权限不足）。
 * WASM 助手能顶上，没必要把 IVE 能力整体丢掉，也不必让用户先去手工删目录。
 *
 * @returns {{ kind: 'wasm', path: string, command: string, prefixArgs: string[],
 *   available: boolean, searched: string[] }|null}
 */
function resolveWasmHelper() {
  const { roots, wasmHelper, wasmHelperUsable } = makeHelperResolver()
  for (const root of roots) {
    const script = path.join(root, 'wasm', 'ive2glb.js')
    if (wasmHelperUsable(script)) return wasmHelper(script)
  }
  return null
}

/**
 * @description 判断某平台是否已提供 IVE 转换助手（原生或 WASM）。
 */
function iveConversionAvailable() {
  return resolveIveHelper().available
}

function missingIveHelperMessage() {
  const helper = resolveIveHelper()
  return [
    `当前平台（${platformDirectory()}）缺少 IVE 转换助手 ive2glb。`,
    '请在 native/ive2glb 下构建后执行 scripts/build-ive2glb.sh 放入 vendor/ive2glb/，',
    '或执行 scripts/build-ive2glb-wasm.sh 产出跨平台的 WASM 助手，',
    `或设置环境变量 GLB_REPAIR_IVE2GLB 指向可执行文件。已查找：${helper.searched.join('、')}`,
  ].join('')
}

// ---------------------------------------------------------------- 中间产物

function isIvePath(filePath) {
  return typeof filePath === 'string' && path.extname(filePath).toLowerCase() === '.ive'
}

function runHelper(helper, inputPath, outputDir) {
  // WASM 助手是个 .js，必须由 Node 执行。打包态 process.execPath 是 Electron 可执行文件，
  // 需要 ELECTRON_RUN_AS_NODE=1 让它以 Node 模式运行；开发态（纯 node）该变量无副作用。
  const env = helper.kind === 'wasm'
    ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    : process.env
  const result = spawnSync(helper.command, [...helper.prefixArgs, inputPath, outputDir], {
    encoding: 'utf8',
    timeout: 30 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
    env,
  })
  if (result.error) {
    const error = new Error(`调用 IVE 转换助手失败：${result.error.message}`)
    // 标记为「起不来」而不是「转换失败」：调用方据此决定是否回退到 WASM 助手。
    error.launchFailure = true
    throw error
  }

  const stdout = (result.stdout || '').trim()
  const lastLine = stdout.split('\n').filter(Boolean).pop() || ''
  let summary = null
  try {
    summary = JSON.parse(lastLine)
  } catch {
    summary = null
  }

  if (!summary) {
    const detail = (result.stderr || '').trim() || lastLine || `退出码 ${result.status}`
    const error = new Error(`IVE 转换助手未返回有效结果：${detail}`)
    // 没有可解析的结果同样属于「起不来」（被杀掉、动态库缺失等），允许回退 WASM。
    error.launchFailure = true
    throw error
  }
  if (summary.status !== 'success' || result.status !== 0) {
    throw new Error(summary.error || 'IVE 转换失败')
  }
  return summary
}

// ---------------------------------------------------------------- 贴图编码

/**
 * @description 把助手导出的原始像素展开为自上而下的 RGBA。
 *   OSG 的 Image 以 OpenGL 约定存放（BOTTOM_LEFT），PNG/JPEG 则是自上而下，
 *   因此这里按行倒序读取，否则贴图会上下颠倒。
 */
function readImagePixels(record, bin) {
  const channels = PIXEL_CHANNELS[record.pixelFormat]
  if (!channels) {
    throw new Error(`不支持的贴图像素格式：${record.pixelFormat}`)
  }
  if (record.dataType !== GL.UNSIGNED_BYTE) {
    throw new Error(`暂不支持 ${record.dataType} 数据类型的贴图（仅支持 8 位通道）`)
  }

  const { width, height, rowBytes, offset } = record
  const source = bin.subarray(offset, offset + record.length)
  const bytesPerPixel = channels.length
  const flip = record.origin !== 'TOP_LEFT'
  const rgba = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const sourceRow = flip ? height - 1 - y : y
    const rowStart = sourceRow * rowBytes
    let target = y * width * 4
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + x * bytesPerPixel
      let r = 255
      let g = 255
      let b = 255
      let a = 255
      switch (channels) {
        case 'RGB': r = source[i]; g = source[i + 1]; b = source[i + 2]; break
        case 'BGR': b = source[i]; g = source[i + 1]; r = source[i + 2]; break
        case 'RGBA': r = source[i]; g = source[i + 1]; b = source[i + 2]; a = source[i + 3]; break
        case 'BGRA': b = source[i]; g = source[i + 1]; r = source[i + 2]; a = source[i + 3]; break
        case 'R': r = g = b = source[i]; break
        case 'A': a = source[i]; break
        case 'RA': r = g = b = source[i]; a = source[i + 1]; break
        case 'RG': r = g = b = source[i]; a = source[i + 1]; break
        default: break
      }
      rgba[target] = r
      rgba[target + 1] = g
      rgba[target + 2] = b
      rgba[target + 3] = a
      target += 4
    }
  }
  return { rgba, hasAlpha: channels.includes('A') || channels === 'RGBA' || channels === 'BGRA' || channels === 'A' }
}

function encodeImage(record, bin, options) {
  const { rgba, hasAlpha } = readImagePixels(record, bin)
  // 带透明通道的贴图必须走 PNG，JPEG 会直接丢掉 alpha。
  const useJpeg = options.keepJpeg !== false && !hasAlpha
  if (useJpeg) {
    const encoded = jpeg.encode({ data: rgba, width: record.width, height: record.height }, options.jpegQuality ?? 90)
    return { bytes: Buffer.from(encoded.data), mimeType: IMAGE_MIME.jpeg, encoding: 'jpeg', hasAlpha }
  }
  const png = new PNG({ width: record.width, height: record.height })
  rgba.copy(png.data)
  return { bytes: PNG.sync.write(png), mimeType: IMAGE_MIME.png, encoding: 'png', hasAlpha }
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0
}

// ---------------------------------------------------------------- GLB 组装

/** @description 顺序写入 BIN 区块，并保持每段 4 字节对齐。 */
function createBinBuilder() {
  const parts = []
  let length = 0
  return {
    push(buffer) {
      const offset = length
      parts.push(buffer)
      length += buffer.length
      const padding = align4(buffer.length) - buffer.length
      if (padding > 0) {
        parts.push(Buffer.alloc(padding))
        length += padding
      }
      return { byteOffset: offset, byteLength: buffer.length }
    },
    length() {
      return length
    },
    toBuffer() {
      return Buffer.concat(parts, length)
    },
  }
}

function accessorFor(view, accessor) {
  return { bufferView: view.index, ...accessor }
}

function buildAccessor(view, type, componentType, count, extra = {}) {
  return accessorFor(view, {
    componentType,
    count,
    type,
    ...extra,
  })
}

function positionBounds(bin) {
  const values = new Float32Array(bin.buffer, bin.byteOffset, bin.length / 4)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < values.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      const value = values[i + c]
      if (value < min[c]) min[c] = value
      if (value > max[c]) max[c] = value
    }
  }
  if (!Number.isFinite(min[0])) return null
  return { min, max }
}

// ---------------------------------------------------------------- 坐标约定转换
//
// OSG / IVE 用的是 Z-up 右手系，而 glTF 规定 Y-up。直接把 Z-up 的坐标写进 glTF
// 容器，模型会在 Cesium 里"躺倒"（实测：蹲姿的 X 与参考件完全一致，但 Y/Z 互换）。
// 这里采用与 FBX2glTF 相同的 -90° 绕 X 旋转：(x, y, z) → (x, z, -y)。
//
// 矩阵按 glTF 的列主序展开，m[col * 4 + row]。
const UP_AXIS_ROTATIONS = {
  // Z-up → Y-up：e_x→(1,0,0)，e_y→(0,0,-1)，e_z→(0,1,0)
  Z: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
  // X-up → Y-up：(x,y,z)→(z,x,y)
  X: [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  // 已是 Y-up，不需要旋转
  Y: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
}

const IDENTITY_MATRIX = identityMatrix()

/**
 * @description 只旋转向量/平移量，不带矩阵的平移列，也不归一化。
 *   不复用 repair.js 的 transformVector：那个会归一化，用法它是对的（法线），
 *   但节点平移量归一化之后长度就错了。
 */
function rotateVector(matrix, vector) {
  return [
    matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2],
    matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2],
    matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2],
  ]
}

function linearPartIsIdentity(matrix) {
  return Math.abs(matrix[0] - 1) < 1e-6 && Math.abs(matrix[5] - 1) < 1e-6 && Math.abs(matrix[10] - 1) < 1e-6
    && [matrix[1], matrix[2], matrix[4], matrix[6], matrix[8], matrix[9]].every((v) => Math.abs(v) < 1e-6)
}

/**
 * @description 按 POSITION 的 accessor min/max 求每个网格局限包围盒。
 */
function meshLocalBounds(intermediate) {
  return (intermediate.meshes || []).map((mesh) => {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (const primitive of mesh.primitives || []) {
      const attribute = primitive.attributes?.POSITION
      if (!attribute) continue
      const bounds = positionBounds(intermediate.bin.subarray(attribute.offset, attribute.offset + attribute.length))
      if (!bounds) continue
      for (let c = 0; c < 3; c += 1) {
        min[c] = Math.min(min[c], bounds.min[c])
        max[c] = Math.max(max[c], bounds.max[c])
      }
    }
    return Number.isFinite(min[0]) ? { min, max } : null
  })
}

/**
 * @description 沿节点链累乘矩阵求世界包围盒（局部盒来自 IVE 中间产物的裸 float 区段）。
 *   工具里的 getPositionBounds 用的是 accessor 并集（不含节点矩阵），实测最大偏差可达
 *   9 万倍，所以贴地/归心必须自己走一遍场景图，不能复用那个结果。
 *   遍历与矩阵累乘收敛在 src/transform.js —— GLB 路径（体检）用的是同一份实现，
 *   只是局部盒来自 accessor min/max。两处各写一遍迟早漂移。
 */
function worldBounds(intermediate, nodes, scenes) {
  return transformWorldBounds(nodes, scenes, meshLocalBounds(intermediate))
}

/**
 * @description 计算"上轴转换 + 贴地 + 水平归心"的仿射矩阵。
 *   节点线性部分全为单位阵时走 bake（直接改写顶点，顺带让 accessor min/max 与真实盒一致），
 *   否则退化为 root（挂一个转换根节点），两种模式渲染结果相同，只是前者附带正确的包围盒。
 */
function createAxisConversion(intermediate, nodes, scenes, options) {
  const sourceUp = options.upAxis === undefined || options.upAxis === null
    ? 'Z'
    : String(options.upAxis).toUpperCase()
  const rotation = sourceUp === 'NONE' ? null : UP_AXIS_ROTATIONS[sourceUp] || null
  const ground = options.ground !== false
  const centerXZ = options.centerXZ !== false
  const before = worldBounds(intermediate, nodes, scenes)
  if (!before) {
    return { mode: 'none', before: null, after: null, label: '', translation: [0, 0, 0], rotation: null }
  }

  // 先把世界盒的 8 个角旋转到目标轴系，再在目标轴系里定平移量。
  const rotationMatrix = rotation || IDENTITY_MATRIX
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (let corner = 0; corner < 8; corner += 1) {
    const point = transformPoint(rotationMatrix, [
      corner & 1 ? before.max[0] : before.min[0],
      corner & 2 ? before.max[1] : before.min[1],
      corner & 4 ? before.max[2] : before.min[2],
    ])
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], point[c])
      max[c] = Math.max(max[c], point[c])
    }
  }

  const translation = [
    centerXZ ? -(min[0] + max[0]) / 2 : 0,
    ground ? -min[1] : 0,
    centerXZ ? -(min[2] + max[2]) / 2 : 0,
  ]
  if (!rotation && translation.every((v) => v === 0)) {
    return { mode: 'none', before, after: { min, max }, label: '', translation, rotation }
  }

  const matrix = (rotation || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).slice()
  matrix[12] = translation[0]
  matrix[13] = translation[1]
  matrix[14] = translation[2]

  return {
    mode: 'pending',
    matrix,
    rotation: rotation || null,
    translation,
    before,
    after: {
      min: min.map((v, c) => v + translation[c]),
      max: max.map((v, c) => v + translation[c]),
    },
    label: [
      rotation ? `${sourceUp}-up→Y-up` : '',
      ground ? '贴地' : '',
      centerXZ ? '水平归心' : '',
    ].filter(Boolean).join(' + '),
  }
}

/**
 * @description 助手只在矩阵非单位时输出 `matrix` 字段（并不输出 hasMatrix 标记），
 *   所以判定一律以字段存在为准 —— 之前用 node.hasMatrix 判断会把全部节点平移静默丢弃。
 */
function nodeMatrixOf(node) {
  return Array.isArray(node?.matrix) && node.matrix.length === 16 ? node.matrix : null
}

/**
 * @description 判定能否走烘焙路径：任一节点带旋转/缩放，就不能只改顶点。
 */
function conversionCanBeBaked(nodes) {
  return nodes.every((node) => {
    const matrix = nodeMatrixOf(node)
    return !matrix || linearPartIsIdentity(matrix)
  })
}

/**
 * @description 对一段 float32 顶点数据施加旋转；withTranslation 时再叠加平移。
 *   components 为 4（TANGENT）时只转前三维、保留 w（切线的手性）。
 */
function transformVectorArray(bytes, rotation, translation, withTranslation, components) {
  const stride = components === 4 ? 4 : 3
  const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  for (let i = 0; i + 2 < values.length; i += stride) {
    const vector = rotateVector(rotation, [values[i], values[i + 1], values[i + 2]])
    values[i] = vector[0] + (withTranslation ? translation[0] : 0)
    values[i + 1] = vector[1] + (withTranslation ? translation[1] : 0)
    values[i + 2] = vector[2] + (withTranslation ? translation[2] : 0)
  }
  return Buffer.from(values.buffer)
}

/**
 * @description 顶点焊接（D3）。IVE 出来的几何是"三角汤"：每个三角形三个独立顶点，
 *   实测 18,924 面 = 56,772 顶点，而同一模型经 FBX2glTF 导出只有 11,516 个顶点。
 *   顶点缓冲因此白白膨胀 4.9 倍（本模型约 1.5 MB）。
 *
 *   只有**全部属性逐个数值相同**的顶点才归并，`String()` 比较同时把 -0 与 0 视为同一个值
 *   （否则旋转产生的 -0 会把本该合并的顶点分成两份）。UV 接缝、硬边（法线不同）因此都不会被破坏，
 *   合并前后渲染结果完全一致。
 *
 *   REQ-007：assimp（FBX/OBJ）的产物同样是三角汤，但它的图元还带 `JOINTS_0`/`WEIGHTS_0`
 *   这类**整型**属性。所以这里按 `componentType` 逐流解码（默认 5126 = float32，与既有行为
 *   完全一致），输出也保持原类型——键仍覆盖**全部**属性，蒙皮接缝因此不会被错误合并。
 * @param {{name: string, components: number, count: number, bytes: Buffer, componentType?: number}[]} streams
 * @param {Buffer} indexBytes
 * @param {number} indexCount
 * @returns {{attributes: object[], indices: {bytes: Buffer, count: number}, before: number, after: number}|null}
 *   没有可合并的顶点、索引越界、或出现不支持的 componentType 时返回 null，调用方按原样输出。
 */
const COMPONENT_ARRAYS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
}

function weldVertices(streams, indexBytes, indexCount) {
  const count = streams.length ? streams[0].count : 0
  if (!count || !indexCount) return null
  if (streams.some((stream) => stream.count !== count)) return null
  if (streams.some((stream) => !COMPONENT_ARRAYS[stream.componentType || 5126])) return null

  const values = streams.map((stream) => {
    const Ctor = COMPONENT_ARRAYS[stream.componentType || 5126]
    return new Ctor(
      stream.bytes.buffer.slice(stream.bytes.byteOffset, stream.bytes.byteOffset + stream.bytes.byteLength),
    )
  })
  const indices = new Uint32Array(
    indexBytes.buffer.slice(indexBytes.byteOffset, indexBytes.byteOffset + indexBytes.byteLength),
  )
  for (const index of indices) {
    if (index >= count) return null
  }

  const lookup = new Map()
  const oldToNew = new Uint32Array(count)
  const picked = []
  for (let vertex = 0; vertex < count; vertex += 1) {
    const key = []
    for (let attribute = 0; attribute < streams.length; attribute += 1) {
      const stride = streams[attribute].components
      const base = vertex * stride
      for (let component = 0; component < stride; component += 1) key.push(values[attribute][base + component])
    }
    const joined = key.join(',')
    let target = lookup.get(joined)
    if (target === undefined) {
      target = picked.length
      lookup.set(joined, target)
      picked.push(vertex)
    }
    oldToNew[vertex] = target
  }
  if (picked.length === count) return null

  const attributes = streams.map((stream, attribute) => {
    const stride = stream.components
    const componentType = stream.componentType || 5126
    const out = new COMPONENT_ARRAYS[componentType](picked.length * stride)
    for (let vertex = 0; vertex < picked.length; vertex += 1) {
      const source = picked[vertex] * stride
      for (let component = 0; component < stride; component += 1) {
        out[vertex * stride + component] = values[attribute][source + component]
      }
    }
    return { name: stream.name, components: stride, count: picked.length, bytes: Buffer.from(out.buffer), componentType }
  })
  const remapped = new Uint32Array(indices.length)
  for (let index = 0; index < indices.length; index += 1) remapped[index] = oldToNew[indices[index]]

  return {
    attributes,
    indices: { bytes: Buffer.from(remapped.buffer), count: indexCount },
    before: count,
    after: picked.length,
  }
}

/**
 * @description 去掉不含任何网格的子树：IVE 常带有整棵骨骼节点树，但它们不参与渲染，
 *   保留只会平白增加 Cesium 的节点数量。
 */
function pruneMeshlessSubtrees(scene) {
  const nodes = scene.nodes || []
  const keep = new Array(nodes.length).fill(false)
  const visiting = new Array(nodes.length).fill(false)

  const mark = (index) => {
    if (index < 0 || index >= nodes.length || keep[index] || visiting[index]) return keep[index] === true
    visiting[index] = true
    let useful = typeof nodes[index].mesh === 'number' && nodes[index].mesh >= 0
    for (const child of nodes[index].children || []) {
      if (mark(child)) useful = true
    }
    visiting[index] = false
    keep[index] = useful
    return useful
  }

  const rootIndices = new Set()
  for (const entry of scene.scenes || []) {
    for (const index of entry.nodes || []) rootIndices.add(index)
  }
  if (rootIndices.size === 0 && nodes.length > 0) rootIndices.add(0)
  for (const index of rootIndices) mark(index)

  const remap = new Map()
  const prunedNodes = []
  for (let i = 0; i < nodes.length; i += 1) {
    if (!keep[i]) continue
    remap.set(i, prunedNodes.length)
    prunedNodes.push({ ...nodes[i], sourceIndex: i })
  }
  for (const node of prunedNodes) {
    node.children = (node.children || []).filter((child) => remap.has(child)).map((child) => remap.get(child))
  }

  const prunedScenes = (scene.scenes || []).map((entry) => ({
    ...(entry.name === undefined ? {} : { name: entry.name }),
    nodes: (entry.nodes || []).filter((index) => remap.has(index)).map((index) => remap.get(index)),
  }))

  return {
    nodes: prunedNodes,
    scenes: prunedScenes.length ? prunedScenes : [{ nodes: prunedNodes.length ? [0] : [] }],
    prunedCount: nodes.length - prunedNodes.length,
  }
}

function buildGlb(intermediate, options) {
  const binBuilder = createBinBuilder()
  const bufferViews = []
  const accessors = []
  const json = {
    asset: {
      version: '2.0',
      generator: 'glb-texture-repair-tool ive2glb',
    },
  }

  const addView = (buffer, target) => {
    const placed = binBuilder.push(buffer)
    const view = { buffer: 0, byteOffset: placed.byteOffset, byteLength: placed.byteLength }
    if (target) view.target = target
    bufferViews.push(view)
    view.index = bufferViews.length - 1
    return view
  }

  // 0) 先剪枝再算轴转换：包围盒要在"真正会写进 GLB 的节点集"上求，否则贴地/归心会偏。
  const pruned = options.pruneMeshlessNodes === false
    ? { nodes: intermediate.nodes || [], scenes: intermediate.scenes, prunedCount: 0 }
    : pruneMeshlessSubtrees(intermediate)
  // axisConversion:false 只关掉改写，包围盒照样算出来，便于体检报告继续显示真实尺寸。
  const conversion = createAxisConversion(intermediate, pruned.nodes, pruned.scenes,
    options.axisConversion === false
      ? { ...options, upAxis: 'NONE', ground: false, centerXZ: false }
      : options)
  if (conversion.mode !== 'none') {
    conversion.mode = conversionCanBeBaked(pruned.nodes) ? 'bake' : 'root'
  }

  // 1) 网格：顶点属性与索引直接沿用助手导出的 float32 / uint32 布局。
  //    先焊接（D3，缩顶点缓冲），再 bake 轴转换（这样只需变换合并后的顶点）。
  const meshes = []
  const weldStats = { before: 0, after: 0, primitives: 0 }
  for (const mesh of intermediate.meshes || []) {
    const primitives = []
    for (const primitive of mesh.primitives || []) {
      let streams = Object.entries(primitive.attributes || {}).map(([name, attribute]) => ({
        name,
        components: attribute.components,
        count: attribute.count,
        bytes: Buffer.from(intermediate.bin.subarray(attribute.offset, attribute.offset + attribute.length)),
      }))
      let indexBytes = Buffer.from(intermediate.bin.subarray(
        primitive.indices.offset,
        primitive.indices.offset + primitive.indices.length,
      ))
      let indexCount = primitive.indices.count

      if (options.weldVertices !== false) {
        const vertexCount = streams.length ? streams[0].count : 0
        weldStats.before += vertexCount
        const welded = weldVertices(streams, indexBytes, indexCount)
        if (welded) {
          streams = welded.attributes
          indexBytes = welded.indices.bytes
          indexCount = welded.indices.count
          weldStats.after += welded.after
          weldStats.primitives += 1
        } else {
          // 该图元没有可合并的顶点，原样计入，否则统计会少算。
          weldStats.after += vertexCount
        }
      }

      const attributes = {}
      for (const stream of streams) {
        let bytes = stream.bytes
        // 位置带平移；法线/切线只旋转（方向不随平移改变）。
        // 只碰这三个名字：COLOR_0 之类不是方向量，旋转它会把颜色转坏。
        if (conversion.mode === 'bake' && conversion.rotation
          && (stream.name === 'POSITION' || stream.name === 'NORMAL' || stream.name === 'TANGENT')
          && (stream.components === 3 || stream.components === 4)) {
          bytes = transformVectorArray(
            bytes,
            conversion.rotation,
            conversion.translation,
            stream.name === 'POSITION',
            stream.components,
          )
        }
        const view = addView(bytes, ARRAY_BUFFER)
        const type = stream.components === 3 ? 'VEC3' : stream.components === 2 ? 'VEC2' : 'VEC4'
        const extra = stream.name === 'POSITION' ? positionBounds(bytes) : null
        accessors.push(buildAccessor(view, type, GL.FLOAT, stream.count, extra || {}))
        attributes[stream.name] = accessors.length - 1
      }

      const indexView = addView(indexBytes, ELEMENT_ARRAY_BUFFER)
      accessors.push(buildAccessor(indexView, 'SCALAR', GL.UNSIGNED_INT, indexCount))

      primitives.push({
        attributes,
        indices: accessors.length - 1,
        mode: 4,
        ...(primitive.material >= 0 ? { material: primitive.material } : {}),
      })
    }
    if (primitives.length) meshes.push({ name: mesh.name || `mesh_${meshes.length}`, primitives })
  }
  json.meshes = meshes

  // 2) 贴图：先编码为 JPEG/PNG，再作为 bufferView 内嵌，保证 GLB 自包含。
  const images = []
  const textures = []
  const textureIndexByImage = new Map()
  const imageDiagnostics = []
  for (const [index, record] of (intermediate.images || []).entries()) {
    let encoded
    try {
      encoded = encodeImage(record, intermediate.bin, options)
    } catch (error) {
      imageDiagnostics.push({ index, name: record.name, error: error.message })
      continue
    }
    const view = addView(encoded.bytes)
    images.push({ name: record.name, bufferView: bufferViews.length - 1, mimeType: encoded.mimeType })
    textureIndexByImage.set(index, textures.length)
    textures.push({ source: images.length - 1, sampler: 0 })
    imageDiagnostics.push({
      index,
      name: record.name,
      width: record.width,
      height: record.height,
      encoding: encoded.encoding,
      bytes: encoded.bytes.length,
    })
  }
  if (images.length) {
    json.images = images
    json.textures = textures
    json.samplers = [{
      magFilter: 9729, // LINEAR
      minFilter: 9987, // LINEAR_MIPMAP_LINEAR
      wrapS: 10497, // REPEAT
      wrapT: 10497,
    }]
    // 非 2 次幂贴图不能使用 REPEAT + mipmap，退回边缘钳制。
    const nonPowerOfTwo = imageDiagnostics.some(
      (entry) => !entry.error && (!isPowerOfTwo(entry.width) || !isPowerOfTwo(entry.height)),
    )
    if (nonPowerOfTwo) {
      json.samplers[0] = { magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }
    }
  }

  // 3) 材质：diffuse 作为 baseColorFactor，贴图作为 baseColorTexture。
  const materials = []
  for (const material of intermediate.materials || []) {
    const textureIndex = material.baseColorImage >= 0 ? textureIndexByImage.get(material.baseColorImage) : undefined
    const entry = {
      name: material.name || `material_${materials.length}`,
      pbrMetallicRoughness: {
        baseColorFactor: material.diffuse || [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: roughnessFromShininess(material.shininess),
      },
      // OSG 只在显式设置 CullFace 时才启用面剔除，缺省即双面可见。
      doubleSided: material.cullFace === 'absent',
    }
    if (textureIndex !== undefined) {
      entry.pbrMetallicRoughness.baseColorTexture = { index: textureIndex }
    }
    if (material.alphaMode === 'BLEND') entry.alphaMode = 'BLEND'
    materials.push(entry)
  }
  if (materials.length) json.materials = materials

  // 4) 节点。bake 模式下平移量要跟着转轴；root 模式下顶点没动，
  //    改为挂一个带转换矩阵的根节点，两种做法渲染结果一致。
  json.nodes = pruned.nodes.map((node) => {
    const entry = { name: node.name || '', children: node.children || [] }
    const sourceMatrix = nodeMatrixOf(node)
    if (sourceMatrix) {
      const matrix = sourceMatrix.slice()
      if (conversion.mode === 'bake' && conversion.rotation) {
        const moved = rotateVector(conversion.rotation, matrix.slice(12, 15))
        matrix[12] = moved[0]; matrix[13] = moved[1]; matrix[14] = moved[2]
      }
      entry.matrix = matrix
    }
    if (typeof node.mesh === 'number' && node.mesh >= 0) entry.mesh = node.mesh
    return entry
  })
  json.scenes = pruned.scenes
  json.scene = 0
  if (conversion.mode === 'root') {
    json.nodes.push({ name: 'axis conversion', children: json.scenes[0]?.nodes || [0], matrix: conversion.matrix })
    json.scenes = [{ name: json.scenes[0]?.name, nodes: [json.nodes.length - 1] }]
  }

  json.bufferViews = bufferViews
  json.accessors = accessors
  json.buffers = [{ byteLength: binBuilder.length() }]

  return {
    json,
    bin: binBuilder.toBuffer(),
    diagnostics: imageDiagnostics,
    prunedNodes: pruned.prunedCount,
    conversion,
    weldStats,
  }
}

function roughnessFromShininess(shininess) {
  if (!Number.isFinite(shininess) || shininess <= 0) return 1
  const roughness = Math.sqrt(2 / (shininess + 2))
  return Math.min(1, Math.max(0, Number(roughness.toFixed(4))))
}

// ---------------------------------------------------------------- 对外接口

/**
 * @description 把单个 IVE 文件转换为自包含的 GLB。
 * @param {string} inputPath IVE 源文件路径。
 * @param {string} outputPath 输出 GLB 路径。
 * @param {{ keepJpeg?: boolean, jpegQuality?: number, pruneMeshlessNodes?: boolean,
 *   upAxis?: 'Z'|'Y'|'X'|'NONE', ground?: boolean, centerXZ?: boolean,
 *   axisConversion?: false, weldVertices?: boolean }} [options]
 *   weldVertices 默认开启：把三角汤里属性完全相同的顶点合并（D3），顶点缓冲可缩到 1/5。
 *   upAxis 默认 'Z'（OSG/IVE 是 Z-up），转成 glTF 规定的 Y-up；
 *   ground / centerXZ 默认开启，把世界包围盒贴到 y=0 并在水平面居中；
 *   axisConversion:false 完全关闭改写（仍会输出实测包围盒）。
 * @returns {{ status: 'success'|'error', inputPath: string, outputPath: string, error?: string, ... }}
 */
function convertIveToGlb(inputPath, outputPath, options = {}) {
  const startedAt = Date.now()
  const report = {
    status: 'error',
    kind: 'ive',
    inputPath,
    outputPath,
    oldBytes: 0,
    newBytes: 0,
  }
  // 转换过程中产生的告警（目前只有"原生助手起不来、已回退 WASM"），最终与助手自身的
  // warnings 合并写进 report.warnings。
  const iveWarnings = []

  try {
    if (!isIvePath(inputPath)) {
      throw new Error('只能转换 IVE 文件。')
    }
    if (!fs.existsSync(inputPath)) {
      throw new Error('IVE 源文件不存在。')
    }
    report.oldBytes = fs.statSync(inputPath).size

    const helper = resolveIveHelper()
    if (!helper.available) {
      throw new Error(missingIveHelperMessage())
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ive2glb-'))
    try {
      // 原生助手"文件在、但起不来"（未签名 / 被隔离 / 部分解包 / 权限不足）时回退 WASM：
      // 两者产出已实测逐字节相同，没有理由因此丢掉 IVE 能力。助手真的跑起来并报转换失败
      //（launchFailure 未标记）则原样抛出，不掩盖真实错误。
      let summary
      try {
        summary = runHelper(helper, inputPath, workDir)
        report.helperKind = helper.kind
      } catch (error) {
        if (!error.launchFailure || helper.kind !== 'native') throw error
        const wasmHelper = resolveWasmHelper()
        if (!wasmHelper) throw error
        summary = runHelper(wasmHelper, inputPath, workDir)
        report.helperKind = 'wasm'
        iveWarnings.push(`原生 IVE 助手无法启动（${error.message}），已回退到 WASM 助手。`)
      }
      const scenePath = path.join(workDir, 'scene.json')
      const binPath = path.join(workDir, 'data.bin')
      const intermediate = JSON.parse(fs.readFileSync(scenePath, 'utf8'))
      intermediate.bin = fs.readFileSync(binPath)
      intermediate.source = summary

      const built = buildGlb(intermediate, options)
      fs.mkdirSync(path.dirname(outputPath), { recursive: true })
      writeGlb(outputPath, built.json, built.bin)

      report.status = 'success'
      report.newBytes = fs.statSync(outputPath).size
      report.images = built.json.images?.length || 0
      report.materials = built.json.materials?.length || 0
      report.meshes = built.json.meshes?.length || 0
      report.nodes = built.json.nodes?.length || 0
      report.prunedNodes = built.prunedNodes
      report.axis = built.conversion.label || '未转换'
      report.axisMode = built.conversion.mode
      // 顶点数一律以真正写进文件的为准（关掉焊接时也要有值），
      // verticesBefore 才是焊接前的统计，没焊接时二者相等。
      report.vertices = (built.json.meshes || []).reduce(
        (total, mesh) => total + (mesh.primitives || []).reduce(
          (sum, primitive) => sum + (built.json.accessors[primitive.attributes.POSITION]?.count || 0),
          0,
        ),
        0,
      )
      report.verticesBefore = built.weldStats.before || report.vertices
      report.weldedVertices = report.verticesBefore - report.vertices
      report.weldedPrimitives = built.weldStats.primitives
      report.triangles = (built.json.meshes || []).reduce(
        (total, mesh) => total + (mesh.primitives || []).reduce(
          (sum, primitive) => sum + (built.json.accessors[primitive.indices]?.count || 0) / 3,
          0,
        ),
        0,
      )
      report.imageDiagnostics = built.diagnostics
      report.warnings = [...iveWarnings, ...(intermediate.warnings || [])]
      if (built.conversion.after) {
        const { min, max } = built.conversion.after
        report.worldSize = min.map((value, index) => Number((max[index] - value).toFixed(3)))
        report.worldCenter = min.map((value, index) => Number(((value + max[index]) / 2).toFixed(3)))
        report.worldMin = min.map((value) => Number(value.toFixed(3)))
      }
      report.elapsedMs = Date.now() - startedAt
      return report
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  } catch (error) {
    report.error = error.message || String(error)
    report.elapsedMs = Date.now() - startedAt
    return report
  }
}

module.exports = {
  buildGlb,
  convertIveToGlb,
  createAxisConversion,
  iveConversionAvailable,
  isIvePath,
  meshLocalBounds,
  missingIveHelperMessage,
  platformDirectory,
  pruneMeshlessSubtrees,
  readImagePixels,
  resolveIveHelper,
  resolveWasmHelper,
  rotateVector,
  transformVectorArray,
  vendorRootsFor,
  weldVertices,
  worldBounds,
}
