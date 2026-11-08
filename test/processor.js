import { setBulkParameters, pulse, sineFreq, pulsingPower, PWMfreq, pulsePattern, pulsingMethod,
    high1, low1, high2, low2, high3, low3, highMask, lowMask, fullMask, 
	setFrequency,
	setPower} from "./pulsing.js";

/**
 * Counts the number of 1 bits in an integer
 * @param {Integer} x 
 * @returns 
 */
function popCount(x) {
	let n = 0;
	while (x) {
		x &= x - 1;
		++n;
	}
	return n ;
}

let idx = 0;
let PWMIndex = 0;
let sineProgress = 0;
let interpolationProgress = 0;
let soundOptions;
const powerIncrementFactor = 0.1;
const distortionFactor = 0.1;

let microsecPerSamples;
let sampleRate;
let prevFrequency = 0;
let prevPower = 0;
let targetFrequency = 0;
let targetPower = 0;
let deltaTime = 0;
let oscillationFrequency;

// Separate phase position for the DC PWM switching waveform.
let dcPwmPhase = 0;

function fillDCPWMSamples(buffer) {
	const duty = Math.max(
		0,
		Math.min(1, Number(pulsingPower) || 0)
	);

	const carrier = Number(PWMfreq);
	const rate = Number(sampleRate);

	// No switching sound at zero or 100% duty.
	if (
		duty <= 0 ||
		duty >= 0.999999 ||
		!Number.isFinite(carrier) ||
		carrier <= 0 ||
		!Number.isFinite(rate) ||
		rate <= 0
	) {
		buffer.fill(0);
		dcPwmPhase = 0;
		return;
	}

	const phaseStep = carrier / rate;
	const amplitude = 0.4;

	for (let i = 0; i < buffer.length; i++) {
		// Zero-mean pulse waveform, suitable for audio output.
		buffer[i] = dcPwmPhase < duty
		? amplitude * (1 - duty)
		: -amplitude * duty;

		dcPwmPhase += phaseStep;
		dcPwmPhase -= Math.floor(dcPwmPhase);
	}
}

class NoiseGenerator3Phase extends AudioWorkletProcessor {
	constructor(options) {
		super();
		soundOptions = options.processorOptions;
		sampleRate = options.processorOptions.sampleRate;
		microsecPerSamples = 1000 / (sampleRate / 1000)
		console.log(sampleRate + "Hz")
		console.log(soundOptions)

		this.port.onmessage = ((event) => {
			const d = event.data.deltaTime;
			if (!isNaN(d) && d > 0 && soundOptions.useInterpolation) {
				deltaTime = d * 1000;
				prevFrequency = sineFreq;
				prevPower = pulsingPower;
				interpolationProgress = 0;
			}

			setBulkParameters(event.data);
			
			oscillationFrequency = event.data.oscillation_frequency;
			targetFrequency = event.data.frequency;
			targetPower = event.data.power;
		});
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0];
		const nowBuffering = output[0];
		const len = nowBuffering.length;

		if (soundOptions.useInterpolation && deltaTime > 0) {
			const interp = Math.min(1, interpolationProgress / deltaTime);
			setFrequency(prevFrequency + interp * (targetFrequency - prevFrequency));
			setPower(prevPower + interp * (targetPower - prevPower));
			interpolationProgress += len * microsecPerSamples;
		}
		if (pulsingMethod === "DC-PWM") {
			fillDCPWMSamples(nowBuffering);
			return true;
		}
		const noOfSamples = 1000000 / sineFreq / microsecPerSamples;

		idx = Math.floor(noOfSamples * sineProgress);

		for (let i = 0; i < len; ++i) {
			const registers = pulse((i + idx) * microsecPerSamples, (i + PWMIndex) * microsecPerSamples);
			const high = popCount(registers & highMask);
			const low = popCount(registers & lowMask);
			let current = high + low;

			if (high == 0 || low == 0) current = 0;

			nowBuffering[i] = current * powerIncrementFactor;
		}
		PWMIndex += len;
		


		sineProgress += len / noOfSamples;
		sineProgress %= 1;

		return true;
	}
}

class NoiseGeneratorSinglePhase extends AudioWorkletProcessor {
	constructor(options) {
		super();
		soundOptions = options.processorOptions;
		sampleRate = options.processorOptions.sampleRate;
		microsecPerSamples = 1000 / (sampleRate / 1000)
		console.log(sampleRate + "Hz")
		console.log(soundOptions)

		this.port.onmessage = ((event) => {
			const d = event.data.deltaTime;
			if (!isNaN(d) && d > 0 && soundOptions.useInterpolation) {
				deltaTime = d * 1000;
				prevFrequency = sineFreq;
				prevPower = pulsingPower;
				interpolationProgress = 0;
			}

			setBulkParameters(event.data);
			
			oscillationFrequency = event.data.oscillation_frequency;
			targetFrequency = event.data.frequency;
			targetPower = event.data.power;
		});
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0];
		const nowBuffering = output[0];
		const len = nowBuffering.length;

		if (soundOptions.useInterpolation && deltaTime > 0) {
			const interp = Math.min(1, interpolationProgress / deltaTime);
			setFrequency(prevFrequency + interp * (targetFrequency - prevFrequency));
			setPower(prevPower + interp * (targetPower - prevPower));
			interpolationProgress += len * microsecPerSamples;
		}
		if (pulsingMethod === "DC-PWM") {
			fillDCPWMSamples(nowBuffering);
			return true;
		}
		const noOfSamples = 1000000 / sineFreq / microsecPerSamples;

		idx = Math.floor(noOfSamples * sineProgress);

		for (let i = 0; i < len; ++i) {
			const registers = pulse((i + idx) * microsecPerSamples, (i + PWMIndex) * microsecPerSamples);
			let current = registers & high1 ? 1 : registers & low1 ? -1 : 0;

			nowBuffering[i] = current * 3 * powerIncrementFactor; // make it the same volume as 3 phase sim
		}
		PWMIndex += len;
		
		if (oscillationFrequency != null) {
			PWMIndex %= 1000000 / oscillationFrequency / microsecPerSamples;
		} else {			
			PWMIndex %= 1000000 / PWMfreq / microsecPerSamples;
		}

		sineProgress += len / noOfSamples;
		sineProgress %= 1;

		return true;
	}
}

let sum = 0;
let prev;
let smooth;

class NoiseFilter extends AudioWorkletProcessor {
	constructor(options) {
		super();
		smooth = 7;
		prev = new Array(smooth).fill(0);
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0];
		const nowBuffering = output[0];
		const input = inputs[0][0];
		const len = input.length;

		for (let i = 0; i < len; ++i) {
			sum += input[i];
			prev.push(input[i]);

			nowBuffering[i] = sum / smooth;

			sum -= prev.shift();
		}
	}
}

let sineStage = 0; 

class Distort extends AudioWorkletProcessor {
	constructor(options) {
		super();
	}

	process(inputs, outputs, parameters) {
		const output = outputs[0];
		const nowBuffering = output[0];
		const input = inputs[0][0];
		const len = input.length;

		for (let i = 0; i < len; ++i) {
			nowBuffering[i] = input[i] + Math.sin(sineStage * Math.PI * 2) * distortionFactor;
			sineStage += sineFreq / (2 * sampleRate);
			sineStage %= 1;
		}
	}
}

registerProcessor("vf-generator", NoiseGenerator3Phase);
registerProcessor("vf-generator-single-phase", NoiseGeneratorSinglePhase);
registerProcessor("vf-filter", NoiseFilter);
registerProcessor("vf-distort", Distort);
