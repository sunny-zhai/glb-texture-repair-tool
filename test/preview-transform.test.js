const test = require('node:test')
const assert = require('node:assert/strict')

const {
  PREVIEW_DEFAULT,
  axisOptions,
  clampPreview,
  describePreview,
  previewMatrix,
} = require('../src/preview-transform')

const IDENTITY = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]

/** @description 用列主序矩阵变换一个点（与 Cesium.Matrix4 的存储顺序一致）。 */
function transform(matrix, [x, y, z]) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ]
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}：期望 ${expected}，实际 ${actual}`)
}

function assertPoint(matrix, point, expected, message) {
  const actual = transform(matrix, point)
  for (let axis = 0; axis < 3; axis += 1) {
    assertClose(actual[axis], expected[axis], `${message} 的第 ${axis} 个分量`)
  }
}

test('preview-transform: 默认输入得到单位矩阵（不旋转、不缩放、不改上轴）', () => {
  assert.deepEqual(previewMatrix(), IDENTITY)
  assert.deepEqual(previewMatrix(PREVIEW_DEFAULT), IDENTITY)
  assert.deepEqual(previewMatrix({ yawDeg: 0, scale: 1 }), IDENTITY)
  // 归一后等于默认的输入同样是单位矩阵（720° = 0°，且不能留下 -0）
  const wrapped = previewMatrix({ yawDeg: 720, scale: 1 })
  assert.deepEqual(wrapped, IDENTITY)
  assert.equal(Object.is(wrapped[0], 1), true)
  assert.equal(Object.is(wrapped[2], -0), false)
})

test('preview-transform: 绕 Y 轴 90° 把 +X 映射到 -Z、+Z 映射到 +X', () => {
  const matrix = previewMatrix({ yawDeg: 90, scale: 1 })
  assertPoint(matrix, [1, 0, 0], [0, 0, -1], '+X')
  assertPoint(matrix, [0, 0, 1], [1, 0, 0], '+Z')
  // 上轴不受 Y 轴旋转影响——这正是"绕 Y 不会把模型转出地面"的依据
  assertPoint(matrix, [0, 1, 0], [0, 1, 0], '+Y（上轴）')
})

test('preview-transform: 缩放作用在三个轴上，且没有平移分量', () => {
  const matrix = previewMatrix({ yawDeg: 0, scale: 2 })
  assert.deepEqual(matrix, [
    2, 0, 0, 0,
    0, 2, 0, 0,
    0, 0, 2, 0,
    0, 0, 0, 1,
  ])
  // 第 4 列是平移：必须是 0，否则模型会离开"贴地 + 归心"的位置
  assert.equal(matrix[12], 0)
  assert.equal(matrix[13], 0)
  assert.equal(matrix[14], 0)
  assert.equal(matrix[15], 1)
})

test('preview-transform: 旋转与缩放叠加时缩放同时作用于两个旋转轴', () => {
  const matrix = previewMatrix({ yawDeg: 90, scale: 3 })
  assertPoint(matrix, [1, 1, 0], [0, 3, -3], '点 (1,1,0)')
})

test('preview-transform: 上轴三态——只有 z 才绕 X 轴 −90°，把 +Z 转成 +Y', () => {
  // auto / y 都不额外旋转（ADR-002：推断结果绝不自作主张）
  assert.deepEqual(previewMatrix({ axis: 'auto' }), IDENTITY)
  assert.deepEqual(previewMatrix({ axis: 'y' }), IDENTITY)

  // z：列主序 Rx(−90°)，Z-up 的 +Z → Y-up 的 +Y，+Y → −Z
  const zUp = previewMatrix({ axis: 'z' })
  assert.deepEqual(zUp, [
    1, 0, 0, 0,
    0, 0, -1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ])
  assertPoint(zUp, [0, 0, 1], [0, 1, 0], 'Z-up 的 +Z')
  assertPoint(zUp, [0, 1, 0], [0, 0, -1], 'Z-up 的 +Y')
  assertPoint(zUp, [1, 0, 0], [1, 0, 0], 'Z-up 的 +X')

  // 组合顺序：先转正、再绕 Y 旋转、最后缩放（点按 Rx → Ry → S 被作用）
  const combined = previewMatrix({ axis: 'z', yawDeg: 90, scale: 2 })
  assertPoint(combined, [0, 0, 1], [0, 2, 0], 'Z-up 上轴 + 90° + 2×')
  assertPoint(combined, [1, 0, 0], [0, 0, -2], 'Z-up 的 +X + 90° + 2×')
  // 组合矩阵不得留下 ±1e-16 的残渣（日志里会印成 -0.0000，断言也会被 -0 绊住）
  assert.deepEqual(combined, [
    0, 0, -2, 0,
    -2, 0, 0, 0,
    0, 2, 0, 0,
    0, 0, 0, 1,
  ])
})

test('preview-transform: clampPreview 规整越界角度、夹住缩放、替换非有限值与非法上轴', () => {
  const base = { yawDeg: 0, scale: 1, axis: 'auto' }
  assert.deepEqual(clampPreview(undefined), base)
  assert.deepEqual(clampPreview(null), base)
  assert.deepEqual(clampPreview({}), base)
  assert.deepEqual(clampPreview({ yawDeg: 'abc', scale: {} }), base)
  assert.deepEqual(clampPreview({ yawDeg: NaN, scale: Infinity }), base)

  // 角度折回 [0, 360)
  assert.deepEqual(clampPreview({ yawDeg: 450 }), { ...base, yawDeg: 90 })
  assert.deepEqual(clampPreview({ yawDeg: -90 }), { ...base, yawDeg: 270 })
  assert.deepEqual(clampPreview({ yawDeg: 360 }), base)
  assert.equal(Object.is(clampPreview({ yawDeg: -360 }).yawDeg, 0), true)

  // 缩放夹到 [0.05, 20]
  assert.equal(clampPreview({ scale: 100 }).scale, 20)
  assert.equal(clampPreview({ scale: 0 }).scale, 0.05)
  assert.equal(clampPreview({ scale: -3 }).scale, 0.05)
  assert.equal(clampPreview({ scale: 2.5 }).scale, 2.5)
  // 字符数字按数字处理（range 控件的 value 就是字符串）
  assert.deepEqual(clampPreview({ yawDeg: '45', scale: '0.5' }), { ...base, yawDeg: 45, scale: 0.5 })

  // 上轴只认三态枚举：其它值（含原型的键）一律退回 auto
  assert.equal(clampPreview({ axis: 'z' }).axis, 'z')
  assert.equal(clampPreview({ axis: 'y' }).axis, 'y')
  assert.equal(clampPreview({ axis: 'Z' }).axis, 'auto')
  assert.equal(clampPreview({ axis: '__proto__' }).axis, 'auto')
  assert.equal(clampPreview({ axis: 3 }).axis, 'auto')
})

test('preview-transform: describePreview 给出中文摘要，默认值单独标注', () => {
  assert.equal(describePreview(undefined), '默认（方向 0° · 缩放 1.00×）')
  assert.equal(describePreview(PREVIEW_DEFAULT), '默认（方向 0° · 缩放 1.00×）')
  // 720° 归一成 0°，因此仍算默认
  assert.equal(describePreview({ yawDeg: 720, scale: 1 }), '默认（方向 0° · 缩放 1.00×）')
  assert.equal(describePreview({ yawDeg: 90, scale: 2 }), '方向 90° · 缩放 2.00×')
  assert.equal(describePreview({ yawDeg: 45.5, scale: 0.25 }), '方向 45.5° · 缩放 0.25×')
  // 显式选了上轴就不再是"默认"，摘要里必须写明是哪一种
  assert.equal(
    describePreview({ axis: 'z' }),
    '方向 0° · 缩放 1.00× · 上轴 Z-up → Y-up（预览绕 X 轴 −90°）',
  )
})

test('preview-transform: axisOptions 暴露三态选项，值与 clampPreview 的枚举一致', () => {
  const options = axisOptions()
  assert.deepEqual(options.map((option) => option.value), ['auto', 'y', 'z'])
  for (const option of options) {
    assert.equal(typeof option.label, 'string')
    assert.ok(option.label.length > 0)
    assert.equal(clampPreview({ axis: option.value }).axis, option.value)
  }
})
