// LoopExit — 8-bar loop expander. Follows WorkinWithAI Audio Engine Rules strictly.
const SAMPLE_SHA = 'd58301e4a494555f411a2afbc448b724136eee76';
const CDN = `https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@${SAMPLE_SHA}/public/samples`;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

let ctx = null;
let master = null;
let compressor = null;
let nextStepTime = 0;
let step = 0;
let timerId = null;
let activeSources = [];
let samples = {};
let loaded = false;

const state = {
  bpm: 120,
  key: 'Am',
  chords: ['Am', 'F', 'C', 'G'],
  bars: 16,
  playing: false,
  mutes: { drums: false, bass: false, piano: false }
};

// Simple chord to MIDI notes (root, third, fifth)
const chordNotes = {
  Am: [57, 60, 64], // A3 C4 E4
  F: [53, 57, 60],
  C: [48, 52, 55],
  G: [55, 59, 62],
  Dm: [50, 53, 57]
};

function getChordNotes(symbol) {
  return chordNotes[symbol] || [60, 64, 67];
}

async function loadSamples() {
  const files = [
    ['kick', `${CDN}/drums/kick.mp3`],
    ['snare', `${CDN}/drums/snare.mp3`],
    ['hat', `${CDN}/drums/hihat.mp3`],
    ['bass', `${CDN}/bass/A1.mp3`],
    ['pianoC', `${CDN}/piano/C4.mp3`],
    ['pianoA', `${CDN}/piano/A3.mp3`]
  ];
  const status = document.getElementById('status');
  status.textContent = `Loading ${files.length} samples...`;
  for (const [name, url] of files) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(name);
      const buf = await resp.arrayBuffer();
      samples[name] = await ctx.decodeAudioData(buf.slice(0));
    } catch (e) {
      status.textContent = `Missing instrument: ${name}`;
      throw e;
    }
  }
  loaded = true;
  status.textContent = 'Samples loaded. Tap play.';
}

function startAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.7;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -1;
  compressor.knee.value = 0;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  document.getElementById('tap-start').style.display = 'none';
  document.getElementById('controls').style.display = 'block';
  loadSamples().catch(() => {});
}

document.getElementById('tap-start').addEventListener('click', startAudio);

function scheduleNote(buffer, time, pitch = 1, gain = 0.5, duration = 0.2) {
  if (!buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = pitch;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.01);
  g.gain.linearRampToValueAtTime(gain, time + duration - 0.02);
  g.gain.linearRampToValueAtTime(0, time + duration);
  src.connect(g);
  g.connect(master);
  src.start(time);
  src.stop(time + duration + 0.05);
  activeSources.push(src);
}

function scheduleStep(s, time) {
  const bar = Math.floor(s / 16);
  const stepInBar = s % 16;
  const chordIdx = bar % 4;
  const notes = getChordNotes(state.chords[chordIdx]);

  // Drums
  if (!state.mutes.drums) {
    if (stepInBar === 0 || stepInBar === 8) scheduleNote(samples.kick, time, 1, 0.8, 0.3);
    if (stepInBar === 4 || stepInBar === 12) scheduleNote(samples.snare, time, 1, 0.6, 0.2);
    if (stepInBar % 2 === 0) scheduleNote(samples.hat, time, 1, 0.3, 0.1);
  }

  // Bass on downbeats
  if (!state.mutes.bass && stepInBar === 0) {
    const root = notes[0] - 24; // lower
    const pitch = Math.pow(2, (root - 45) / 12); // A1 ~45
    scheduleNote(samples.bass, time, pitch, 0.5, 0.4);
  }

  // Piano chords
  if (!state.mutes.piano && stepInBar === 0) {
    notes.forEach((n, i) => {
      const pitch = Math.pow(2, (n - 60) / 12);
      scheduleNote(samples.pianoC, time, pitch, 0.4 / (i + 1), 1.5);
    });
  }
}

function scheduler() {
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (state.bars * 16);
  }
}

function start() {
  if (!ctx || !loaded || state.playing) return;
  state.playing = true;
  nextStepTime = ctx.currentTime + 0.1;
  step = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  document.getElementById('status').textContent = 'Playing...';
  requestAnimationFrame(updatePlayhead);
}

function stop() {
  state.playing = false;
  clearInterval(timerId);
  activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
  activeSources = [];
  document.getElementById('status').textContent = 'Stopped';
}

function updatePlayhead() {
  if (!state.playing) return;
  // Drive UI from ctx.currentTime
  requestAnimationFrame(updatePlayhead);
}

document.getElementById('play').onclick = start;
document.getElementById('stop').onclick = stop;

// Live controls
document.getElementById('bpm').onchange = e => { state.bpm = parseInt(e.target.value) || 120; };
document.getElementById('key').onchange = e => { state.key = e.target.value; };
document.getElementById('chords').onchange = e => {
  state.chords = e.target.value.split(/\s+/).filter(Boolean).slice(0, 4);
};

// Visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});

// Export stubs (full OfflineAudioContext render to be completed for ship)
function exportWAV() {
  document.getElementById('status').textContent = 'Export: render OfflineAudioContext for exact samples. See rules for length calc.';
  // Implementation would render full arrangement, fold tail, peak limit, name file.
}
document.getElementById('export-wav').onclick = exportWAV;
document.getElementById('export-midi').onclick = () => {
  document.getElementById('status').textContent = 'MIDI export: multi-track with tempo/TS. Placeholder.';
};

// Persist
function saveState() {
  localStorage.setItem('loopexit', JSON.stringify({ bpm: state.bpm, key: state.key, chords: state.chords }));
}
window.addEventListener('beforeunload', saveState);
// Load on start...