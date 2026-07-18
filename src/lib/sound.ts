type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

export function prepareLoginChime() {
  const AudioContextClass = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextClass) return () => undefined;

  let context: AudioContext | null = null;

  try {
    context = new AudioContextClass();
    void context.resume();
  } catch {
    return () => undefined;
  }

  return (play: boolean) => {
    if (!context) return;
    if (!play) {
      void context.close();
      context = null;
      return;
    }

    const activeContext = context;
    const start = activeContext.currentTime + 0.02;
    [523.25, 659.25].forEach((frequency, index) => {
      const noteStart = start + index * 0.09;
      const oscillator = activeContext.createOscillator();
      const gain = activeContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.035, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16);
      oscillator.connect(gain);
      gain.connect(activeContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.17);
    });

    window.setTimeout(() => void activeContext.close(), 450);
    context = null;
  };
}
