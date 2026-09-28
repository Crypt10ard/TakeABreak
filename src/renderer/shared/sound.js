// All sounds are synthesised – no audio files. Soft bell tones and a breath-synced "sea".

let ctx = null;
let master = null;
let volume = 0.6;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    // A gentle compressor keeps overlapping tones from ever getting harsh.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

const NOTES = { low: 392.0, mid: 523.25, high: 659.25, top: 783.99 };

/** A single soft bell strike: a few inharmonic partials with exponential decay. */
function strike(freq, when = 0, gain = 0.22) {
  const c = audio();
  const t = c.currentTime + when;
  const partials = [
    [1, 1, 3.4],
    [2.005, 0.32, 2.1],
    [2.76, 0.14, 1.5],
    [5.4, 0.05, 0.8],
  ];
  for (const [ratio, amp, decay] of partials) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain * amp, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

/**
 * start  – a break begins
 * step   – the program moves on
 * end    – the break is over (rising three-note figure)
 * soft   – quiet notice (warnings, micro breaks)
 */
export function chime(kind = 'soft') {
  try {
    switch (kind) {
      case 'start':
        strike(NOTES.low, 0, 0.2);
        strike(NOTES.high, 0.22, 0.14);
        break;
      case 'end':
        strike(NOTES.mid, 0, 0.18);
        strike(NOTES.high, 0.2, 0.16);
        strike(NOTES.top, 0.4, 0.15);
        break;
      case 'step':
        strike(NOTES.high, 0, 0.09);
        break;
      default:
        strike(NOTES.mid, 0, 0.12);
    }
  } catch (err) {
    console.warn('sound unavailable', err);
  }
}

/** Brown noise through a low-pass filter that opens and closes with the breath – like waves. */
export function createSea() {
  const c = audio();
  const seconds = 6;
  const fade = Math.floor(c.sampleRate * 0.5);
  const length = c.sampleRate * seconds;
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const raw = new Float32Array(length + fade);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      raw[i] = last * 3.2;
    }
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = raw[i];
    // Cross-fade the tail into the head so the loop has no click.
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = raw[i] * k + raw[length + i] * (1 - k);
    }
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  filter.Q.value = 0.3;
  const gain = c.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(master);
  source.start();

  let stopped = false;
  return {
    /** v: 0 (exhaled) … 1 (inhaled) */
    breathe(v) {
      if (stopped) return;
      const t = c.currentTime;
      filter.frequency.setTargetAtTime(240 + v * 950, t, 0.35);
      gain.gain.setTargetAtTime(0.05 + v * 0.17, t, 0.4);
    },
    quiet(level = 0.03) {
      if (stopped) return;
      gain.gain.setTargetAtTime(level, c.currentTime, 0.8);
      filter.frequency.setTargetAtTime(260, c.currentTime, 0.8);
    },
    stop(seconds = 1.2) {
      if (stopped) return;
      stopped = true;
      gain.gain.setTargetAtTime(0, c.currentTime, seconds / 4);
      setTimeout(() => source.stop(), seconds * 1000 + 300);
    },
  };
}
