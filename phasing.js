let AudioContext = window.AudioContext || window.webkitAudioContext
let audioCtx
let microphone
let micProcessor
let recording = false
let nameCounter = 1

const bufferSize = 0
const sampleRate = 44100

// Load audio file into a buffer.
async function getFile(audioContext, filepath) {
  const response = await fetch(filepath)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  return audioBuffer
}

// Round to 2 decimal places.
round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// Try to get microphone access. Either way, start the audio context and load existing tracks.
const handleSuccess = (stream) => {
  audioCtx = new AudioContext({ latencyHint: 'interactive', sampleRate: sampleRate })
  microphone = audioCtx.createMediaStreamSource(stream)
  setupTracks()
}

const handleFailure = (exception) => {
  console.log("Couldn't get microphone:", exception)
  audioCtx = new AudioContext({ latencyHint: 'interactive', sampleRate: sampleRate })
  setupTracks()
}

const convertTime = (length) => {
  return `${Math.floor(length / 60)}'${Math.floor(length % 60)}"`
}

navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  .then(handleSuccess)
  .catch(handleFailure)

let tapes = {}

class Tape {
  constructor() {
    this.buffer = null
    this.reverseBuffer = null
    this.source = null
    this.out = audioCtx.createGain()
    this.out.connect(audioCtx.destination)
    this.rate = 0
    this.savedRate = 1
    this.startTime = 0
    this.startPos = 0
    // This is necessary to prevent a race condition
    // between position slider onchange and updatePositions:
    this.lastPos = null
  }

  togglePlay() {
    if (this.rate === 0) {
      this.setRate(this.savedRate)
    } else {
      this.savedRate = this.rate
      this.setRate(0)
    }
  }

  // AudioBufferSourceNodes don't expose their playback position,
  // so we have to figure it out ourselves by keeping track of when and where playback began (and the playback rate).
  // This returns the current playback position in seconds.
  getPos() {
    let pos = ((audioCtx.currentTime - this.startTime) * this.rate + this.startPos)
    return ((pos % this.buffer.duration) + this.buffer.duration) % this.buffer.duration
  }

  // Set the playback position: seek to a given time in seconds.
  setPos(pos) {
    // Set startPos, reset startTime, and generate a new source.
    this.startPos = pos
    this.startTime = audioCtx.currentTime
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    this.setRate(this.rate)
  }

  updateBuffer() {
    // Browsers differ re. modifying a source's buffer;
    // for consistency, we make a new source.
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    // Also have to invalidate the reverse buffer.
    this.reverseBuffer = null
    this.setRate(this.rate)
  }

  // Set the playback rate (as a multiplier relative to the normal playback rate). Preserves current position.
  setRate(rate) {
    // Reset startPos and startTime since we're changing playbackRate. Order matters.
    this.startPos = this.getPos()
    this.startTime = audioCtx.currentTime

    if (rate < 0) {
      // Negative case not supported consistently across browsers, so we have to do it manually:
      if (!this.reverseBuffer) {
        this.reverseBuffer = audioCtx.createBuffer(1, this.buffer.length, audioCtx.sampleRate)
        let reversed = this.buffer.getChannelData(0).slice(0).reverse()
        this.reverseBuffer.copyToChannel(reversed, 0)
      }
      if (this.rate > 0) {
        this.source.disconnect()
        this.source = null
      }
      if (!this.source) {
        this.source = audioCtx.createBufferSource()
        this.source.buffer = this.reverseBuffer
        this.source.loop = true
        this.source.connect(this.out)
        this.source.start(0, this.startPos)
      }
      this.source.playbackRate.value = -rate
    } else if (rate === 0) {
      // Also not supported, but here's a workaround.
      if (this.source) {
        this.source.disconnect()
        this.source = null
      }
      // Allow restoring the previous rate by pressing "play".
      if (this.rate !== 0)
        this.savedRate = this.rate
    } else {
      if (this.rate < 0) {
        // Playing reversed.
        this.source.disconnect()
        this.source = null
      }
      if (!this.source) {
        this.source = audioCtx.createBufferSource()
        this.source.buffer = this.buffer
        this.source.loop = true
        this.source.connect(this.out)
        this.source.start(0, this.startPos)
      }
      this.source.playbackRate.value = rate
    }
    this.rate = rate
  }
}

function recordTape() {
  // To satisfy Chrome's demands:
  if (audioCtx.state === "suspended")
    audioCtx.resume().then(_recordTape)
  else
    _recordTape()
}

// TODO: refactor these into static methods on Tape?
function createBlankTape(name, length) {
  const buffer = audioCtx.createBuffer(1, length * audioCtx.sampleRate, audioCtx.sampleRate)
  return createTape(name, buffer)
}

let idCounter = 0

// Create a new Tape and add it to the UI.
function createTape(name, buffer) {
  let tape = new Tape()
  Object.assign(tape, {
    name: name,
    buffer: buffer,
    source: null,
    rate: 0,
    startTime: audioCtx.currentTime,
    startPos: 0,
    id: idCounter++,
  })
  tapes[tape.id] = tape
  addTape(tape)
  return tape
}

// Add a tape to the UI: add a new row to the table, create the relevant controls and inputs.
function addTape(tape) {
  let length = tape.buffer.duration
  // Create new table entry from template.
  let table = document.getElementById("tape-box")
  let template = document.getElementById("tape-template")
  let entry = template.cloneNode(true)
  entry.hidden = false
  entry.id = "tape-" + tape.id
  tape.dom = entry
  table.insertBefore(entry, document.getElementById("new-tape"))

  let postsetup = (sketch) => {
    sketch.reel.input.value((tape.name ? tape.name + " " : "") + convertTime(length))

    sketch.reel.speedSlider.onchange = (value) => {
      console.log(tape)
      value = value * 16 - 8
      tape.savedRate = value
      if (tape.rate !== 0)
        tape.setRate(value)
      updatePlayState(tape)
    }

    sketch.reel.gainSlider.onchange = (value) => {
      tape.out.gain.value = Math.pow(10, 72*(value - .75)/20)
    }

    sketch.reel.playButton.onclick = () => {
      tape.togglePlay()
      updatePlayState(tape)
    }

    sketch.reel.copyButton.onclick = async () => {
      createTape(tape.name, tape.buffer)
    }

    sketch.reel.onscrub = (deltaPos) => {
      let pos = tape.getPos() + deltaPos * tape.buffer.duration
      if (pos < 0) pos += tape.buffer.duration
      tape.setPos(pos)
      startUpdating = true
    }
  }
  let sketch = new p5(reelToReel(entry.id, postsetup), entry.getElementsByClassName("reel-canvas")[0]);
  tape.sketch = sketch
  console.log(name, tape, sketch)
  // Add new source option.
  // let select = document.getElementById("record-src")
  // let option = document.createElement("option")
  // option.innerHTML = name
  // select.appendChild(option)
}

function recordTape() {
  if (recording) {
    console.log("Already recording!")
    return
  }

  const button = document.getElementById("record-button")
  button.innerHTML = "Stop Recording"
  button.classList.remove("btn-danger")
  button.classList.add("btn-warning")
  button.onclick = (e) => recording = false

  let dstName = ''
  // TODO: avoid creating this placeholder buffer
  let dst = createBlankTape(dstName, 0.1)

  console.log("start recording")
  // Leaving this commented code here in case we want it later.
  // (This is for recording to a tape from another tape machine's output.)
  // let srcSelect = document.getElementById("record-src")
  let src = microphone  // null
  // if (srcSelect.selectedIndex === 0) {
  //   console.log("error: no source selected.")
  //   return
  // } else if (srcSelect.selectedIndex === 1) {
  //   src = microphone
  // } else {
  //   src = tapes[srcSelect.options[srcSelect.selectedIndex].text].out
  // }

  // Chrome bug requires us to add a dummy output:
  // https://bugs.chromium.org/p/chromium/issues/detail?id=327649#c15
  let recorder = audioCtx.createScriptProcessor(bufferSize, 1, 1)
  recorder.connect(audioCtx.destination)
  src.connect(recorder)
  recording = true

  let pos = 0
  let lastPos = 0
  let chunks = []
  recorder.onaudioprocess = (e) => {
    if (!recording) {
      console.log('stop recording')
      recording = false

      button.innerHTML = "Record"
      button.classList.remove("btn-warning")
      button.classList.add("btn-danger")
      button.onclick = (e) => recordTape()

      src.disconnect(recorder)
      recorder.disconnect()
      recorder.onaudioprocess = null

      const totalLength = chunks.map(c => c.length).reduce((x, y) => x+y);
      console.log("Recorded length:", totalLength/audioCtx.sampleRate)
      dst.buffer = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate)
      let pos = 0;
      for (const chunk of chunks) {
        console.log(chunk[0])
        dst.buffer.copyToChannel(chunk, 0, pos)
        pos += chunk.length
      }
      dst.sketch.reel.input.value(convertTime(totalLength/audioCtx.sampleRate))
      dst.updateBuffer()
      dst.setRate(dst.rate)
      return
    }
    const data = e.inputBuffer.getChannelData(0)
    chunks.push(data.slice())
    pos += data.length
    if (pos - lastPos > audioCtx.sampleRate/10) {
      lastPos = pos
      dst.sketch.reel.input.value(convertTime(pos/audioCtx.sampleRate))
    }
  }
}

async function uploadTape() {
  const file = document.getElementById("file-input").files[0];
  if (!file) return
  const arrayBuffer = await file.arrayBuffer()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  console.log(file)
  createTape(file.name.replace(/\.[^/.]+$/, ""), audioBuffer)
}

function updatePlayState(tape) {
  // TODO: update p5 button state?
  // if (tape.rate === 0) {
  // } else {
  // }
  tape.sketch.reel.speed = tape.rate
}

// Every `updatePositionsRate` ms, update the sliders to indicate current playback positions.
const updatePositionsRate = 30
let startUpdating = true
function updatePositions() {
  for (let name in tapes) {
    let tape = tapes[name]
    let slider = document.getElementById(`${name}-position`)
    let time = audioCtx.currentTime
    if ((tape.sketch.reel && tape.sketch.reel.position === tape.lastPos) || (tape.lastPos === null) || startUpdating) {
      if (tape.sketch.reel) {
        tape.sketch.reel.position = tape.getPos() / tape.buffer.duration
        tape.lastPos = tape.sketch.reel.position
      }
      startUpdating = false
    }
  }
  setTimeout(updatePositions, updatePositionsRate)
}

updatePositions()

// Load pre-recorded tracks.
const setupTracks = async () => {
  for (const name of ["Nimita", "Tim", "Ian", "Ian-mic"]) {
    const sample = await getFile(audioCtx, `audio/${name}.opus`)
    createTape(name, sample)
  }
}