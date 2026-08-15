type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

export type UiSound = "tap" | "success" | "error" | "notification" | "message";

type SoundNote = {
  frequency: number;
  delay: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

const SOUND_SETTING_KEY = "bodyfeet:sound-enabled";
const SOUND_SETTING_EVENT = "bodyfeet:sound-setting";

const SOUND_PATTERNS: Record<UiSound, SoundNote[]> = {
  tap: [{ frequency: 440, delay: 0, duration: 0.06, gain: 0.012 }],
  success: [
    { frequency: 523.25, delay: 0, duration: 0.14, gain: 0.026 },
    { frequency: 659.25, delay: 0.09, duration: 0.16, gain: 0.028 }
  ],
  error: [
    { frequency: 246.94, delay: 0, duration: 0.13, gain: 0.022, type: "triangle" },
    { frequency: 196, delay: 0.1, duration: 0.18, gain: 0.02, type: "triangle" }
  ],
  notification: [
    { frequency: 659.25, delay: 0, duration: 0.12, gain: 0.022 },
    { frequency: 783.99, delay: 0.12, duration: 0.2, gain: 0.025 }
  ],
  message: [
    { frequency: 739.99, delay: 0, duration: 0.1, gain: 0.018 },
    { frequency: 880, delay: 0.08, duration: 0.14, gain: 0.02 }
  ]
};

let sharedContext: AudioContext | null = null;
let unlockInstalled = false;

function getAudioContextClass() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext ?? null;
}

function createAudioContext() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;
  try {
    return new AudioContextClass();
  } catch {
    return null;
  }
}

function schedulePattern(context: AudioContext, pattern: SoundNote[]) {
  const start = context.currentTime + 0.015;

  pattern.forEach((note) => {
    const noteStart = start + note.delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = note.type ?? "sine";
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + note.duration + 0.02);
  });
}

export function isUiSoundEnabled() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SOUND_SETTING_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setUiSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SOUND_SETTING_KEY, enabled ? "1" : "0");
  } catch {
    // The preference remains active for the current screen even if storage is blocked.
  }

  window.dispatchEvent(new CustomEvent<boolean>(SOUND_SETTING_EVENT, { detail: enabled }));

  if (!enabled && sharedContext) {
    void sharedContext.close();
    sharedContext = null;
  }
}

export function subscribeToUiSoundSetting(listener: (enabled: boolean) => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleSetting = (event: Event) => {
    listener((event as CustomEvent<boolean>).detail);
  };
  window.addEventListener(SOUND_SETTING_EVENT, handleSetting);
  return () => window.removeEventListener(SOUND_SETTING_EVENT, handleSetting);
}

export function playUiSound(sound: UiSound) {
  if (!isUiSoundEnabled()) return;

  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = createAudioContext();
  }
  const context = sharedContext;
  if (!context) return;

  const play = () => schedulePattern(context, SOUND_PATTERNS[sound]);
  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
  } else {
    play();
  }
}

export function installSoundUnlock() {
  if (typeof window === "undefined" || unlockInstalled) return;
  unlockInstalled = true;

  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    if (!isUiSoundEnabled()) return;

    if (!sharedContext || sharedContext.state === "closed") {
      sharedContext = createAudioContext();
    }
    if (sharedContext?.state === "suspended") void sharedContext.resume();
  };

  window.addEventListener("pointerdown", unlock, { capture: true, once: true });
  window.addEventListener("keydown", unlock, { capture: true, once: true });
}

export function prepareLoginChime() {
  if (!isUiSoundEnabled()) return () => undefined;

  let context = createAudioContext();
  if (!context) return () => undefined;
  void context.resume();

  return (play: boolean) => {
    if (!context) return;
    const activeContext = context;

    if (!play || !isUiSoundEnabled()) {
      void activeContext.close();
      context = null;
      return;
    }

    schedulePattern(activeContext, SOUND_PATTERNS.success);
    window.setTimeout(() => void activeContext.close(), 450);
    context = null;
  };
}