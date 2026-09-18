// 界面接线冒烟（TASK-008 的自动化部分，**不参与 `npm test`**：`node --test "test/*.test.js"`
// 只发现 `*.test.js`，本文件是 `.cjs`，需要人手动跑）。
//
// 为什么需要它：Electron 壳层不在覆盖率插桩范围内，而「体检面板有没有真的渲染出来」
// 「滑块有没有改到 modelMatrix 且没写回文件」这类接线错误，纯函数单测抓不到。这里用
// DevTools Protocol 连进渲染进程，走一遍真实路径（体检 IPC + Cesium 加载 + 滑块 input/change
// + 上轴三态 + 日志 + 文件哈希），把结果打成 JSON。目视确认（直立/贴地/同框）仍需人工。
//
// 实现注意：每一步都是**独立的短求值**（不是一个大 await），这样某一步卡住时能直接看出是哪
// 一步，而不是整体超时成一团黑。实测「一次大求值」在刚启动的实例上会整体挂住。
//
// 用法（两个终端）：
//   npx electron . --remote-debugging-port=9333
//   node test/ui-smoke.cjs model/蹲姿.glb --port 9333
// 退出码 0 = 全部断言通过；1 = 有断言失败；2 = 连不上调试端口。
//
// 布局断言（REQ-006 / BR-027）怎么做的，以及为什么这么做：
//   · 视口尺寸用 `Emulation.setDeviceMetricsOverride` 覆写（实测 Electron 里
//     `Browser.getWindowForTarget`/`setWindowBounds` 不存在，返回 -32601），覆写在
//     `Page.reload` 之后仍然生效，所以能稳定地在 1280×800 与 900px 两个宽度上断言。
//   · 窗口宽度是布局记忆的一部分，跑第二轮时上一轮的 localStorage 会带进来。为了让同一
//     实例可以**重复跑**（也让"启动时恢复布局"走真实路径），开跑前先种入确定的布局值再
//     `Page.reload`，不靠"外部先把应用重启一遍"。
//   · 分隔条拖拽用合成 PointerEvent 打真实处理路径（pointerdown 在分隔条、pointermove/up
//     在 window）。`setPointerCapture` 对合成指针会抛 InvalidPointerId，渲染进程里已经
//     try/catch 兜住，因此**没有**为测试另开一条内部通路。
//   · `viewer.resize()` 双重取证：一是临时包住 `state.viewer.resize` 计数，二是渲染进程里
//     的内部计数器 `window.__layout.resizeCount()`。
const path = require('node:path')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')

const argv = process.argv.slice(2)
const modelArg = argv.find((value) => !value.startsWith('--')) || 'model/蹲姿.glb'
const portIndex = argv.indexOf('--port')
const port = portIndex >= 0 && argv[portIndex + 1] ? argv[portIndex + 1] : '9333'
const modelPath = path.resolve(modelArg)

const failures = []
// 已执行的断言数：脚本里有 25 处 `if (step) { check(...) }`，某一步 Runtime.evaluate 超时
// 返回 undefined 时整块断言会被**静默跳过**、仍然 exit 0。收尾用数量下限兜住这种假绿。
let checksRun = 0
// 断言调用点总数（99）。新增断言后必须同步抬高；低于它说明有整块断言被静默跳过。
const EXPECTED_CHECK_COUNT = 99
const check = (label, condition, detail) => {
  checksRun += 1
  if (condition) return
  failures.push(detail === undefined ? label : `${label}（实际：${detail}）`)
}

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page' && /index\.html/.test(target.url || ''))
  if (!page) throw new Error(`没有找到页面目标：${JSON.stringify(targets.map((t) => [t.type, t.url]))}`)
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket 连接失败')) }, { once: true })
  })

  let nextId = 0
  const steps = []
  const send = (method, params = {}) => {
    nextId += 1
    const id = nextId
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 5000)
      const handler = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        clearTimeout(timer)
        socket.removeEventListener('message', handler)
        resolve(message.result)
      }
      socket.addEventListener('message', handler)
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  // 窗口被遮挡时页面会进入 hidden，rAF 被节流 → Cesium 一帧都不渲染 → 模型的 ready 永远不置。
  // 冒烟因此先把页面提到前台，否则它天然依赖"跑测试时人把窗口留在最前面"。
  await send('Page.bringToFront')
  const evaluate = (label, expression, awaitPromise = false, timeout = 30000) => {
    nextId += 1
    const id = nextId
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        steps.push(`${label}: 超时 ${timeout}ms`)
        resolve(undefined)
      }, timeout)
      const handler = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        clearTimeout(timer)
        socket.removeEventListener('message', handler)
        if (message.result?.exceptionDetails) {
          const description = message.result.exceptionDetails.exception?.description || '未知异常'
          steps.push(`${label}: 页面内异常 ${description.split('\n')[0]}`)
          resolve(undefined)
          return
        }
        steps.push(label)
        resolve(message.result?.result?.value)
      }
      socket.addEventListener('message', handler)
      socket.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise, returnByValue: true },
      }))
    })
  }
  return { evaluate, steps, send, close: () => socket.close() }
}

const sha256 = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex')

async function main() {
  const before = sha256(modelPath)
  const client = await connect()
  const run = client.evaluate
  const send = client.send
  // 视口覆写：命中/退出编辑器的宽度断点。`Browser.setWindowBounds` 在 Electron 里不存在
  // （实测 getWindowForTarget 返回 -32601），Emulation 域可用且会真正改变 innerWidth/innerHeight。
  const setViewport = async (width, height) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  const clearViewport = async () => {
    await send('Emulation.clearDeviceMetricsOverride')
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  // 真实键盘输入（CDP 注入的事件是 trusted 的，会触发按钮的原生激活行为；
  // 页面里 dispatchEvent(new KeyboardEvent(...)) 不会）。
  const pressKey = async (name, keyCode) => {
    const base = { windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, key: name, code: name }
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
    if (name === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r' })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  // 原始求值（不进 steps），用于轮询页面重载
  const rawEval = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true })
    return result?.result?.value
  }
  // 页面错误采集：`window.__smokeErrors` 以前从未被赋值（死字段），于是"页面异常 0 条"这句
  // 结论其实没有数据来源。这里真正装上监听，并在**每次重载后**重装（重载会清掉 window）。
  const installErrorCollector = () => rawEval(`(() => {
    if (window.__smokeErrors) return window.__smokeErrors.length;
    window.__smokeErrors = [];
    window.addEventListener('error', (e) => window.__smokeErrors.push('error: ' + String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__smokeErrors.push('unhandledrejection: ' + String(e.reason)));
    return 0;
  })()`)
  // 重载页面：既让同一实例可以重复跑（状态栏/模型/布局都是上一轮遗留的），也让
  // "启动时从 localStorage 恢复布局"变成真实路径而不是事后调用。
  const reloadPage = async (label) => {
    await send('Page.reload')
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const probe = await rawEval(`({ ready: document.readyState, fn: typeof validateModel, layout: typeof window.__layout })`)
      if (probe && probe.ready === 'complete' && probe.fn === 'function' && probe.layout === 'object') {
        await installErrorCollector()
        client.steps.push(label)
        return true
      }
    }
    client.steps.push(`${label}: 超时`)
    return false
  }
  const seedLayout = async (value, label) => {
    await rawEval(`localStorage.setItem('glb-repair.layout', ${JSON.stringify(JSON.stringify(value))})`)
    return reloadPage(label)
  }
  const LAYOUT_SEED = (over) => ({
    version: 1, left: 320, right: 380, bottom: 240,
    logCollapsed: false, rightCollapsed: false, drawerOpen: false, ...over,
  })

  // ---------------------------------------------------------------- 启动恢复 + 读取时夹取（REQ-006 标准 5）
  // 先切到 1280×800：Emulation 的视口覆写在 Page.reload 之后依然生效
  await installErrorCollector()
  await setViewport(1280, 800)
  await seedLayout(LAYOUT_SEED(), '种入布局并重载页面')
  const startRestore = await run('启动时从 localStorage 恢复布局', `(() => {
    const shell = document.getElementById('appShell');
    return {
      stored: localStorage.getItem(window.__layout.key),
      varLeft: getComputedStyle(shell).getPropertyValue('--pane-left').trim(),
      varRight: getComputedStyle(shell).getPropertyValue('--pane-right').trim(),
      varBottom: getComputedStyle(shell).getPropertyValue('--pane-bottom').trim(),
      layout: window.__layout.get(),
      scrollWidth: document.scrollingElement.scrollWidth,
      clientWidth: document.scrollingElement.clientWidth,
    };
  })()`)
  if (startRestore) {
    check('重载后必须按 localStorage 恢复三栏尺寸（不是默认值）',
      startRestore.varLeft === '320px' && startRestore.varRight === '380px' && startRestore.varBottom === '240px',
      JSON.stringify(startRestore))
  }

  // 大屏存下来的越界值：读取时必须夹到合法区间，且不得顶出滚动条
  await seedLayout(LAYOUT_SEED({ left: 99999, right: 99999, bottom: 99999 }), '种入越界布局并重载页面')
  const clampedStart = await run('启动时夹取越界布局（大屏像素值不能弄坏小窗口）', `(() => {
    const shell = document.getElementById('appShell');
    const se = document.scrollingElement;
    return {
      layout: window.__layout.get(),
      limits: window.__layout.limits,
      varLeft: getComputedStyle(shell).getPropertyValue('--pane-left').trim(),
      varRight: getComputedStyle(shell).getPropertyValue('--pane-right').trim(),
      varBottom: getComputedStyle(shell).getPropertyValue('--pane-bottom').trim(),
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      scrollWidth: se.scrollWidth, clientWidth: se.clientWidth,
      scrollHeight: se.scrollHeight,
      centerWidth: Math.round(document.getElementById('cesiumContainer').getBoundingClientRect().width),
    };
  })()`)
  if (clampedStart) {
    const limits = clampedStart.limits
    check('越界宽度必须在启动时就夹到上限',
      clampedStart.layout.left <= limits.left.max && clampedStart.layout.right <= limits.right.max
        && clampedStart.layout.bottom <= limits.bottom.max,
      JSON.stringify(clampedStart))
    check('夹取后必须仍给中栏留出最小宽度（不出现中栏为 0 的布局）',
      clampedStart.centerWidth >= limits.centerMinWidth, JSON.stringify(clampedStart))
    check('夹取后不得出现纵向/横向整页滚动',
      clampedStart.scrollHeight <= clampedStart.innerHeight + 1 && clampedStart.scrollWidth <= clampedStart.clientWidth + 1,
      JSON.stringify(clampedStart))
  }

  // 确定性起点：默认布局 + 干净的状态栏
  await seedLayout(LAYOUT_SEED({ left: 260, right: 340, bottom: 200 }), '回到默认布局并重载页面')

  const modules = await run('模块与元素', `(() => ({
    reportFormat: typeof window.reportFormat,
    previewTransform: typeof window.previewTransform,
    inspectGlb: typeof window.repairApp?.inspectGlb,
    ids: ['inspectStatus','inspectPanel','inspectWorldBox','inspectWorldCenter','inspectAccessorBox',
      'inspectAccessorCenter','inspectDeviation','inspectFacts','inspectIssues','previewYaw',
      'previewYawValue','previewScale','previewScaleValue','previewAxis','resetPreview',
      'cesiumContainer','log'].reduce((acc, id) => (acc[id] = Boolean(document.getElementById(id)), acc), {}),
    // BR-027：既有 id 一个都不能丢，同时新增的编辑器外壳元素必须齐全
    shellIds: ['appShell','paneLeft','paneCenter','paneRight','paneBottom','statusBar',
      'splitterLeft','splitterRight','splitterBottom','toggleLog','toggleDrawer','helpPanel',
      'capabilityHint','progressWrap','statusModel','statusModelSize','statusInspect','statusProgress',
      'inputSummary','inputList','outputSummary','resultList','pickFiles','pickDir','clearInputs',
      'pickOutput','pickValidation','resetView','runRepair','freezePose','minimizeWindow',
      'maximizeWindow','closeWindow'].reduce((acc, id) => (acc[id] = Boolean(document.getElementById(id)), acc), {}),
    layoutApi: typeof window.__layout,
  }))()`)
  check('页面可求值', Boolean(modules), '第 1 步就没有响应')
  if (modules) {
    check('两个纯模块必须以普通 <script> 加载成功', modules.reportFormat === 'object' && modules.previewTransform === 'object',
      JSON.stringify([modules.reportFormat, modules.previewTransform]))
    check('inspect-glb 通道必须已暴露', modules.inspectGlb === 'function')
    check('面板与控件元素必须齐全', Object.values(modules.ids).every(Boolean),
      JSON.stringify(Object.entries(modules.ids).filter(([, ok]) => !ok)))
    check('编辑器外壳的既有 id 与新增元素必须齐全', Object.values(modules.shellIds).every(Boolean),
      JSON.stringify(Object.entries(modules.shellIds).filter(([, ok]) => !ok)))
    check('布局调试入口必须存在（供拖拽/恢复断言复用内部函数）', modules.layoutApi === 'object', String(modules.layoutApi))
  }

  // ---------------------------------------------------------------- 布局：1280×800 一屏（REQ-006 标准 1）
  const wide = await run('布局：1280×800 一屏三栏 + 底部日志 + 状态栏', `(() => {
    const rect = (id) => { const el = document.getElementById(id); if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) }; };
    const se = document.scrollingElement;
    const shell = document.getElementById('appShell');
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollHeight: se.scrollHeight,
      scrollWidth: se.scrollWidth,
      clientWidth: se.clientWidth,
      clientHeight: se.clientHeight,
      classes: shell.className,
      left: rect('paneLeft'), center: rect('paneCenter'), right: rect('paneRight'),
      bottomPane: rect('paneBottom'), cesium: rect('cesiumContainer'),
      status: rect('statusBar'), log: rect('log'),
      inspectEmpty: {
        hidden: document.getElementById('inspectEmpty').hidden,
        text: document.getElementById('inspectEmpty').textContent,
        visible: document.getElementById('inspectEmpty').getClientRects().length > 0,
      },
      statusText: {
        model: document.getElementById('statusModel').textContent,
        size: document.getElementById('statusModelSize').textContent,
        inspect: document.getElementById('statusInspect').textContent,
        progress: document.getElementById('statusProgress').textContent,
      },
      // 四个槽位是否真的渲染出来（有 rect）：本步只看"槽位存在且可见"，接线真值由
      // 加载模型后的状态栏断言负责——否则这里读到的只是 index.html 里的静态初值，
      // 删掉整个 renderStatusBar() 也照样通过（冷审指出这是自我满足的断言）
      statusSlots: ['statusModel', 'statusModelSize', 'statusInspect', 'statusProgress'].reduce((acc, id) => {
        const el = document.getElementById(id);
        acc[id] = { text: el.textContent, rects: el.getClientRects().length };
        return acc;
      }, {}),
      limits: window.__layout.limits,
    };
  })()`)
  if (wide) {
    check('1280×800 下页面本身不得整页滚动（scrollHeight <= innerHeight + 1）',
      wide.scrollHeight <= wide.innerHeight + 1, `${wide.scrollHeight} vs ${wide.innerHeight}`)
    check('1280×800 下不得出现横向滚动（scrollWidth <= clientWidth + 1）',
      wide.scrollWidth <= wide.clientWidth + 1, `${wide.scrollWidth} vs ${wide.clientWidth}`)
    check('左栏、中栏、右栏、底部日志、状态栏必须同时可见',
      [wide.left, wide.center, wide.right, wide.bottomPane, wide.status].every((r) => r && r.w > 0 && r.h > 0),
      JSON.stringify([wide.left, wide.center, wide.right, wide.bottomPane, wide.status]))
    check('四个区域必须都落在首屏内（不靠滚动才能看到）',
      [wide.left, wide.center, wide.right, wide.bottomPane, wide.log, wide.status]
        .every((r) => r && r.bottom <= wide.innerHeight + 1 && r.right <= wide.innerWidth + 1),
      JSON.stringify({ innerHeight: wide.innerHeight, rects: [wide.left, wide.center, wide.right, wide.bottomPane, wide.log, wide.status] }))
    check('3D 视口必须是三栏里最宽的一栏',
      wide.center.w > wide.left.w && wide.center.w > wide.right.w,
      JSON.stringify({ left: wide.left.w, center: wide.center.w, right: wide.right.w }))
    check('3D 容器高度必须真的兑现 CANVAS_MIN_HEIGHT（阈值与模块常量同源，不能用 120 掩盖）',
      wide.cesium.h >= wide.limits.canvasMinHeight, `${wide.cesium.h} < ${wide.limits.canvasMinHeight}`)
    check('状态栏四个槽位必须存在且首屏可见（接线真值由加载模型后的断言负责，这里不再读静态初值）',
      Object.values(wide.statusSlots).every((slot) => slot.rects > 0 && slot.text.length > 0),
      JSON.stringify(wide.statusSlots))
    check('右栏没有体检结果时必须给出中文空态提示（不能是一片空白）',
      wide.inspectEmpty.hidden === false && wide.inspectEmpty.visible === true && /选择预览模型/.test(wide.inspectEmpty.text),
      JSON.stringify(wide.inspectEmpty))
  }

  // 种入一组**与默认值和 styles.css 初值都不同**的布局并重载：只有真的走了
  // "读 localStorage → clamp → 写 CSS 变量"这条链路才会得到这组数，否则断言无从通过
  // （早先这里只查默认值 260/340/200，那两个数同时等于样式表初值，属空断言）。
  // 注意必须用 seedLayout（rawEval + Page.reload）：在求值脚本里直接 location.reload()
  // 会销毁执行上下文，那个 await 永远不返回。
  await seedLayout(LAYOUT_SEED({ left: 321, right: 381, bottom: 241 }), '种入非默认布局并重载页面')
  const seeded = await run('非默认布局必须被恢复', `(() => {
    const shell = document.getElementById('appShell');
    return {
      applied: window.__layout.get(),
      varLeft: getComputedStyle(shell).getPropertyValue('--pane-left').trim(),
      varRight: getComputedStyle(shell).getPropertyValue('--pane-right').trim(),
      varBottom: getComputedStyle(shell).getPropertyValue('--pane-bottom').trim(),
      leftWidth: Math.round(document.getElementById('paneLeft').getBoundingClientRect().width),
    };
  })()`)
  if (seeded) {
    check('非默认布局必须被恢复并落到 CSS 变量上',
      seeded.varLeft === '321px' && seeded.varRight === '381px' && seeded.varBottom === '241px'
        && seeded.leftWidth === seeded.applied.left,
      JSON.stringify(seeded))
    check('恢复的布局必须与样式表初值不同（否则这条断言自我满足）',
      seeded.varLeft !== '260px' && seeded.varRight !== '340px' && seeded.varBottom !== '200px',
      JSON.stringify(seeded))
  }
  // 后续步骤按"默认布局"起步，这里恢复回去
  await seedLayout(LAYOUT_SEED({ left: 260, right: 340, bottom: 200 }), '回到默认布局并重载页面')

  // 帮助面板：.hint 与 #capabilityHint 必须仍然可达（允许折叠，不允许删除）
  const helpPane = await run('帮助面板：提示文案仍可达', `(async () => {
    const panel = document.getElementById('helpPanel');
    const button = document.getElementById('toggleHelp');
    const before = panel.hidden;
    button.click();
    await new Promise((r) => setTimeout(r, 200));
    const opened = {
      hidden: panel.hidden,
      hints: [...document.querySelectorAll('#helpPanel .hint')].map((el) => el.textContent.trim()).filter(Boolean),
      capabilityExists: Boolean(document.getElementById('capabilityHint')),
      capabilityVisible: document.getElementById('capabilityHint').getClientRects().length > 0,
      ariaExpanded: button.getAttribute('aria-expanded'),
    };
    button.click();
    await new Promise((r) => setTimeout(r, 200));
    return { before, opened, closedHidden: panel.hidden };
  })()`, true)
  if (helpPane) {
    check('帮助按钮必须能展开提示面板', helpPane.before === true && helpPane.opened.hidden === false && helpPane.opened.ariaExpanded === 'true',
      JSON.stringify(helpPane))
    check('.hint 提示文案不得被删除', helpPane.opened.hints.length >= 1, JSON.stringify(helpPane.opened.hints))
    check('#capabilityHint 必须仍然存在且可显示', helpPane.opened.capabilityExists === true && helpPane.opened.capabilityVisible === true,
      JSON.stringify(helpPane.opened))
    check('帮助按钮必须能再次收起面板', helpPane.closedHidden === true, String(helpPane.closedHidden))
  }

  const loaded = await run('加载预览模型（体检 + Cesium）',
    `(async () => { await validateModel(${JSON.stringify(modelPath)}); return document.getElementById('validationStatus').textContent })()`, true, 45000)
  check('预览加载必须落定', typeof loaded === 'string', String(loaded))
  // 只断言"落定"不够：窗口不可见时超时兜底也会让它落定，但状态文案是"未渲染"——必须真加载成功
  check('预览必须真的加载成功（不能被"未渲染"的超时兜底蒙过）', /加载成功/.test(loaded || ''), String(loaded))
  await new Promise((resolve) => setTimeout(resolve, 3000))

  const inspect = await run('读体检面板', `(() => {
    const text = (id) => document.getElementById(id)?.textContent ?? null;
    const panel = document.getElementById('inspectPanel');
    return {
      status: text('inspectStatus'),
      statusClass: document.getElementById('inspectStatus')?.className,
      panelHidden: panel?.hidden,
      worldBox: text('inspectWorldBox'),
      worldCenter: text('inspectWorldCenter'),
      accessorBox: text('inspectAccessorBox'),
      deviation: text('inspectDeviation'),
      deviationClass: document.getElementById('inspectDeviation')?.className,
      facts: [...document.getElementById('inspectFacts').children].map((li) => li.textContent),
      issues: [...document.getElementById('inspectIssues').children].map((li) => li.textContent),
      panelText: panel?.textContent ?? '',
      pageErrors: window.__smokeErrors || [],
    };
  })()`)
  if (inspect) {
    check('体检面板必须显示', inspect.panelHidden === false)
    check('世界盒必须有值', /m$/.test(inspect.worldBox || ''), inspect.worldBox)
    check('accessor 盒必须有值', /m$/.test(inspect.accessorBox || ''), inspect.accessorBox)
    check('偏差文案必须有值', Boolean(inspect.deviation), inspect.deviation)
    check('偏差档位必须是 ok/warn/error 之一', /inspect-deviation( (ok|warn|error))?$/.test(inspect.deviationClass || ''), inspect.deviationClass)
    check('事实行不得为空', inspect.facts.length > 0)
    check('事实行里必须含比例尺（否则这一行永远不出现）', (inspect.facts || []).some((row) => row.startsWith('比例尺')), JSON.stringify(inspect.facts))
    check('问题清单不得为空', inspect.issues.length > 0)
    check('面板不得渲染 undefined/NaN', !/undefined|NaN/.test(inspect.panelText), String(inspect.panelText).slice(0, 120))
  }

  // ---------------------------------------------------------------- 状态栏（REQ-006 标准 6）
  const statusBar = await run('状态栏：模型 / 大小 / 体检耗时与问题计数', `(() => ({
    model: document.getElementById('statusModel').textContent,
    modelTitle: document.getElementById('statusModel').title,
    size: document.getElementById('statusModelSize').textContent,
    inspect: document.getElementById('statusInspect').textContent,
    progress: document.getElementById('statusProgress').textContent,
  }))()`)
  if (statusBar) {
    check('状态栏必须显示当前预览模型名',
      statusBar.model === path.basename(modelPath) || statusBar.modelTitle === modelPath,
      JSON.stringify(statusBar))
    check('状态栏必须显示模型大小', /^(\d+(\.\d+)? (B|KB|MB))$/.test(statusBar.size), statusBar.size)
    check('状态栏必须显示体检耗时与错误/警告/提示计数',
      /耗时 \d+ ms · 错误 \d+ \/ 警告 \d+ \/ 提示 \d+/.test(statusBar.inspect), statusBar.inspect)
    check('未跑批量修复时进度必须是「未开始」', statusBar.progress === '未开始', statusBar.progress)
  }

  // 批量进度：直接喂真实的事件处理函数（repair-progress 通道就是把它交给 handleRepairProgress）。
  // 不跑真的修复，避免冒烟测试往磁盘写文件。
  const batchStatus = await run('状态栏：批量进度（成功 N / 失败 M / 共 T）', `(() => {
    const text = () => document.getElementById('statusProgress').textContent;
    const seen = [];
    handleRepairProgress({ phase: 'start', total: 3 });
    seen.push(text());
    handleRepairProgress({ phase: 'file-done', index: 0, completed: 1, total: 3, relativePath: 'a.glb', status: 'success' });
    handleRepairProgress({ phase: 'file-done', index: 1, completed: 2, total: 3, relativePath: 'b.glb', status: 'error', error: '坏文件' });
    seen.push(text());
    handleRepairProgress({ phase: 'done', completed: 3, total: 3, failed: 1 });
    seen.push(text());
    return seen;
  })()`)
  if (batchStatus) {
    check('开始批量修复时进度必须清零',
      batchStatus[0] === '成功 0 / 失败 0 / 共 3', JSON.stringify(batchStatus))
    check('单文件失败必须计入失败数',
      batchStatus[1] === '成功 1 / 失败 1 / 共 3', JSON.stringify(batchStatus))
    check('批量结束必须汇总为 成功 N / 失败 M / 共 T',
      batchStatus[2] === '成功 2 / 失败 1 / 共 3', JSON.stringify(batchStatus))
  }

  const drag = await run('拖动滑块（只 input，不记日志）', `(async () => {
    const log = () => document.getElementById('log').textContent;
    const count = () => (log().match(/modelMatrix=\\[[^\\]]*\\]/g) || []).length;
    const before = count();
    const yaw = document.getElementById('previewYaw');
    for (const value of ['15','30','45','60','75']) {
      yaw.value = value;
      yaw.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 60));
    }
    return { added: count() - before, yawLabel: document.getElementById('previewYawValue').textContent };
  })()`, true)
  if (drag) {
    check('拖动（input）不得刷日志', drag.added === 0, String(drag.added))
    check('拖动时标签必须跟着变', drag.yawLabel === '75°', drag.yawLabel)
  }

  const committed = await run('松手（change）记最终矩阵', `(async () => {
    const fire = async (id, value) => {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 250));
    };
    await fire('previewYaw', '90');
    await fire('previewScale', '2');
    const log = document.getElementById('log').textContent;
    return {
      yawLabel: document.getElementById('previewYawValue').textContent,
      scaleLabel: document.getElementById('previewScaleValue').textContent,
      matrixLines: (log.match(/modelMatrix=\\[[^\\]]*\\]/g) || []).slice(-2),
      summaries: (log.match(/预览修正：.*?(?= · modelMatrix=)/g) || []).slice(-2),
      previewOnlyNote: log.includes('未写入输出文件'),
    };
  })()`, true)
  if (committed) {
    check('方向标签应为 90°', committed.yawLabel === '90°', committed.yawLabel)
    check('缩放标签应为 2.00×', committed.scaleLabel === '2.00×', committed.scaleLabel)
    check('两次 change 各记一行 modelMatrix', committed.matrixLines.length === 2, JSON.stringify(committed.matrixLines))
    check('日志必须注明仅预览、未写回', committed.previewOnlyNote === true)
    check('摘要必须写出方向与缩放', /方向 90° · 缩放 2\.00×/.test(committed.summaries?.[1] || ''), JSON.stringify(committed.summaries))
  }

  const axis = await run('上轴三态（Z-up → Y-up）', `(async () => {
    const select = document.getElementById('previewAxis');
    const optionCount = select.options.length;
    select.value = 'z';
    select.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 300));
    const log = document.getElementById('log').textContent;
    return {
      optionCount,
      summary: (log.match(/预览修正：.*?(?= · modelMatrix=)/g) || []).slice(-1)[0] ?? null,
      matrix: (log.match(/modelMatrix=\\[[^\\]]*\\]/g) || []).slice(-1)[0] ?? null,
    };
  })()`, true)
  if (axis) {
    check('上轴三态应有 3 个选项', axis.optionCount === 3, String(axis.optionCount))
    check('选 Z-up 后摘要要写明上轴', /上轴 Z-up/.test(axis.summary || ''), String(axis.summary))
    check('选 Z-up 后矩阵必须是 Rx(−90°)∘Ry(90°)∘2 的复合结果',
      axis.matrix === 'modelMatrix=[0.0000, 0.0000, -2.0000, 0.0000, -2.0000, 0.0000, 0.0000, 0.0000, 0.0000, 2.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 1.0000]',
      String(axis.matrix))
  }

  const reset = await run('重置预览修正', `(async () => {
    document.getElementById('resetPreview').click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      yaw: document.getElementById('previewYawValue').textContent,
      scale: document.getElementById('previewScaleValue').textContent,
      axis: document.getElementById('previewAxis').value,
      logged: document.getElementById('log').textContent.includes('已重置预览修正'),
    };
  })()`, true)
  if (reset) {
    check('重置必须回到 0° / 1.00× / auto', reset.yaw === '0°' && reset.scale === '1.00×' && reset.axis === 'auto',
      `${reset.yaw} / ${reset.scale} / ${reset.axis}`)
    check('重置必须写日志', reset.logged === true)
  }

  // ---------------------------------------------------------------- 分隔条拖拽（REQ-006 标准 2）
  // 用合成 PointerEvent 走**真实**的指针处理路径（pointerdown 在分隔条、pointermove/up 在
  // window）。分隔条里的 setPointerCapture 对合成事件会抛 InvalidPointerId，代码里已 try/catch
  // 兜住，所以无需为测试另开一条通路。
  const splitterDrag = await run('拖拽分隔条（合成 PointerEvent）', `(async () => {
    const shell = document.getElementById('appShell');
    const splitter = document.getElementById('splitterLeft');
    const container = document.getElementById('cesiumContainer');
    let resizeCalls = 0;
    const originalResize = state.viewer ? state.viewer.resize : null;
    if (state.viewer) {
      state.viewer.resize = function (...args) { resizeCalls += 1; return originalResize.apply(this, args); };
    }
    const measure = () => ({
      varLeft: getComputedStyle(shell).getPropertyValue('--pane-left').trim(),
      centerWidth: Math.round(container.getBoundingClientRect().width),
      resizeCount: window.__layout.resizeCount(),
    });
    const before = measure();
    const rect = splitter.getBoundingClientRect();
    const options = { pointerId: 1, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'mouse', buttons: 1 };
    splitter.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: rect.x + 2, clientY: rect.y + 30 }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: rect.x + 62, clientY: rect.y + 30 }));
    const during = { ...measure(), dragging: splitter.classList.contains('dragging') };
    window.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: rect.x + 62, clientY: rect.y + 30 }));
    await new Promise((r) => setTimeout(r, 400));
    const after = { ...measure(), dragging: splitter.classList.contains('dragging') };
    if (state.viewer && originalResize) state.viewer.resize = originalResize;
    return {
      before, during, after,
      viewerResizeCalls: resizeCalls,
      layout: window.__layout.get(),
      stored: localStorage.getItem(window.__layout.key),
    };
  })()`, true)
  if (splitterDrag) {
    const beforeLeft = parseInt(splitterDrag.before.varLeft, 10)
    const afterLeft = parseInt(splitterDrag.after.varLeft, 10)
    check('拖拽必须改变 CSS 变量 --pane-left（+60px）', afterLeft - beforeLeft === 60,
      `${splitterDrag.before.varLeft} → ${splitterDrag.after.varLeft}`)
    check('拖拽过程中必须加上 dragging 类，松手后清掉',
      splitterDrag.during.dragging === true && splitterDrag.after.dragging === false,
      JSON.stringify([splitterDrag.during.dragging, splitterDrag.after.dragging]))
    check('拖拽必须改变 3D 容器宽度（左栏变宽 60px，中栏相应变窄）',
      splitterDrag.before.centerWidth - splitterDrag.after.centerWidth === 60,
      `${splitterDrag.before.centerWidth} → ${splitterDrag.after.centerWidth}`)
    check('拖拽必须调用 state.viewer.resize()（Cesium 只监听 window resize）',
      splitterDrag.viewerResizeCalls > 0 && splitterDrag.after.resizeCount > splitterDrag.before.resizeCount,
      JSON.stringify({ patched: splitterDrag.viewerResizeCalls, internal: [splitterDrag.before.resizeCount, splitterDrag.after.resizeCount] }))
    check('拖拽后布局必须写入 localStorage', /"left":320/.test(splitterDrag.stored || ''), String(splitterDrag.stored))
  }

  // 拖到各个极限：任何一栏都不得被拖到 0（每栏有最小尺寸）
  const dragToZero = await run('把左栏/右栏/日志拖到极限（最小尺寸必须生效）', `(async () => {
    const shell = document.getElementById('appShell');
    const drag = (id, dx, dy) => {
      const splitter = document.getElementById(id);
      const rect = splitter.getBoundingClientRect();
      const options = { pointerId: 3, bubbles: true, cancelable: true, isPrimary: true, pointerType: 'mouse', buttons: 1 };
      splitter.dispatchEvent(new PointerEvent('pointerdown', { ...options, clientX: rect.x + 2, clientY: rect.y + 2 }));
      window.dispatchEvent(new PointerEvent('pointermove', { ...options, clientX: rect.x + 2 + dx, clientY: rect.y + 2 + dy }));
      window.dispatchEvent(new PointerEvent('pointerup', { ...options, clientX: rect.x + 2 + dx, clientY: rect.y + 2 + dy }));
    };
    const measure = () => ({
      left: Math.round(document.getElementById('paneLeft').getBoundingClientRect().width),
      center: Math.round(document.getElementById('cesiumContainer').getBoundingClientRect().width),
      right: Math.round(document.getElementById('paneRight').getBoundingClientRect().width),
      bottom: Math.round(document.getElementById('paneBottom').getBoundingClientRect().height),
      canvas: Math.round(document.getElementById('cesiumContainer').getBoundingClientRect().height),
      varLeft: getComputedStyle(shell).getPropertyValue('--pane-left').trim(),
      scrollWidth: document.scrollingElement.scrollWidth,
      clientWidth: document.scrollingElement.clientWidth,
    });
    drag('splitterLeft', -4000, 0);
    const leftMin = measure();
    drag('splitterLeft', 4000, 0);
    const leftMax = measure();
    drag('splitterRight', 4000, 0);
    const rightMin = measure();
    drag('splitterRight', -4000, 0);
    const rightMax = measure();
    drag('splitterBottom', 0, 4000);
    const bottomMin = measure();
    drag('splitterBottom', 0, -4000);
    const bottomMax = measure();
    return { leftMin, leftMax, rightMin, rightMax, bottomMin, bottomMax, limits: window.__layout.limits };
  })()`, true)
  if (dragToZero) {
    const limits = dragToZero.limits
    check('左栏不能被拖到 0，也不能超过上限',
      dragToZero.leftMin.left === limits.left.min && dragToZero.leftMax.left <= limits.left.max && dragToZero.leftMax.left >= limits.left.min,
      JSON.stringify({ min: dragToZero.leftMin.left, max: dragToZero.leftMax.left, limits }))
    check('右栏不能被拖到 0，也不能超过上限',
      dragToZero.rightMin.right === limits.right.min && dragToZero.rightMax.right <= limits.right.max && dragToZero.rightMax.right >= limits.right.min,
      JSON.stringify({ min: dragToZero.rightMin.right, max: dragToZero.rightMax.right, limits }))
    check('日志不能被拖到 0，也不能吃满整屏',
      dragToZero.bottomMin.bottom === limits.bottom.min && dragToZero.bottomMax.bottom <= limits.bottom.max,
      JSON.stringify({ min: dragToZero.bottomMin.bottom, max: dragToZero.bottomMax.bottom, limits }))
    check('把日志拖到上限后 3D 画布仍必须 ≥ CANVAS_MIN_HEIGHT（中栏标题行与预览控件条都要算进高度预算）',
      dragToZero.bottomMax.canvas >= limits.canvasMinHeight,
      JSON.stringify({ canvas: dragToZero.bottomMax.canvas, min: limits.canvasMinHeight, bottom: dragToZero.bottomMax.bottom }))
    check('任何一次极限拖拽后 3D 视口都必须仍是最宽的一栏且不出现横向滚动',
      [dragToZero.leftMin, dragToZero.leftMax, dragToZero.rightMin, dragToZero.rightMax].every((state) => state.center >= limits.centerMinWidth && state.center > state.left && state.center > state.right && state.scrollWidth <= state.clientWidth + 1),
      JSON.stringify(dragToZero))
  }

  // ---------------------------------------------------------------- 折叠日志（REQ-006 标准 3）
  const logCollapse = await run('折叠/展开日志（3D 视口吃掉腾出的高度）', `(async () => {
    const container = document.getElementById('cesiumContainer');
    const shell = document.getElementById('appShell');
    let resizeCalls = 0;
    const originalResize = state.viewer ? state.viewer.resize : null;
    if (state.viewer) {
      state.viewer.resize = function (...args) { resizeCalls += 1; return originalResize.apply(this, args); };
    }
    const height = () => Math.round(container.getBoundingClientRect().height);
    const before = height();
    const callsBefore = resizeCalls;
    document.getElementById('toggleLog').click();
    await new Promise((r) => setTimeout(r, 400));
    const callsAfterCollapse = resizeCalls;
    const collapsed = { height: height(), classes: shell.className, varBottom: getComputedStyle(shell).getPropertyValue('--pane-bottom').trim(),
      stored: localStorage.getItem(window.__layout.key), expanded: document.getElementById('toggleLog').getAttribute('aria-expanded') };
    document.getElementById('toggleLog').click();
    await new Promise((r) => setTimeout(r, 400));
    const callsAfterExpand = resizeCalls;
    const expanded = { height: height(), classes: shell.className, varBottom: getComputedStyle(shell).getPropertyValue('--pane-bottom').trim(),
      stored: localStorage.getItem(window.__layout.key), expanded: document.getElementById('toggleLog').getAttribute('aria-expanded') };
    if (state.viewer && originalResize) state.viewer.resize = originalResize;
    return { before, collapsed, expanded, viewerResizeCalls: resizeCalls,
      resizeOnCollapse: callsAfterCollapse - callsBefore, resizeOnExpand: callsAfterExpand - callsAfterCollapse };
  })()`, true)
  if (logCollapse) {
    check('折叠日志后 3D 视口必须变高', logCollapse.collapsed.height > logCollapse.before + 40,
      `${logCollapse.before} → ${logCollapse.collapsed.height}`)
    check('折叠时必须挂 log-collapsed 类且 --pane-bottom 收到折叠高度', /log-collapsed/.test(logCollapse.collapsed.classes),
      logCollapse.collapsed.classes)
    check('折叠状态必须写入 localStorage', /"logCollapsed":true/.test(logCollapse.collapsed.stored || ''), String(logCollapse.collapsed.stored))
    check('展开后必须恢复原来的高度', Math.abs(logCollapse.expanded.height - logCollapse.before) <= 2,
      `${logCollapse.before} → ${logCollapse.expanded.height}`)
    check('折叠日志必须自己重算 3D 画布（前后计数，不能靠 ResizeObserver 顺带触发蒙过）',
      logCollapse.resizeOnCollapse > 0, String(logCollapse.resizeOnCollapse))
    check('展开日志必须自己重算 3D 画布', logCollapse.resizeOnExpand > 0, String(logCollapse.resizeOnExpand))
  }

  // ---------------------------------------------------------------- localStorage 记忆 + 夹取（REQ-006 标准 5）
  const persist = await run('布局记忆与恢复（越界值必须夹到合法区间）', `(async () => {
    const shell = document.getElementById('appShell');
    const key = window.__layout.key;
    const seeded = { version: 1, left: 320, right: 380, bottom: 240, logCollapsed: false, rightCollapsed: false, drawerOpen: false };
    localStorage.setItem(key, JSON.stringify(seeded));
    const applied = window.__layout.restore();
    await new Promise((r) => setTimeout(r, 250));
    const varLeft = getComputedStyle(shell).getPropertyValue('--pane-left').trim();
    const varRight = getComputedStyle(shell).getPropertyValue('--pane-right').trim();
    const varBottom = getComputedStyle(shell).getPropertyValue('--pane-bottom').trim();
    const big = { left: 99999, right: 99999, bottom: 99999, logCollapsed: false, rightCollapsed: false, drawerOpen: false };
    const clamped = window.__layout.clamp(big);
    const stored = JSON.parse(localStorage.getItem(key));
    return { key, stored, applied, varLeft, varRight, varBottom, clamped, limits: window.__layout.limits, innerWidth: window.innerWidth };
  })()`, true)
  if (persist) {
    check('localStorage 键必须是 glb-repair.layout', persist.key === 'glb-repair.layout', String(persist.key))
    check('restore() 必须从 localStorage 读回并落到 CSS 变量上',
      persist.stored.left === 320 && persist.stored.right === 380 && persist.stored.bottom === 240,
      JSON.stringify(persist.stored))
    check('恢复后的布局必须落到 CSS 变量上',
      persist.varLeft === '320px' && persist.varRight === '380px' && persist.varBottom === '240px',
      JSON.stringify([persist.varLeft, persist.varRight, persist.varBottom]))
    const limits = persist.limits
    check('越界的宽度必须被夹到上限内',
      persist.clamped.left <= limits.left.max && persist.clamped.right <= limits.right.max && persist.clamped.bottom <= limits.bottom.max,
      JSON.stringify(persist.clamped))
    check('夹取后必须仍给中栏留出最小宽度',
      persist.innerWidth - persist.clamped.left - persist.clamped.right - 8 >= limits.centerMinWidth,
      JSON.stringify({ clamped: persist.clamped, innerWidth: persist.innerWidth, centerMin: limits.centerMinWidth }))
  }

  // ---------------------------------------------------------------- 窄窗口降级（REQ-006 标准 4）
  await setViewport(900, 700)
  const narrow = await run('窄窗口 900px：两栏 + 右栏抽屉，无横向滚动', `(async () => {
    const shell = document.getElementById('appShell');
    const se = document.scrollingElement;
    const rect = (id) => { const r = document.getElementById(id).getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; };
    // 先用一个"大屏存下来的"越界值，验证读取时的 clamp 在窄窗口下也兜得住
    const big = { version: 1, left: 9999, right: 9999, bottom: 9999, logCollapsed: false, rightCollapsed: false, drawerOpen: false };
    localStorage.setItem(window.__layout.key, JSON.stringify(big));
    const applied = window.__layout.restore();
    await new Promise((r) => setTimeout(r, 300));
    const closed = {
      classes: shell.className,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      scrollWidth: se.scrollWidth, clientWidth: se.clientWidth, scrollHeight: se.scrollHeight,
      left: rect('paneLeft'), center: rect('paneCenter'), right: rect('paneRight'),
      splitterRightDisplay: getComputedStyle(document.getElementById('splitterRight')).display,
      rightVisibility: getComputedStyle(document.getElementById('paneRight')).visibility,
      applied,
    };
    document.getElementById('toggleDrawer').click();
    await new Promise((r) => setTimeout(r, 350));
    const opened = {
      classes: shell.className,
      scrollWidth: se.scrollWidth, clientWidth: se.clientWidth,
      right: rect('paneRight'),
      rightVisibility: getComputedStyle(document.getElementById('paneRight')).visibility,
      ariaExpanded: document.getElementById('toggleDrawer').getAttribute('aria-expanded'),
    };
    document.getElementById('toggleDrawer').click();
    await new Promise((r) => setTimeout(r, 350));
    const reclosed = { classes: shell.className, rightVisibility: getComputedStyle(document.getElementById('paneRight')).visibility };
    return { closed, opened, reclosed, limits: window.__layout.limits };
  })()`, true)
  if (narrow) {
    check('窗口 900px 时必须切到窄布局（narrow 类）', /(^| )narrow( |$)/.test(narrow.closed.classes), narrow.closed.classes)
    check('窄布局下不得出现横向滚动',
      narrow.closed.scrollWidth <= narrow.closed.clientWidth + 1 && narrow.opened.scrollWidth <= narrow.opened.clientWidth + 1,
      JSON.stringify({ closed: [narrow.closed.scrollWidth, narrow.closed.clientWidth], opened: [narrow.opened.scrollWidth, narrow.opened.clientWidth] }))
    check('窄布局下页面本身仍不得整页滚动', narrow.closed.scrollHeight <= narrow.closed.innerHeight + 1,
      `${narrow.closed.scrollHeight} vs ${narrow.closed.innerHeight}`)
    check('窄布局下右栏分隔条必须隐藏、右栏默认收进抽屉',
      narrow.closed.splitterRightDisplay === 'none' && narrow.closed.rightVisibility === 'hidden',
      JSON.stringify([narrow.closed.splitterRightDisplay, narrow.closed.rightVisibility]))
    check('窄布局下 3D 视口仍必须是两栏里最宽的',
      narrow.closed.center.w > narrow.closed.left.w, JSON.stringify({ left: narrow.closed.left.w, center: narrow.closed.center.w }))
    check('大屏存下的越界宽度在窄窗口下必须被夹住（不留横向滚动）',
      narrow.closed.applied.left <= narrow.limits.left.max
        && narrow.closed.innerWidth - narrow.closed.applied.left - 4 >= narrow.limits.centerMinWidth,
      JSON.stringify({ applied: narrow.closed.applied, innerWidth: narrow.closed.innerWidth }))
    check('抽屉按钮必须能把右栏拉出来（且不制造横向滚动）',
      /drawer-open/.test(narrow.opened.classes) && narrow.opened.rightVisibility === 'visible'
        && narrow.opened.right.right <= narrow.opened.clientWidth + 1 && narrow.opened.ariaExpanded === 'true',
      JSON.stringify(narrow.opened))
    check('再次点击必须收起抽屉', !/drawer-open/.test(narrow.reclosed.classes) && narrow.reclosed.rightVisibility === 'hidden',
      JSON.stringify(narrow.reclosed))
  }
  await clearViewport()

  // 超时兜底与"晚到就绪"路径：用假 Model 直接调渲染进程里真实的 waitForModelReady
  const readyPaths = await run('waitForModelReady 的 ready/error/timeout/晚到就绪', `(async () => {
    const fake = (options) => {
      const readyListeners = [];
      const errorListeners = [];
      const model = {
        ready: Boolean(options && options.ready),
        readyEvent: { addEventListener: (cb) => { readyListeners.push(cb); return () => { const i = readyListeners.indexOf(cb); if (i >= 0) readyListeners.splice(i, 1); }; } },
        errorEvent: { addEventListener: (cb) => { errorListeners.push(cb); return () => { const i = errorListeners.indexOf(cb); if (i >= 0) errorListeners.splice(i, 1); }; } },
        fireReady: () => readyListeners.slice().forEach((cb) => cb()),
        fireError: (e) => errorListeners.slice().forEach((cb) => cb(e)),
        listeners: () => readyListeners.length + errorListeners.length,
      };
      return model;
    };
    const out = {};
    const already = fake({ ready: true });
    out.alreadyReady = await waitForModelReady(already, 50);
    const ok = fake({});
    const readyPromise = waitForModelReady(ok, 500);
    ok.fireReady();
    out.ready = await readyPromise;
    out.readyListenersLeft = ok.listeners();
    const failing = fake({});
    const errorPromise = waitForModelReady(failing, 500).then(() => 'resolved', (e) => 'rejected:' + (e && e.message));
    failing.fireError(new Error('坏模型'));
    out.error = await errorPromise;
    out.errorListenersLeft = failing.listeners();
    const slow = fake({});
    let lateCalls = 0;
    out.timeout = await waitForModelReady(slow, 50, () => { lateCalls += 1; });
    out.lateCallsBeforeReady = lateCalls;
    out.listenersKeptAfterTimeout = slow.listeners();
    slow.fireReady();
    await new Promise((r) => setTimeout(r, 50));
    out.lateCallsAfterReady = lateCalls;
    out.listenersAfterLateReady = slow.listeners();
    return out;
  })()`, true)
  if (readyPaths) {
    check('已就绪的模型直接返回 ready', readyPaths.alreadyReady === 'ready', String(readyPaths.alreadyReady))
    check('ready 事件路径必须清理监听', readyPaths.ready === 'ready' && readyPaths.readyListenersLeft === 0,
      `${readyPaths.ready} / 剩 ${readyPaths.readyListenersLeft}`)
    check('error 事件仍必须 reject', String(readyPaths.error).startsWith('rejected:坏模型'), String(readyPaths.error))
    check('error 路径必须清理监听', readyPaths.errorListenersLeft === 0, String(readyPaths.errorListenersLeft))
    check('等不到渲染时返回 timeout 且保留 ready 监听', readyPaths.timeout === 'timeout' && readyPaths.listenersKeptAfterTimeout > 0,
      `${readyPaths.timeout} / 剩 ${readyPaths.listenersKeptAfterTimeout}`)
    check('晚到的 ready 必须触发补跑回调', readyPaths.lateCallsBeforeReady === 0 && readyPaths.lateCallsAfterReady === 1,
      `${readyPaths.lateCallsBeforeReady} → ${readyPaths.lateCallsAfterReady}`)
    check('补跑后必须清理监听', readyPaths.listenersAfterLateReady === 0, String(readyPaths.listenersAfterLateReady))
  }

  const missing = await run('体检失败路径（不存在的文件）',
    `window.repairApp.inspectGlb(${JSON.stringify(`${modelPath}.missing.glb`)}).then((r) => ({ ok: r.ok, error: String(r.error || '') }))`, true)
  check('体检失败必须是 { ok:false, error } 而不是 reject',
    missing?.ok === false && (missing?.error || '').length > 0, JSON.stringify(missing))

  // ---------------------------------------------------------------- 键盘可达与焦点样式（REQ-006 标准 6）
  const focusables = await run('键盘可达性：操作栏与预览控件可聚焦', `(() => {
    const ids = ['pickFiles','pickDir','clearInputs','pickOutput','pickValidation','resetView','runRepair',
      'freezePose','previewYaw','previewScale','previewAxis','resetPreview','toggleLog','toggleDrawer'];
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      out[id] = el ? { tabIndex: el.tabIndex, disabled: Boolean(el.disabled), rendered: el.getClientRects().length > 0 } : null;
    }
    return out;
  })()`)
  if (focusables) {
    const unreachable = Object.entries(focusables).filter(([, info]) => !info || info.disabled || info.tabIndex < 0 || !info.rendered)
    check('操作栏与预览控件必须都能被 Tab 到达（且可见、可用）', unreachable.length === 0, JSON.stringify(unreachable))
  }

  await run('把焦点放到操作栏第一个按钮', `(() => { document.getElementById('pickFiles').focus(); return document.activeElement.id; })()`)
  await pressKey('Tab', 9)
  const focusRing = await run('真实 Tab 后焦点样式必须可见', `(() => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    return { id: el.id, tag: el.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, focusVisible: el.matches(':focus-visible') };
  })()`)
  if (focusRing) {
    check('Tab 必须能把焦点移到下一个操作按钮', focusRing.tag === 'BUTTON' && focusRing.id !== '' && focusRing.id !== 'pickFiles',
      JSON.stringify(focusRing))
    check('键盘聚焦必须可见（:focus-visible 有实际描边）',
      focusRing.focusVisible === true && focusRing.outlineStyle !== 'none' && parseFloat(focusRing.outlineWidth) >= 1,
      JSON.stringify(focusRing))
  }

  // 主按钮的键盘激活：用 CDP 注入 trusted Enter，走原生 click → 真实的 IPC 调用。
  // 这里**故意**不选任何输入，主进程会回一条中文错误，正好当作"键盘真的触发了按钮"的证据。
  await run('把焦点放到主按钮', `(() => { document.getElementById('runRepair').focus(); return document.activeElement.id; })()`)
  const logBeforeKeyboardRun = await run('记录日志长度', `document.getElementById('log').textContent.length`)
  await pressKey('Enter', 13)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const keyboardRun = await run('主按钮键盘激活的结果', `(() => {
    const log = document.getElementById('log').textContent;
    return {
      tail: log.slice(-120),
      clicked: log.includes('请选择一个或多个 GLB / IVE 文件'),
      buttonRestored: document.getElementById('runRepair').textContent === '开始修复',
      disabled: document.getElementById('runRepair').disabled,
    };
  })()`)
  if (keyboardRun) {
    check('主按钮必须能被键盘（Enter）触发（并拿到主进程的中文校验错误）',
      keyboardRun.clicked === true, JSON.stringify({ tail: keyboardRun.tail, logBefore: logBeforeKeyboardRun }))
    check('键盘触发后主按钮必须恢复可用状态', keyboardRun.buttonRestored === true && keyboardRun.disabled === false,
      JSON.stringify(keyboardRun))
  }

  client.close()

  const after = sha256(modelPath)
  check('预览与体检不得写回输入文件', before === after, `${before} → ${after}`)

  // 假绿防线（冷审指出）：某一步 Runtime.evaluate 超时 → undefined → 其 `if (step)` 内的
  // 整块断言被静默跳过，脚本照样 exit 0。这两条把"步骤没返回"和"断言没跑够"变成红。
  // 注意 detail 参数在 check() 自增之前求值，所以这里要 +1 把本条自身算进去。
  const timedOutSteps = client.steps.filter((step) => /超时/.test(step))
  check('所有步骤都必须真实返回结果（任何一步超时都不得静默跳过其断言）',
    timedOutSteps.length === 0, JSON.stringify(timedOutSteps))
  const executedChecks = checksRun + 1
  check('已执行断言数必须达到下限（新增断言后要同步抬高 EXPECTED_CHECK_COUNT）',
    executedChecks >= EXPECTED_CHECK_COUNT, `${executedChecks} < ${EXPECTED_CHECK_COUNT}`)

  console.log(JSON.stringify({ modelPath, port, checksRun, steps: client.steps, failures }, null, 2))
  if (failures.length) {
    console.error(`\n界面接线冒烟失败 ${failures.length} 项：`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log(`\n界面接线冒烟通过：${modelPath}（${client.steps.length} 步 / ${checksRun} 条断言）`)
}

main().catch((error) => {
  console.error(`界面接线冒烟无法执行：${error.message}`)
  process.exit(2)
})
