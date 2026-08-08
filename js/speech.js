// ---- Text-to-speech (English pronunciation only) ----

let cachedVoices = [];
let voicesReady = false;

function loadVoices() {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v && v.length) {
      cachedVoices = v;
      voicesReady = true;
      resolve(v);
      return;
    }
    speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoices = speechSynthesis.getVoices();
      voicesReady = true;
      resolve(cachedVoices);
    }, { once: true });
    // Fallback timeout in case the event never fires.
    setTimeout(() => resolve(cachedVoices), 1000);
  });
}

function pickEnglishVoice() {
  const preferred = cachedVoices.find((v) => /en-US/i.test(v.lang)) ||
    cachedVoices.find((v) => /^en/i.test(v.lang));
  return preferred || null;
}

export function ttsSupported() {
  return 'speechSynthesis' in window;
}

export async function speak(text, { rate = 1 } = {}) {
  if (!ttsSupported()) return;
  if (!voicesReady) await loadVoices();
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = rate;
  const voice = pickEnglishVoice();
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
  return new Promise((resolve) => {
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
  });
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel();
}
