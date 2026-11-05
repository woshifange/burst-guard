/**
 * 原生 WebAudio 程序化音效（无音频文件，不引 howler）。
 */

export type SfxName = 'shot' | 'explosion' | 'heal' | 'ui' | 'turn' | 'win' | 'lose' | 'block';

export class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;
  private master: GainNode | null = null;

  unlock(): void {
    if (this.ctx || !this.enabled) return;
    try {
      const Ctor: typeof AudioContext = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.02);
    }
    if (on) this.unlock();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.5, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, lowpassFreq: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = ((seed / 4294967296) * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpassFreq, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  play(name: SfxName): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;
    switch (name) {
      case 'shot':
        this.tone(220, 0.12, 'square', 0.25, 90);
        this.noise(0.1, 0.3, 1800);
        break;
      case 'explosion':
        this.noise(0.55, 0.9, 900);
        this.tone(70, 0.35, 'sine', 0.5, 40);
        break;
      case 'heal':
        this.tone(520, 0.18, 'sine', 0.2, 780);
        this.tone(780, 0.22, 'sine', 0.15, 1040);
        break;
      case 'ui':
        this.tone(660, 0.06, 'triangle', 0.15, 880);
        break;
      case 'turn':
        this.tone(440, 0.1, 'triangle', 0.18, 660);
        break;
      case 'block':
        this.tone(160, 0.1, 'square', 0.12, 80);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.2), i * 110));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sine', 0.2), i * 140));
        break;
    }
  }
}
