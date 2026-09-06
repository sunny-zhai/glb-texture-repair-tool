const inputSummary = document.getElementById('inputSummary')
const outputSummary = document.getElementById('outputSummary')
const inputList = document.getElementById('inputList')
const resultList = document.getElementById('resultList')
const log = document.getElementById('log')
const validationStatus = document.getElementById('validationStatus')
const validationModelSummary = document.getElementById('validationModelSummary')
const cesiumContainer = document.getElementById('cesiumContainer')
const minimizeWindow = document.getElementById('minimizeWindow')
const maximizeWindow = document.getElementById('maximizeWindow')
const closeWindow = document.getElementById('closeWindow')

const state = {
  inputMode: 'files',
  inputPaths: [],
  outputDir: '',
  viewer: null,
  model: null,
  validationBounds: null,
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
      li.textContent = `${report.status.toUpperCase()} ${report.inputPath} -> ${report.outputPath} (${report.oldBytes}B -> ${report.newBytes}B, converted=${report.imagesConverted}, embedded=${report.externalImagesEmbedded || 0})`
    }
    resultList.appendChild(li)
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

async function validateModel(filePath) {
  if (!filePath) return
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
    }

    if (state.model) {
      state.viewer.scene.primitives.remove(state.model)
      state.model = null
    }

    const model = await Cesium.Model.fromGltfAsync({
      url: payload.dataUrl,
      scale: 1,
      modelMatrix: Cesium.Matrix4.IDENTITY,
    })
    if (!model) {
      throw new Error('Cesium 未返回模型对象。')
    }
    state.model = model
    state.viewer.scene.primitives.add(model)
    await waitForModelReady(model)
    setModelViewFromCesiumBounds(model, payload.bounds)
    state.viewer.scene.requestRender()

    const decimalMegabytes = (payload.bytes / 1000 / 1000).toFixed(2)
    const binaryMebibytes = (payload.bytes / 1024 / 1024).toFixed(2)
    setValidationStatus(`加载成功 · ${decimalMegabytes} MB / ${binaryMebibytes} MiB`, 'ok')
    appendLog(`Cesium 验证成功：${filePath} · ${payload.bytes.toLocaleString()} 字节`, 'ok')
  } catch (error) {
    setValidationStatus('加载失败', 'error')
    appendLog(`Cesium 验证失败：${error.message}`, 'error')
  }
}

function waitForModelReady(model) {
  if (model.ready) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let removeReadyListener
    let removeErrorListener
    const cleanup = () => {
      removeReadyListener?.()
      removeErrorListener?.()
    }
    removeReadyListener = model.readyEvent.addEventListener(() => {
      cleanup()
      resolve()
    })
    if (model.errorEvent) {
      removeErrorListener = model.errorEvent.addEventListener((error) => {
        cleanup()
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    }
  })
}

function setModelViewFromCesiumBounds(model, fallbackBounds) {
  if (model.boundingSphere && model.boundingSphere.radius > 0) {
    const radius = model.boundingSphere.radius
    state.viewer.camera.viewBoundingSphere(model.boundingSphere, new Cesium.HeadingPitchRange(0, -0.18, radius * 2.8))
    return
  }
  setInitialModelView(fallbackBounds)
}

function setInitialModelView(bounds) {
  const center = bounds?.center || [0, 0, 0]
  const radius = Math.max(bounds?.radius || 1, 0.25)
  const target = new Cesium.Cartesian3(center[0], center[1], center[2])
  const offset = new Cesium.Cartesian3(
    radius * 3.8,
    radius * 0.8,
    radius * 1.1,
  )

  state.viewer.camera.lookAt(target, offset)
  // Release the temporary lookAt transform so Cesium's normal mouse controls
  // remain active after the initial framing.
  state.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
state.viewer.scene.requestRender()
  }

function resetModelView() {
  if (!state.viewer || !state.validationBounds) return
  setInitialModelView(state.validationBounds)
}

document.getElementById('pickFiles').addEventListener('click', async () => {
  const paths = await window.repairApp.pickInputs('files')
  state.inputMode = 'files'
  state.inputPaths = paths
  renderInputs()
  appendLog(`已选择 ${paths.length} 个文件`)
})

document.getElementById('pickDir').addEventListener('click', async () => {
  const paths = await window.repairApp.pickInputs('directory')
  state.inputMode = 'directory'
  state.inputPaths = paths
  renderInputs()
  appendLog(`已选择目录 ${paths[0] || ''}`)
})

document.getElementById('pickOutput').addEventListener('click', async () => {
  const outputDir = await window.repairApp.pickOutputDir()
  state.outputDir = outputDir
  renderOutput()
  appendLog(`输出目录：${outputDir || '未选择'}`)
})

document.getElementById('pickValidation').addEventListener('click', async () => {
  const paths = await window.repairApp.pickInputs('files')
  await validateModel(paths[0])
})

document.getElementById('resetView').addEventListener('click', resetModelView)

document.getElementById('runRepair').addEventListener('click', async () => {
  resultList.innerHTML = ''
  try {
    const reports = await window.repairApp.repairGlb({
      inputPaths: state.inputPaths,
      inputMode: state.inputMode,
      outputDir: state.outputDir,
    })
    renderResults(reports)
    appendLog(`完成：${reports.length} 个任务`, 'ok')
    const firstSuccess = reports.find((report) => report.status === 'success')
    if (firstSuccess) await validateModel(firstSuccess.outputPath)
  } catch (error) {
    appendLog(error.message, 'error')
  }
})

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

renderInputs()
renderOutput()
