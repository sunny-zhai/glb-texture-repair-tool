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

// report-format.js / preview-transform.js 是纯 CommonJS 模块，在 index.html 里以普通
// <script> 先于本文件加载，导出挂在 window 上（渲染进程没有 Node，无法 require）。
const reportFormat = window.reportFormat
const previewTools = window.previewTransform

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


function appendLog(message, className) {
  const line = document.createElement('div')
  if (className) line.className = className
  line.textContent = message
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
}

function renderInputs() {
  inputSummary.textContent = state.inputPaths.length ? `${state.inputPaths.length} 个输入` : '未选择'
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
      li.textContent = `${report.status.toUpperCase()} ${report.inputPath} -> ${report.outputPath} (${report.oldBytes}B -> ${report.newBytes}B, baked=${report.skinnedMeshesBaked || 0}, converted=${report.imagesConverted}, embedded=${report.externalImagesEmbedded || 0}, uv=${report.texCoordsFilled || 0}, merged=${report.primitivesMerged || 0})`
    }
    resultList.appendChild(li)
  }
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

function handleRepairProgress(progress) {
  switch (progress?.phase) {
    case 'scanning':
      showProgress(0, 0, '正在扫描输入，统计待修复模型数量…')
      break
    case 'start':
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
      showProgress(progress.index, progress.total, `正在把 IVE 转换为 GLB：${progress.relativePath}`)
      appendLog(`[IVE ${progress.index + 1}/${progress.total}] 转换中：${progress.relativePath}`)
      break
    case 'convert-done':
      if (progress.status === 'error') {
        showProgress(progress.index + 1, progress.total, `IVE 转换失败：${progress.relativePath}`, 'done')
        appendLog(`IVE 转换失败：${progress.relativePath}：${progress.error}`, 'error')
      } else {
        showProgress(progress.index + 1, progress.total, `IVE 已转换为 GLB：${progress.relativePath}`)
        // 尺寸是世界包围盒（宽 × 高 × 前后深，单位米），直接暴露"摆进去到底是多大"。
        const size = Array.isArray(progress.worldSize) && progress.worldSize.length === 3
          ? `，尺寸 ${progress.worldSize.map((value) => Number(value).toFixed(2)).join(' × ')} m`
          : ''
        // 焊接收益：IVE 原始几何是三角汤，这里显示的才是真正落盘的顶点数。
        const geometry = Number.isFinite(progress.vertices) && progress.vertices > 0
          ? `，顶点 ${progress.vertices}`
            + (progress.verticesBefore > progress.vertices ? `（同类合并前 ${progress.verticesBefore}）` : '')
            + `，三角面 ${progress.triangles}`
          : ''
        appendLog(
          `IVE 转换完成：${progress.relativePath} → ${(progress.newBytes / 1024 / 1024).toFixed(2)} MB，`
          + `贴图 ${progress.images} 张，网格 ${progress.meshes} 个，剪掉无网格节点 ${progress.prunedNodes} 个，`
          + `坐标 ${progress.axis || '未转换'}${size}${geometry}`,
          'ok',
        )
      }
      break
    case 'done':
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
  setInspectStatus(
    `体检完成 · ${report.elapsedMs ?? 0} ms · ${issueSummary}${partialNote}`,
    report.partial || counts.error > 0 ? 'warn' : 'ok',
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

function resetPreviewControls() {
  if (!previewTools) return
  if (!previewAxis.options.length) {
    for (const option of previewTools.axisOptions()) {
      const element = document.createElement('option')
      element.value = option.value
      element.textContent = option.label
      previewAxis.appendChild(element)
    }
  }
  previewYaw.value = String(previewTools.PREVIEW_DEFAULT.yawDeg)
  previewScale.value = String(previewTools.PREVIEW_DEFAULT.scale)
  previewAxis.value = previewTools.PREVIEW_DEFAULT.axis
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
    // 新模型一律回到默认预览修正（modelMatrix 本来就是单位矩阵，控件必须与之一致）
    resetPreviewControls()
    model.backFaceCulling = false
    model.minimumPixelSize = 96
    model.debugShowBoundingVolume = false
    state.viewer.scene.primitives.add(model)
    appendLog(`Cesium 模型对象已创建：${filePath}`)
    const readyState = await waitForModelReady(model)
    if (readyState === 'timeout') {
      // 绝不能报成"加载成功"：窗口不可见时一帧都没渲染，画面还是空的（TASK-009）
      appendLog('模型对象已创建，但当前未渲染（窗口不可见/被遮挡时 Cesium 不渲染）——仍会继续做诊断与取景，请把窗口切到前台确认', 'warn')
    }
    appendModelDiagnostics(model, payload.bounds)
    startModelAnimations(model, payload.metadata)
    await frameModelPreview(model, payload.bounds)
    state.viewer.scene.requestRender()

    const decimalMegabytes = (payload.bytes / 1000 / 1000).toFixed(2)
    const binaryMebibytes = (payload.bytes / 1024 / 1024).toFixed(2)
    if (readyState === 'timeout') {
      setValidationStatus('已创建模型，但当前未渲染（请把窗口切到前台）', 'warn')
    } else {
      setValidationStatus(`加载成功 · ${decimalMegabytes} MB / ${binaryMebibytes} MiB`, 'ok')
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
function waitForModelReady(model, timeoutMs = 5000) {
  if (model.ready) return Promise.resolve('ready')
  return new Promise((resolve, reject) => {
    let removeReadyListener
    let removeErrorListener
    let timer
    const cleanup = () => {
      removeReadyListener?.()
      removeErrorListener?.()
      clearTimeout(timer)
    }
    removeReadyListener = model.readyEvent.addEventListener(() => {
      cleanup()
      resolve('ready')
    })
    if (model.errorEvent) {
      removeErrorListener = model.errorEvent.addEventListener((error) => {
        cleanup()
        reject(error instanceof Error ? error : new Error(formatError(error)))
      })
    }
    timer = setTimeout(() => {
      cleanup()
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
})

runRepairButton.addEventListener('click', async () => {
  resultList.innerHTML = ''
  showProgress(0, 0, '正在扫描输入，统计待修复模型数量…')
  setRunning(true)
  try {
    const reports = await window.repairApp.repairGlb({
      inputPaths: state.inputPaths,
      inputMode: state.inputMode,
      outputDir: state.outputDir,
      freezePose: document.getElementById('freezePose').checked,
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

// IVE 依赖随包分发的原生助手；缺失时明确告知而不是静默失败。
window.repairApp.capabilities().then((capabilities) => {
  if (!capabilities) return
  capabilityHint.hidden = false
  if (capabilities.ive) {
    capabilityHint.textContent = '支持输入 GLB 与 IVE：IVE 会先由 ive2glb 转换为 GLB，再进入同一套修复与 Cesium 验证流程。'
    return
  }
  capabilityHint.textContent = `当前平台（${capabilities.platform}）未提供 IVE 转换助手，.ive 文件无法转换。`
  appendLog(`IVE 转换不可用：未找到 ive2glb。已查找：${(capabilities.iveHelperSearched || []).join('、')}`, 'error')
}).catch(() => {
  // 能力探测失败不影响主流程
})

renderInputs()
renderOutput()
resetPreviewControls()
