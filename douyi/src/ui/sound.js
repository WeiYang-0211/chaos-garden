export class SoundBoard {
  constructor(enabled = false) {
    this.enabled = Boolean(enabled);
    this.context = null;
    this.master = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) this.arm();
    else if (this.master) this.master.gain.value = 0;
  }

  async arm() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      if (this.master) this.master.gain.value = 0.16;
    } catch {
      this.context = null;
      this.master = null;
    }
  }

  tone({ frequency = 440, duration = 0.2, type = "sine", gain = 0.35, detune = 0, delay = 0 }) {
    if (!this.enabled || !this.context || !this.master) return;
    try {
      const start = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.detune.setValueAtTime(detune, start);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope).connect(this.master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.05);
    } catch {
    }
  }

  noise({ duration = 0.12, gain = 0.25, frequency = 900, q = 0.8, delay = 0 }) {
    if (!this.enabled || !this.context || !this.master) return;
    try {
      const start = this.context.currentTime + delay;
      const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < frames; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / frames) ** 2;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const envelope = this.context.createGain();
      envelope.gain.value = gain;
      source.connect(filter).connect(envelope).connect(this.master);
      source.start(start);
    } catch {
    }
  }

  knock() {
    this.noise({ duration: 0.08, gain: 0.35, frequency: 520, q: 1.4 });
    this.tone({ frequency: 156, duration: 0.14, type: "triangle", gain: 0.35 });
  }

  tick() {
    this.noise({ duration: 0.035, gain: 0.12, frequency: 1800, q: 2 });
    this.tone({ frequency: 880, duration: 0.05, type: "sine", gain: 0.08 });
  }

  judge() {
    this.tone({ frequency: 220, duration: 0.8, type: "sine", gain: 0.18 });
    this.tone({ frequency: 330, duration: 0.7, type: "sine", gain: 0.1, delay: 0.06 });
  }

  gong() {
    this.tone({ frequency: 110, duration: 1.8, type: "sine", gain: 0.32 });
    this.tone({ frequency: 165, duration: 1.5, type: "sine", gain: 0.16, detune: 4 });
    this.tone({ frequency: 220, duration: 1.1, type: "triangle", gain: 0.08, delay: 0.03 });
    this.noise({ duration: 0.3, gain: 0.1, frequency: 300, q: 0.5 });
  }

  chime() {
    this.tone({ frequency: 660, duration: 0.35, type: "sine", gain: 0.12 });
    this.tone({ frequency: 990, duration: 0.28, type: "sine", gain: 0.06, delay: 0.04 });
  }
}
