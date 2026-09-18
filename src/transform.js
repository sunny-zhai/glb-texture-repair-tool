// 世界包围盒与矩阵工具（GLB 侧）。
//
// 为什么单独一层：模型"看着对、摆进去不对"的头号原因是**包围盒失真** —— glTF 只要求
// accessor 的 min/max 描述顶点数据本身，不含节点变换。工具早先的 getPositionBounds()
// 就是把所有 POSITION 的 min/max 直接并集，实测最大偏差可达 9 万倍（装甲救护车：
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
const CORNERS = []
for (let index = 0; index < 8; index += 1) {
  CORNERS.push([index & 1 ? 1 : 0, index & 2 ? 1 : 0, index & 4 ? 1 : 0])
}

function emptyBounds() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
}

function isValidBounds(bounds) {
  return Boolean(bounds) && Number.isFinite(bounds.min?.[0]) && Number.isFinite(bounds.max?.[0])
}

function boundsSize(bounds) {
  if (!isValidBounds(bounds)) return null
  return [0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis])
}

function boundsCenter(bounds) {
  if (!isValidBounds(bounds)) return null
  return [0, 1, 2].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2)
}

function roundTriple(values) {
  return values ? values.map((value) => Number(value.toFixed(4))) : null
}

/**
 * @description 沿节点链累乘矩阵求世界包围盒。
 *   nodes / scenes 与 glTF 同构（`{ matrix | translation/rotation/scale, mesh, children }`），
 *   IVE 中间产物也是这个形状，因此两条路径共用本函数。
 * @param {object[]} nodes 节点数组（可传剪枝后的子集）。
 * @param {{nodes?: number[]}[]} scenes 场景列表。
 * @param {({min: number[], max: number[]}|null)[]} localBoundsByMesh 每个网格的局部盒（按网格索引）。
 * @returns {{min: number[], max: number[]}|null} 没有任何网格时为 null。
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
    for (const child of node.children ?? []) walk(child, world)
    visiting.delete(index)
  }

  const roots = (scenes?.length ? scenes : [{ nodes: (nodes ?? []).map((_, index) => index) }])
  for (const scene of roots) {
    for (const root of scene?.nodes ?? []) walk(root, identityMatrix())
  }
  return isValidBounds(total) ? total : null
}

/**
 * @description 每个网格的局部盒，取自各图元 POSITION accessor 的 min/max。
 *   返回数组按网格索引对齐，无几何的网格为 null（与 ive.js 的 meshLocalBounds 同形）。
 */
function meshLocalBoundsFromAccessors(json) {
  return (json?.meshes ?? []).map((mesh) => {
    const bounds = emptyBounds()
    for (const primitive of mesh?.primitives ?? []) {
      const accessor = json.accessors?.[primitive?.attributes?.POSITION]
      if (!accessor?.min || !accessor?.max) continue
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
 */
function accessorUnionBounds(json) {
  const bounds = emptyBounds()
  let seen = false
  for (const mesh of json?.meshes ?? []) {
    for (const primitive of mesh?.primitives ?? []) {
      const accessor = json.accessors?.[primitive?.attributes?.POSITION]
      if (!accessor?.min || !accessor?.max) continue
      seen = true
      for (let axis = 0; axis < 3; axis += 1) {
        if (Number.isFinite(accessor.min[axis])) bounds.min[axis] = Math.min(bounds.min[axis], accessor.min[axis])
        if (Number.isFinite(accessor.max[axis])) bounds.max[axis] = Math.max(bounds.max[axis], accessor.max[axis])
      }
    }
  }
  return seen && isValidBounds(bounds) ? bounds : null
}

/**
 * @description 两个包围盒的失真倍数：取三个轴上"大的比小的大多少"的最大值。
 *   1 表示一致；>10 就该怀疑取景会错（实测装甲救护车 >20 万，运输车约 4 千）。
 */
function deviationFactor(left, right) {
  const a = boundsSize(left)
  const b = boundsSize(right)
  if (!a || !b) return null
  let worst = 1
  for (let axis = 0; axis < 3; axis += 1) {
    const small = Math.min(Math.abs(a[axis]), Math.abs(b[axis]))
    const large = Math.max(Math.abs(a[axis]), Math.abs(b[axis]))
    if (small <= 0) continue
    worst = Math.max(worst, large / small)
  }
  return Number(worst.toFixed(3))
}

/** @description 一次性给出 GLB 的两种盒与偏差，便于报告直接取用。 */
function glbBounds(json) {
  const world = worldBounds(json?.nodes, json?.scenes, meshLocalBoundsFromAccessors(json))
  const accessorUnion = accessorUnionBounds(json)
  return {
    world,
    accessorUnion,
    worldSize: roundTriple(boundsSize(world)),
    worldCenter: roundTriple(boundsCenter(world)),
    accessorUnionSize: roundTriple(boundsSize(accessorUnion)),
    deviationFactor: deviationFactor(accessorUnion, world),
  }
}

module.exports = {
  accessorUnionBounds,
  boundsCenter,
  boundsSize,
  deviationFactor,
  glbBounds,
  meshLocalBoundsFromAccessors,
  worldBounds,
}
