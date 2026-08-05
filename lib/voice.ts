/**
 * Voice guidance over the Web Speech API. No network, no keys — every evergreen
 * browser ships a synthesiser. Silently no-ops where it is unavailable.
 */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let warmed = false;

/**
 * iOS and Chrome only allow speech after a user gesture. Call this from the
 * click that enables voice so the first real announcement isn't swallowed.
 */
export function primeSpeech() {
  if (!speechSupported() || warmed) return;
  const utterance = new SpeechSynthesisUtterance('');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
  warmed = true;
}

export function speak(text: string, options: { interrupt?: boolean } = {}) {
  if (!speechSupported() || !text) return;

  // Turn instructions matter more than whatever is still playing.
  if (options.interrupt) window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1;
  utterance.lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}
