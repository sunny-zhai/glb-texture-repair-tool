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
const path = require('node:path')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')

const argv = process.argv.slice(2)
const modelArg = argv.find((value) => !value.startsWith('--')) || 'model/蹲姿.glb'
const portIndex = argv.indexOf('--port')
const port = portIndex >= 0 && argv[portIndex + 1] ? argv[portIndex + 1] : '9333'
const modelPath = path.resolve(modelArg)

const failures = []
const check = (label, condition, detail) => {
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
  return { evaluate, steps, close: () => socket.close() }
}

const sha256 = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex')

async function main() {
  const before = sha256(modelPath)
  const client = await connect()
  const run = client.evaluate

  const modules = await run('模块与元素', `(() => ({
    reportFormat: typeof window.reportFormat,
    previewTransform: typeof window.previewTransform,
    inspectGlb: typeof window.repairApp?.inspectGlb,
    ids: ['inspectStatus','inspectPanel','inspectWorldBox','inspectWorldCenter','inspectAccessorBox',
      'inspectAccessorCenter','inspectDeviation','inspectFacts','inspectIssues','previewYaw',
      'previewYawValue','previewScale','previewScaleValue','previewAxis','resetPreview',
      'cesiumContainer','log'].reduce((acc, id) => (acc[id] = Boolean(document.getElementById(id)), acc), {}),
  }))()`)
  check('页面可求值', Boolean(modules), '第 1 步就没有响应')
  if (modules) {
    check('两个纯模块必须以普通 <script> 加载成功', modules.reportFormat === 'object' && modules.previewTransform === 'object',
      JSON.stringify([modules.reportFormat, modules.previewTransform]))
    check('inspect-glb 通道必须已暴露', modules.inspectGlb === 'function')
    check('面板与控件元素必须齐全', Object.values(modules.ids).every(Boolean),
      JSON.stringify(Object.entries(modules.ids).filter(([, ok]) => !ok)))
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

  client.close()

  const after = sha256(modelPath)
  check('预览与体检不得写回输入文件', before === after, `${before} → ${after}`)

  console.log(JSON.stringify({ modelPath, port, steps: client.steps, failures }, null, 2))
  if (failures.length) {
    console.error(`\n界面接线冒烟失败 ${failures.length} 项：`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }
  console.log(`\n界面接线冒烟通过：${modelPath}（${client.steps.length} 步）`)
}

main().catch((error) => {
  console.error(`界面接线冒烟无法执行：${error.message}`)
  process.exit(2)
})
