// 世界包围盒与矩阵工具（GLB 侧）。
//
// 为什么单独一层：模型"看着对、摆进去不对"的头号原因是**包围盒失真** —— glTF 只要求
// accessor 的 min/max 描述顶点数据本身，不含节点变换。工具早先的 getPositionBounds()
// 就是把所有 POSITION 的 min/max 直接并集，实测最大偏差可达 20 万倍（装甲救护车：
// accessor 801,146 × 265,331 × 546,442 vs 真实 3.49 × 3.92 × 8.95）。求取景盒必须沿
// 节点链累乘矩阵后重新包角点。
//
// 与 src/ive.js 的关系：IVE 中间产物的顶点是裸 float 区段，局部盒得从字节里量；GLB 的
// 局部盒直接来自 accessor 的 min/max。两者**只有数据来源不同**，节点遍历与矩阵累乘完全
// 相同，所以那段逻辑收敛到这里的 worldBounds()，ive.js 传入自己量出的局部盒复用。
const {
  getNodeLocalMatrix,
  identityMatrix,
  multiplyMatrix,
  transformPoint,
} = require('./repair')

// 单位立方体的 8 个角，用于把局部盒变换到世界空间后重新求轴对齐盒。
const asArray = (value) => (Array.isArray(value) ? value : [])

const CORNERS = []
for (let index = 0; index < 8; index += 1) {
  CORNERS.push([index & 1 ? 1 : 0, index & 2 ? 1 : 0, index & 4 ? 1 : 0])
}

function emptyBounds() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
}

function isValidBounds(bounds) {
  if (!bounds?.min || !bounds?.max) return false
  return [0, 1, 2].every((axis) => (
    Number.isFinite(bounds.min[axis])
    && Number.isFinite(bounds.max[axis])
    && bounds.max[axis] >= bounds.min[axis]
  ))
}

function boundsSize(bounds) {
  if (!isValidBounds(bounds)) return null
  return [0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis])
}

function boundsCenter(bounds) {
  if (!isValidBounds(bounds)) return null
  return [0, 1, 2].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2)
}

/** @description 体对角线长度。用它兜退化轴：薄板/扁平资产的某个轴尺寸为 0 时逐轴比值会失真。 */
function boundsDiagonal(bounds) {
  const size = boundsSize(bounds)
  return size ? Math.hypot(size[0], size[1], size[2]) : null
}

function roundTriple(values) {
  return values ? values.map((value) => Number(value.toFixed(4))) : null
}

/**
 * @description 取默认场景。glTF 里 `json.scene` 缺省即 0；没有 scenes 的 GLB **不会被渲染**，
 *   此时返回 null —— 不要伪造成"所有节点都是根"的场景，那会把父子变换算错。
 */
function defaultSceneOf(json) {
  const scenes = json?.scenes
  if (!Array.isArray(scenes) || scenes.length === 0) return null
  const index = Number.isInteger(json?.scene) ? json.scene : 0
  return scenes[index] ?? null
}

/**
 * @description 默认场景的状态：`none`（文件里没有 scene，glTF 下不会渲染）、
 *   `out-of-range`（`json.scene` 指向不存在的场景——这是**文件损坏**，与"没有场景"不同，
 *   必须分别提示，否则用户只看到"没有盒"却不知道为什么）、`ok`。
 */
function defaultSceneStatus(json) {
  const scenes = json?.scenes
  if (!Array.isArray(scenes) || scenes.length === 0) return 'none'
  const index = Number.isInteger(json?.scene) ? json.scene : 0
  return scenes[index] ? 'ok' : 'out-of-range'
}

/**
 * @description 从给定场景可达的网格索引集合。accessor 盒只应统计**真正会被渲染**的网格，
 *   否则文件里体积巨大的未引用网格会带来假偏差（审查实测：未引用的 1000³ 网格让
 *   1³ 的正常模型报出 1000 倍偏差并触发告警）。
 */
function reachableMeshIndexes(nodes, scene) {
  const meshIndexes = new Set()
  const visiting = new Set()
  const walk = (index) => {
    const node = nodes?.[index]
    if (!node || visiting.has(index)) return
    visiting.add(index)
    if (typeof node.mesh === 'number' && node.mesh >= 0) meshIndexes.add(node.mesh)
    for (const child of asArray(node.children)) walk(child)
    visiting.delete(index)
  }
  for (const root of asArray(scene?.nodes)) walk(root)
  return meshIndexes
}

/**
 * @description 沿节点链累乘矩阵求世界包围盒。
 *   nodes / scenes 与 glTF 同构（`{ matrix | translation/rotation/scale, mesh, children }`），
 *   IVE 中间产物也是这个形状，因此两条路径共用本函数。
 *   **只遍历传入的 scenes**：空 scenes 返回 null，绝不退化成"把每个节点都当根"——
 *   那会丢掉父级变换（审查实测：父节点平移 100、子节点为网格时，退化版本给出
 *   `[0,0,0]×[101,1,1]` 的错误盒）。
 * @param {object[]} nodes 节点数组（可传剪枝后的子集）。
 * @param {{nodes?: number[]}[]} scenes 场景列表（GLB 路径只传默认场景）。
 * @param {({min: number[], max: number[]}|null)[]} localBoundsByMesh 每个网格的局部盒（按网格索引）。
 * @returns {{min: number[], max: number[]}|null} 无场景或无网格时为 null。
 */
function worldBounds(nodes, scenes, localBoundsByMesh) {
  const total = emptyBounds()
  const visiting = new Set()

  const walk = (index, parentMatrix) => {
    const node = nodes?.[index]
    if (!node || visiting.has(index)) return
    visiting.add(index)
    const world = multiplyMatrix(parentMatrix, getNodeLocalMatrix(node))

    const local = typeof node.mesh === 'number' ? localBoundsByMesh?.[node.mesh] : null
    if (local) {
      for (const corner of CORNERS) {
        const point = transformPoint(world, [
          corner[0] ? local.max[0] : local.min[0],
          corner[1] ? local.max[1] : local.min[1],
          corner[2] ? local.max[2] : local.min[2],
        ])
        for (let axis = 0; axis < 3; axis += 1) {
          if (!Number.isFinite(point[axis])) continue
          if (point[axis] < total.min[axis]) total.min[axis] = point[axis]
          if (point[axis] > total.max[axis]) total.max[axis] = point[axis]
        }
      }
    }
    for (const child of asArray(node.children)) walk(child, world)
    visiting.delete(index)
  }

  for (const scene of asArray(scenes)) {
    for (const root of asArray(scene?.nodes)) walk(root, identityMatrix())
  }
  return isValidBounds(total) ? total : null
}

/**
 * @description 每个网格的局部盒，取自各图元 POSITION accessor 的 min/max。
 *   返回数组按网格索引对齐，无几何的网格为 null（与 ive.js 的 meshLocalBounds 同形）。
 */
function meshLocalBoundsFromAccessors(json) {
  const meshes = Array.isArray(json?.meshes) ? json.meshes : []
  return meshes.map((mesh) => {
    const bounds = emptyBounds()
    for (const primitive of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      const accessor = json?.accessors?.[primitive?.attributes?.POSITION]
      if (!Array.isArray(accessor?.min) || !Array.isArray(accessor?.max)) continue
      for (let axis = 0; axis < 3; axis += 1) {
        if (Number.isFinite(accessor.min[axis]) && accessor.min[axis] < bounds.min[axis]) {
          bounds.min[axis] = accessor.min[axis]
        }
        if (Number.isFinite(accessor.max[axis]) && accessor.max[axis] > bounds.max[axis]) {
          bounds.max[axis] = accessor.max[axis]
        }
      }
    }
    return isValidBounds(bounds) ? bounds : null
  })
}

/**
 * @description 不含任何节点变换的"accessor 并集盒"——即 Cesium 若只信 accessor min/max
 *   会得到的取景范围。它**不是**真实包围盒，专门用来量化失真（见 deviationFactor）。
 *   只统计默认场景可达的网格，否则未引用的网格会制造假偏差。
 */
function accessorUnionBounds(json) {
  const bounds = emptyBounds()
  const localBounds = meshLocalBoundsFromAccessors(json)
  const reachable = reachableMeshIndexes(json?.nodes, defaultSceneOf(json))
  let seen = false
  for (const meshIndex of reachable) {
    const local = localBounds[meshIndex]
    if (!local) continue
    seen = true
    for (let axis = 0; axis < 3; axis += 1) {
      if (local.min[axis] < bounds.min[axis]) bounds.min[axis] = local.min[axis]
      if (local.max[axis] > bounds.max[axis]) bounds.max[axis] = local.max[axis]
    }
  }
  return seen && isValidBounds(bounds) ? bounds : null
}

function axisSizeRatios(left, right) {
  const leftSize = boundsSize(left)
  const rightSize = boundsSize(right)
  return [0, 1, 2].map((axis) => {
    const small = Math.min(leftSize[axis], rightSize[axis])
    const large = Math.max(leftSize[axis], rightSize[axis])
    return small > 0 ? large / small : 1
  })
}

function centerOffsetRatio(left, right) {
  const leftCenter = boundsCenter(left)
  const rightCenter = boundsCenter(right)
  const diagonal = Math.max(boundsDiagonal(left) ?? 0, boundsDiagonal(right) ?? 0)
  if (!(diagonal > 0)) return 0
  const offset = Math.hypot(...[0, 1, 2].map((axis) => leftCenter[axis] - rightCenter[axis]))
  return offset / diagonal
}

/**
 * @description 两个包围盒的失真倍数，同时覆盖**尺寸**与**位置**：
 *   `max(逐轴尺寸比值的最坏值, 1 + 中心偏移 ÷ 体对角线)`。
 *   只看尺寸会漏掉"纯平移"这种取景同样会错的情形（审查实测：整体平移 1000 时旧实现
 *   恒为 1，Cesium 取景明显错位却报"无失真"）。1 表示完全一致。
 */
function deviationFactor(left, right) {
  if (!isValidBounds(left) || !isValidBounds(right)) return null
  const sizeRatio = Math.max(1, ...axisSizeRatios(left, right))
  return Number(Math.max(sizeRatio, 1 + centerOffsetRatio(left, right)).toFixed(3))
}

/** @description 偏差的两个分量，便于报告解释"差在哪"（尺寸还是位置）。 */
function deviationParts(left, right) {
  if (!isValidBounds(left) || !isValidBounds(right)) return null
  const sizeRatio = Math.max(1, ...axisSizeRatios(left, right))
  const offsetRatio = centerOffsetRatio(left, right)
  return {
    factor: Number(Math.max(sizeRatio, 1 + offsetRatio).toFixed(3)),
    sizeRatio: Number(sizeRatio.toFixed(3)),
    centerOffsetRatio: Number(offsetRatio.toFixed(3)),
  }
}

/**
 * @description 一次性给出 GLB 的两种盒与偏差。
 *   两处都**只按默认场景**统计，与 Cesium 的取景口径一致（审查实测：并集所有 scene
 *   会让报告盒与预览取景不符，而节点统计又只算默认场景，报告自相矛盾）。
 */
function glbBounds(json) {
  const scene = defaultSceneOf(json)
  const localBounds = meshLocalBoundsFromAccessors(json)
  const world = worldBounds(json?.nodes, scene ? [scene] : [], localBounds)
  const accessorUnion = accessorUnionBounds(json)
  return {
    sceneIndex: scene ? (Number.isInteger(json?.scene) ? json.scene : 0) : null,
    sceneCount: Array.isArray(json?.scenes) ? json.scenes.length : 0,
    world,
    accessorUnion,
    worldSize: roundTriple(boundsSize(world)),
    worldCenter: roundTriple(boundsCenter(world)),
    accessorUnionSize: roundTriple(boundsSize(accessorUnion)),
    accessorUnionCenter: roundTriple(boundsCenter(accessorUnion)),
    deviationFactor: deviationFactor(accessorUnion, world),
    deviationParts: deviationParts(accessorUnion, world),
  }
}

module.exports = {
  accessorUnionBounds,
  boundsCenter,
  boundsDiagonal,
  boundsSize,
  defaultSceneOf,
  defaultSceneStatus,
  deviationFactor,
  deviationParts,
  glbBounds,
  meshLocalBoundsFromAccessors,
  reachableMeshIndexes,
  worldBounds,
}
