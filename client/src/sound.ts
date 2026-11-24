// Effets sonores discrets, synthétisés (aucun fichier à télécharger).
let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)());

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05, when = 0) {
  if (!sound.enabled) return;
  try {
    const a = ac();
    const t = a.currentTime + when;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {
    /* audio indisponible */
  }
}

function noise(dur: number, gain = 0.04, when = 0, hp = 2000) {
  if (!sound.enabled) return;
  try {
    const a = ac();
    const t = a.currentTime + when;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  } catch {
    /* audio indisponible */
  }
}

export const sound = {
  enabled: true,
  card: () => noise(0.07, 0.05, 0, 3000),
  chip: () => {
    tone(2400, 0.05, "triangle", 0.03);
    tone(3100, 0.04, "triangle", 0.02, 0.03);
  },
  turn: () => {
    tone(660, 0.12, "sine", 0.04);
    tone(880, 0.18, "sine", 0.04, 0.1);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", 0.035, i * 0.09)),
  tick: () => tone(1200, 0.02, "square", 0.012),
  lose: () => {
    tone(330, 0.2, "sine", 0.03);
    tone(247, 0.3, "sine", 0.03, 0.15);
  },
  click: () => tone(900, 0.03, "sine", 0.02),
};
