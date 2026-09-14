import { useEffect, useState } from 'react';

function findArabicVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('ar'));
}

/**
 * Speaks Arabic text with an installed Arabic voice, or null when the device
 * has none. Voices load asynchronously, so this can become available after
 * the first render.
 */
export function useArabicSpeech(): ((text: string) => void) | null {
  const [voice, setVoice] = useState(findArabicVoice);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const update = () => setVoice(findArabicVoice());
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, []);

  if (!voice) return null;
  return (text: string) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    synth.speak(utterance);
  };
}
