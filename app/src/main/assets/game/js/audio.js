/**
 * Vector Strike - Procedural Audio Engine
 * Pure WebAudio API synthesizer for all weapon sounds, explosions,
 * combat feedback, and algorithmic cyberpunk background soundtrack.
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.5;
        this.musicEnabled = true;
        this.isInitialized = false;
        this.musicNode = null;
        this.musicStep = 0;
        this.musicTimer = null;
    }

    init() {
        if (this.isInitialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.isInitialized = true;
                if (this.musicEnabled) {
                    this.startBackgroundMusic();
                }
            }
        } catch (e) {
            console.warn('WebAudio not supported or blocked:', e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playWeaponFire(type) {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        gain.connect(this.ctx.destination);

        switch (type) {
            case 'RAIL_PISTOL':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(650, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
                gain.gain.setValueAtTime(this.sfxVolume * 0.45, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.12);
                break;

            case 'ARC_CARBINE':
                osc.type = 'square';
                osc.frequency.setValueAtTime(480, now);
                osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
                gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.08);
                break;

            case 'SCATTER_PULSE':
                this.playNoise(0.18, 400, this.sfxVolume * 0.6);
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
                gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.2);
                break;

            case 'ION_SNIPER':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1200, now);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);
                gain.gain.setValueAtTime(this.sfxVolume * 0.7, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.35);
                this.playNoise(0.25, 800, this.sfxVolume * 0.5);
                break;

            case 'MAG_LAUNCHER':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
                gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + 0.25);
                break;

            default:
                break;
        }
    }

    playMeleeSwing() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.18);
        gain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    }

    playDeflect() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.setValueAtTime(1800, now + 0.05);
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playExplosion() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.65, 300, this.sfxVolume * 0.85);

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);
        gain.gain.setValueAtTime(this.sfxVolume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    playJump() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playDash() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.22, 1200, this.sfxVolume * 0.55);
    }

    playWallKick() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(540, now + 0.1);
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playGravAnchor() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);
        gain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    playShieldHit() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(this.sfxVolume * 0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    playShieldBreak() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.3, 2400, this.sfxVolume * 0.6);
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.25);
        gain.gain.setValueAtTime(this.sfxVolume * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    playFleshHit() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
        gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playPlayerDeath() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        this.playNoise(0.4, 600, this.sfxVolume * 0.6);
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    playPickup() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.18); // C6
        gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    }

    playGrenadeThrow() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playGrenadeBounce() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(200, now + 0.04);
        gain.gain.setValueAtTime(this.sfxVolume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    }

    playReloadStart() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.setValueAtTime(350, now + 0.08);
        gain.gain.setValueAtTime(this.sfxVolume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    }

    playReloadComplete() {
        if (!this.ctx || this.sfxVolume <= 0) return;
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
    }

    playNoise(duration, cutoff = 800, volume = 0.3) {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    startBackgroundMusic() {
        if (!this.ctx || this.musicTimer || !this.musicEnabled) return;

        // Cyberpunk synth chords in D minor (Dm, Bb, F, C)
        const progression = [
            [146.83, 220.00, 261.63, 293.66], // Dm
            [116.54, 174.61, 233.08, 293.66], // Bb
            [174.61, 220.00, 261.63, 349.23], // F
            [130.81, 164.81, 196.00, 261.63]  // C
        ];

        let chordIdx = 0;
        let noteStep = 0;

        this.musicTimer = setInterval(() => {
            if (!this.musicEnabled || !this.ctx || this.musicVolume <= 0) return;
            this.resume();

            const now = this.ctx.currentTime;
            const currentChord = progression[chordIdx];
            const freq = currentChord[noteStep % currentChord.length];

            // Synth arpeggio note
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq * 1.5, now);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900 + Math.sin(now * 2) * 400, now);

            gain.gain.setValueAtTime(this.musicVolume * 0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.22);

            // Sub bass on step 0
            if (noteStep === 0) {
                const bassOsc = this.ctx.createOscillator();
                const bassGain = this.ctx.createGain();
                bassOsc.type = 'sine';
                bassOsc.frequency.setValueAtTime(currentChord[0] * 0.5, now);
                bassGain.gain.setValueAtTime(this.musicVolume * 0.22, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                bassOsc.connect(bassGain);
                bassGain.connect(this.ctx.destination);
                bassOsc.start(now);
                bassOsc.stop(now + 0.7);
            }

            noteStep++;
            if (noteStep >= 8) {
                noteStep = 0;
                chordIdx = (chordIdx + 1) % progression.length;
            }
        }, 180); // 133 BPM 16th notes
    }

    stopBackgroundMusic() {
        if (this.musicTimer) {
            clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }

    setMusicVolume(vol) {
        this.musicVolume = vol;
    }

    setSfxVolume(vol) {
        this.sfxVolume = vol;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEngine;
}
