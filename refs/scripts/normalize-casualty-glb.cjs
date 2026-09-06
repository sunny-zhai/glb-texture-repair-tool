#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const input = process.argv[2]
const output = process.argv[3]

if (!input || !output) {
  console.error('Usage: normalize-casualty-glb.cjs <input.glb> <output.glb>')
  process.exit(1)
}

function align4(value) {
  return (value + 3) & ~3
}

function readGlb(filePath) {
  const bytes = fs.readFileSync(filePath)
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`Unsupported GLB: ${filePath}`)
  }

  const jsonLength = bytes.readUInt32LE(12)
  const jsonStart = 20
  const jsonText = bytes.slice(jsonStart, jsonStart + jsonLength)
    .toString('utf8')
    .replace(/\0/g, '')
    .trim()
  const json = JSON.parse(jsonText)
  const binStart = jsonStart + align4(jsonLength) + 8
  const binLength = bytes.readUInt32LE(jsonStart + align4(jsonLength))
  const bin = Buffer.from(bytes.slice(binStart, binStart + binLength))
  return { json, bin }
}

function writeGlb(filePath, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)])
  const paddedBin = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)])
  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 4, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLength, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(paddedJson.length, 0)
  jsonHeader.write('JSON', 4, 4, 'ascii')
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(paddedBin.length, 0)
  binHeader.write('BIN\0', 4, 4, 'ascii')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBin]))
}

const { json, bin } = readGlb(input)
const animationCount = Array.isArray(json.animations) ? json.animations.length : 0

// Cesium's ModelGraphics path does not need the crouch animation. Removing
// animation metadata avoids animation sampler incompatibilities while leaving
// the skinned crouch pose and all material/texture data untouched.
delete json.animations
if (Array.isArray(json.extensionsUsed)) {
  json.extensionsUsed = json.extensionsUsed.filter((name) => name !== 'KHR_animation_pointer')
  if (json.extensionsUsed.length === 0) delete json.extensionsUsed
}
if (Array.isArray(json.extensionsRequired)) {
  json.extensionsRequired = json.extensionsRequired.filter((name) => name !== 'KHR_animation_pointer')
  if (json.extensionsRequired.length === 0) delete json.extensionsRequired
}

writeGlb(output, json, bin)
console.log(JSON.stringify({ input, output, removedAnimations: animationCount, bytes: fs.statSync(output).size }))
