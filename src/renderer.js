const inputSummary = document.getElementById('inputSummary')
const outputSummary = document.getElementById('outputSummary')
const inputList = document.getElementById('inputList')
const resultList = document.getElementById('resultList')
const log = document.getElementById('log')
const validationStatus = document.getElementById('validationStatus')
const validationModelSummary = document.getElementById('validationModelSummary')
const cesiumContainer = document.getElementById('cesiumContainer')
const progressWrap = document.getElementById('progressWrap')
const progressFill = document.getElementById('progressFill')
const progressText = document.getElementById('progressText')
const progressCounter = document.getElementById('progressCounter')
const runRepairButton = document.getElementById('runRepair')
const capabilityHint = document.getElementById('capabilityHint')
const minimizeWindow = document.getElementById('minimizeWindow')
const maximizeWindow = document.getElementById('maximizeWindow')
const closeWindow = document.getElementById('closeWindow')
const inspectStatus = document.getElementById('inspectStatus')
const inspectPanel = document.getElementById('inspectPanel')
const inspectWorldBox = document.getElementById('inspectWorldBox')
const inspectWorldCenter = document.getElementById('inspectWorldCenter')
const inspectAccessorBox = document.getElementById('inspectAccessorBox')
const inspectAccessorCenter = document.getElementById('inspectAccessorCenter')
const inspectDeviation = document.getElementById('inspectDeviation')
const inspectFacts = document.getElementById('inspectFacts')
const inspectIssues = document.getElementById('inspectIssues')
const previewYaw = document.getElementById('previewYaw')
const previewYawValue = document.getElementById('previewYawValue')
const previewScale = document.getElementById('previewScale')
const previewScaleValue = document.getElementById('previewScaleValue')
const previewAxis = document.getElementById('previewAxis')
const resetPreviewButton = document.getElementById('resetPreview')
// 编辑器式外壳（BR-027）：栏位、分隔条、折叠按钮、状态栏
const appShell = document.getElementById('appShell')
const helpPanel = document.getElementById('helpPanel')
const toggleHelpButton = document.getElementById('toggleHelp')
const toggleDrawerButton = document.getElementById('toggleDrawer')
const closeDrawerButton = document.getElementById('closeDrawer')
const toggleLogButton = document.getElementById('toggleLog')
const splitterLeft = document.getElementById('splitterLeft')
const splitterRight = document.getElementById('splitterRight')
const splitterBottom = document.getElementById('splitterBottom')
const inputBadge = document.getElementById('inputBadge')
const inspectEmpty = document.getElementById('inspectEmpty')
const actionBar = document.querySelector('.action-bar')
const previewBar = document.querySelector('.preview-bar')
// 中栏自己的标题行（34px）：它和预览控件条一起吃掉中栏高度，算底部上限时必须计入，
// 否则 CANVAS_MIN_HEIGHT 会被这 34px 悄悄抵消（冷审实测：声明 160 实际只剩 126）
const centerHeader = document.querySelector('.pane-center .pane-header')
const statusBar = document.getElementById('statusBar')
const statusModel = document.getElementById('statusModel')
const statusModelSize = document.getElementById('statusModelSize')
const statusInspect = document.getElementById('statusInspect')
const statusProgress = document.getElementById('statusProgress')

// report-format.js / preview-transform.js 是纯 CommonJS 模块，在 index.html 里以普通
// <script> 先于本文件加载，导出挂在 window 上（渲染进程没有 Node，无法 require）。
const reportFormat = window.reportFormat
const previewTools = window.previewTransform

// 预览修正的记忆（REQ-010）：只记**用户显式选过**的上轴/方向/缩放；"从未动过"与"显式选了
// auto"必须可区分——所以用键是否存在来表达（没动过就不写这个键）。
const PREVIEW_KEY = 'glb-repair.preview'
const PREVIEW_VERSION = 1

const ISSUE_LEVEL_LABELS = { error: '错误', warn: '警告', info: '提示' }

const state = {
  inputMode: 'files',
  inputPaths: [],
  outputDir: '',
  viewer: null,
  model: null,
  validationBounds: null,
}

// 体检是异步的：快速连续切换模型时，旧请求的结果不能覆盖新模型的面板
let inspectToken = 0

// ================================================================ 编辑器式布局（BR-027 / ADR-006）
// 布局状态（REQ-011 / ADR-011）：用户意图是**占比**（左/右栏占可用宽度、底部日志占窗口高度），
// 像素只是派生物——窗口缩放时只按占比重算像素，所以各区占比恒定；拖拽仍按像素跟手，落盘前换算回占比。
// 写 localStorage（键 glb-repair.layout，version 2）；version 1 的旧像素载荷按当前窗口迁移。
const LAYOUT_KEY = 'glb-repair.layout'
const LAYOUT_VERSION = 2
// 折叠后日志只剩标题行
const LOG_COLLAPSED_HEIGHT = 34
// 像素**下限**（可用性）与比例**上下限**（构图）。上限必须是比例：旧的像素上限（480/560/560）
// 在大窗口下本身就是占比杀手（左栏 480px 在 2560 宽下只剩 18.75%），与"占比固定"直接冲突。
const PANE_LIMITS = {
  left: { min: 180 },
  right: { min: 220 },
  bottom: { min: 90 },
}
// 比例下限只防"极端比例被存下来"（例如在大窗口里把某栏拖到 0.5%），真正的可用性下限是
// **像素下限**（见 PANE_LIMITS）——两者都生效时取更宽松的一方，否则小窗口会把日志卡在
// 比 90px 还高的位置（实测 0.12 × 757 = 91 > 90，拖到底也下不来）。
const PANE_RATIO_LIMITS = {
  left: { min: 0.06, max: 0.40 },
  right: { min: 0.07, max: 0.45 },
  bottom: { min: 0.06, max: 0.60 },
}
// 中栏（3D 主视口）的最小宽高：夹取左/右/底栏时始终为它留出空间，保证它是最宽的一栏
const CENTER_MIN_WIDTH = 420
const CENTER_MIN_HEIGHT = 240
// 3D 画布本身的最小高度（中栏减去预览控件条后仍要留出的高度）
const CANVAS_MIN_HEIGHT = 160
const LAYOUT_DEFAULT = { left: 260, right: 340, bottom: 200 }
// 默认占比由"1280×800 下的 260 / 340 / 200 像素"换算而来，保证默认观感与旧版一致
const RATIO_REFERENCE = { width: 1280 - 8, height: 800 }
const LAYOUT_RATIO_DEFAULT = {
  left: LAYOUT_DEFAULT.left / RATIO_REFERENCE.width,
  right: LAYOUT_DEFAULT.right / RATIO_REFERENCE.width,
  bottom: LAYOUT_DEFAULT.bottom / RATIO_REFERENCE.height,
}
const SPLITTER_KEY_STEP = 16

let layout = {
  ...LAYOUT_DEFAULT,
  logCollapsed: false,
  rightCollapsed: false,
  drawerOpen: false,
}
// `layout` = 当前窗口下**实际生效**的像素（渲染用）；`layoutRatio` = 用户**真正设定**的占比
// （落盘的只有它）。两者分开的理由（ADR-007，单位从 px 换成比例）：窗口临时变小、跨到窄断点、
// 或面板内容临时变高，都只该影响"这一次渲染"——窗口恢复后占比要能自己回来。
let layoutRatio = { ...LAYOUT_RATIO_DEFAULT }
// initLayout() 会挂一次性监听，用这个护栏保证它只生效一次
let layoutInitialized = false

function clampNumber(value, min, max, fallback) {
  // 只认真正的有限数值：Number(null)/Number([])/Number('') 都会得到 0（有限），
  // 于是坏值会退化成"下限"而不是"默认值"（实测 {"bottom":null} 会变成日志几乎折叠）
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

function layoutMetrics() {
  return {
    width: appShell?.clientWidth || window.innerWidth || 0,
    height: appShell?.clientHeight || window.innerHeight || 0,
    narrow: Boolean(appShell?.classList.contains('narrow')),
  }
}

// 可用空间：宽度要减掉两条 4px 分隔条（REQ-011 的占比以它为分母）
function ratioSpace() {
  const { width, height } = layoutMetrics()
  return { width: Math.max(0, width - 8), height: Math.max(0, height) }
}

/** @description 把任意输入规整为合法的**占比**（用户意图的唯一单位）。 */
function clampRatio(input) {
  const candidate = input && typeof input === 'object' ? input : {}
  return {
    left: clampNumber(candidate.left, PANE_RATIO_LIMITS.left.min, PANE_RATIO_LIMITS.left.max, LAYOUT_RATIO_DEFAULT.left),
    right: clampNumber(candidate.right, PANE_RATIO_LIMITS.right.min, PANE_RATIO_LIMITS.right.max, LAYOUT_RATIO_DEFAULT.right),
    bottom: clampNumber(candidate.bottom, PANE_RATIO_LIMITS.bottom.min, PANE_RATIO_LIMITS.bottom.max, LAYOUT_RATIO_DEFAULT.bottom),
  }
}

/** @description 占比 → 像素（派生物）。分母是当前可用空间，因此占比与窗口尺寸无关。 */
function ratioToPixels(ratio, space = ratioSpace()) {
  const safe = clampRatio(ratio)
  return {
    left: safe.left * space.width,
    right: safe.right * space.width,
    bottom: safe.bottom * space.height,
  }
}

/** @description 像素 → 占比：拖拽改动换算成占比后才能落盘（ADR-011 决策 b）。 */
function ratioFromPixels(pixels) {
  const space = ratioSpace()
  if (!(space.width > 0) || !(space.height > 0)) return clampRatio(layoutRatio)
  return clampRatio({
    left: pixels.left / space.width,
    right: pixels.right / space.width,
    bottom: pixels.bottom / space.height,
  })
}

/** @description 占比 → 当前窗口下**生效的像素**（先换算，再走最小尺寸/中栏/画布约束）。 */
function layoutFromRatio(ratio, options = {}) {
  return clampLayout(ratioToPixels(ratio), options)
}

/**
 * @description 把任意（可能来自旧屏幕的）布局**像素**夹到合法区间。
 * @param {object} input 像素布局值
 * @param {{fitWindow?: boolean}} [options] `fitWindow: false` 只按栏位自身的下限规整，
 *   不套用当前窗口/内容的预算——否则窗口一小，用户设定的值就被吃掉。
 */
function clampLayout(input, options = {}) {
  const { fitWindow = true } = options
  const candidate = input && typeof input === 'object' ? input : {}
  const { width, height, narrow } = layoutMetrics()
  const space = ratioSpace()
  // 像素上没有上限（ADR-011 决策 e：上限由比例上限承担），这里的 max 只用来兜"输入大于当前窗口"
  const leftMax = Math.max(PANE_LIMITS.left.min, space.width)
  const rightMax = Math.max(PANE_LIMITS.right.min, space.width)
  const bottomMax = Math.max(PANE_LIMITS.bottom.min, space.height)
  let left = clampNumber(candidate.left, PANE_LIMITS.left.min, leftMax, LAYOUT_DEFAULT.left)
  let right = clampNumber(candidate.right, PANE_LIMITS.right.min, rightMax, LAYOUT_DEFAULT.right)
  let bottom = clampNumber(candidate.bottom, PANE_LIMITS.bottom.min, bottomMax, LAYOUT_DEFAULT.bottom)

  if (fitWindow && width > 0) {
    if (narrow) {
      // 窄窗口只有 左栏 + 4px + 中栏 三列，右栏是不占列宽的浮层抽屉
      const narrowMax = Math.max(PANE_LIMITS.left.min, Math.round(width * 0.4))
      left = Math.min(left, narrowMax, Math.max(PANE_LIMITS.left.min, width - 4 - CENTER_MIN_WIDTH),
        Math.floor((width - 4 - 1) / 2))
    } else {
      // 8px 是两个分隔条；中栏宽度 = 剩余部分
      const total = width - 8
      // ① 中栏至少要有 CENTER_MIN_WIDTH：优先削较宽的一侧
      const overflow = left + right - (total - CENTER_MIN_WIDTH)
      if (overflow > 0) {
        const cutRight = Math.min(overflow, Math.max(0, right - PANE_LIMITS.right.min))
        right -= cutRight
        left = Math.max(PANE_LIMITS.left.min, left - (overflow - cutRight))
      }
      // ② 中栏必须始终是**最宽**的一栏（严格大于两侧）：否则把左栏拖到上限后，
      //    3D 主视口就不再是最大面积，验收标准 2 直接不成立
      left = Math.min(left, Math.floor((total - right - 1) / 2))
      right = Math.min(right, Math.floor((total - left - 1) / 2))
      left = Math.max(left, PANE_LIMITS.left.min)
      right = Math.max(right, PANE_LIMITS.right.min)
    }
  }

  if (fitWindow && height > 0) {
    // 只减**稳定**的 chrome：动作条 / 状态栏 / 中栏标题行 / 分隔条。**故意不含帮助面板**
    // （TASK-011）：它是临时面板，一旦计入，打开帮助就会把用户的日志高度夹小。
    // 预览控件条是唯一保留的实时读取——它只随**窗口宽度**换行（内容是静态控件），
    // 而模型信息行已被 CSS 固定成单行省略号，数据不再能改变它。
    const chrome = (actionBar?.offsetHeight || 41)
      + (statusBar?.offsetHeight || 28)
      + (centerHeader?.offsetHeight || 34)
      + 4
    // 中栏 = 标题行 + 预览控件条 + 3D 画布；只守 CENTER_MIN_HEIGHT 会让画布被挤到几十像素
    // （实测 1100×760 且存量 bottom=333 时画布只剩 93px），所以标题行与控件条高度都要扣掉
    const previewBarHeight = previewBar?.offsetHeight || 0
    const maxBottom = Math.max(
      PANE_LIMITS.bottom.min,
      height - chrome - previewBarHeight - CANVAS_MIN_HEIGHT,
    )
    bottom = Math.min(bottom, maxBottom)
  }

  return {
    left: Math.round(left),
    right: Math.round(right),
    bottom: Math.round(bottom),
    // 布尔字段只认真正的布尔：真值垃圾串（"no"）会把日志静默折叠，虽然在合法区间内，
    // 却与"字段类型错误也必须鲁棒"的意图不符（冷审实测 {"logCollapsed":"no"} 折叠了日志）
    logCollapsed: candidate.logCollapsed === true,
    rightCollapsed: candidate.rightCollapsed === true,
    drawerOpen: candidate.drawerOpen === true,
  }
}

/**
 * @description 读取持久化布局，返回**占比载荷**或 null。
 *   version 2 直接取占比；version 1 的旧像素载荷按**当前窗口**换算成占比迁移（ADR-011 决策 f）——
 *   迁移不出合法值就回落默认占比，绝不让某一栏被挤到 0。
 */
function readStoredLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (parsed.version === LAYOUT_VERSION) {
      return { ratio: clampRatio(parsed), flags: readStoredFlags(parsed), migrated: false }
    }
    if (parsed.version === 1) {
      // 旧格式是像素：用当前可用空间换算成占比。夹取只在 px 层做，比例本身交给 clampRatio。
      const pixels = clampLayout({
        left: parsed.left,
        right: parsed.right,
        bottom: parsed.bottom,
      })
      return { ratio: ratioFromPixels(pixels), flags: readStoredFlags(parsed), migrated: true }
    }
    // 其它版本不认识就整份丢弃：前向兼容不能靠 clamp 硬吃未知结构
    return null
  } catch (error) {
    // 隐私模式 / 坏 JSON 都不该影响使用，回落到默认布局
    return null
  }
}

function readStoredFlags(parsed) {
  // 布尔字段只认真正的布尔：真值垃圾串（"no"）会把日志静默折叠（冷审实测）
  return {
    logCollapsed: parsed.logCollapsed === true,
    rightCollapsed: parsed.rightCollapsed === true,
    drawerOpen: parsed.drawerOpen === true,
  }
}

function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({
      version: LAYOUT_VERSION,
      // 落盘的是**用户意图**（占比），不是当前窗口夹取后的生效像素（ADR-007/ADR-011）
      left: Number(layoutRatio.left.toFixed(6)),
      right: Number(layoutRatio.right.toFixed(6)),
      bottom: Number(layoutRatio.bottom.toFixed(6)),
      logCollapsed: layout.logCollapsed,
      rightCollapsed: layout.rightCollapsed,
      drawerOpen: layout.drawerOpen,
    }))
  } catch (error) {
    // 配额/隐私模式：布局记不住不是功能故障
  }
}

/**
 * @description **用户操作**改布局：拖的是像素，记住的是占比——先把新像素换算成占比，
 *   再由占比重算生效像素（ADR-011 决策 b）。
 */
function commitLayout(next) {
  layoutRatio = ratioFromPixels({ ...layout, ...(next || {}) })
  layout = layoutFromRatio(layoutRatio)
  return layout
}

/**
 * @description **只改折叠标志**的用户操作：不重写占比意图——小窗口下点一次折叠，
 *   不该顺手把用户在大窗口里设定的比例吃掉（TASK-011）。
 */
function commitFlags(flags) {
  layout = clampLayout({ ...layout, ...flags })
  return layout
}

/**
 * @description **非用户事件**（窗口缩放、跨窄断点、内容变化）重算生效像素：占比不动、不落盘——
 *   这样窗口恢复或换回短内容后，用户的占比能自己回来（ADR-007 + ADR-011）。
 */
function refitLayout() {
  layout = layoutFromRatio(layoutRatio)
  return layout
}

/** @description 从存储/默认值建立初始布局（占比意图与生效像素一起定）。 */
function adoptLayout(source) {
  layoutRatio = clampRatio(source?.ratio ?? source)
  layout = layoutFromRatio(layoutRatio)
  if (source?.flags) layout = clampLayout({ ...layout, ...source.flags })
  return layout
}

// 3D 画布尺寸变化必须重算（Cesium 只监听 window resize，分隔条拖动它感知不到，不处理会被
// 拉伸/裁剪）。节流到下一帧，拖动时不掉帧。
let viewerResizeFrame = 0
let viewerResizeCount = 0
function scheduleViewerResize() {
  const resizeNow = () => {
    if (!state.viewer?.resize) return
    state.viewer.resize()
    viewerResizeCount += 1
  }
  if (typeof requestAnimationFrame !== 'function') {
    resizeNow()
    return
  }
  if (viewerResizeFrame) return
  viewerResizeFrame = requestAnimationFrame(() => {
    viewerResizeFrame = 0
    resizeNow()
  })
}

function applyLayout() {
  const narrow = Boolean(appShell.classList.contains('narrow'))
  appShell.style.setProperty('--pane-left', `${layout.left}px`)
  appShell.style.setProperty('--pane-right', `${layout.right}px`)
  appShell.style.setProperty('--pane-bottom', `${layout.logCollapsed ? LOG_COLLAPSED_HEIGHT : layout.bottom}px`)
  appShell.classList.toggle('log-collapsed', layout.logCollapsed)
  appShell.classList.toggle('right-collapsed', !narrow && layout.rightCollapsed)
  appShell.classList.toggle('drawer-open', narrow && layout.drawerOpen)

  toggleLogButton.textContent = layout.logCollapsed ? '展开' : '折叠'
  toggleLogButton.setAttribute('aria-expanded', String(!layout.logCollapsed))
  if (narrow) {
    toggleDrawerButton.textContent = layout.drawerOpen ? '收起体检' : '体检 / 选项'
    toggleDrawerButton.setAttribute('aria-expanded', String(layout.drawerOpen))
  } else {
    toggleDrawerButton.textContent = layout.rightCollapsed ? '显示体检' : '隐藏体检'
    toggleDrawerButton.setAttribute('aria-expanded', String(!layout.rightCollapsed))
  }
  scheduleViewerResize()
}

// ---------------------------------------------------------------- 分隔条拖拽

const splitterDrag = {
  name: '',
  startX: 0,
  startY: 0,
  startLeft: 0,
  startRight: 0,
  startBottom: 0,
  element: null,
}

function beginSplitterDrag(name, clientX, clientY, element, pointerId) {
  if (name === 'bottom' && layout.logCollapsed) return false
  if (name === 'right' && appShell.classList.contains('narrow')) return false
  splitterDrag.name = name
  splitterDrag.startX = clientX
  splitterDrag.startY = clientY
  splitterDrag.startLeft = layout.left
  splitterDrag.startRight = layout.right
  splitterDrag.startBottom = layout.bottom
  splitterDrag.element = element || null
  splitterDrag.element?.classList.add('dragging')
  // 指针捕获让拖动离开 4px 细条也继续；合成事件（冒烟测试）没有活动指针，捕获会抛，
  // 忽略即可 —— 那种情况下 pointermove 直接派发到 window，同样能驱动。
  try {
    element?.setPointerCapture?.(pointerId)
  } catch (error) {
    // 合成 PointerEvent：没有可捕获的活动指针
  }
  return true
}

function moveSplitterDrag(clientX, clientY) {
  if (!splitterDrag.name) return
  const deltaX = clientX - splitterDrag.startX
  const deltaY = clientY - splitterDrag.startY
  if (splitterDrag.name === 'left') {
    commitLayout({ ...layout, left: splitterDrag.startLeft + deltaX })
  } else if (splitterDrag.name === 'right') {
    commitLayout({ ...layout, right: splitterDrag.startRight - deltaX })
  } else {
    commitLayout({ ...layout, bottom: splitterDrag.startBottom - deltaY })
  }
  applyLayout()
}

function endSplitterDrag() {
  if (!splitterDrag.name) return
  splitterDrag.name = ''
  splitterDrag.element?.classList.remove('dragging')
  splitterDrag.element = null
  saveLayout()
  // 拖动结束后再补一次，避免最后一帧被 rAF 合并掉
  scheduleViewerResize()
}

function nudgeSplitter(name, delta) {
  if (name === 'bottom' && layout.logCollapsed) return
  if (name === 'right' && appShell.classList.contains('narrow')) return
  if (name === 'left') commitLayout({ ...layout, left: layout.left + delta })
  else if (name === 'right') commitLayout({ ...layout, right: layout.right - delta })
  else commitLayout({ ...layout, bottom: layout.bottom - delta })
  applyLayout()
  saveLayout()
}

function wireSplitter(element, name) {
  if (!element) return
  element.addEventListener('pointerdown', (event) => {
    if (typeof event.button === 'number' && event.button !== 0) return
    if (!beginSplitterDrag(name, event.clientX, event.clientY, element, event.pointerId)) return
    event.preventDefault()
  })
  element.addEventListener('keydown', (event) => {
    const back = name === 'bottom' ? 'ArrowUp' : 'ArrowLeft'
    const forward = name === 'bottom' ? 'ArrowDown' : 'ArrowRight'
    if (event.key !== back && event.key !== forward) return
    event.preventDefault()
    nudgeSplitter(name, event.key === forward ? SPLITTER_KEY_STEP : -SPLITTER_KEY_STEP)
  })
}

// ---------------------------------------------------------------- 折叠 / 抽屉

function toggleLogPane(force) {
  const next = force === undefined ? !layout.logCollapsed : Boolean(force)
  if (next === layout.logCollapsed) return
  commitFlags({ logCollapsed: next })
  applyLayout()
  saveLayout()
}

function toggleRightPane(force) {
  const narrow = Boolean(appShell.classList.contains('narrow'))
  if (narrow) {
    const next = force === undefined ? !layout.drawerOpen : Boolean(force)
    if (next === layout.drawerOpen) return
    layout = { ...layout, drawerOpen: next }
  } else {
    const next = force === undefined ? !layout.rightCollapsed : Boolean(force)
    if (next === layout.rightCollapsed) return
    commitFlags({ rightCollapsed: next })
  }
  applyLayout()
  saveLayout()
}

function toggleHelpPane() {
  const open = Boolean(helpPanel.hidden)
  helpPanel.hidden = !open
  toggleHelpButton.setAttribute('aria-expanded', String(open))
  // 帮助面板**不参与栏位预算**（TASK-011）：它打开只临时占用工作区高度（网格 1fr 行自己吸收），
  // 既不改 --pane-bottom 也不落盘。这里只需要让 3D 画布按新容器尺寸重算。
  scheduleViewerResize()
}

/** @description 窄窗口（<1100px）降级为两栏 + 右栏抽屉；窗口宽度跨过断点时只重算生效值。 */
function syncNarrowMode(isNarrow) {
  if (!appShell) return
  appShell.classList.toggle('narrow', isNarrow)
  // 断点变化属于非用户事件：绝不落盘（用户在大窗口下的尺寸必须留着）
  refitLayout()
  applyLayout()
}

function initLayout() {
  // 幂等护栏：这里挂的是 matchMedia / ResizeObserver / 窗口与分隔条等**一次性**监听，
  // 被调用两次会让每个处理器各跑一遍（实测再点一次折叠按钮，logCollapsed 翻转两次等于没翻）
  if (layoutInitialized) return
  layoutInitialized = true
  const stored = readStoredLayout()
  adoptLayout(stored || LAYOUT_RATIO_DEFAULT)
  // 旧版（version 1）像素载荷一旦迁移成功就立刻按新格式回写，避免每次启动都重算一遍
  if (stored?.migrated) saveLayout()
  const narrowQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 1099px)')
    : null
  if (narrowQuery) {
    appShell.classList.toggle('narrow', narrowQuery.matches)
    if (typeof narrowQuery.addEventListener === 'function') {
      narrowQuery.addEventListener('change', (event) => syncNarrowMode(event.matches))
    }
  }
  refitLayout()
  applyLayout()
  wireSplitter(splitterLeft, 'left')
  wireSplitter(splitterRight, 'right')
  wireSplitter(splitterBottom, 'bottom')
  toggleLogButton.addEventListener('click', () => toggleLogPane())
  toggleDrawerButton.addEventListener('click', () => toggleRightPane())
  closeDrawerButton.addEventListener('click', () => toggleRightPane(false))
  toggleHelpButton.addEventListener('click', toggleHelpPane)
  window.addEventListener('pointermove', (event) => {
    if (!splitterDrag.name) return
    event.preventDefault()
    moveSplitterDrag(event.clientX, event.clientY)
  })
  window.addEventListener('pointerup', () => endSplitterDrag())
  window.addEventListener('pointercancel', () => endSplitterDrag())

  // Cesium 只监听 window resize，容器自身的变化它感知不到 —— 这里补上。
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => scheduleViewerResize())
    observer.observe(cesiumContainer)
  }
  let windowResizeFrame = 0
  window.addEventListener('resize', () => {
    if (windowResizeFrame) return
    windowResizeFrame = requestAnimationFrame(() => {
      windowResizeFrame = 0
      // 窗口缩放属于非用户事件：只重算生效值，**不落盘**（用户的选择要能随窗口恢复回来）
      refitLayout()
      applyLayout()
    })
  })
}

// 冒烟测试（test/ui-smoke.cjs）用真实 PointerEvent 驱动分隔条；这里另外暴露只读的布局
// 快照与"从 localStorage 恢复"入口，供恢复/夹取断言复用同一套内部函数（不另写一份逻辑）。
window.__layout = {
  key: LAYOUT_KEY,
  get: () => ({ ...layout }),
  getRatio: () => ({ ...layoutRatio }),
  limits: {
    ...PANE_LIMITS,
    ratio: PANE_RATIO_LIMITS,
    ratioDefault: LAYOUT_RATIO_DEFAULT,
    centerMinWidth: CENTER_MIN_WIDTH,
    centerMinHeight: CENTER_MIN_HEIGHT,
    canvasMinHeight: CANVAS_MIN_HEIGHT,
    logCollapsedHeight: LOG_COLLAPSED_HEIGHT,
  },
  clamp: (input) => clampLayout(input),
  restore: () => {
    const stored = readStoredLayout()
    adoptLayout(stored || LAYOUT_RATIO_DEFAULT)
    if (stored?.migrated) saveLayout()
    applyLayout()
    return { ...layout }
  },
  resizeCount: () => viewerResizeCount,
}

// ================================================================ 状态栏

const statusState = {
  model: { name: '', bytes: null },
  inspect: null,
  batch: null,
}

function formatBytesShort(bytes) {
  // null/undefined 不能被 Number() 折成 0 —— "0 B" 会被误读成"有个 0 字节的模型"
  if (bytes === null || bytes === undefined || bytes === '') return '—'
  const number = Number(bytes)
  if (!Number.isFinite(number) || number < 0) return '—'
  if (number < 1024) return `${number} B`
  if (number < 1048576) return `${(number / 1024).toFixed(1)} KB`
  return `${(number / 1048576).toFixed(2)} MB`
}

function baseName(filePath) {
  if (!filePath) return ''
  const parts = String(filePath).split(/[\\/]/)
  return parts[parts.length - 1] || String(filePath)
}

function renderStatusBar() {
  const model = statusState.model
  statusModel.textContent = model.name ? baseName(model.name) : '未选择'
  statusModel.title = model.name || ''
  statusModelSize.textContent = formatBytesShort(model.bytes)

  const inspect = statusState.inspect
  if (!inspect) {
    statusInspect.textContent = '未体检'
  } else if (inspect.failed) {
    statusInspect.textContent = '体检失败'
  } else {
    statusInspect.textContent = `耗时 ${inspect.elapsedMs ?? 0} ms · 错误 ${inspect.error} / 警告 ${inspect.warn} / 提示 ${inspect.info}`
  }
  // 窄布局会把 #inspectStatus 收进抽屉并隐藏，配色线索不能一起丢——这里带同样的档位类
  statusInspect.className = `status-inspect${inspect ? ` ${inspect.failed ? 'error' : (inspect.level || 'ok')}` : ''}`.trim()

  const batch = statusState.batch
  statusProgress.textContent = batch
    ? `成功 ${batch.success} / 失败 ${batch.failed} / 共 ${batch.total}`
    : '未开始'
}


function appendLog(message, className) {
  const line = document.createElement('div')
  if (className) line.className = className
  line.textContent = message
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
}

function renderInputs() {
  inputSummary.textContent = state.inputPaths.length ? `${state.inputPaths.length} 个输入` : '未选择'
  inputBadge.textContent = String(state.inputPaths.length)
  inputList.innerHTML = ''
  for (const item of state.inputPaths) {
    const li = document.createElement('li')
    li.textContent = item
    inputList.appendChild(li)
  }
}

function renderOutput() {
  outputSummary.textContent = state.outputDir || '未选择'
}

function renderResults(reports) {
  resultList.innerHTML = ''
  for (const report of reports) {
    const li = document.createElement('li')
    if (report.status === 'error') {
      li.textContent = `ERROR ${report.inputPath}：${report.error}`
      appendLog(`修复失败：${report.inputPath}：${report.error}`, 'error')
    } else {
      li.textContent = `${report.status.toUpperCase()} ${report.inputPath} -> ${report.outputPath} (${report.oldBytes}B -> ${report.newBytes}B, baked=${report.skinnedMeshesBaked || 0}, converted=${report.imagesConverted}, embedded=${report.externalImagesEmbedded || 0}, uv=${report.texCoordsFilled || 0}, merged=${report.primitivesMerged || 0}, down=${report.texturesDownsampled || 0})`
      // BR-032：贴图降采样必须在日志里说清楚——选「不降」时也要明确讲"未降采样"，
      // 而不是静默省略（用户才不会以为降过了或是忘了降）
      appendLog(`${report.outputPath}：${describeTextureDownsample(report)}`, 'ok')
    }
    resultList.appendChild(li)
  }
  // 批量结果就是权威进度：成功/失败/总数直接由报告统计，状态栏与之保持一致
  statusState.batch = {
    success: reports.filter((report) => report.status !== 'error').length,
    failed: reports.filter((report) => report.status === 'error').length,
    total: reports.length,
  }
  renderStatusBar()
}

/** @description 贴图降采样的中文说明（BR-032）。档位为「不降」时也要明确表达"未降采样"。 */
function describeTextureDownsample(report) {
  const before = Number(report?.textureBytesBefore) || 0
  const after = Number(report?.textureBytesAfter) || 0
  const count = Number(report?.texturesDownsampled) || 0
  const tier = Number(report?.maxTextureSize) || 0
  if (tier <= 0) return `贴图：未降采样（档位「不降」，共 ${formatBytesShort(before)}）`
  if (count <= 0) return `贴图：没有超过 ${tier}px 的贴图，未降采样（共 ${formatBytesShort(before)}）`
  return `贴图降采样：${count} 张，最长边 ≤ ${tier}px，${formatBytesShort(before)} → ${formatBytesShort(after)}`
}

function showProgress(done, total, message, className = '') {
  progressWrap.hidden = false
  progressText.textContent = message
  progressCounter.textContent = total > 0 ? `${done}/${total}` : ''
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  progressFill.style.width = `${percent}%`
  progressFill.className = `progress-fill ${className}`.trim()
}

function setRunning(running) {
  runRepairButton.disabled = running
  runRepairButton.textContent = running ? '修复中…' : '开始修复'
}

/** @description 待转换格式的中文名（进度与日志文案用；别再一律写成 IVE）。 */
function convertFormatLabel(relativePath) {
  const ext = String(relativePath || '').toLowerCase().split('.').pop()
  if (ext === 'ive') return 'IVE'
  if (ext === 'fbx') return 'FBX'
  if (ext === 'obj') return 'OBJ'
  return '模型'
}

function handleRepairProgress(progress) {
  switch (progress?.phase) {
    case 'scanning':
      showProgress(0, 0, '正在扫描输入，统计待修复模型数量…')
      break
    case 'start':
      statusState.batch = { success: 0, failed: 0, total: progress.total }
      renderStatusBar()
      if (progress.total === 0) {
        showProgress(0, 0, '未在所选输入中找到 GLB 文件。', 'done')
        appendLog('未在所选输入中找到 GLB 文件。', 'error')
        break
      }
      showProgress(0, progress.total, `共 ${progress.total} 个模型，开始批量修复…`)
      appendLog(`开始批量修复：共 ${progress.total} 个模型`)
      break
    case 'file-start':
      showProgress(progress.index, progress.total, `正在修复：${progress.relativePath}`)
      appendLog(`[${progress.index + 1}/${progress.total}] 修复中：${progress.relativePath}`)
      break
    case 'file-done':
      if (statusState.batch) {
        statusState.batch.failed += progress.status === 'error' ? 1 : 0
        statusState.batch.success = Math.max(0, progress.completed - statusState.batch.failed)
        statusState.batch.total = progress.total
        renderStatusBar()
      }
      showProgress(
        progress.completed,
        progress.total,
        progress.status === 'error'
          ? `失败：${progress.relativePath}`
          : `已完成：${progress.relativePath}`,
        progress.completed === progress.total ? 'done' : '',
      )
      break
    case 'convert-start':
      // 待转换的不止 IVE（还有 FBX/OBJ）：文案按源扩展名走，别把 FBX 说成 IVE
      showProgress(progress.index, progress.total, `正在把 ${convertFormatLabel(progress.relativePath)} 转换为 GLB：${progress.relativePath}`)
      appendLog(`[${convertFormatLabel(progress.relativePath)} ${progress.index + 1}/${progress.total}] 转换中：${progress.relativePath}`)
      break
    case 'convert-done':
      if (progress.status === 'error') {
        showProgress(progress.index + 1, progress.total, `${convertFormatLabel(progress.relativePath)} 转换失败：${progress.relativePath}`, 'done')
        appendLog(`${convertFormatLabel(progress.relativePath)} 转换失败：${progress.relativePath}：${progress.error}`, 'error')
      } else {
        showProgress(progress.index + 1, progress.total, `${convertFormatLabel(progress.relativePath)} 已转换为 GLB：${progress.relativePath}`)
        // 尺寸是世界包围盒（宽 × 高 × 前后深，单位米）——只有 IVE 那条链会报，FBX/OBJ 没有
        const size = Array.isArray(progress.worldSize) && progress.worldSize.length === 3
          ? `，尺寸 ${progress.worldSize.map((value) => Number(value).toFixed(2)).join(' × ')} m`
          : ''
        // 焊接收益：原始几何是三角汤，这里显示的才是真正落盘的顶点数
        const geometry = Number.isFinite(progress.vertices) && progress.vertices > 0
          ? `，顶点 ${progress.vertices}`
            + (progress.verticesBefore > progress.vertices ? `（同类合并前 ${progress.verticesBefore}）` : '')
            + `，三角面 ${progress.triangles}`
          : ''
        // FBX/OBJ 没有"剪掉无网格节点"这一步，字段缺失时不能打印 undefined
        const pruned = Number.isFinite(progress.prunedNodes) ? `，剪掉无网格节点 ${progress.prunedNodes} 个` : ''
        const images = Number.isFinite(progress.images) ? `贴图 ${progress.images} 张，` : ''
        appendLog(
          `${convertFormatLabel(progress.relativePath)} 转换完成：${progress.relativePath} → ${(progress.newBytes / 1024 / 1024).toFixed(2)} MB，`
          + `${images}网格 ${progress.meshes} 个${pruned}，`
          + `坐标 ${progress.axis || '未转换'}${size}${geometry}`,
          'ok',
        )
        // 转换阶段的告警（例如 MTL 里指向别的机器的贴图路径解析不到）必须在这里打出来，
        // 否则批量路径会把它们静默吞掉——只有单文件预览那条路才会显示（冷审 I-2）
        for (const warning of progress.warnings || []) appendLog(`转换告警：${warning}`, 'warn')
      }
      break
    case 'done':
      statusState.batch = {
        success: Math.max(0, progress.completed - progress.failed),
        failed: progress.failed,
        total: progress.total,
      }
      renderStatusBar()
      showProgress(
        progress.completed,
        progress.total,
        progress.failed > 0
          ? `批量修复结束：成功 ${progress.completed - progress.failed} 个，失败 ${progress.failed} 个。`
          : `批量修复结束：全部 ${progress.completed} 个模型修复成功。`,
        'done',
      )
      break
    default:
      break
  }
}

function setValidationStatus(message, className = '') {
  validationStatus.textContent = message
  validationStatus.className = `status ${className}`.trim()
}

function setValidationModelSummary(filePath, bytes) {
  validationModelSummary.textContent = filePath
    ? `当前验证模型：${filePath} · ${bytes.toLocaleString()} 字节`
    : '当前验证模型：未选择'
  // CSS 已把这一行固定成单行省略号（TASK-011）：完整路径挂 title，长路径hover 仍可读全
  validationModelSummary.title = filePath
    ? `${filePath} · ${bytes.toLocaleString()} 字节`
    : ''
  statusState.model = { name: filePath || '', bytes: Number.isFinite(bytes) ? bytes : null }
  renderStatusBar()
}

// ---------------------------------------------------------------- 模型体检面板

function setInspectStatus(message, className = '') {
  inspectStatus.textContent = message
  inspectStatus.className = `status ${className}`.trim()
}

function resetInspectPanel() {
  inspectPanel.hidden = true
  inspectWorldBox.textContent = '—'
  inspectWorldCenter.textContent = '—'
  inspectAccessorBox.textContent = '—'
  inspectAccessorCenter.textContent = '—'
  inspectDeviation.textContent = ''
  inspectDeviation.className = 'inspect-deviation'
  inspectFacts.innerHTML = ''
  inspectIssues.innerHTML = ''
}

function fillInspectBoxes(bounds) {
  const world = bounds?.world ?? null
  const accessor = bounds?.accessorUnion ?? null
  inspectWorldBox.textContent = reportFormat.formatBox(world)
  inspectWorldCenter.textContent = `中心 ${reportFormat.formatCenter(world)}`
  inspectAccessorBox.textContent = reportFormat.formatBox(accessor)
  inspectAccessorCenter.textContent = `中心 ${reportFormat.formatCenter(accessor)}`
}

function renderInspectFacts(report) {
  inspectFacts.innerHTML = ''
  for (const row of reportFormat.factRows(report)) {
    const li = document.createElement('li')
    const label = document.createElement('span')
    label.className = 'fact-label'
    label.textContent = row.label
    const value = document.createElement('span')
    value.className = 'fact-value'
    value.textContent = row.value
    li.append(label, value)
    inspectFacts.appendChild(li)
  }
}

function renderInspectIssues(report) {
  inspectIssues.innerHTML = ''
  const issues = reportFormat.sortIssues(report?.issues)
  if (!issues.length) {
    const li = document.createElement('li')
    li.className = 'issue-info'
    li.textContent = '未发现问题'
    inspectIssues.appendChild(li)
    return
  }
  for (const issue of issues) {
    const level = issue?.level ?? 'info'
    const li = document.createElement('li')
    li.className = `issue-${level}`
    const code = issue?.code ? `[${issue.code}] ` : ''
    const detail = issue?.detail ? `—— ${issue.detail}` : ''
    li.textContent = `${ISSUE_LEVEL_LABELS[level] ?? '提示'} ${code}${issue?.message ?? ''}${detail}`
    inspectIssues.appendChild(li)
  }
}

/** @description 体检失败：只更新状态与偏差行，**不抛出**，预览照常进行。 */
function renderInspectFailure(message) {
  inspectPanel.hidden = false
  fillInspectBoxes(null)
  inspectDeviation.textContent = message
  inspectDeviation.className = 'inspect-deviation error'
  inspectFacts.innerHTML = ''
  inspectIssues.innerHTML = ''
  setInspectStatus(`体检失败：${message}`, 'error')
  appendLog(`模型体检失败：${message}`, 'error')
  statusState.inspect = { failed: true }
  renderStatusBar()
}

function renderInspectionResult(result) {
  const report = result?.report
  if (!result?.ok || !report) {
    renderInspectFailure(result?.error || '体检没有返回报告。')
    return
  }
  // 双保险：main.js 的 handler 已把 inspect() 的 ok:false 折成 { ok:false, error }，但报告本身
  // 也可能来自别处（例如将来的 IPC 复用），这里再判一次，保证面板永远只显示中文原因。
  if (report.ok !== true) {
    const firstError = (Array.isArray(report.issues) ? report.issues : [])
      .find((issue) => issue?.level === 'error')
    renderInspectFailure(firstError?.message || '文件无法体检（报告不可用）。')
    return
  }

  inspectPanel.hidden = false
  for (const warning of result.conversionWarnings || []) appendLog(`转换告警：${warning}`, 'warn')
  fillInspectBoxes(report.bounds)

  const level = reportFormat.deviationLevel(report.bounds?.deviationFactor)
  inspectDeviation.textContent = reportFormat.deviationText(report)
  inspectDeviation.className = `inspect-deviation${level === 'ok' ? '' : ` ${level}`}`

  renderInspectFacts(report)
  renderInspectIssues(report)

  const counts = reportFormat.issueCounts(report.issues)
  const issueSummary = counts.error || counts.warn || counts.info
    ? `错误 ${counts.error} / 警告 ${counts.warn} / 提示 ${counts.info}`
    : '未发现问题'
  const partialNote = report.partial ? ' · 报告不完整（文件结构异常，问题清单已说明原因）' : ''
  const statusLevel = report.partial || counts.error > 0 ? 'warn' : 'ok'
  statusState.inspect = {
    elapsedMs: Number.isFinite(report.elapsedMs) ? report.elapsedMs : 0,
    error: counts.error,
    warn: counts.warn,
    info: counts.info,
    partial: Boolean(report.partial),
    level: statusLevel,
  }
  renderStatusBar()
  setInspectStatus(
    `体检完成 · ${report.elapsedMs ?? 0} ms · ${issueSummary}${partialNote}`,
    statusLevel,
  )
  appendLog(
    `模型体检完成：${report.fileName || result.filePath} · ${((report.fileBytes ?? 0) / 1048576).toFixed(2)} MB`
    + ` · ${issueSummary}${partialNote}`,
    report.partial || counts.error > 0 ? 'warn' : 'ok',
  )
}

async function loadInspection(filePath) {
  const token = ++inspectToken
  resetInspectPanel()
  if (inspectEmpty) inspectEmpty.hidden = true
  if (!reportFormat) {
    setInspectStatus('体检面板模块未加载', 'error')
    return
  }
  setInspectStatus('正在体检…')
  try {
    const result = await window.repairApp.inspectGlb(filePath)
    if (token !== inspectToken) return
    renderInspectionResult(result)
  } catch (error) {
    if (token !== inspectToken) return
    renderInspectFailure(formatError(error))
  }
}

// ---------------------------------------------------------------- 预览方向/缩放（仅预览）

function readPreviewInput() {
  return {
    yawDeg: Number(previewYaw.value),
    scale: Number(previewScale.value),
    axis: previewAxis.value,
  }
}

function previewYawLabel(yawDeg) {
  return `${Number(yawDeg.toFixed(1))}°`
}

function previewScaleLabel(scale) {
  return `${scale.toFixed(2)}×`
}

function updatePreviewLabels() {
  if (!previewTools) return
  const preview = previewTools.clampPreview(readPreviewInput())
  previewYawValue.textContent = previewYawLabel(preview.yawDeg)
  previewScaleValue.textContent = previewScaleLabel(preview.scale)
}

/**
 * @description 只改 Cesium 预览的 modelMatrix（均匀缩放 × 绕 Y 轴旋转，可选的 Z-up→Y-up
 *   绕 X 轴 −90°），并把最终矩阵写进日志。**绝不写回任何文件**（ADR-004：写回必须是另一个
 *   显式操作，当前不存在）。
 * @param {{log?: boolean, prefix?: string}} [options] 拖动过程中 `log:false`（只实时改矩阵，
 *   不然一次拖动会刷出几十行日志，把"最终 modelMatrix"这条验收证据淹掉）；松手（`change`）
 *   或重置时才记一行。
 */
function applyPreviewTransform(options = {}) {
  const { log = true, prefix = '预览修正：' } = options
  if (!previewTools) {
    appendLog('预览修正模块未加载，无法应用方向/缩放。', 'error')
    return
  }
  const preview = previewTools.clampPreview(readPreviewInput())
  const summary = previewTools.describePreview(preview)
  if (!state.model || !state.viewer) {
    if (log) appendLog(`预览修正未生效：还没有加载预览模型。当前设置：${summary}（仅预览修正，未写入输出文件）`, 'warn')
    return
  }
  const matrix = previewTools.previewMatrix(preview)
  state.model.modelMatrix = Cesium.Matrix4.fromArray(matrix)
  state.viewer.scene.requestRender()
  if (log) {
    appendLog(`${prefix}${summary} · modelMatrix=[${matrix.map((value) => value.toFixed(4)).join(', ')}]（仅预览修正，未写入输出文件）`)
  }
}

/** @description 读取上次的预览选择（REQ-010）。没有记录时返回 null——"从未选过"与"选了 auto"必须可区分。 */
function readStoredPreview() {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (parsed.version !== PREVIEW_VERSION) return null
    // clampPreview 负责把垃圾值规整成合法默认值（yaw 取整到 5°、scale 夹到区间、axis 只认三态）
    return previewTools.clampPreview({ yawDeg: parsed.yawDeg, scale: parsed.scale, axis: parsed.axis })
  } catch (error) {
    // 隐私模式 / 坏 JSON：当作"没记录过"，绝不影响使用
    return null
  }
}

/** @description 记住预览选择。**只在用户显式操作时调用**（控件 change 或重置按钮）。 */
function savePreviewPreference() {
  if (!previewTools) return
  try {
    const preview = previewTools.clampPreview(readPreviewInput())
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({
      version: PREVIEW_VERSION,
      yawDeg: preview.yawDeg,
      scale: preview.scale,
      axis: preview.axis,
    }))
  } catch (error) {
    // 配额/隐私模式：记不住不是功能故障
  }
}

/**
 * @description 让控件回到"上次显式选择"（若存在）或默认值，并刷新标签。
 * @param {{stored?: object|null}} [options] `stored` 由调用方传入（避免每次重读 localStorage）
 */
function resetPreviewControls(options = {}) {
  if (!previewTools) return
  if (!previewAxis.options.length) {
    for (const option of previewTools.axisOptions()) {
      const element = document.createElement('option')
      element.value = option.value
      element.textContent = option.label
      previewAxis.appendChild(element)
    }
  }
  const source = options.stored || previewTools.PREVIEW_DEFAULT
  previewYaw.value = String(source.yawDeg)
  previewScale.value = String(source.scale)
  previewAxis.value = source.axis
  updatePreviewLabels()
}

async function validateModel(filePath) {
  if (!filePath) return
  // 体检与预览互不依赖：这里先并行发起，任何体检失败都只落到面板上，不会打断 Cesium 加载。
  loadInspection(filePath)
  if (!window.Cesium) {
    setValidationStatus('CesiumJS 加载失败', 'error')
    appendLog('CesiumJS 未加载，请检查网络连接。', 'error')
    return
  }

  setValidationStatus('正在加载...')
  try {
    const payload = await window.repairApp.readGlbDataUrl(filePath)
    state.validationBounds = payload.bounds
    setValidationModelSummary(payload.filePath, payload.bytes)
    appendValidationMetadata(payload.metadata)
    // 转换阶段解析不到的贴图（FBX/OBJ 常见：MTL 指向别的机器的绝对路径）如实报出来
    for (const warning of payload.conversionWarnings || []) appendLog(`转换告警：${warning}`, 'warn')
    if (!state.viewer) {
      state.viewer = new Cesium.Viewer(cesiumContainer, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        vrButton: false,
        imageryProvider: false,
      })
      state.viewer.scene.globe.show = false
      state.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#eaf1f5')
      state.viewer.scene.skyBox.show = false
      state.viewer.scene.sun.show = false
      state.viewer.scene.moon.show = false
      state.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 0.02
      state.viewer.camera.frustum.near = 0.01
      state.viewer.scene.requestRenderMode = false
      state.viewer.scene.renderError.addEventListener((scene, error) => {
        appendLog(`Cesium 渲染错误：${formatError(error)}`, 'error')
      })
    }

    if (state.model) {
      state.viewer.scene.primitives.remove(state.model)
      state.model = null
    }

    const model = await Cesium.Model.fromGltfAsync({
      url: payload.dataUrl,
      scale: 1,
      modelMatrix: Cesium.Matrix4.IDENTITY,
      backFaceCulling: false,
      minimumPixelSize: 96,
    })
    if (!model) {
      throw new Error('Cesium 未返回模型对象。')
    }
    state.model = model
    // 新模型的预览修正：默认回到默认值；若用户**显式选过**（REQ-010），沿用那组选择并立即生效
    const storedPreview = readStoredPreview()
    resetPreviewControls({ stored: storedPreview })
    model.backFaceCulling = false
    model.minimumPixelSize = 96
    model.debugShowBoundingVolume = false
    state.viewer.scene.primitives.add(model)
    appendLog(`Cesium 模型对象已创建：${filePath}`)
    if (storedPreview) {
      applyPreviewTransform({ prefix: '预览修正（沿用上次选择）：' })
    }
    const loadedStatusText = `加载成功 · ${(payload.bytes / 1000 / 1000).toFixed(2)} MB / ${(payload.bytes / 1024 / 1024).toFixed(2)} MiB`
    // 超时兜底恢复：窗口恢复后终于渲染出第一帧时，重新诊断与取景（否则停在回退取景上）
    const onLateReady = () => {
      appendModelDiagnostics(model, payload.bounds)
      frameModelPreview(model, payload.bounds)
      state.viewer?.scene.requestRender()
      setValidationStatus(loadedStatusText, 'ok')
      appendLog('模型在窗口恢复后完成首次渲染，已重新取景并更新状态', 'ok')
    }
    const readyState = await waitForModelReady(model, 5000, onLateReady)
    if (readyState === 'timeout') {
      // 绝不能报成"加载成功"：窗口不可见时一帧都没渲染，画面还是空的（TASK-009）
      appendLog('模型对象已创建，但当前未渲染（窗口不可见/被遮挡时 Cesium 不渲染）——仍会继续做诊断与取景，请把窗口切到前台确认', 'warn')
    }
    appendModelDiagnostics(model, payload.bounds)
    startModelAnimations(model, payload.metadata)
    await frameModelPreview(model, payload.bounds)
    state.viewer.scene.requestRender()

    if (readyState === 'timeout') {
      setValidationStatus('已创建模型，但当前未渲染（请把窗口切到前台）', 'warn')
    } else {
      setValidationStatus(loadedStatusText, 'ok')
      appendLog(`Cesium 验证成功：${filePath} · ${payload.bytes.toLocaleString()} 字节`, 'ok')
    }
  } catch (error) {
    setValidationStatus('加载失败', 'error')
    appendLog(`Cesium 验证失败：${error.message}`, 'error')
  }
}

function appendValidationMetadata(metadata) {
  if (!metadata) return
  appendLog(`Cesium 验证输入：meshes=${metadata.meshCount}, materials=${metadata.materialCount}, images=${metadata.imageCount}, skins=${metadata.skinCount}, animations=${metadata.animationCount}, skinned=${metadata.hasSkinnedMeshes}`)
  if (metadata.extensionsRequired.length) {
    appendLog(`GLB 必需扩展：${metadata.extensionsRequired.join(', ')}`)
  }
  if (metadata.extensionsUsed.length) {
    appendLog(`GLB 使用扩展：${metadata.extensionsUsed.join(', ')}`)
  }
  if (metadata.externalImageUris.length) {
    appendLog(`GLB 存在外部贴图：${metadata.externalImageUris.join(' | ')}`, 'error')
  }
}

function formatError(error) {
  if (!error) return '未知错误'
  return error.message || error.toString()
}

/**
 * @description 等模型就绪，**必须带超时**。窗口不可见/被遮挡时页面会被节流：`requestAnimationFrame`
 *   几乎不跑 → Cesium 一帧都没渲染（`frameNumber` 恒为 0、`resourcesLoaded` 仍为 false）→
 *   那句"置 `_ready` 并发 `readyEvent`"的 `afterRender` 回调永不执行。没有超时兜底，
 *   `validateModel` 会一直挂在这里：`#validationStatus` 永远停在「正在加载…」，包围盒诊断与
 *   默认取景也都不跑（窗口恢复可见后回调才会补跑，所以不是永久卡死）。走到这里说明
 *   `Cesium.Model.fromGltfAsync` 已经返回、模型对象有效，所以超时按"已创建但未渲染"处理，
 *   不能报成加载失败。
 * @param {object} model Cesium.Model
 * @param {number} [timeoutMs] 等渲染的上限
 * @returns {Promise<'ready'|'timeout'>} `timeout` 表示等不到渲染（模型对象仍然有效）
 */
function waitForModelReady(model, timeoutMs = 5000, onLateReady = null) {
  if (model.ready) return Promise.resolve('ready')
  return new Promise((resolve, reject) => {
    let settled = false
    let removeReadyListener
    let removeErrorListener
    let timer
    const dropErrorListener = () => {
      removeErrorListener?.()
      removeErrorListener = undefined
    }
    removeReadyListener = model.readyEvent.addEventListener(() => {
      if (settled) {
        // 超时之后才就绪：promise 已经交付过 'timeout'，但必须把状态与取景补上——否则画面
        // 永远停在按 accessor 盒回退的错误取景上（那正是工具自己报"相差 N 倍"的盒）。
        removeReadyListener?.()
        removeReadyListener = undefined
        onLateReady?.()
        return
      }
      settled = true
      clearTimeout(timer)
      removeReadyListener?.()
      removeReadyListener = undefined
      dropErrorListener()
      resolve('ready')
    })
    if (model.errorEvent) {
      removeErrorListener = model.errorEvent.addEventListener((error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        removeReadyListener?.()
        removeReadyListener = undefined
        dropErrorListener()
        reject(error instanceof Error ? error : new Error(formatError(error)))
      })
    }
    timer = setTimeout(() => {
      settled = true
      // 注意：**保留** ready 监听（等它在窗口恢复渲染后补跑），只撤掉错误监听与计时器
      dropErrorListener()
      resolve('timeout')
    }, timeoutMs)
  })
}

function appendModelDiagnostics(model, fallbackBounds) {
  const sphere = model.boundingSphere
  if (sphere && Number.isFinite(sphere.radius) && sphere.radius > 0) {
    const center = sphere.center
    appendLog(`Cesium 模型就绪：boundingSphere radius=${sphere.radius.toFixed(3)}, center=(${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`, 'ok')
    return
  }

  if (fallbackBounds) {
    appendLog(`Cesium 模型就绪，但未取得有效 boundingSphere；改用 accessors 范围 radius=${fallbackBounds.radius.toFixed(3)}`)
    return
  }

  appendLog('Cesium 模型就绪，但没有可用 boundingSphere 或 POSITION 范围。', 'error')
}

function startModelAnimations(model, metadata) {
  if (!metadata?.animationCount) return
  if (!model.activeAnimations?.addAll) {
    appendLog('Cesium 动画：当前模型对象未暴露 activeAnimations。', 'error')
    return
  }

  try {
    model.activeAnimations.addAll({
      loop: Cesium.ModelAnimationLoop.REPEAT,
    })
    appendLog(`Cesium 动画：已启动 ${metadata.animationCount} 个动画。`, 'ok')
  } catch (error) {
    appendLog(`Cesium 动画启动失败：${formatError(error)}`, 'error')
  }
}

function setModelViewFromCesiumBounds(model, fallbackBounds) {
  if (model.boundingSphere && model.boundingSphere.radius > 0) {
    setCameraToSphere(model.boundingSphere.center, model.boundingSphere.radius)
    return
  }
  setInitialModelView(fallbackBounds)
}

function setCameraToSphere(center, radius) {
  const safeRadius = Math.max(radius || 1, 0.25)
  const distance = safeRadius * 5.5
  const viewDirection = Cesium.Cartesian3.normalize(new Cesium.Cartesian3(1.8, -2.4, 1.25), new Cesium.Cartesian3())
  const cameraPosition = Cesium.Cartesian3.add(
    center,
    Cesium.Cartesian3.multiplyByScalar(viewDirection, distance, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  )
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(center, cameraPosition, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  )
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  )
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  )

  state.viewer.camera.setView({
    destination: cameraPosition,
    orientation: {
      direction,
      up,
    },
  })
  appendCameraDiagnostics(center, safeRadius)
  state.viewer.scene.requestRender()
}

async function frameModelPreview(model, fallbackBounds) {
  setModelViewFromCesiumBounds(model, fallbackBounds)
  state.viewer.scene.requestRender()
}

function setInitialModelView(bounds) {
  const center = bounds?.center || [0, 0, 0]
  const radius = Math.max(bounds?.radius || 1, 0.25)
  const target = new Cesium.Cartesian3(center[0], center[1], center[2])
  const offset = new Cesium.Cartesian3(
    radius * 4.5,
    radius * 1.3,
    radius * 1.9,
  )

  state.viewer.camera.lookAt(target, offset)
  // Release the temporary lookAt transform so Cesium's normal mouse controls
  // remain active after the initial framing.
  state.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
  state.viewer.scene.requestRender()
}

function appendCameraDiagnostics(target, radius) {
  const position = state.viewer.camera.position
  appendLog(`Cesium 相机：position=(${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)}), target=(${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)}), radius=${radius.toFixed(3)}`)
}

// 复用加载时的取景入口，保证「重置视角」与加载模型的默认视角完全一致。
// 之前这里直接调 setInitialModelView，走的是 accessor 边界那条回退路径，
// 和加载时优先采用的 boundSphere 取景不同，重置后视角会跳。
function resetModelView() {
  if (!state.viewer || !state.model) return
  setModelViewFromCesiumBounds(state.model, state.validationBounds)
  state.viewer.scene.requestRender()
}

document.getElementById('pickFiles').addEventListener('click', async () => {
  // 传当前选择：主进程做**累加去重**，逐个点选不会把之前选中的顶掉
  const previous = state.inputMode === 'files' ? state.inputPaths : []
  const paths = await window.repairApp.pickInputs('files', previous)
  const added = paths.length - previous.length
  state.inputMode = 'files'
  state.inputPaths = paths
  renderInputs()
  appendLog(added > 0
    ? `已累加 ${added} 个文件，当前共 ${paths.length} 个输入`
    : `已是当前选择（共 ${paths.length} 个输入）`)
})

document.getElementById('pickDir').addEventListener('click', async () => {
  const paths = await window.repairApp.pickInputs('directory')
  state.inputMode = 'directory'
  state.inputPaths = paths
  renderInputs()
  appendLog(`已选择目录 ${paths[0] || ''}`)
})

document.getElementById('clearInputs').addEventListener('click', () => {
  state.inputMode = 'files'
  state.inputPaths = []
  renderInputs()
  appendLog('已清空输入选择')
})

document.getElementById('pickOutput').addEventListener('click', async () => {
  const outputDir = await window.repairApp.pickOutputDir()
  state.outputDir = outputDir
  renderOutput()
  appendLog(`输出目录：${outputDir || '未选择'}`)
})

document.getElementById('pickValidation').addEventListener('click', async () => {
  // 预览只取单个文件：这里**不**累加，避免与批量的输入列表互相污染
  const paths = await window.repairApp.pickInputs('files', [])
  if (paths.length > 1) appendLog(`预览只加载第一个：${paths[0]}`, 'warn')
  await validateModel(paths[0])
})

document.getElementById('resetView').addEventListener('click', resetModelView)

// 预览修正控件：input 只实时改预览的 modelMatrix（不记日志，避免拖动刷屏），
// change（松手/选完）才记一行最终矩阵；绝不落盘（ADR-004）
const applyPreviewLive = () => {
  updatePreviewLabels()
  applyPreviewTransform({ log: false })
}
const applyPreviewAndLog = () => {
  updatePreviewLabels()
  applyPreviewTransform()
  // REQ-010：只有**显式操作**（松手 change）才记住这组选择；input 拖动过程不写
  savePreviewPreference()
}

previewYaw.addEventListener('input', applyPreviewLive)
previewYaw.addEventListener('change', applyPreviewAndLog)
previewScale.addEventListener('input', applyPreviewLive)
previewScale.addEventListener('change', applyPreviewAndLog)
// 上轴三态（ADR-002）：由人显式指定，推断结果绝不自作主张；这里同样只影响预览
previewAxis.addEventListener('change', applyPreviewAndLog)

resetPreviewButton.addEventListener('click', () => {
  resetPreviewControls()
  applyPreviewTransform({ prefix: '已重置预览修正：' })
  // 重置是显式操作：把默认值记下来，重启后仍是默认（而不是被当成"从未选过"）
  savePreviewPreference()
})

/** @description 修复选项（IPC 载荷的选项部分）。抽成函数，冒烟可以直接断言接线（BR-032）。 */
function collectRepairOptions() {
  return {
    freezePose: document.getElementById('freezePose').checked,
    // BR-032：贴图降采样档位（0 = 不降，默认）；主进程会再兜一次非法值
    maxTextureSize: Number(document.getElementById('textureMaxSize').value) || 0,
  }
}

runRepairButton.addEventListener('click', async () => {
  resultList.innerHTML = ''
  showProgress(0, 0, '正在扫描输入，统计待修复模型数量…')
  setRunning(true)
  try {
    const reports = await window.repairApp.repairGlb({
      inputPaths: state.inputPaths,
      inputMode: state.inputMode,
      outputDir: state.outputDir,
      ...collectRepairOptions(),
    })
    renderResults(reports)
    appendLog(`完成：${reports.length} 个任务`, 'ok')
    const firstSuccess = reports.find((report) => report.status === 'success')
    if (firstSuccess) await validateModel(firstSuccess.outputPath)
  } catch (error) {
    appendLog(error.message, 'error')
    showProgress(0, 0, `批量修复中断：${error.message}`)
  } finally {
    setRunning(false)
  }
})

window.repairApp.onRepairProgress(handleRepairProgress)

minimizeWindow.addEventListener('click', () => {
  window.repairApp.windowMinimize()
})

maximizeWindow.addEventListener('click', async () => {
  const maximized = await window.repairApp.windowToggleMaximize()
  maximizeWindow.textContent = maximized ? '❐' : '□'
  maximizeWindow.setAttribute('aria-label', maximized ? '还原' : '最大化')
})

closeWindow.addEventListener('click', () => {
  window.repairApp.windowClose()
})

window.repairApp.onWindowMaximizeState((maximized) => {
  maximizeWindow.textContent = maximized ? '❐' : '□'
  maximizeWindow.setAttribute('aria-label', maximized ? '还原' : '最大化')
})

// 三种待转换格式各有后端：IVE 靠随包的原生助手，FBX/OBJ 靠进程内的 assimpjs(WASM)。
// 缺哪个就说清哪个，不静默降级。
window.repairApp.capabilities().then((capabilities) => {
  if (!capabilities) return
  capabilityHint.hidden = false
  const formats = ['GLB']
  if (capabilities.ive) formats.push('IVE')
  if (capabilities.assimp) formats.push('FBX', 'OBJ')
  const notes = []
  if (capabilities.ive) notes.push('IVE 由 ive2glb 转换')
  if (capabilities.assimp) notes.push('FBX/OBJ 由 assimpjs 转换')
  capabilityHint.textContent = `支持输入 ${formats.join(' / ')}${notes.length ? `：${notes.join('；')}` : ''}，转换后进入同一套修复与 Cesium 验证流程。`
  if (!capabilities.ive) {
    appendLog(`IVE 转换不可用：未找到 ive2glb。已查找：${(capabilities.iveHelperSearched || []).join('、')}`, 'error')
  }
  if (!capabilities.assimp) {
    appendLog(`FBX/OBJ 转换不可用：${capabilities.assimpMessage || 'assimpjs 不可用'}`, 'error')
  }
}).catch(() => {
  // 能力探测失败不影响主流程
})

renderInputs()
renderOutput()
// REQ-010：启动时就把上次显式选过的预览三态摆到控件上，并说明它来自上次选择
{
  const storedPreview = readStoredPreview()
  resetPreviewControls({ stored: storedPreview })
  if (storedPreview) {
    appendLog(`预览修正：已沿用上次选择（${previewTools.describePreview(storedPreview)}）；点「重置预览修正」可恢复默认`, 'ok')
  }
}
initLayout()
renderStatusBar()

// 冒烟测试用：预览记忆的键与当前控件值（只读）
window.__preview = {
  key: PREVIEW_KEY,
  get: () => (previewTools ? previewTools.clampPreview(readPreviewInput()) : null),
  stored: () => localStorage.getItem(PREVIEW_KEY),
}
