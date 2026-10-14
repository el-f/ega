// Reads an answer aloud with a voice installed on this computer: a network voice would send the text away.

/** Some Chromium builds ship no speech engine; the button is not shown there. */
export function canSpeak(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

const VOICE_LIST_WAIT_MS = 1_000;

/** Chrome answers the first ask with an empty list and announces the real one with `voiceschanged`. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(speechSynthesis.getVoices());
    };
    const timer = setTimeout(done, VOICE_LIST_WAIT_MS);
    speechSynthesis.addEventListener('voiceschanged', done);
  });
}

// Norwegian voices carry the written standard's tag (nb, nn), never the macrolanguage code.
const SAME_LANGUAGE: Readonly<Record<string, readonly string[]>> = { no: ['no', 'nb', 'nn'] };

/** A local voice for the language; with no language, the local default. Never a network voice,
 *  and never another language's voice reading text it cannot pronounce. */
export async function pickLocalVoice(
  lang: string | undefined,
): Promise<SpeechSynthesisVoice | undefined> {
  const local = (await loadVoices()).filter((v) => v.localService);
  if (lang === undefined) return local.find((v) => v.default) ?? local[0];
  const want = lang.toLowerCase().split('-')[0] ?? '';
  const tags = SAME_LANGUAGE[want] ?? [want];
  return local.find((v) => tags.includes(v.lang.toLowerCase().split('-')[0] ?? ''));
}

/** One voice at a time across the panel: a new read stops the one before, and `onEnd` fires for both. */
export function speakWith(voice: SpeechSynthesisVoice, text: string, onEnd: () => void): void {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) speechSynthesis.cancel();
}
