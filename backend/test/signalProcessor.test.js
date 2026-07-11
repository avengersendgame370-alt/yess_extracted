/**
 * Lightweight self-test for the FFT rewrite and honest-confidence gating.
 * No test framework dependency -- run directly:
 *   node backend/test/signalProcessor.test.js
 */
const { computeMagnitudeSpectrum } = require('../services/fft');
const signalProcessor = require('../services/signalProcessor');

let failures = 0;

// --- Test 1: FFT magnitude matches a naive direct DFT on the same padded signal ---
function naiveDFTMagnitude(signal) {
    const N = signal.length;
    const half = Math.floor(N / 2);
    const mags = new Float64Array(half);
    for (let k = 0; k < half; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            re += signal[n] * Math.cos(angle);
            im -= signal[n] * Math.sin(angle);
        }
        mags[k] = Math.sqrt(re * re + im * im);
    }
    return mags;
}

const testSignal = Array.from({ length: 250 }, (_, i) =>
    Math.sin(2 * Math.PI * 1.2 * (i / 30)) + 0.3 * Math.sin(2 * Math.PI * 0.25 * (i / 30)));

const { magnitudes: fftMags, N: fftN } = computeMagnitudeSpectrum(testSignal);
const padded = new Array(fftN).fill(0);
testSignal.forEach((v, i) => padded[i] = v);
const dftMags = naiveDFTMagnitude(padded);

let maxDiff = 0;
for (let k = 0; k < dftMags.length; k++) maxDiff = Math.max(maxDiff, Math.abs(fftMags[k] - dftMags[k]));
console.log(`[Test 1] Max FFT-vs-DFT magnitude difference: ${maxDiff.toExponential(3)}`);
if (maxDiff < 1e-8) console.log("  PASS: FFT numerically matches direct DFT\n");
else { console.log("  FAIL: FFT diverges from DFT\n"); failures++; }

// --- Test 2: recover a known synthetic heart rate from a clean sine wave ---
const sampleRate = 30, durationSec = 10, trueBPM = 72, trueHz = trueBPM / 60;
const green = [], red = [];
for (let i = 0; i < sampleRate * durationSec; i++) {
    const t = i / sampleRate;
    const pulse = Math.sin(2 * Math.PI * trueHz * t);
    green.push(128 + 2.0 * pulse + (Math.random() - 0.5) * 0.05);
    red.push(140 + 1.2 * pulse + (Math.random() - 0.5) * 0.05);
}
const result = signalProcessor.processSignal(green, red, sampleRate);
console.log(`[Test 2] Synthetic clean 72 BPM signal -> recovered heartRate: ${result.heartRate} BPM, signalQuality: ${result.signalQuality}, hrConfident: ${result.hrConfident}`);
if (Math.abs(result.heartRate - trueBPM) <= 3) console.log("  PASS: within +-3 BPM of the synthetic ground truth\n");
else { console.log("  FAIL: outside expected tolerance\n"); failures++; }

// --- Test 3: pure noise should NOT be reported as a confident reading ---
const noiseGreen = Array.from({ length: 250 }, () => 128 + (Math.random() - 0.5) * 0.02);
const noiseRed = Array.from({ length: 250 }, () => 140 + (Math.random() - 0.5) * 0.02);
const noiseResult = signalProcessor.processSignal(noiseGreen, noiseRed, sampleRate);
console.log(`[Test 3] Pure noise input -> hrConfident: ${noiseResult.hrConfident}, heartRate reported: ${noiseResult.heartRate}`);
if (noiseResult.heartRate === 0 && noiseResult.hrConfident === false) console.log("  PASS: low-confidence noise is not reported as a fabricated reading\n");
else { console.log("  FAIL: noise produced a false-confident reading\n"); failures++; }

console.log(failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
