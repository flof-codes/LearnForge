import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dictation through the browser's own speech recognition.
 *
 * Not every browser has it (Firefox does not, and an installed web app on iOS
 * may refuse it): `supported` says so, and the caller then leaves the field to
 * the keyboard, whose own microphone key works everywhere.
 */

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const dictationSupported = (): boolean => recognitionCtor() !== null;

const LOCALES: Record<string, string> = { de: 'de-DE', en: 'en-US' };

interface Options {
  /** App language; the recognizer listens in it. */
  language: string;
  /** Called with the text as it grows: what was there before plus what has been heard so far. */
  onText: (text: string) => void;
}

export function useDictation({ language, onText }: Options) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText; // eslint-disable-line react-hooks/refs

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  /** Starts listening and appends to `base`, the text already in the field. */
  const start = useCallback((base: string) => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = LOCALES[language.slice(0, 2)] ?? language;
    rec.continuous = true;
    rec.interimResults = true;
    const prefix = base.trim() ? `${base.trim()} ` : '';
    let heard = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) heard += result[0].transcript;
        else interim += result[0].transcript;
      }
      onTextRef.current((prefix + heard + interim).replace(/\s+/g, ' ').trimStart());
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are a pause or our own stop, not a fault.
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(e.error);
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = rec;
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setError('start-failed');
    }
  }, [language]);

  useEffect(() => () => recognition.current?.abort(), []);

  return { supported: dictationSupported(), listening, error, start, stop };
}
