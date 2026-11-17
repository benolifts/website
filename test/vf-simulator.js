// Shared train V/F simulation runtime.
// This module contains no editor controls or editor-specific DOM dependencies.

import {
    setupDatabase,
    setTrain,
    commandVF,
    getVFData,
    getAvailableTrains,
    setSoundUpdateFunction
} from "./interface.js";

import {
    setSoundOptions,
    startSound,
    stopSound,
    getSoundData
} from "./sound.js";

import {
    setCanvas,
    setRenderOptions,
    renderVisualisations
} from "./render.js";


export const MOTOR_SOUND_BASE_HZ = {
    1: {
        slow: 25,
        fast: 70
    },
    2: {
        slow: 30,
        fast: 60
    }
    // Add further profiles here:
    //
    // 2: {
    //     slow: 25,
    //     fast: 50
    // },
    //
    // 3: {
    //     slow: 18,
    //     fast: 36
    // }
};

export const DEFAULT_MOTOR_SOUND_BASE_HZ = {
    slow: 20,
    fast: 40
};

const MOTOR_SOUND_MIN_PLAYBACK_RATE = 0.1;
const MOTOR_SOUND_MAX_PLAYBACK_RATE = 16;
const MOTOR_SOUND_MIN_VOLUME = 0.5;
const MOTOR_SOUND_LOOP_START_SECONDS = 0.5;
const MOTOR_SOUND_LOOP_CROSSFADE_SECONDS = 0.4;
const USER_TRAINS_KEY = "vf-simulator-user-trains-v1";
const REQUIRED_SPEED_MARGIN_KMH = 6;
const OFFSET_REFERENCE_ROLLING_RESISTANCE = 0.3;
const RESISTOR_SOUND_FILE = "soundR.wav";

let assetBaseUrl = "./";
let vfDataUrl = "./vf.json";
let canvas = null;
let ctx = null;
let statusText = null;
let runtimeReadyPromise = null;
let animationStarted = false;

let motorSoundContext = null;
let motorSoundMasterGain = null;
let motorSoundProfile = null;
let motorSoundPlayers = { slow: null, fast: null };
let motorSoundShouldPlay = false;
const MOTOR_SOUND_BUFFERS = new Map();
const MOTOR_SOUND_PROFILE_LOADS = new Map();
const MOTOR_SOUND_FAILED_PROFILES = new Set();
let resistorSoundAudio = null;
let lastResistorNotchIndex = -1;

let currentTrain = {
    traction: "AC_PWM",
    audio_mode: "48T",
    controls: {},
    pulsing: []
};
let currentTrainName = "";
let currentTrainSource = "included";

let frequency = 0;
let dcPwmSpeedKmh = 0;
let dcResistorSpeedKmh = 0;
let power = 0;
let acceleration = 0;
let throttle = 0;
let hill = 1;
let previousFrame = 0;
let lastSpeedKmh = 0;
let vfErrorLogged = false;
let soundStarted = false;
let soundUpdateFunction = null;
let effectiveMaxSpeed = 0;
let maxSpeedOffset = 0;
let taperEndSpeed = 0;
let simulationEnabled = false;
let simulationPaused = false;
let databaseReady = false;
let pendingDriveName = null;
let initialResetRequested = false;
let interfaceTrainReady = false;
let includedTrains = [];
let includedTrainConfigs = new Map();
let pulsingHighlightCallback = null;

globalThis.simulated_speed = 0;

export function clamp(value, min, max, fallback = min) {
    const number = Number(value);

    return Number.isFinite(number)
        ? Math.max(min, Math.min(max, number))
        : fallback;
}


export function lerp(a, b, amount) {
    return a + (b - a) * amount;
}


export function normaliseTraction(value) {
    return ["AC_PWM", "DC_PWM", "DC_RESISTOR"].includes(value)
        ? value
        : "AC_PWM";
}


export function normaliseAudioMode(value) {
    return value === "48S" ? "48S" : "48T";
}


export function isAC(train = currentTrain) {
    return normaliseTraction(train.traction) === "AC_PWM";
}


export function isDCPWM(train = currentTrain) {
    return normaliseTraction(train.traction) === "DC_PWM";
}


export function isDCResistor(train = currentTrain) {
    return normaliseTraction(train.traction) === "DC_RESISTOR";
}


export function parseNumberArray(value) {
    if (Array.isArray(value)) {
        if (!value.length) return null;

        const numbers = value.map(Number);

        return numbers.every(Number.isFinite)
            ? numbers
            : null;
    }

    const text = String(value ?? "").trim();

    if (!text) return null;

    const parts = text.split(",").map(part => part.trim());

    if (parts.some(part => part === "")) return null;

    const numbers = parts.map(Number);

    return numbers.every(Number.isFinite)
        ? numbers
        : null;
}


export function getEffectiveResistancePercent(
    hillValue,
    rollingResistance
) {
    const safeHill = clamp(hillValue, 0, 2, 1);

    const safeRollingResistance = Number.isFinite(
        Number(rollingResistance)
    )
        ? Number(rollingResistance)
        : 0.3;

    return (
        ((2 - safeHill) * 2) - 1
    ) + safeRollingResistance;
}


export function getResistanceRate(percentPerSecond) {
    const fraction = Number(percentPerSecond) / 100;

    if (!Number.isFinite(fraction)) return 0;

    if (fraction >= 1) return Infinity;

    return -Math.log1p(-fraction);
}


export function getRollingResistanceAcceleration(
    speedKmh,
    train = currentTrain,
    hillValue = hill
) {
    const rawResistance = Number(
        train.rolling_resistance ?? 0.3
    );

    const rollingResistance = Number.isFinite(rawResistance)
        ? rawResistance
        : 0.3;

    const effectiveResistancePercent =
        getEffectiveResistancePercent(
            hillValue,
            rollingResistance
        );

    const rate = getResistanceRate(
        effectiveResistancePercent
    );

    const speed = Math.max(0, Number(speedKmh) || 0);

    if (rate === Infinity) {
        return Infinity;
    }

    return Number.isFinite(rate)
        ? speed * rate
        : 0;
}


export function calculateMaxSpeedOffset(train = currentTrain) {
    const rawMaxSpeed = Number(train.max_speed ?? 120);

    const statedMaxSpeed = Number.isFinite(rawMaxSpeed)
        ? Math.max(0, rawMaxSpeed)
        : 120;

    // The actual speed limit is stated max speed + 6.
    const targetSpeed =
        statedMaxSpeed + REQUIRED_SPEED_MARGIN_KMH;

    const accel = Number(
        train.controls?.acceleration ?? 2.5
    );

    if (
        !Number.isFinite(targetSpeed) ||
        targetSpeed <= 0 ||
        !Number.isFinite(accel) ||
        accel <= 0
    ) {
        return 0;
    }

    // Fixed reference value for calibration.
    // The live user setting does not change this calculation.
    //
    // IMPORTANT:
    // With the specified additive hill formula, flat-track
    // resistance at 0.3 is 1.3%, not 0.3%.
    const referenceResistancePercent =
        getEffectiveResistancePercent(
            1,
            OFFSET_REFERENCE_ROLLING_RESISTANCE
        );

    const referenceRate = getResistanceRate(
        referenceResistancePercent
    );

    const resistanceAtTarget =
        targetSpeed * referenceRate;

    if (
        !Number.isFinite(resistanceAtTarget) ||
        accel <= resistanceAtTarget
    ) {
        return 0;
    }


    // ----------------------------------------------------
    // DC RESISTOR
    //
    // The final notch has its own taper exponent and power.
    // Calibrate the final notch so that its remaining
    // acceleration balances the reference resistance.
    // ----------------------------------------------------

    if (isDCResistor(train)) {
        const notches = (train.pulsing ?? [])
            .filter(item => item.mode === "NOTCH")
            .map(item => ({
                ...item,
                min_speed: Number(item.min_speed ?? 0)
            }))
            .sort((a, b) => a.min_speed - b.min_speed);

        if (!notches.length) return 0;

        const finalIndex = notches.length - 1;

        const finalNotchStart =
            notches[finalIndex].min_speed;

        if (
            !Number.isFinite(finalNotchStart) ||
            finalNotchStart >= targetSpeed
        ) {
            return 0;
        }

        const finalStagePower =
            Math.min(1, (finalIndex + 1) / 3);

        const taperExponent = Number(train.taper_off ?? 1);



        if (
            !Number.isFinite(taperExponent) ||
            taperExponent <= 0
        ) {
            return 0;
        }







        const maximumFinalNotchAcceleration =
            accel * finalStagePower;

        if (
            maximumFinalNotchAcceleration <= resistanceAtTarget
        ) {
            return 0;
        }

        const requiredPowerRatio =
            resistanceAtTarget /
            maximumFinalNotchAcceleration;

        const taperRatio = Math.pow(
            requiredPowerRatio,
            1 / taperExponent
        );

        if (
            !Number.isFinite(taperRatio) ||
            taperRatio <= 0 ||
            taperRatio >= 1
        ) {
            return 0;
        }

        return (
            taperRatio *
            (targetSpeed - finalNotchStart) /
            (1 - taperRatio)
        );
    }


    // ----------------------------------------------------
    // AC PWM AND DC PWM
    //
    // The acceleration tapers linearly from peak_point
    // to the calculated taper endpoint.
    // ----------------------------------------------------

    const peakPoint = Number(train.peak_point ?? 50);

    if (
        !Number.isFinite(peakPoint) ||
        targetSpeed <= peakPoint
    ) {
        return 0;
    }

    return (
        resistanceAtTarget *
        (targetSpeed - peakPoint) /
        (accel - resistanceAtTarget)
    );
}


export function updateMaxSpeedCalibration() {
    const rawMaxSpeed = Number(currentTrain.max_speed ?? 120);

    const statedMaxSpeed = Number.isFinite(rawMaxSpeed)
        ? Math.max(0, rawMaxSpeed)
        : 120;

    effectiveMaxSpeed =
        statedMaxSpeed + REQUIRED_SPEED_MARGIN_KMH;

    maxSpeedOffset = calculateMaxSpeedOffset(currentTrain);

    taperEndSpeed =
        effectiveMaxSpeed + maxSpeedOffset;
}


export function calculateSpeedPerMotorHz(train) {
    if (!isAC(train)) return NaN;

    const wheel = Number(train.wheel_diameter);
    const poles = Number(train.motor_poles ?? 4);
    const motorSide = Number(train.gear_ratio_motor_side);
    const wheelSide = Number(train.gear_ratio_wheel_side);

    if (
        !Number.isFinite(wheel) || wheel <= 0 ||
        !Number.isFinite(poles) || poles <= 0 || poles % 2 !== 0 ||
        !Number.isFinite(motorSide) || motorSide <= 0 ||
        !Number.isFinite(wheelSide) || wheelSide <= 0
    ) {
        return NaN;
    }

    return (poles * motorSide / wheelSide) /
        (7.2 * Math.PI * wheel);
}


export function calculateDCMotorRotationHz(speedKmh, train = currentTrain) {
    const wheel = Number(train.wheel_diameter);
    const motorSide = Number(train.gear_ratio_motor_side);
    const wheelSide = Number(train.gear_ratio_wheel_side);

    const motorPoles = 4;

    if (
        !Number.isFinite(wheel) || wheel <= 0 ||
        !Number.isFinite(motorSide) || motorSide <= 0 ||
        !Number.isFinite(wheelSide) || wheelSide <= 0
    ) {
        return 0;
    }

    const speed = Number.isFinite(Number(speedKmh))
        ? Math.max(0, Number(speedKmh))
        : 0;

    return (
        speed * motorPoles * motorSide
    ) / (
        7.2 * Math.PI * wheel * wheelSide
    );
}


export function normalisePowerControls(raw = {}, traction = currentTrain.traction) {
    const controls = {
        ...(raw && typeof raw === "object" ? raw : {})
    };

    controls.acceleration = clamp(
        controls.acceleration,
        0,
        100,
        2.5
    );

    controls.deceleration = clamp(
        controls.deceleration,
        0,
        100,
        3
    );

    if (traction === "DC_RESISTOR") {
        for (const key of [
            "min_power",
            "max_power",
            "initial_min_power",
            "initial_max_power",
            "peak_min_power",
            "peak_max_power"
        ]) {
            delete controls[key];
        }

        return controls;
    }

    const hasNewPowerFields = [
        "initial_min_power",
        "peak_min_power",
        "peak_max_power"
    ].some(key => controls[key] != null);

    function legacyPercent(value, fallback) {
        if (value == null || value === "") return fallback;

        const number = Number(value);

        if (!Number.isFinite(number)) return fallback;

        return number > 0 && number <= 1
            ? number * 100
            : number;
    }

    const initialMin = hasNewPowerFields
        ? (controls.initial_min_power ?? 10)
        : legacyPercent(controls.min_power, 10);

    const initialMax = hasNewPowerFields
        ? (controls.initial_max_power ?? 20)
        : legacyPercent(controls.initial_max_power, 20);

    const peakMin = hasNewPowerFields
        ? (controls.peak_min_power ?? 10)
        : legacyPercent(controls.min_power, 10);

    const peakMax = hasNewPowerFields
        ? (controls.peak_max_power ?? 100)
        : legacyPercent(controls.max_power, 100);

    controls.initial_min_power = clamp(initialMin, 0, 100, 10);
    controls.initial_max_power = clamp(initialMax, 0, 100, 20);
    controls.peak_min_power = clamp(peakMin, 0, 100, 10);
    controls.peak_max_power = clamp(peakMax, 0, 100, 100);

    controls.initial_max_power = Math.max(
        controls.initial_min_power,
        controls.initial_max_power
    );

    controls.peak_max_power = Math.max(
        controls.peak_min_power,
        controls.peak_max_power
    );

    delete controls.min_power;
    delete controls.max_power;

    return controls;
}


export function getPWMpowerFraction(speedKmh, throttleAmount, train = currentTrain) {
    const amount = Math.abs(Number(throttleAmount));

    if (amount <= 0) return 0;

    const controls = train.controls ?? {};

    const throttleProgress = clamp(
        (amount - 0.01) / 0.99,
        0,
        1,
        0
    );

    const peakPoint = Math.max(
        0.001,
        Number(train.peak_point ?? 50)
    );

    const speedProgress = clamp(
        Number(speedKmh) / peakPoint,
        0,
        1,
        0
    );

    const initialPower = lerp(
        Number(controls.initial_min_power ?? 10),
        Number(controls.initial_max_power ?? 20),
        throttleProgress
    );

    const peakPower = lerp(
        Number(controls.peak_min_power ?? 10),
        Number(controls.peak_max_power ?? 100),
        throttleProgress
    );

    return clamp(
        lerp(initialPower, peakPower, speedProgress) / 100,
        0,
        1,
        0
    );
}


export const OSCILLATION_MODES = [
    "TRIANGLE",
    "SINE",
    "SQUARE",
    "SAW-RISING",
    "SAW-FALLING",
    "RANDOM"
];


export const AC_SCHEMA = {
    "ASYNC": {
        fields: ["min_speed", "carrier_frequency"],
        defaults: {
            min_speed: 0,
            carrier_frequency: 400
        }
    },

    "ASYNC-OSCILLATING": {
        fields: [
            "min_speed",
            "oscillation_mode",
            "oscillation_frequency",
            "min_carrier_frequency",
            "max_carrier_frequency"
        ],
        defaults: {
            min_speed: 0,
            oscillation_mode: "TRIANGLE",
            oscillation_frequency: 5,
            min_carrier_frequency: 350,
            max_carrier_frequency: 450
        }
    },

    "ASYNC-SWEEP": {
        fields: [
            "min_speed",
            "min_carrier_frequency",
            "max_carrier_frequency"
        ],
        defaults: {
            min_speed: 0,
            min_carrier_frequency: 350,
            max_carrier_frequency: 450
        }
    },
    "ASYNC-MUSIC": {
        fields: [
            "min_speed",
            "frequencies",
            "beats",
            "tempo"
        ],
        defaults: {
            min_speed: 0,
            frequencies: [440],
            beats: [1],
            tempo: 130
        }
    },
    "SYNC": {
        fields: ["min_speed", "pulses"],
        defaults: {
            min_speed: 0,
            pulses: 21
        }
    },

    "SHE-PWM": {
        fields: ["min_speed", "pulses"],
        defaults: {
            min_speed: 0,
            pulses: 21
        }
    },

    "ASYNC-STEP": {
        fields: ["min_speed", "carrier_frequencies"],
        defaults: {
            min_speed: 0,
            carrier_frequencies: [400]
        }
    },

    "AUTO-SYNC": {
        fields: [
            "min_speed",
            "min_pulses",
            "max_pulses",
            "pulse_step",
            "max_switching_frequency"
        ],
        defaults: {
            min_speed: 0,
            min_pulses: 1,
            max_pulses: 99,
            pulse_step: 1,
            max_switching_frequency: 1200
        }
    },


};


export const DC_PWM_SCHEMA = {
    "PWM": {
        fields: ["min_speed", "carrier_frequency"],
        defaults: {
            min_speed: 0,
            carrier_frequency: 400
        }
    }
};


export const DC_RESISTOR_SCHEMA = {
    "NOTCH": {
        fields: ["min_speed"],
        defaults: {
            min_speed: 0
        }
    }
};


export const FIELD_DEFINITIONS = {
    min_speed: {
        label: "Start Speed (km/h)",
        type: "number",
        step: 0.1,
        min: 0
    },

    min_motor_frequency: {
        label: "Start Motor Frequency (Hz)",
        type: "number",
        step: 0.1,
        min: 0
    },

    oscillation_mode: {
        label: "Oscillation Mode",
        type: "select",
        options: OSCILLATION_MODES
    },

    oscillation_frequency: {
        label: "Oscillation Frequency (Hz)",
        type: "number",
        step: 0.1,
        min: 0.1
    },

    carrier_frequency: {
        label: "Carrier Frequency (Hz)",
        type: "number",
        step: 10,
        min: 0
    },

    min_carrier_frequency: {
        label: "Min Carrier Frequency (Hz)",
        type: "number",
        step: 10,
        min: 0
    },

    max_carrier_frequency: {
        label: "Max Carrier Frequency (Hz)",
        type: "number",
        step: 10,
        min: 0
    },

    pulses: {
        label: "Pulses",
        type: "number",
        step: 1,
        min: 1
    },

    carrier_frequencies: {
        label: "Carrier Frequencies (comma separated)",
        type: "array"
    },

    min_pulses: {
        label: "Minimum Pulses",
        type: "number",
        step: 1,
        min: 1
    },

    max_pulses: {
        label: "Maximum Pulses",
        type: "number",
        step: 1,
        min: 1
    },

    pulse_step: {
        label: "Pulse Step",
        type: "number",
        step: 1,
        min: 1
    },

    max_switching_frequency: {
        label: "Max Switching Frequency (Hz)",
        type: "number",
        step: 1,
        min: 0
    },



    frequencies: {
        label: "Frequencies (comma separated)",
        type: "array"
    },

    beats: {
        label: "Beats (comma separated)",
        type: "array"
    },


    tempo: {
        label: "Tempo of the music",
        type: "number",
        step: 1,
        min: 10
    }

};


export function getPulsingSchema(train = currentTrain) {
    if (isDCPWM(train)) return DC_PWM_SCHEMA;
    if (isDCResistor(train)) return DC_RESISTOR_SCHEMA;
    return AC_SCHEMA;
}


export function getActiveFields(config, schemaSet = getPulsingSchema()) {
    const schema = schemaSet[config.mode];

    if (!schema) return [];

    const fields = [...schema.fields];

    if (
        config.mode === "ASYNC-OSCILLATING" &&
        config.oscillation_mode === "RANDOM"
    ) {
        return fields.filter(key => key !== "oscillation_frequency");
    }

    return fields;
}


export function normalisePulsingConfig(raw = {}, train = currentTrain) {
    if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
    ) {
        raw = {};
    }

    const source = { ...raw };
    const schemaSet = getPulsingSchema(train);
    const modes = Object.keys(schemaSet);

    const mode = modes.includes(source.mode)
        ? source.mode
        : modes[0];

    const schema = schemaSet[mode];
    const result = { mode };

    const factor = calculateSpeedPerMotorHz(train);



    if (mode === "ASYNC-OSCILLATING") {
        const waveform =
            source.oscillation_mode ??
            schema.defaults.oscillation_mode;

        result.oscillation_mode =
            OSCILLATION_MODES.includes(waveform)
                ? waveform
                : schema.defaults.oscillation_mode;
    }

    for (const key of getActiveFields(result, schemaSet)) {
        if (key === "oscillation_mode") continue;

        const def = FIELD_DEFINITIONS[key];
        let value = source[key];

        if (def.type === "array") {
            const parsed = parseNumberArray(value);

            result[key] = parsed?.length
                ? parsed
                : [...schema.defaults[key]];

            continue;
        }

        if (value == null || value === "") {
            value = schema.defaults[key];
        }

        const number = Number(value);

        result[key] =
            Number.isFinite(number) &&
            number >= (def.min ?? -Infinity) &&
            number <= (def.max ?? Infinity)
                ? number
                : schema.defaults[key];
    }

    return result;
}


export function serialisePulsingConfig(config, train = currentTrain) {
    return normalisePulsingConfig(config, train);
}


export function transitionPulsingConfig(previous, newMode, train = currentTrain) {
    const old = normalisePulsingConfig(previous, train);
    const schemaSet = getPulsingSchema(train);

    if (!schemaSet[newMode]) return old;

    const oldFields = schemaSet[old.mode].fields;
    const newFields = schemaSet[newMode].fields;

    const next = { mode: newMode };

    for (const key of newFields) {
        if (
            oldFields.includes(key) &&
            Object.hasOwn(old, key)
        ) {
            next[key] = Array.isArray(old[key])
                ? [...old[key]]
                : old[key];
        }
    }


    const isRangeMode = mode =>
        mode === "ASYNC-OSCILLATING" ||
        mode === "ASYNC-SWEEP";

    if (isRangeMode(newMode)) {
        if (isRangeMode(old.mode)) {
            next.min_carrier_frequency =
                old.min_carrier_frequency;

            next.max_carrier_frequency =
                old.max_carrier_frequency;
        } else {
            const carrier = old.carrier_frequency ?? 400;

            next.min_carrier_frequency =
                Math.max(0, carrier - 50);

            next.max_carrier_frequency =
                carrier + 50;
        }
    }

    if (newMode === "ASYNC") {
        next.carrier_frequency = isRangeMode(old.mode)
            ? (
                old.min_carrier_frequency +
                old.max_carrier_frequency
            ) / 2
            : (old.carrier_frequency ?? 400);
    }

    return normalisePulsingConfig(next, train);
}


export function readUserTrains() {
    try {
        const stored = JSON.parse(
            localStorage.getItem(USER_TRAINS_KEY) || "[]"
        );

        if (!Array.isArray(stored)) return [];

        return stored.filter(item =>
            item &&
            typeof item.name === "string" &&
            item.config &&
            typeof item.config === "object"
        );

    } catch (error) {
        console.warn("Could not read saved user trains:", error);
        return [];
    }
}


// AC pulsing modes supported by interface.js. Keep this list in the
// shared runtime because getACInterfaceTrain() is used by both pages.
const INTERFACE_AC_MODES = new Set([
    "ASYNC",
    "ASYNC-OSCILLATING",
    "ASYNC-SWEEP",
    "ASYNC-MUSIC",
    "SYNC",
    "SHE-PWM",
    "ASYNC-STEP",
    "AUTO-SYNC"
]);


export function getACInterfaceTrain(train) {
    const interfaceTrain = structuredClone(train);

    interfaceTrain.pulsing = (
        Array.isArray(train.pulsing)
            ? train.pulsing
            : []
    ).filter(config =>
        INTERFACE_AC_MODES.has(config.mode)
    );

    // interface.js requires at least one pulsing entry.
    if (!interfaceTrain.pulsing.length) {
        interfaceTrain.pulsing = [
            {
                mode: "ASYNC",
                min_speed: 0,
                carrier_frequency: 400
            }
        ];
    }

    return interfaceTrain;
}


function resolveAsset(path) {
    const base = new URL(assetBaseUrl || "./", document.baseURI);
    return new URL(path, base).href;
}

function notifyControlState() {
    const detail = { throttle, hill };
    try {
        globalThis.dispatchEvent(new CustomEvent("vf-control-change", { detail }));
    } catch (error) {
        // The runtime can also be used in a non-window host.
    }
}

function notifyDriveChanged() {
    const detail = {
        name: currentTrainName,
        source: currentTrainSource,
        train: structuredClone(currentTrain)
    };
    try {
        globalThis.dispatchEvent(new CustomEvent("vf-drive-changed", { detail }));
    } catch (error) {
        // The runtime can also be used in a non-window host.
    }
}

export function getRuntimeSnapshot() {
    return {
        name: currentTrainName,
        source: currentTrainSource,
        train: currentTrain ? structuredClone(currentTrain) : null,
        enabled: simulationEnabled,
        paused: simulationPaused,
        speedKmh: lastSpeedKmh,
        throttle,
        hill,
        interfaceTrainReady,
        soundStarted
    };
}

export function getCurrentTrain() {
    return structuredClone(currentTrain);
}

export function getIncludedTrains() {
    return [...includedTrains];
}

export function getIncludedTrainConfigs() {
    return new Map(
        [...includedTrainConfigs.entries()].map(([key, value]) => [
            key, { name: value.name, config: structuredClone(value.config) }
        ])
    );
}

export function isInterfaceTrainReady() {
    return interfaceTrainReady;
}

export function setInterfaceTrainReady(value) {
    interfaceTrainReady = Boolean(value);
}

export function isSoundStarted() {
    return soundStarted;
}

export function getSoundUpdateFunction() {
    return soundUpdateFunction;
}

export function setPulsingHighlightCallback(callback) {
    pulsingHighlightCallback = typeof callback === "function" ? callback : null;
}

export function setThrottle(value) {
    throttle = clamp(value, -1, 1, 0);
    notifyControlState();
    if (pulsingHighlightCallback) pulsingHighlightCallback(lastSpeedKmh, throttle);
    return throttle;
}

export function setHill(value) {
    hill = clamp(value, 0, 2, 1);
    notifyControlState();
    return hill;
}

export function setSimulationPaused(value) {
    simulationPaused = Boolean(value);
    previousFrame = performance.now();
    return simulationPaused;
}

export function resetSimulationSpeed() {
    frequency = 0;
    dcPwmSpeedKmh = 0;
    dcResistorSpeedKmh = 0;
    power = 0;
    acceleration = 0;
    throttle = 0;
    lastSpeedKmh = 0;
    previousFrame = performance.now();
    globalThis.simulated_speed = 0;
    lastResistorNotchIndex = -1;
    notifyControlState();
    if (pulsingHighlightCallback) pulsingHighlightCallback(0, 0);
}

export function normaliseTrainConfig(rawTrain) {
    const train = rawTrain && typeof rawTrain === "object" && !Array.isArray(rawTrain)
        ? structuredClone(rawTrain)
        : {};

    train.traction = normaliseTraction(train.traction);
    train.audio_mode = normaliseAudioMode(train.audio_mode ?? train.audio);
    delete train.audio;
    delete train.speed_per_motor_hz;

    train.wheel_diameter ??= 0.84;
    train.gear_ratio_motor_side ??= 6;
    train.gear_ratio_wheel_side ??= 1;
    train.max_speed ??= 120;
    train.rolling_resistance ??= 0.3;
    train.decel_cutoff ??= 1;

    if (isDCPWM(train) || isDCResistor(train)) {
        const profile = Number(train.sound_profile ?? 1);
        train.sound_profile = Number.isInteger(profile) && profile >= 1 ? profile : 1;
    } else {
        delete train.sound_profile;
    }

    if (isDCResistor(train)) {
        delete train.motor_poles;
        delete train.resonance;
        delete train.peak_point;
        train.taper_off ??= 1;
    } else {
        train.peak_point ??= 50;
        delete train.taper_off;
        if (isAC(train)) {
            train.motor_poles ??= 4;
            train.resonance ??= 400;
        } else {
            delete train.motor_poles;
            delete train.resonance;
        }
    }

    train.controls = normalisePowerControls(train.controls ?? {}, train.traction);
    train.pulsing = Array.isArray(train.pulsing) ? train.pulsing : [];
    train.pulsing = train.pulsing.map(item => normalisePulsingConfig(item, train));
    return train;
}

export function stopDriveOutput() {
    if (!interfaceTrainReady) return;
    try {
        commandVF(0, 0, 16);
    } catch (error) {
        console.warn("Could not stop V/F output:", error);
    }
}

function applyCurrentTrainToVF() {
    currentTrain.pulsing = (Array.isArray(currentTrain.pulsing) ? currentTrain.pulsing : [])
        .map(item => normalisePulsingConfig(item, currentTrain));
    updateMaxSpeedCalibration();

    if (isAC()) {
        const factor = calculateSpeedPerMotorHz(currentTrain);
        if (Number.isFinite(factor) && factor > 0) currentTrain.speed_per_motor_hz = factor;
        else delete currentTrain.speed_per_motor_hz;

        try {
            setTrain(getACInterfaceTrain(currentTrain));
            interfaceTrainReady = true;
            vfErrorLogged = false;
        } catch (error) {
            interfaceTrainReady = false;
            console.warn("AC PWM V/F setup failed:", error);
        }
        return;
    }

    if (isDCPWM()) {
        const factor = calculateDCMotorRotationHz(1, currentTrain);
        if (!Number.isFinite(factor) || factor <= 0) {
            delete currentTrain.speed_per_motor_hz;
            interfaceTrainReady = false;
            console.warn("DC-PWM V/F setup failed: invalid motor frequency conversion.");
            return;
        }
        currentTrain.speed_per_motor_hz = factor;
        try {
            setTrain(structuredClone(currentTrain));
            interfaceTrainReady = true;
            vfErrorLogged = false;
        } catch (error) {
            interfaceTrainReady = false;
            console.warn("DC PWM V/F setup failed:", error);
        }
        return;
    }

    delete currentTrain.speed_per_motor_hz;
    interfaceTrainReady = false;
}

export function setTrainConfiguration(rawTrain, name = currentTrainName, options = {}) {
    const previousTrain = currentTrain;
    const wasSoundStarted = soundStarted;
    const previousAudioMode = previousTrain?.audio_mode;
    const previousProfile = previousTrain?.sound_profile;
    const previousTraction = previousTrain?.traction;

    if (options.reset !== false) {
        stopDriveOutput();
        stopMotorSound();
    }

    currentTrain = normaliseTrainConfig(rawTrain);
    currentTrainName = String(name ?? "");
    if (options.source) currentTrainSource = options.source;

    const profileChanged =
        previousProfile !== currentTrain.sound_profile ||
        previousTraction !== currentTrain.traction;

    if (profileChanged && options.reset === false) stopMotorSound();

    if (options.reset !== false) {
        frequency = 0;
        dcPwmSpeedKmh = 0;
        dcResistorSpeedKmh = 0;
        power = 0;
        acceleration = 0;
        throttle = 0;
        hill = 1;
        lastSpeedKmh = 0;
        simulationEnabled = options.activate !== false;
        simulationPaused = false;
        previousFrame = performance.now();
        globalThis.simulated_speed = 0;
        vfErrorLogged = false;
        lastResistorNotchIndex = -1;
        notifyControlState();
    }

    applyAudioMode(currentTrain.audio_mode);
    if (isDCPWM() || isDCResistor()) preloadMotorSounds(currentTrain.sound_profile);
    applyCurrentTrainToVF();

    if (wasSoundStarted && (options.reset !== false || previousAudioMode !== currentTrain.audio_mode)) {
        void restartSound();
    }

    if (pulsingHighlightCallback) pulsingHighlightCallback(lastSpeedKmh, throttle);
    return structuredClone(currentTrain);
}

export function getResistorPowerFraction(
    speedKmh,
    train = currentTrain,
    throttleValue = throttle,
    calculatedTaperEndSpeed = null
) {
    const notches = (train.pulsing ?? [])
        .filter(item => item.mode === "NOTCH")
        .map(item => ({
            ...item,
            min_speed: Number(item.min_speed ?? 0)
        }))
        .sort((a, b) => a.min_speed - b.min_speed);

    if (!notches.length) return 0;

    const throttlePercent =
        Math.abs(Number(throttleValue)) * 100;

    if (throttlePercent === 0) return 0;

    const maxSpeed = Number(train.max_speed ?? 120);

    const suppliedTaperEnd =
        Number(calculatedTaperEndSpeed);

    const finalSpeed =
        calculatedTaperEndSpeed != null &&
        Number.isFinite(suppliedTaperEnd)
            ? suppliedTaperEnd
            : maxSpeed + REQUIRED_SPEED_MARGIN_KMH;

    if (speedKmh >= finalSpeed) return 0;

    const enteredTaper = Number(train.taper_off ?? 1);

    const taperExponent = Number.isFinite(enteredTaper)
        ? enteredTaper
        : 1;

    // Find the highest resistor reached.
    let reachedIndex = -1;

    for (let i = 0; i < notches.length; i++) {
        if (speedKmh >= notches[i].min_speed) {
            reachedIndex = i;
        } else {
            break;
        }
    }

    if (reachedIndex < 0) return 0;

    // Throttle stages.
    let stageIndex;
    let throttleScale;

    if (throttlePercent < 50) {
        stageIndex = 0;
        throttleScale = 0.5;

    } else if (throttlePercent <= 90) {
        stageIndex = reachedIndex;
        throttleScale = 0.5;

    } else {
        stageIndex = reachedIndex;
        throttleScale = 1;
    }

    const finalIndex = notches.length - 1;
    const startSpeed = notches[stageIndex].min_speed;

    // R1 = 1/3.
    // R2 = 2/3.
    // R3 onwards = full power.
    const startingPower =
        Math.min(1, (stageIndex + 1) / 3) *
        throttleScale;

    const referenceDistance =
        maxSpeed * 0.10 + 5;

    const thirdStart =
        notches[Math.min(2, finalIndex)].min_speed;

    const thirdEndpoint =
        thirdStart + referenceDistance;

    let endpoint;

    // The final notch now reaches the calibrated taper end.
    if (stageIndex === finalIndex) {
        endpoint = finalSpeed;

    } else if (stageIndex === 0) {
        endpoint =
            startSpeed + referenceDistance / 3;

    } else if (stageIndex === 1) {
        endpoint =
            startSpeed + referenceDistance * 2 / 3;

    } else if (stageIndex === 2) {
        endpoint = thirdEndpoint;

    } else {
        const stageProgress =
            (stageIndex - 2) / (finalIndex - 2);

        endpoint =
            thirdEndpoint +
            (finalSpeed - thirdEndpoint) * stageProgress;
    }

    const availableSpeed = endpoint - startSpeed;

    if (availableSpeed <= 0 || speedKmh >= endpoint) {
        return 0;
    }

    const progress =
        (speedKmh - startSpeed) / availableSpeed;

    const remainingPower = Math.pow(
        1 - progress,
        taperExponent
    );

    return startingPower * remainingPower;
}


export function getMotorSoundContext() {

    if (!motorSoundContext) {

        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            console.warn(
                "Web Audio API is not supported."
            );

            return null;
        }

        motorSoundContext = new AudioContextClass();

        motorSoundMasterGain =
            motorSoundContext.createGain();

        motorSoundMasterGain.gain.value = 1;

        motorSoundMasterGain.connect(
            motorSoundContext.destination
        );
    }

    return motorSoundContext;
}


export function resumeMotorSoundContext() {

    const context = getMotorSoundContext();

    if (
        context &&
        context.state === "suspended"
    ) {
        context.resume().catch(error => {
            console.warn(
                "Could not resume motor sound audio:",
                error
            );
        });
    }
}


export async function loadMotorSoundAsset(
    profile,
    soundType
) {

    const context = getMotorSoundContext();

    if (!context) {
        throw new Error(
            "Motor sound audio context is unavailable."
        );
    }

    // soundType is either:
    // "s" = slow
    // "f" = fast

    const filename =
        resolveAsset(`sound${profile}${soundType}.opus`);

    const response = await fetch(filename);

    if (!response.ok) {
        throw new Error(
            `Could not load ${filename} (${response.status}).`
        );
    }

    const audioData = await response.arrayBuffer();

    return await context.decodeAudioData(audioData);
}


export function preloadMotorSounds(
    profile,
    retry = false
) {

    profile = Number(profile);

    if (
        !Number.isInteger(profile) ||
        profile < 1
    ) {
        return Promise.resolve(null);
    }

    // Already downloaded and decoded.
    if (MOTOR_SOUND_BUFFERS.has(profile)) {
        return Promise.resolve(
            MOTOR_SOUND_BUFFERS.get(profile)
        );
    }

    // Already downloading.
    if (MOTOR_SOUND_PROFILE_LOADS.has(profile)) {
        return MOTOR_SOUND_PROFILE_LOADS.get(profile);
    }

    // Do not repeatedly retry a missing file every frame.
    if (
        MOTOR_SOUND_FAILED_PROFILES.has(profile) &&
        !retry
    ) {
        return Promise.resolve(null);
    }

    MOTOR_SOUND_FAILED_PROFILES.delete(profile);

    const loading = Promise.all([

        // Download and decode the slow recording.
        loadMotorSoundAsset(profile, "s"),

        // Download and decode the fast recording.
        loadMotorSoundAsset(profile, "f")

    ])

        .then(([slowBuffer, fastBuffer]) => {

            const buffers = {
                slow: slowBuffer,
                fast: fastBuffer
            };

            MOTOR_SOUND_BUFFERS.set(
                profile,
                buffers
            );

            console.log(
                `Motor sound profile ${profile} loaded.`
            );

            return buffers;

        })

        .catch(error => {

            MOTOR_SOUND_FAILED_PROFILES.add(profile);

            console.warn(
                `Could not preload motor sound profile ${profile}:`,
                error
            );

            return null;

        })

        .finally(() => {

            MOTOR_SOUND_PROFILE_LOADS.delete(profile);

        });

    MOTOR_SOUND_PROFILE_LOADS.set(
        profile,
        loading
    );

    return loading;
}


export function createMotorSoundVoice(
    player,
    offset,
    initialGain,
    startTime
) {

    const source =
        motorSoundContext.createBufferSource();

    const voiceGain =
        motorSoundContext.createGain();

    source.buffer = player.buffer;

    source.loop = false;

    source.playbackRate.setValueAtTime(
        player.playbackRate,
        startTime
    );

    voiceGain.gain.setValueAtTime(
        initialGain,
        startTime
    );

    source.connect(voiceGain);

    voiceGain.connect(
        player.outputGain
    );

    source.start(
        startTime,
        offset
    );

    return {
        source,
        gain: voiceGain
    };
}


export function stopMotorSoundVoice(
    voice,
    stopTime = motorSoundContext.currentTime
) {

    if (!voice) return;

    const source = voice.source;
    const gain = voice.gain;

    source.onended = () => {

        source.disconnect();
        gain.disconnect();

    };

    try {

        source.stop(stopTime);

    } catch (error) {

        source.disconnect();
        gain.disconnect();

    }
}


export function createMotorSoundStem(
    buffer,
    playbackRate
) {

    const now = motorSoundContext.currentTime;

    const outputGain =
        motorSoundContext.createGain();

    outputGain.gain.value = 0;

    outputGain.connect(
        motorSoundMasterGain
    );

    const player = {

        buffer,

        outputGain,

        currentVoice: null,
        nextVoice: null,

        // Current position in source audio seconds.
        position: 0,

        // Progress through the repeat crossfade.
        fadePosition: 0,

        playbackRate,

        lastUpdateTime: now

    };

    // Start the first playback instance at the
    // beginning of the recording.
    player.currentVoice = createMotorSoundVoice(
        player,
        0,
        1,
        now
    );

    return player;
}


export function stopMotorSoundStem(player) {

    if (!player) return;

    const now = motorSoundContext.currentTime;

    stopMotorSoundVoice(
        player.currentVoice,
        now
    );

    stopMotorSoundVoice(
        player.nextVoice,
        now
    );

    player.outputGain.disconnect();
}


export function updateMotorSoundStem(
    player,
    playbackRate
) {

    const now = motorSoundContext.currentTime;

    const elapsedSeconds = Math.max(
        0,
        now - player.lastUpdateTime
    );

    // Measure elapsed time in source-audio seconds,
    // so the overlap timing adjusts to playback speed.

    const elapsedSourceSeconds =
        elapsedSeconds * player.playbackRate;


    // ----------------------------------------------------
    // REPEAT CROSSFADE IN PROGRESS
    // ----------------------------------------------------

    if (player.nextVoice) {

        player.fadePosition += elapsedSourceSeconds;

        const fadeProgress = clamp(
            player.fadePosition /
                MOTOR_SOUND_LOOP_CROSSFADE_SECONDS,
            0,
            1,
            0
        );

        if (fadeProgress >= 1) {

            // The new playback instance has taken over.
            // Discard the final 0.1 seconds of the old one.

            stopMotorSoundVoice(
                player.currentVoice,
                now
            );

            player.currentVoice =
                player.nextVoice;

            player.nextVoice = null;

            player.position =
                player.fadePosition;

            player.fadePosition = 0;

            // Ensure the new playback instance is at full gain.
            const newGain =
                player.currentVoice.gain.gain;

            newGain.cancelScheduledValues(now);

            newGain.setValueAtTime(1, now);

        } else {

            // EQUAL-POWER CROSSFADE
            //
            // Old recording: cosine fade out.
            // New recording: sine fade in.
            //
            // Their combined power remains constant.

            const fadeAngle =
                fadeProgress * Math.PI / 2;

            const oldGainValue =
                Math.cos(fadeAngle);

            const newGainValue =
                Math.sin(fadeAngle);

            const oldGain =
                player.currentVoice.gain.gain;

            const newGain =
                player.nextVoice.gain.gain;

            oldGain.cancelScheduledValues(now);
            newGain.cancelScheduledValues(now);

            oldGain.setValueAtTime(
                oldGainValue,
                now
            );

            newGain.setValueAtTime(
                newGainValue,
                now
            );
        }


    // ----------------------------------------------------
    // NORMAL PLAYBACK
    // ----------------------------------------------------

    } else {

        player.position += elapsedSourceSeconds;

        const remainingSourceSeconds =
            player.buffer.duration -
            player.position;

        // Start the second playback instance when
        // 0.5 seconds of source audio remain.

        if (
            remainingSourceSeconds <=
            MOTOR_SOUND_LOOP_START_SECONDS
        ) {

            player.nextVoice = createMotorSoundVoice(
                player,
                0,
                0,
                now
            );

            player.fadePosition = 0;
        }
    }


    // ----------------------------------------------------
    // UPDATE PLAYBACK RATE
    // ----------------------------------------------------

    player.lastUpdateTime = now;

    player.playbackRate = clamp(
        playbackRate,
        MOTOR_SOUND_MIN_PLAYBACK_RATE,
        MOTOR_SOUND_MAX_PLAYBACK_RATE,
        MOTOR_SOUND_MIN_PLAYBACK_RATE
    );

    // Both playback instances follow the same motor speed.

    for (const voice of [
        player.currentVoice,
        player.nextVoice
    ]) {

        if (!voice) continue;

        voice.source.playbackRate.setTargetAtTime(
            player.playbackRate,
            now,
            0.02
        );
    }
}


export function stopMotorSound() {

    motorSoundShouldPlay = false;

    stopMotorSoundStem(
        motorSoundPlayers.slow
    );

    stopMotorSoundStem(
        motorSoundPlayers.fast
    );

    motorSoundPlayers = {
        slow: null,
        fast: null
    };
}


export function updateMotorSound(
    traction,
    speedKmh,
    motorPower,
    throttleValue
) {

    // ----------------------------------------------------
    // CHECK WHETHER MOTOR SOUND SHOULD PLAY
    // ----------------------------------------------------

    const decelCutoff = Number(
        currentTrain.decel_cutoff ?? 1
    );

    const isDCResistorBraking =

        Number(throttleValue) < 0 &&
        Number(speedKmh) > (
            Number.isFinite(decelCutoff)
                ? decelCutoff
                : 1
        );

    const motorHasPower =
        Number.isFinite(Number(motorPower)) &&
        Number(motorPower) > 0;

    if (
        (traction !== "DC_PWM" && traction !== "DC_RESISTOR") ||
        (!motorHasPower && !isDCResistorBraking)
    ) {

        stopMotorSound();
        return;
    }

    const context = getMotorSoundContext();

    if (!context) return;

    motorSoundShouldPlay = true;


    // ----------------------------------------------------
    // SELECT SOUND PROFILE
    // ----------------------------------------------------

    const profileValue = Number(
        currentTrain.sound_profile ?? 1
    );

    const profile =
        Number.isInteger(profileValue) &&
        profileValue >= 1
            ? profileValue
            : 1;

    // Stop the old profile when the train selects
    // a different sound profile.

    if (motorSoundProfile !== profile) {

        stopMotorSound();

        motorSoundProfile = profile;
    }

    // The sounds should already be downloading because
    // preloadMotorSounds() is called when the train loads.

    const buffers =
        MOTOR_SOUND_BUFFERS.get(profile);

    if (!buffers) {

        preloadMotorSounds(profile);

        return;
    }


    // ----------------------------------------------------
    // GET SLOW AND FAST PLAYBACK FREQUENCIES
    // ----------------------------------------------------

    const profileSettings =
        MOTOR_SOUND_BASE_HZ[profile] ??
        DEFAULT_MOTOR_SOUND_BASE_HZ;

    const slowBaseHz = Number(
        profileSettings.slow
    );

    const fastBaseHz = Number(
        profileSettings.fast
    );

    if (
        !Number.isFinite(slowBaseHz) ||
        !Number.isFinite(fastBaseHz) ||
        slowBaseHz <= 0 ||
        fastBaseHz <= slowBaseHz
    ) {

        console.warn(
            `Invalid slow/fast motor sound Hz settings for profile ${profile}.`
        );

        stopMotorSound();

        return;
    }


    // ----------------------------------------------------
    // MOTOR ROTATION FREQUENCY
    // ----------------------------------------------------

    const motorHz = Math.max(
        0,
        calculateDCMotorRotationHz(
            speedKmh,
            currentTrain
        )
    );


    // ----------------------------------------------------
    // PLAYBACK SPEED FOR EACH RECORDING
    // ----------------------------------------------------

    const slowPlaybackRate = clamp(
        motorHz / slowBaseHz,
        MOTOR_SOUND_MIN_PLAYBACK_RATE,
        MOTOR_SOUND_MAX_PLAYBACK_RATE,
        MOTOR_SOUND_MIN_PLAYBACK_RATE
    );

    const fastPlaybackRate = clamp(
        motorHz / fastBaseHz,
        MOTOR_SOUND_MIN_PLAYBACK_RATE,
        MOTOR_SOUND_MAX_PLAYBACK_RATE,
        MOTOR_SOUND_MIN_PLAYBACK_RATE
    );


// ----------------------------------------------------
// EQUAL-POWER CROSSFADE BETWEEN SLOW AND FAST
// ----------------------------------------------------

// 0 = entirely slow recording.
// 1 = entirely fast recording.

const transitionProgress = clamp(
    (motorHz - slowBaseHz) /
        (fastBaseHz - slowBaseHz),
    0,
    1,
    0
);

const transitionAngle =
    transitionProgress * Math.PI / 2;

// Curved equal-power gains.
const slowMix =
    Math.cos(transitionAngle);

const fastMix =
    Math.sin(transitionAngle);


    // ----------------------------------------------------
    // THROTTLE-BASED VOLUME
    // ----------------------------------------------------

    const throttleMagnitude = clamp(
        Math.abs(Number(throttleValue)),
        0,
        1,
        0
    );

    const throttleProgress = clamp(
        (throttleMagnitude - 0.01) / 0.99,
        0,
        1,
        0
    );

    const volume =
        MOTOR_SOUND_MIN_VOLUME +
        (1 - MOTOR_SOUND_MIN_VOLUME) *
        throttleProgress;

    const now = context.currentTime;

    motorSoundMasterGain.gain.setTargetAtTime(
        volume,
        now,
        0.02
    );


    // ----------------------------------------------------
    // SLOW RECORDING
    // ----------------------------------------------------

    if (slowMix > 0.0001) {

        if (!motorSoundPlayers.slow) {

            motorSoundPlayers.slow =
                createMotorSoundStem(
                    buffers.slow,
                    slowPlaybackRate
                );
        }

        updateMotorSoundStem(
            motorSoundPlayers.slow,
            slowPlaybackRate
        );

        motorSoundPlayers.slow.outputGain.gain
            .setTargetAtTime(
                slowMix,
                now,
                0.02
            );

    } else if (motorSoundPlayers.slow) {

        stopMotorSoundStem(
            motorSoundPlayers.slow
        );

        motorSoundPlayers.slow = null;
    }


    // ----------------------------------------------------
    // FAST RECORDING
    // ----------------------------------------------------

    if (fastMix > 0.0001) {

        if (!motorSoundPlayers.fast) {

            motorSoundPlayers.fast =
                createMotorSoundStem(
                    buffers.fast,
                    fastPlaybackRate
                );
        }

        updateMotorSoundStem(
            motorSoundPlayers.fast,
            fastPlaybackRate
        );

        motorSoundPlayers.fast.outputGain.gain
            .setTargetAtTime(
                fastMix,
                now,
                0.02
            );

    } else if (motorSoundPlayers.fast) {

        stopMotorSoundStem(
            motorSoundPlayers.fast
        );

        motorSoundPlayers.fast = null;
    }
}


export function playResistorSound() {
    if (!resistorSoundAudio) {
        resistorSoundAudio = new Audio(
            resolveAsset(RESISTOR_SOUND_FILE)
        );

        resistorSoundAudio.preload = "auto";
    }

    // Restart the recording every time a resistor switches.
    resistorSoundAudio.pause();

    try {
        resistorSoundAudio.currentTime = 0;
    } catch (error) {
        // The audio may not have loaded yet.
    }

    const playPromise = resistorSoundAudio.play();

    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(error => {
            console.warn(
                "Could not play resistor sound:",
                error
            );
        });
    }
}


export function getActiveResistorIndex(
    speedKmh,
    throttleValue,
    train = currentTrain
) {
    const notches = (train.pulsing ?? [])
        .filter(item => item.mode === "NOTCH")
        .map(item => ({
            min_speed: Number(item.min_speed ?? 0)
        }))
        .sort((a, b) => a.min_speed - b.min_speed);

    const throttlePercent =
        Math.abs(Number(throttleValue)) * 100;

    if (
        !notches.length ||
        !Number.isFinite(throttlePercent) ||
        throttlePercent === 0
    ) {
        return -1;
    }

    // Find the highest resistor reached.
    let reachedIndex = -1;

    for (let i = 0; i < notches.length; i++) {
        if (speedKmh >= notches[i].min_speed) {
            reachedIndex = i;
        } else {
            break;
        }
    }

    if (reachedIndex < 0) return -1;

    // Match the existing resistor power calculation:
    // Below 50% throttle, the first resistor stage is used.
    // At 50% throttle or above, use the reached stage.
    return throttlePercent < 50
        ? 0
        : reachedIndex;
}


export function applyAudioMode(mode) {
    mode = normaliseAudioMode(mode);
    currentTrain.audio_mode = mode;
    setSoundOptions({ sampleRate: 48000, singlePhase: mode === "48S" });
    return mode;
}

export async function ensureSoundStarted(allowPaused = false) {
    if (soundStarted || !simulationEnabled || (simulationPaused && !allowPaused)) return;
    try {
        const updateFunction = await startSound();
        if (!simulationEnabled || (simulationPaused && !allowPaused)) {
            stopSound();
            return;
        }
        soundUpdateFunction = updateFunction;
        setSoundUpdateFunction(updateFunction);
        soundStarted = true;
    } catch (error) {
        console.error("Could not start sound:", error);
    }
}

export async function restartSound() {
    if (soundStarted) stopSound();
    soundStarted = false;
    await ensureSoundStarted();
}

function renderDCResistorVisualisation(power) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const level = clamp(power, 0, 1, 0);

    // Keep the line slightly inside the canvas.
    const padding = height * 0.1;

    // 100% = top, 50% = middle, 0% = bottom.
    const y = padding +
        (height - padding * 2) * (1 - level);

    ctx.beginPath();
    ctx.strokeStyle = "#00d9ff";
    ctx.lineWidth = 2;

    ctx.moveTo(0, y);
    ctx.lineTo(width, y);

    ctx.stroke();
}


function renderDCPWMVisualisation(duty, carrierFrequency) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const dutyCycle = clamp(duty, 0, 1, 0);

    const highY = height * 0.25;
    const lowY = height * 0.75;

    ctx.strokeStyle = "#00d9ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    // 0%: continuously low.
    if (dutyCycle <= 0) {
        ctx.moveTo(0, lowY);
        ctx.lineTo(width, lowY);

    // 100%: continuously high.
    } else if (dutyCycle >= 1) {
        ctx.moveTo(0, highY);
        ctx.lineTo(width, highY);

    } else {
        // Match the existing render.js time scale:
        // 20,000 samples per second, 4 samples per pixel.
        const visibleSeconds = width * 4 / 20000;

        const frequency = Math.max(
            1,
            Number(carrierFrequency) || 400
        );

        const cycles = Math.max(
            1,
            Math.round(frequency * visibleSeconds)
        );

        const period = width / cycles;

        ctx.moveTo(0, lowY);

        for (let i = 0; i < cycles; i++) {
            const start = i * period;
            const end = (i + 1) * period;
            const highEnd = start + period * dutyCycle;

            ctx.lineTo(start, lowY);
            ctx.lineTo(start, highY);
            ctx.lineTo(highEnd, highY);
            ctx.lineTo(highEnd, lowY);
            ctx.lineTo(end, lowY);
        }
    }

    ctx.stroke();
}


function loop() {
    const now = performance.now();


    // ----------------------------------------------------
    // Simulation disabled.
    // ----------------------------------------------------

    if (!simulationEnabled) {
        stopMotorSound();
        previousFrame = now;

        lastSpeedKmh = 0;
        globalThis.simulated_speed = 0;

        statusText.textContent = "Simulation stopped";

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        requestAnimationFrame(loop);
        return;
    }


    // ----------------------------------------------------
    // Simulation paused.
    // ----------------------------------------------------

    if (simulationPaused) {
        previousFrame = now;

        globalThis.simulated_speed = lastSpeedKmh;

        statusText.textContent =
            `PAUSED | Speed: ${lastSpeedKmh.toFixed(2)} km/h`;

        requestAnimationFrame(loop);
        return;
    }


    // ----------------------------------------------------
    // Physics time step.
    // ----------------------------------------------------

    const deltaTime = Math.max(0, now - previousFrame);
    previousFrame = now;

    const simulationDeltaTime = Math.min(deltaTime, 100);
    const elapsedSeconds = simulationDeltaTime / 1000;


    const traction = normaliseTraction(currentTrain.traction);
    const controls = currentTrain.controls ?? {};

    const accel = Number(controls.acceleration ?? 2.5);
    const decel = Number(controls.deceleration ?? 3);

    const physicsMaxSpeed = effectiveMaxSpeed;

    let speedKmh = 0;
    let vfData = null;

    acceleration = 0;


    // ====================================================
    // DC RESISTOR
    // ====================================================

    if (traction === "DC_RESISTOR") {

        speedKmh = dcResistorSpeedKmh;
// ----------------------------------------------------
// RESISTOR SWITCHING SOUND
// ----------------------------------------------------

const activeResistorIndex = getActiveResistorIndex(
    speedKmh,
    throttle,
    currentTrain
);

// Play soundR.wav whenever a new higher resistor
// stage becomes active while applying power.

if (
    throttle > 0 &&
    power > 0 &&
    activeResistorIndex > lastResistorNotchIndex
) {
    playResistorSound();
}

// Reset tracking when power is removed.
// This allows the sound to play again when power
// is reapplied and a resistor stage is engaged.

lastResistorNotchIndex =
    throttle > 0 && power > 0
        ? activeResistorIndex
        : -1;
        if (throttle > 0) {
            power = getResistorPowerFraction(
                speedKmh,
                currentTrain,
                throttle,
                taperEndSpeed
            );

            acceleration = accel * power;

        } else if (throttle < 0) {
            power = 0;
            acceleration = -decel;

        } else {
            power = 0;
            acceleration = 0;
        }

        acceleration -= getRollingResistanceAcceleration(
            speedKmh,
            currentTrain,
            hill
        );

        dcResistorSpeedKmh +=
            acceleration * elapsedSeconds;

        dcResistorSpeedKmh = clamp(
            dcResistorSpeedKmh,
            0,
            physicsMaxSpeed,
            0
        );

        speedKmh = dcResistorSpeedKmh;


    // ====================================================
    // AC PWM
    // ====================================================

    } else if (traction === "AC_PWM") {

        const speedPerMotorHz =
            calculateSpeedPerMotorHz(currentTrain);

        if (
            !Number.isFinite(speedPerMotorHz) ||
            speedPerMotorHz <= 0
        ) {
            lastSpeedKmh = 0;
            globalThis.simulated_speed = 0;

            statusText.textContent =
                "Frequency: — Hz | Pulsing: — Hz | Power: 0% | " +
                "Speed: 0.00 km/h | Acceleration: 0.00 km/h/s | " +
                "Mode: Invalid AC gear ratio";

            requestAnimationFrame(loop);
            return;
        }

        speedKmh = frequency / speedPerMotorHz;

        const peakPoint =
            Number(currentTrain.peak_point ?? 50);

        let accelerationFactor = 1;

        if (speedKmh > peakPoint) {
            accelerationFactor =
                taperEndSpeed > peakPoint
                    ? clamp(
                        (taperEndSpeed - speedKmh) /
                        (taperEndSpeed - peakPoint),
                        0,
                        1,
                        0
                    )
                    : 0;
        }

        if (throttle > 0) {
            acceleration =
                accelerationFactor *
                accel *
                hill *
                throttle;

        } else if (throttle < 0) {
            acceleration = -(
                (decel - accel) +
                (accel * (2 - hill))
            ) * Math.abs(throttle);
        }

        acceleration -= getRollingResistanceAcceleration(
            speedKmh,
            currentTrain,
            hill
        );

        power = getPWMpowerFraction(
            speedKmh,
            throttle,
            currentTrain
        );

        if (
            throttle < 0 &&
            speedKmh < Number(currentTrain.decel_cutoff ?? 1)
        ) {
            power = 0;
        }

        frequency +=
            elapsedSeconds *
            acceleration *
            speedPerMotorHz;

        frequency = clamp(
            frequency,
            0,
            physicsMaxSpeed * speedPerMotorHz,
            0
        );

        speedKmh = frequency / speedPerMotorHz;

        try {
            commandVF(
                frequency,
                power,
                simulationDeltaTime
            );

            vfData = getVFData();

        } catch (error) {
            if (!vfErrorLogged) {
                console.warn("AC PWM V/F output error:", error);
                vfErrorLogged = true;
            }
        }


    // ====================================================
    // DC PWM
    // ====================================================

    } else if (traction === "DC_PWM") {

        speedKmh = dcPwmSpeedKmh;

        const peakPoint =
            Number(currentTrain.peak_point ?? 50);

        let accelerationFactor = 1;

        if (speedKmh > peakPoint) {
            accelerationFactor =
                taperEndSpeed > peakPoint
                    ? clamp(
                        (taperEndSpeed - speedKmh) /
                        (taperEndSpeed - peakPoint),
                        0,
                        1,
                        0
                    )
                    : 0;
        }

        if (throttle > 0) {
            acceleration =
                accelerationFactor *
                accel *
                hill *
                throttle;

        } else if (throttle < 0) {
            acceleration = -(
                (decel - accel) +
                (accel * (2 - hill))
            ) * Math.abs(throttle);
        }

        acceleration -= getRollingResistanceAcceleration(
            speedKmh,
            currentTrain,
            hill
        );

        power = getPWMpowerFraction(
            speedKmh,
            throttle,
            currentTrain
        );

        if (
            throttle < 0 &&
            speedKmh < Number(currentTrain.decel_cutoff ?? 1)
        ) {
            power = 0;
        }

        dcPwmSpeedKmh +=
            acceleration * elapsedSeconds;

        dcPwmSpeedKmh = clamp(
            dcPwmSpeedKmh,
            0,
            physicsMaxSpeed,
            0
        );

        speedKmh = dcPwmSpeedKmh;

        // Calculate the DC motor's electrical frequency.
        const dcMotorFrequency = calculateDCMotorRotationHz(
            speedKmh,
            currentTrain
        );

        // Send DC-PWM through the normal V/F interface.
        // V/F now selects the PWM entry and carrier frequency.
        try {
            commandVF(
                dcMotorFrequency,
                power,
                simulationDeltaTime
            );

            vfData = getVFData();

        } catch (error) {
            if (!vfErrorLogged) {
                console.warn("DC PWM V/F output error:", error);
                vfErrorLogged = true;
            }
        }
    }

// Update the looping DC motor recording.
updateMotorSound(
    traction,
    speedKmh,
    power,
    throttle
);
    // ====================================================
    // DC RESISTOR AUDIO
    // ====================================================

    if (
        traction === "DC_RESISTOR" &&
        soundStarted &&
        soundUpdateFunction
    ) {
        soundUpdateFunction({
            mode: "ASYNC",
            frequency: calculateDCMotorRotationHz(
                speedKmh,
                currentTrain
            ),
            carrier_frequency: 400,
            pulses: 1,
            power: 0
        }, simulationDeltaTime);
    }











// ====================================================
// BOTTOM STATUS STRING
// ====================================================
lastSpeedKmh = speedKmh;

globalThis.simulated_speed = speedKmh;

statusText.textContent =
    "Frequency: " +
    Number(
        traction === "DC_PWM" || traction === "DC_RESISTOR"
            ? calculateDCMotorRotationHz(speedKmh, currentTrain)
            : frequency
    ).toFixed(2) +
    " Hz | Pulsing: " +
    (
        traction === "DC_RESISTOR" ||
        (traction === "DC_PWM" && (power <= 0 || power >= 1)) ||
        (traction === "AC_PWM" && power <= 0)
            ? "—"
            : traction === "DC_PWM"
                ? Number(vfData?.carrierFrequency || 0).toFixed(0)
                : Number(getSoundData().pulsingFrequency || 0).toFixed(0)
    ) +
    " Hz | Power: " +
    Math.floor(Number(power) * 100) + "% | Speed: " +
    speedKmh.toFixed(2) +
    " km/h | Acceleration: " +
    (speedKmh <= 0 && acceleration < 0 ? 0 : acceleration).toFixed(2) +
    " km/h/s | Mode: " +
    (traction === "DC_RESISTOR" ? "DC RESISTOR" : vfData?.pulsingMode || "—");
if (pulsingHighlightCallback) pulsingHighlightCallback(speedKmh, throttle);




    // ====================================================
    // VISUALISATION
    // ====================================================

    if (traction === "DC_RESISTOR") {

        renderDCResistorVisualisation(power);

    } else if (traction === "DC_PWM") {

renderDCPWMVisualisation(
    Number(vfData?.currentPower ?? power),
    Number(vfData?.carrierFrequency) || 400
);

    } else {

        renderVisualisations();
    }

    requestAnimationFrame(loop);
}


export function VF_control_reset() {
    stopDriveOutput();
    stopMotorSound();
    if (soundStarted) {
        try { stopSound(); } catch (error) { console.warn("Could not stop sound:", error); }
        soundStarted = false;
    }
    simulationEnabled = false;
    simulationPaused = false;
    frequency = 0;
    dcPwmSpeedKmh = 0;
    dcResistorSpeedKmh = 0;
    power = 0;
    acceleration = 0;
    throttle = 0;
    hill = 1;
    lastSpeedKmh = 0;
    previousFrame = performance.now();
    globalThis.simulated_speed = 0;
    vfErrorLogged = false;
    lastResistorNotchIndex = -1;
    if (pulsingHighlightCallback) pulsingHighlightCallback(0, 0);
    notifyControlState();
    if (statusText) statusText.textContent = "Simulation stopped";
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!databaseReady) {
        initialResetRequested = true;
        pendingDriveName = null;
    }
    return true;
}

export function VF_control_pause() {
    if (!simulationEnabled) return false;
    if (simulationPaused) return true;
    simulationPaused = true;
    previousFrame = performance.now();
    stopDriveOutput();
    stopMotorSound();
    if (soundStarted) {
        try { stopSound(); } catch (error) { console.warn("Could not stop sound:", error); }
        soundStarted = false;
    }
    if (statusText) statusText.textContent = `PAUSED | Speed: ${lastSpeedKmh.toFixed(2)} km/h`;
    return true;
}

export function VF_control_resume() {
    if (!simulationEnabled) return false;
    if (!simulationPaused) return true;
    simulationPaused = false;
    previousFrame = performance.now();
    void ensureSoundStarted();
    return true;
}

export function VF_control_operate(throttlePosition, hillValue) {
    const requestedThrottle = Number(throttlePosition);
    const requestedHill = Number(hillValue);
    if (!Number.isFinite(requestedThrottle) || !Number.isFinite(requestedHill)) return false;
    throttle = clamp(requestedThrottle, -1, 1, 0);
    hill = clamp(requestedHill, 0, 2, 1);
    notifyControlState();
    if (pulsingHighlightCallback) pulsingHighlightCallback(lastSpeedKmh, throttle);
    return true;
}

export function loadDriveByName(driveName) {
    const key = String(driveName ?? "").trim().toLowerCase();
    if (!key) return false;

    const includedEntry = includedTrainConfigs.get(key);
    if (includedEntry) {
        setTrainConfiguration(includedEntry.config, includedEntry.name, { reset: true, activate: true, source: "included" });
        notifyDriveChanged();
        return true;
    }

    // Read local storage at command time, so recently saved user
    // drives are available to the runtime without the editor page.
    const userTrain = readUserTrains().find(item => item.name.trim().toLowerCase() === key);
    if (userTrain) {
        setTrainConfiguration(userTrain.config, userTrain.name, { reset: true, activate: true, source: "user" });
        notifyDriveChanged();
        return true;
    }
    return false;
}

export function VF_control_set_drive(driveName) {
    const name = String(driveName ?? "").trim();
    if (!name) return false;
    if (!databaseReady) {
        pendingDriveName = name;
        initialResetRequested = false;
        return true;
    }
    const loaded = loadDriveByName(name);
    if (!loaded) console.warn("VF_control_set_drive: train not found:", name);
    return loaded;
}

// Namespaced API for parent pages that host this runtime in an iframe.
// The legacy function names are retained for existing remote controllers.
export const VF_REMOTE_API = Object.freeze({
    setDrive: VF_control_set_drive,
    reset: VF_control_reset,
    pause: VF_control_pause,
    resume: VF_control_resume,
    operate: VF_control_operate,
    getState: getRuntimeSnapshot,
    get ready() {
        return runtimeReadyPromise;
    }
});

if (typeof globalThis.VFSimulatorRemote === "undefined") {
    globalThis.VFSimulatorRemote = VF_REMOTE_API;
}

const legacyRemoteFunctions = {
    VF_control_set_drive,
    VF_control_reset,
    VF_control_pause,
    VF_control_resume,
    VF_control_operate
};

// Do not replace names that may already belong to the host simulator.
// The namespaced VFSimulatorRemote API above is always available.
for (const [name, callback] of Object.entries(legacyRemoteFunctions)) {
    if (typeof globalThis[name] === "undefined") {
        globalThis[name] = callback;
    }
}

async function initialiseRuntime() {
    try {
        const response = await fetch(resolveAsset(vfDataUrl));
        if (!response.ok) throw new Error(`Could not load ${vfDataUrl} (${response.status}).`);
        const trainData = await response.json();
        if (!trainData || typeof trainData !== "object" || Array.isArray(trainData)) {
            throw new Error("vf.json must contain a train object.");
        }

        await setupDatabase(trainData);
        includedTrainConfigs = new Map(
            Object.entries(trainData).map(([name, config]) => [name.toLowerCase(), { name, config }])
        );
        includedTrains = getAvailableTrains();
        if (!includedTrains.length) throw new Error("No trains were found in vf.json.");

        databaseReady = true;
        const preferred = "Kiepe Croydon tram (50 mph)";
        const selected = includedTrains.find(name => name.toLowerCase() === preferred.toLowerCase()) ?? includedTrains[0];
        const requestedDrive = pendingDriveName;
        pendingDriveName = null;

        if (requestedDrive) {
            const loaded = loadDriveByName(requestedDrive);
            if (!loaded) {
                console.warn("Requested initial drive was not found:", requestedDrive);
                if (!initialResetRequested) {
                    const entry = includedTrainConfigs.get(selected.toLowerCase());
                    if (entry) setTrainConfiguration(entry.config, entry.name, { reset: true, activate: true, source: "included" });
                }
            }
        } else if (!initialResetRequested) {
            const entry = includedTrainConfigs.get(selected.toLowerCase());
            if (entry) setTrainConfiguration(entry.config, entry.name, { reset: true, activate: true, source: "included" });
        } else {
            simulationEnabled = false;
            if (statusText) statusText.textContent = "Simulation stopped";
        }

        if (!animationStarted) {
            animationStarted = true;
            previousFrame = performance.now();
            requestAnimationFrame(loop);
        }
        return getRuntimeSnapshot();

    } catch (error) {
        console.error("Database initialisation failed:", error);
        if (statusText) statusText.textContent = `Could not initialise V/F simulator: ${error.message ?? error}`;
        throw error;
    }
}

export function initializeVFSimulator(options = {}) {
    if (runtimeReadyPromise) return runtimeReadyPromise;

    canvas = options.canvas ?? document.getElementById("canvas") ?? document.getElementById("vf-canvas");
    statusText = options.status ?? document.getElementById("status-text") ?? document.getElementById("vf-status-text");

    if (!canvas || typeof canvas.getContext !== "function") {
        throw new Error("VF simulator requires a canvas element.");
    }
    if (!statusText) throw new Error("VF simulator requires a status text element.");

    ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not obtain a 2D context for the VF simulator canvas.");

    if (options.assetBaseUrl) assetBaseUrl = options.assetBaseUrl;
    if (options.vfDataUrl) vfDataUrl = options.vfDataUrl;

    setSoundOptions({ useInterpolation: true });
    setCanvas(canvas, ctx);
    setRenderOptions({
        renderSinglePhase: true,
        waveHeight: 0.4,
        phase1Position: 0.5,
        sampleRate: 20000,
        samplesPerPixel: 4,
        phase1Colour: "#f0dc65"
    });

    globalThis.addEventListener?.("pointerdown", () => {
        void ensureSoundStarted();
        resumeMotorSoundContext();
    }, { passive: true });

    runtimeReadyPromise = initialiseRuntime();
    if (typeof globalThis.VF_control_ready === "undefined") {
        globalThis.VF_control_ready = runtimeReadyPromise;
    }
    return runtimeReadyPromise;
}

export const USER_TRAIN_STORAGE_KEY = USER_TRAINS_KEY;
