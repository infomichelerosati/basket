class SoundManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        // Check local storage for mute preference
        this.muted = localStorage.getItem('dunk_muted') === 'true';
        this.noiseBuffer = null;
    }

    init() {
        if (this.initialized) return;
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.initialized = true;
            this.createNoiseBuffer();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }

    createNoiseBuffer() {
        if (!this.ctx) return;
        // 2 seconds of white noise
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
    }

    // --- LOW LEVEL SYNTHESIS HELPERS ---

    playOscillator(freq, type, duration, vol, detune = 0, slideTo = null) {
        if (this.muted || !this.initialized) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }
        osc.detune.value = detune;

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol, filterFreq = 1000, filterSweep = false) {
        if (this.muted || !this.initialized || !this.noiseBuffer) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
        if (filterSweep) {
            filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + duration);
        }

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        source.start();
        source.stop(this.ctx.currentTime + duration);
    }

    // --- GAME SOUNDS ---

    playJump() {
        // Laser-like "Pew" / Swoosh
        if (this.muted) return;
        // Oscillator swoosh
        this.playOscillator(200, 'triangle', 0.2, 0.1, 0, 400); // 200 -> 400Hz
        // Subtle noise whoosh
        this.playNoise(0.2, 0.05, 800, true);
    }

    playScore(isPerfect) {
        if (this.muted) return;
        const now = this.ctx.currentTime;

        if (isPerfect) {
            // "SWISH": White noise sweep + High magical chord
            this.playNoise(0.4, 0.15, 2000, true); // The Net Sound

            // Magical sparkles
            setTimeout(() => this.playOscillator(1318, 'sine', 0.4, 0.05), 0);   // E6
            setTimeout(() => this.playOscillator(1567, 'sine', 0.4, 0.05), 100); // G6
            setTimeout(() => this.playOscillator(1975, 'sine', 0.5, 0.05), 200); // B6
        } else {
            // "CLANK-IN": Dull hit then score
            this.playNoise(0.1, 0.1, 500); // Rim touch
            // Major triad Arpeggio (C Major)
            setTimeout(() => this.playOscillator(523.25, 'triangle', 0.2, 0.1), 50);  // C5
            setTimeout(() => this.playOscillator(659.25, 'triangle', 0.2, 0.1), 100); // E5
            setTimeout(() => this.playOscillator(783.99, 'triangle', 0.3, 0.1), 150); // G5
        }
    }

    playHit() {
        // Wall/Rim Impact: Blunt thud
        this.playOscillator(150, 'square', 0.1, 0.05, 0, 50); // Drop pitch
        this.playNoise(0.05, 0.05, 600); // Click
    }

    // New: Specific sound for floor bounce
    playFloorBounce(velocity) {
        if (this.muted) return;
        let vol = Math.min(0.2, velocity * 0.05);
        this.playOscillator(100, 'sine', 0.15, vol, 0, 50); // Low thud
    }

    playGameOver() {
        if (this.muted) return;
        // Classic "Power Down"
        this.playOscillator(800, 'sawtooth', 0.8, 0.2, 0, 50);
        this.playNoise(0.8, 0.1, 1000, true);

        // Sad melody
        setTimeout(() => this.playOscillator(392, 'square', 0.3, 0.1), 100); // G
        setTimeout(() => this.playOscillator(370, 'square', 0.3, 0.1), 400); // F#
        setTimeout(() => this.playOscillator(349, 'square', 0.6, 0.1), 700); // F
    }

    // Generic fallback for external calls
    playTone(freq, type, duration, vol = 0.1, slideTo = null) {
        this.playOscillator(freq, type, duration, vol, 0, slideTo);
    }

    vibrate(pattern) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }
}

const audioManager = new SoundManager();
window.audioManager = audioManager; // Expose globally
