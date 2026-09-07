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
      li.textContent = `${report.status.toUpperCase()} ${report.inputPath} -> ${report.outputPath} (${report.oldBytes}B -> ${report.newBytes}B, baked=${report.skinnedMeshesBaked || 0}, converted=${report.imagesConverted}, embedded=${report.externalImagesEmbedded || 0})`
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
    model.backFaceCulling = false
    model.minimumPixelSize = 96
    model.debugShowBoundingVolume = false
    state.viewer.scene.primitives.add(model)
    appendLog(`Cesium 模型对象已创建：${filePath}`)
    await waitForModelReady(model)
    appendModelDiagnostics(model, payload.bounds)
    startModelAnimations(model, payload.metadata)
    await frameModelPreview(model, payload.bounds)
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
        reject(error instanceof Error ? error : new Error(formatError(error)))
      })
    }
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
