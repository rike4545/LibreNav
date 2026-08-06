/**
 * Voice guidance over the Web Speech API. No network, no keys — every evergreen
 * browser ships a synthesiser.
 *
 * The default voice is usually the worst one installed, so this picks a natural
 * one where the platform has it and lets the driver override the choice.
 */

export type VoiceSettings = {
  /** voiceURI of the chosen voice, or null to auto-pick. */
  voiceUri: string | null;
  /** 0.5–2. Slightly above 1 reads as alert without sounding rushed. */
  rate: number;
  pitch: number;
  volume: number;
};

export const defaultVoiceSettings: VoiceSettings = {
  voiceUri: null,
  rate: 1.0,
  pitch: 1,
  volume: 1
};

let settings: VoiceSettings = { ...defaultVoiceSettings };

export function configureVoice(next: VoiceSettings) {
  settings = next;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Voices load asynchronously on most browsers — getVoices() is empty on first
 * call and fills in after a `voiceschanged` event.
 */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function onVoicesChanged(callback: () => void): () => void {
  if (!speechSupported()) return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', callback);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', callback);
}

/**
 * Markers for the higher-quality voices platforms ship alongside the robotic
 * defaults. Apple's "Siri"/enhanced set, Google's network voices, and Microsoft's
 * "Natural" line all sound markedly better for turn-by-turn.
 */
const GOOD_VOICE_HINTS = ['siri', 'natural', 'enhanced', 'premium', 'neural', 'google'];
const POOR_VOICE_HINTS = ['compact', 'eloquence', 'espeak'];

function scoreVoice(voice: SpeechSynthesisVoice, language: string): number {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  let score = 0;

  // Language match matters most — a great voice reading the wrong language is
  // useless, and street names come back localised.
  if (voice.lang.toLowerCase().startsWith(language.slice(0, 2))) score += 100;
  if (voice.lang.toLowerCase() === language.toLowerCase()) score += 25;

  if (GOOD_VOICE_HINTS.some((hint) => name.includes(hint))) score += 40;
  if (POOR_VOICE_HINTS.some((hint) => name.includes(hint))) score -= 50;
  // Local voices keep working without a connection, which matters while driving.
  if (voice.localService) score += 15;
  if (voice.default) score += 5;

  return score;
}

export function pickVoice(): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (!voices.length) return null;

  if (settings.voiceUri) {
    const chosen = voices.find((voice) => voice.voiceURI === settings.voiceUri);
    if (chosen) return chosen;
  }

  const language = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return [...voices].sort((a, b) => scoreVoice(b, language) - scoreVoice(a, language))[0] ?? null;
}

let warmed = false;

/**
 * iOS and Chrome only allow speech after a user gesture. Call this from the
 * click that starts navigation so the first real announcement isn't swallowed.
 */
export function primeSpeech() {
  if (!speechSupported() || warmed) return;
  const utterance = new SpeechSynthesisUtterance(' ');
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
  warmed = true;
}

export function speak(text: string, options: { interrupt?: boolean } = {}) {
  if (!speechSupported() || !text.trim()) return;

  const synth = window.speechSynthesis;

  // Turn instructions matter more than whatever is still playing. Otherwise,
  // dropping a queued line is better than letting announcements pile up and
  // arrive after the turn they describe.
  if (options.interrupt) synth.cancel();
  else if (synth.speaking || synth.pending) return;

  const utterance = new SpeechSynthesisUtterance(spoken(text));
  const voice = pickVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else if (typeof navigator !== 'undefined') {
    utterance.lang = navigator.language;
  }

  utterance.rate = clamp(settings.rate, 0.5, 2);
  utterance.pitch = clamp(settings.pitch, 0, 2);
  utterance.volume = clamp(settings.volume, 0, 1);

  synth.speak(utterance);
}

/**
 * Tidy the text before it is read aloud.
 *
 * Valhalla's instructions are written to be *read*, so they carry abbreviations
 * and slashed multi-names that synthesisers mangle — "NY 9A N/West St" comes out
 * as a stream of letters.
 */
function spoken(text: string): string {
  return (
    text
      // "West Street/Joe DiMaggio Highway" — say the first name only.
      .replace(/([A-Za-z.])\/([A-Z])/g, '$1, or $2')
      .replace(/\bRd\b\.?/g, 'Road')
      .replace(/\bSt\b\.?/g, 'Street')
      .replace(/\bAve\b\.?/g, 'Avenue')
      .replace(/\bBlvd\b\.?/g, 'Boulevard')
      .replace(/\bDr\b\.?/g, 'Drive')
      .replace(/\bLn\b\.?/g, 'Lane')
      .replace(/\bHwy\b\.?/g, 'Highway')
      .replace(/\bPkwy\b\.?/g, 'Parkway')
      .replace(/\bCt\b\.?/g, 'Court')
      .replace(/\bSq\b\.?/g, 'Square')
      // Directional suffixes read as initials otherwise.
      .replace(/\bN\b(?=\s|$)/g, 'North')
      .replace(/\bS\b(?=\s|$)/g, 'South')
      .replace(/\bE\b(?=\s|$)/g, 'East')
      .replace(/\bW\b(?=\s|$)/g, 'West')
      .replace(/\bNE\b/g, 'northeast')
      .replace(/\bNW\b/g, 'northwest')
      .replace(/\bSE\b/g, 'southeast')
      .replace(/\bSW\b/g, 'southwest')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}

/** Read a sample line so a voice can be judged before driving with it. */
export function previewVoice() {
  speak('In 400 metres, turn right onto Market Street.', { interrupt: true });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
