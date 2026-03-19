'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { setAuthToken } from '@/lib/api';
import { clsx } from 'clsx';

type Lang = 'en' | 'hi';
type Role = 'user' | 'assistant';

interface Message { id: string; role: Role; text: string; action?: string; }
interface ConvMsg  { role: string; content: string | null; }

function speak(text: string, lang: Lang) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const clean = text.replace(/[*#_]/g, '').trim();
  if (!clean) return;

  const doSpeak = () => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang  = lang === 'hi' ? 'hi-IN' : 'en-IN';
    u.rate  = 0.88;
    u.pitch = 1.0;
    u.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (lang === 'hi') {
      const v = voices.find(v => v.lang === 'hi-IN')
             || voices.find(v => v.lang.startsWith('hi'))
             || voices.find(v => v.name.toLowerCase().includes('hindi'));
      if (v) u.voice = v;
    } else {
      const v = voices.find(v => v.lang === 'en-IN')
             || voices.find(v => v.lang === 'en-US')
             || voices.find(v => v.lang.startsWith('en'));
      if (v) u.voice = v;
    }

    window.speechSynthesis.speak(u);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
  }
}

function fmt(t: string) {
  return t.replace(/\*\*/g,'').replace(/\*/g,'').replace(/#{1,3}\s/g,'').trim();
}

function extractAction(text: string) {
  const m = text.match(/(?:Added|Created|Logged|Submitted|Generated)\s[^.!?\n]+/i)
         || text.match(/(?:जोड़ा|बनाया|दर्ज किया|जमा किया)[^।!?\n]+/);
  return m ? m[0].trim() : undefined;
}

const PROMPTS: Record<Lang, string[]> = {
  en: ['Show my farms', 'Create crop plan', 'Log a harvest', 'Weather forecast?'],
  hi: ['मेरे खेत दिखाओ', 'फसल योजना बनाओ', 'फसल दर्ज करो', 'मौसम कैसा है?'],
};

export default function AgriChat() {
  const { getToken } = useAuth();

  const [open, setOpen]           = useState(false);
  const [lang, setLangState]       = useState<Lang>('en');
  const setLang = (l: Lang) => { langRef.current = l; setLangState(l); };
  const [messages, setMessages]   = useState<Message[]>([]);
  const [conversation, setConv]   = useState<ConvMsg[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [inited, setInited]       = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  const bottomRef       = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLInputElement>(null);
  const mediaRecRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const processVoiceRef = useRef<((blob: Blob) => void) | null>(null);
  const langRef         = useRef<Lang>(lang);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !inited) { setInited(true); sendMessage('', true); }
  }, [open]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    stopRecording();
  }, []);

  const addMsg = (role: Role, text: string, action?: string) => {
    setMessages(p => [...p, { id: `${Date.now()}-${Math.random()}`, role, text, action }]);
  };

  const sendMessage = useCallback(async (userText: string, isInit = false) => {
    if (loading) return;
    if (!isInit && !userText.trim()) return;
    window.speechSynthesis?.cancel();
    setLoading(true);
    if (!isInit) { addMsg('user', userText); setInput(''); }

    const initPrompt = lang === 'hi'
      ? 'नमस्ते! मेरे खाते की जानकारी दो।'
      : 'Hello! Tell me about my account.';

    const apiMsgs: ConvMsg[] = isInit
      ? [{ role: 'user', content: initPrompt }]
      : [...conversation, { role: 'user', content: userText }];

    try {
      const token = await getToken(); setAuthToken(token);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ messages: apiMsgs, lang: langRef.current }),
      });
      if (!res.ok) throw new Error('err');
      const data = await res.json();
      addMsg('assistant', data.reply || '...', extractAction(data.reply || ''));
      setConv(data.conversation || apiMsgs);
      if (autoSpeak && data.reply) speak(data.reply, lang);
    } catch {
      addMsg('assistant', lang === 'hi' ? 'माफ़ करें, कुछ गड़बड़ हुई।' : 'Sorry, something went wrong.');
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [loading, conversation, lang, autoSpeak, getToken]);

  const processVoice = useCallback(async (audioBlob: Blob) => {
    setTranscribing(true);
    window.speechSynthesis?.cancel();
    try {
      const token = await getToken();
      const mime = audioBlob.type || 'audio/webm';
      const ext  = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';

      const form = new FormData();
      form.append('file', audioBlob, `audio.${ext}`);
      const currentLang = langRef.current;
      form.append('lang', currentLang);
      form.append('conversation', JSON.stringify(conversation));

      console.log('[voice] sending →', { lang: currentLang, size: audioBlob.size });

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/voice`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    form,
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Voice processing failed');
      }

      const data = await res.json() as { transcript: string; reply: string; conversation: any[] };

      if (data.transcript) {
        addMsg('user', data.transcript);
        setInput('');
      }
      if (data.reply) {
        addMsg('assistant', data.reply, extractAction(data.reply));
        setConv(data.conversation || []);
        if (autoSpeak) speak(data.reply, lang);
      }
    } catch (e: any) {
      console.error('Voice error:', e);
      addMsg('assistant', lang === 'hi' ? 'आवाज़ नहीं समझ पाया। फिर कोशिश करें।' : "Couldn't process audio. Try again.");
    } finally {
      setTranscribing(false);
    }
  }, [getToken, lang, conversation, autoSpeak]);

  useEffect(() => { processVoiceRef.current = processVoice; }, [processVoice]);

  const startRecording = useCallback(async () => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current  = stream;
      chunksRef.current  = [];

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find(t => MediaRecorder.isTypeSupported(t)) || '';

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 500) {
          processVoiceRef.current?.(blob);
        }
      };

      rec.start(100);
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        alert('Microphone permission denied.');
      } else {
        console.error('Mic error:', err);
      }
    }
  }, [recording, transcribing]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setRecSeconds(0);
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
    } else {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const toggleMic = useCallback(() => {
    if (recording) stopRecording();
    else startRecording();
  }, [recording, startRecording, stopRecording]);

  const clearChat = () => {
    setMessages([]); setConv([]); setInited(false);
    window.speechSynthesis?.cancel();
    stopRecording();
  };

  const hasUserMsg  = messages.some(m => m.role === 'user');
  const micDisabled = loading || transcribing;
  const micLabel    = recording
    ? `${recSeconds}s`
    : transcribing
    ? '…'
    : '';

  return (
    <>
      <button onClick={() => setOpen(o => !o)} aria-label="AgriBot"
        className={clsx(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl',
          'flex items-center justify-center text-2xl text-white transition-all duration-200 active:scale-95',
          open ? 'bg-red-500 hover:bg-red-600' : 'bg-leaf-600 hover:bg-leaf-700'
        )}>
        {open ? '✕' : '🌾'}
        {!open && !inited && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex flex-col rounded-3xl shadow-2xl overflow-hidden bg-white border border-[#e8ddd0]"
          style={{ width: 384, height: 580 }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-leaf-700 to-leaf-600 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-xl shrink-0">🌿</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm">AgriBot</div>
              <div className="text-xs text-leaf-200 truncate">
                {recording     ? (lang === 'hi' ? `🔴 रिकॉर्ड हो रहा है… ${recSeconds}s` : `🔴 Recording… ${recSeconds}s`)
                 : transcribing ? (lang === 'hi' ? '⏳ समझ रहा है…' : '⏳ Transcribing…')
                 : loading      ? (lang === 'hi' ? 'सोच रहा है…' : 'Thinking…')
                 : (lang === 'hi' ? 'आपका AI सहायक' : 'Your AI farming assistant')}
              </div>
            </div>

            <div className="px-3 py-1 bg-white/30 text-white text-xs font-bold rounded-lg">
              {lang === 'hi' ? 'हिंदी' : 'EN'}
            </div>

            <div className="flex bg-white/20 rounded-xl overflow-hidden shrink-0">
              {(['en','hi'] as Lang[]).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={clsx('px-2.5 py-1.5 text-xs font-bold transition-colors',
                    lang === l ? 'bg-white text-leaf-700' : 'text-white/70 hover:text-white')}>
                  {l === 'en' ? 'EN' : 'हि'}
                </button>
              ))}
            </div>

            <button onClick={() => { setAutoSpeak(a => !a); window.speechSynthesis?.cancel(); }}
              className={clsx('w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 transition-colors',
                autoSpeak ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white/10 text-white/40 hover:bg-white/20')}>
              {autoSpeak ? '🔊' : '🔇'}
            </button>

            <button onClick={clearChat}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs text-white/60 shrink-0">
              🗑️
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="text-center py-10">
                <div className="text-5xl mb-3">🌾</div>
                <p className="text-sm font-medium text-[#1d3a1f]">{lang === 'hi' ? 'नमस्ते!' : 'Hello!'}</p>
                <p className="text-xs text-[#7a6652] mt-1">{lang === 'hi' ? 'मैं आपका AI कृषि सहायक हूं' : "I'm your AI farming assistant"}</p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={clsx('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-leaf-100 flex items-center justify-center text-sm shrink-0 mt-0.5">🌿</div>
                )}
                <div className="max-w-[80%] space-y-1">
                  <div className={clsx('rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-leaf-600 text-white rounded-br-sm'
                      : 'bg-[#fdf8f0] text-[#1d3a1f] rounded-bl-sm border border-[#e8ddd0]')}>
                    {fmt(msg.text)}
                  </div>
                  {msg.action && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-medium">
                      ✅ {msg.action}
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <button onClick={() => speak(msg.text, lang)} className="text-xs text-[#a89880] hover:text-leaf-600 transition-colors">
                      🔊 {lang === 'hi' ? 'सुनें' : 'Listen'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {(loading || transcribing) && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-leaf-100 flex items-center justify-center text-sm shrink-0">🌿</div>
                <div className="bg-[#fdf8f0] border border-[#e8ddd0] rounded-2xl rounded-bl-sm px-4 py-3.5 flex gap-1 items-end">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-leaf-400"
                      style={{ animation: `agri-bounce 1.2s ${i*0.15}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {!hasUserMsg && !loading && (
            <div className="px-4 pb-2 flex gap-1.5 flex-wrap shrink-0">
              {PROMPTS[lang].map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-leaf-50 border border-leaf-200 text-leaf-700 hover:bg-leaf-100 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-[#e8ddd0] px-3 py-3 bg-white shrink-0">
            <form onSubmit={e => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={
                  transcribing ? (lang === 'hi' ? '⏳ आवाज़ समझ रहा है…' : '⏳ Transcribing your voice…')
                  : recording  ? (lang === 'hi' ? '🔴 बोलें… फिर ⏹️ दबाएं' : '🔴 Speak… then press ⏹️')
                  : (lang === 'hi' ? 'टाइप करें या 🎙️ दबाएं' : 'Type or press 🎙️ to speak')
                }
                disabled={loading || recording || transcribing}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#e8ddd0] text-sm outline-none focus:ring-2 focus:ring-leaf-400 bg-[#fdf8f0] placeholder-[#b0a090] disabled:opacity-60 min-w-0"
              />

              <button
                type="button"
                onClick={toggleMic}
                disabled={micDisabled}
                className={clsx(
                  'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 select-none relative',
                  recording
                    ? 'bg-red-500 text-white ring-2 ring-red-300 ring-offset-1 scale-105'
                    : transcribing
                    ? 'bg-amber-400 text-white'
                    : 'bg-[#f0ebe3] hover:bg-leaf-100 text-[#7a6652] hover:text-leaf-700 active:scale-95',
                  micDisabled && !recording && 'opacity-40 pointer-events-none'
                )}>
                {recording ? (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-lg">⏹️</span>
                    {recSeconds > 0 && <span className="text-[9px] font-bold mt-0.5">{recSeconds}s</span>}
                  </span>
                ) : transcribing ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-xl">🎙️</span>
                )}
              </button>

              <button type="submit" disabled={loading || !input.trim() || recording || transcribing}
                className="w-11 h-11 rounded-xl bg-leaf-600 hover:bg-leaf-700 disabled:opacity-30 flex items-center justify-center text-white transition-colors shrink-0 active:scale-95">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2 21L23 12 2 3v7l15 2-15 2v7z"/>
                </svg>
              </button>
            </form>

            <p className="text-center text-xs text-[#b0a090] mt-1.5 h-4">
              {recording
                ? (lang === 'hi' ? `🔴 रिकॉर्ड हो रहा है (${recSeconds}s)` : `🔴 Recording (${recSeconds}s)`)
                : transcribing
                ? (lang === 'hi' ? '⏳ Groq Whisper से ट्रांसक्रिप्ट हो रहा है…' : '⏳ Transcribing via Groq Whisper…')
                : (lang === 'hi' ? '🎙️ दबाएं और बोलें, फिर ⏹️ से रोकें' : '🎙️ Press to record · press ⏹️ when done')}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes agri-bounce {
          0%,100% { transform: translateY(0);    opacity: 0.35; }
          50%      { transform: translateY(-5px); opacity: 1;    }
        }
      `}</style>
    </>
  );
}