'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { SpeakButton, getDiseaseReportText, getGradeReportText } from './SpeakButton';
import { useLanguage } from '@/context/LanguageContext';

const AI_SERVICE = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:5000';

type Mode     = 'disease' | 'grade';
type Stage    = 'idle' | 'uploading' | 'scanning' | 'analyzing' | 'overlay' | 'dashboard';

interface FrameResult {
  frame_index:    number;
  timestamp:      number;
  crop_identified: string | null;
  status:         'healthy' | 'concerning' | 'critical' | 'unclear';
  observations:   string[];
  confidence:     number;
}

interface ProgressEvent {
  stage:         string;
  message:       string;
  percent:       number;
  current_frame?: number;
  total_frames?:  number;
  timestamp?:     number;
  duration?:      number;
  frame_count?:   number;
}

interface FinalEvent {
  mode:            Mode;
  file_type:       string;
  frames_analyzed: number;
  frame_results:   FrameResult[];
  result:          any;
}

// ── Colour maps ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  healthy:    { color: '#22c55e', labelEn: 'Healthy',    labelHi: 'स्वस्थ',      glow: '0 0 30px #22c55e88' },
  concerning: { color: '#f59e0b', labelEn: 'Concerning', labelHi: 'चिंताजनक',   glow: '0 0 30px #f59e0b88' },
  critical:   { color: '#ef4444', labelEn: 'Critical',   labelHi: 'गंभीर',       glow: '0 0 30px #ef444488' },
  unclear:    { color: '#94a3b8', labelEn: 'Scanning…',  labelHi: 'स्कैन हो रहा है…', glow: '0 0 20px #94a3b844' },
};

const GRADE_CONFIG: Record<string, { color: string; glow: string; label: string }> = {
  A: { color: '#22c55e', glow: '0 0 40px #22c55e99', label: 'Grade A' },
  B: { color: '#3b82f6', glow: '0 0 40px #3b82f699', label: 'Grade B' },
  C: { color: '#f59e0b', glow: '0 0 40px #f59e0b99', label: 'Grade C' },
  D: { color: '#ef4444', glow: '0 0 40px #ef444499', label: 'Grade D' },
};

// ── Scanning line animation component ────────────────────────────────────────
function ScanLine({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
      <div
        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent opacity-80"
        style={{ animation: 'scan-line 1.8s ease-in-out infinite' }}
      />
      {/* Corner brackets */}
      {[['top-2 left-2', 'border-t-2 border-l-2'],
        ['top-2 right-2', 'border-t-2 border-r-2'],
        ['bottom-2 left-2', 'border-b-2 border-l-2'],
        ['bottom-2 right-2', 'border-b-2 border-r-2']
      ].map(([pos, border], i) => (
        <div key={i} className={`absolute w-6 h-6 border-green-400 ${pos} ${border}`} />
      ))}
    </div>
  );
}

// ── Frame dot timeline ────────────────────────────────────────────────────────
function FrameTimeline({
  frames, duration, current,
}: { frames: FrameResult[]; duration: number; current: number }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
      <div className="relative h-1 bg-white/20 rounded-full">
        {/* Progress bar */}
        <div
          className="absolute left-0 top-0 h-full bg-white/60 rounded-full transition-all duration-300"
          style={{ width: `${duration > 0 ? (current / duration) * 100 : 0}%` }}
        />
        {/* Frame dots */}
        {frames.map((f, i) => {
          const pct = duration > 0 ? (f.timestamp / duration) * 100 : (i / Math.max(frames.length - 1, 1)) * 100;
          const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.unclear;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-black/30 transition-all"
              style={{
                left: `${pct}%`,
                backgroundColor: cfg.color,
                boxShadow: cfg.glow,
                transform: 'translate(-50%, -50%)',
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-white/50 mt-1">
        <span>0:00</span>
        {duration > 0 && <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2,'0')}</span>}
      </div>
    </div>
  );
}

// ── Overlay result card ───────────────────────────────────────────────────────
function OverlayResult({
  final, mode, onDone,
}: { final: FinalEvent; mode: Mode; onDone: () => void }) {
  const r = final.result;
  const isDisease = mode === 'disease';

  // Determine dominant status/grade for colour theme
  let themeColor = '#22c55e';
  let themeGlow  = '0 0 60px #22c55e66';
  let headline   = '';
  let subline    = '';

  if (isDisease) {
    const urgency = r.urgency;
    if (!r.is_healthy) {
      if (urgency === 'immediate') { themeColor = '#ef4444'; themeGlow = '0 0 80px #ef444466'; }
      else if (urgency === 'within_week') { themeColor = '#f59e0b'; themeGlow = '0 0 80px #f59e0b66'; }
      else { themeColor = '#f59e0b'; themeGlow = '0 0 60px #f59e0b44'; }
    }
    headline = r.is_healthy ? '✅ Crop is Healthy' : `⚠️ ${r.conditions?.length || 1} Issue${(r.conditions?.length||1) > 1 ? 's' : ''} Detected`;
    subline  = r.crop_identified || 'Crop identified';
  } else {
    const gc = GRADE_CONFIG[r.grade] || GRADE_CONFIG.B;
    themeColor = gc.color; themeGlow = gc.glow;
    headline   = `${r.grade_label}`;
    subline    = `₹${r.price_range?.min_inr_per_kg/100}–₹${r.price_range?.max_inr_per_kg/100}/kg`;
  }

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl"
      style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%)',
        backdropFilter: 'blur(2px)',
      }}>

      {/* Animated ring */}
      <div
        className="relative w-32 h-32 rounded-full flex items-center justify-center mb-6"
        style={{ boxShadow: themeGlow, border: `3px solid ${themeColor}` }}>
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20"
          style={{ backgroundColor: themeColor }}
        />
        {isDisease ? (
          <span className="text-5xl z-10">{r.is_healthy ? '✅' : '🔬'}</span>
        ) : (
          <span className="text-5xl font-black z-10" style={{ color: themeColor }}>{r.grade}</span>
        )}
      </div>

      {/* Headline */}
      <h2
        className="text-3xl font-black text-center mb-1 drop-shadow-lg"
        style={{ color: themeColor, textShadow: themeGlow }}>
        {headline}
      </h2>
      <p className="text-white/80 text-lg text-center mb-2">{subline}</p>
      <p className="text-white/60 text-sm text-center max-w-sm px-6 mb-8">
        {r.overall_assessment}
      </p>

      {/* Quick stats row */}
      <div className="flex gap-3 mb-8 flex-wrap justify-center">
        {isDisease ? (
          <>
            {r.conditions?.slice(0, 3).map((c: any, i: number) => (
              <div key={i}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border"
                style={{ borderColor: themeColor, color: themeColor, background: `${themeColor}22` }}>
                {c.name} · {c.severity}
              </div>
            ))}
            {r.is_healthy && (
              <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-500/20 border border-green-400 text-green-300">
                No issues found
              </div>
            )}
          </>
        ) : (
          <>
            <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 border border-white/20 text-white">
              Score: {r.score}/100
            </div>
            {Object.entries(r.marketability || {}).filter(([, v]) => v).map(([k]) => (
              <div key={k}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border"
                style={{ borderColor: themeColor, color: themeColor, background: `${themeColor}22` }}>
                {k.replace('_suitable', '').replace('_', ' ')}
              </div>
            ))}
          </>
        )}
      </div>

      {/* CTA */}
      <button
        onClick={onDone}
        className="px-8 py-3 rounded-2xl font-bold text-black text-lg transition-all hover:scale-105 active:scale-95"
        style={{ backgroundColor: themeColor, boxShadow: themeGlow }}>
        View Full Report / पूरी रिपोर्ट देखें →
      </button>

      <p className="text-white/30 text-xs mt-3">
        {final.frames_analyzed} frame{final.frames_analyzed > 1 ? 's' : ''} analysed / फ्रेम विश्लेषित
      </p>
    </div>
  );
}

// ── Full dashboard report ─────────────────────────────────────────────────────
function ReportLangToggle({
  lang, onToggle, translating,
}: { lang: 'en' | 'hi'; onToggle: () => void; translating: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={translating}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-all',
        lang === 'hi'
          ? 'bg-orange-50 border-orange-300 text-orange-700'
          : 'bg-white border-[#e8ddd0] text-[#7a6652] hover:border-leaf-400'
      )}>
      {translating ? (
        <>
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Translating…</span>
        </>
      ) : lang === 'hi' ? (
        <><span>🇬🇧</span><span className="text-xs">English</span></>
      ) : (
        <><span>🇮🇳</span><span className="text-xs">हिंदी में देखें</span></>
      )}
    </button>
  );
}

function DashboardReport({
  final, mode, onReset,
}: { final: FinalEvent; mode: Mode; onReset: () => void }) {
  const [reportLang, setReportLang] = useState<'en' | 'hi'>('en');
  const [translating, setTranslating] = useState(false);
  const [translatedResult, setTranslatedResult] = useState<any>(null);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // r is always the language-correct version
  const r = (reportLang === 'hi' && translatedResult) ? translatedResult : final.result;
  const isDisease = mode === 'disease';

  const handleLangToggle = async () => {
    // Switching back to English — just clear translated result
    if (reportLang === 'hi') {
      setReportLang('en');
      return;
    }

    // Already have a translation cached — just switch
    if (translatedResult) {
      setReportLang('hi');
      return;
    }

    // Fetch translation from our API route
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch('/api/translate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: final.result, mode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Translation failed');
      }
      const { translated } = await res.json();
      setTranslatedResult(translated);
      setReportLang('hi');
    } catch (e: any) {
      setTranslateError(e.message || 'Could not translate. Please try again.');
    } finally {
      setTranslating(false);
    }
  };

  const GRADE_BG: Record<string, string> = { A: 'bg-green-500', B: 'bg-blue-500', C: 'bg-yellow-500', D: 'bg-red-500' };
  const URGENCY_STYLE: Record<string, string> = {
    immediate:   'bg-red-100 text-red-700 border-red-200',
    within_week: 'bg-orange-100 text-orange-700 border-orange-200',
    monitor:     'bg-yellow-100 text-yellow-700 border-yellow-200',
    none:        'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">
            {isDisease
              ? (reportLang === 'hi' ? '🔬 रोग विश्लेषण रिपोर्ट' : '🔬 Disease Analysis Report')
              : (reportLang === 'hi' ? '🏅 गुणवत्ता ग्रेड रिपोर्ट' : '🏅 Quality Grade Report')}
          </h1>
          <p className="text-[#7a6652] text-sm mt-0.5">
            {final.frames_analyzed} {reportLang === 'hi' ? 'फ्रेम विश्लेषित' : `frame${final.frames_analyzed > 1 ? 's' : ''} analysed`} · {r.crop_identified || 'Crop'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ReportLangToggle lang={reportLang} onToggle={handleLangToggle} translating={translating} />
          <SpeakButton
            getText={(lang) =>
              isDisease
                ? getDiseaseReportText(r, lang)
                : getGradeReportText(r, lang)
            }
          />
          <button onClick={onReset} className="btn-secondary text-sm">
            {reportLang === 'hi' ? '← नया विश्लेषण' : '← New Analysis'}
          </button>
        </div>
      </div>

      {/* Translation error */}
      {translateError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 flex items-center gap-2">
          ⚠️ {translateError}
          <button onClick={() => setTranslateError(null)} className="ml-auto text-red-500 hover:text-red-700 font-medium">✕</button>
        </div>
      )}

      {/* Translation loading shimmer */}
      {translating && (
        <div className="card bg-orange-50 border-orange-200 flex items-center gap-3 py-3">
          <span className="text-xl">🇮🇳</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-orange-700 mb-1">रिपोर्ट का हिंदी अनुवाद हो रहा है…</div>
            <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-400 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Frame timeline strip */}
      {final.frame_results.length > 1 && (
        <div className="card">
          <p className="text-xs font-semibold text-[#7a6652] uppercase tracking-wide mb-3">{reportLang === 'hi' ? 'फ्रेम स्कैन टाइमलाइन' : 'Frame Scan Timeline'}</p>
          <div className="flex gap-2 flex-wrap">
            {final.frame_results.map((f, i) => {
              const cfg = STATUS_CONFIG[f.status] || STATUS_CONFIG.unclear;
              return (
                <div key={i} className="flex-1 min-w-20 rounded-xl p-2 text-center text-xs"
                  style={{ backgroundColor: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }}>
                  <div className="font-bold" style={{ color: cfg.color }}>
                    {reportLang === 'hi' ? cfg.labelHi : cfg.labelEn}
                  </div>
                  <div className="text-[#7a6652] mt-0.5">
                    {f.timestamp.toFixed(1)}s
                  </div>
                  <div className="text-[#7a6652] mt-0.5 text-xs">
                    {f.confidence}% {reportLang === 'hi' ? 'विश्वास' : 'conf'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isDisease ? (
        <>
          {/* Summary */}
          <div className={clsx('card border-2', r.is_healthy ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50')}>
            <div className="flex items-start gap-4">
              <span className="text-4xl">{r.is_healthy ? '✅' : '⚠️'}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="font-bold text-lg text-[#1d3a1f]">
                    {r.is_healthy ? (reportLang === 'hi' ? 'फसल स्वस्थ है' : 'Crop is Healthy') : (reportLang === 'hi' ? 'समस्याएं मिलीं' : 'Issues Detected')}
                  </h2>
                  <span className={clsx('badge border', URGENCY_STYLE[r.urgency])}>
                    {r.urgency === 'immediate'
                      ? (reportLang === 'hi' ? '🚨 तुरंत कार्रवाई करें' : '🚨 Act immediately')
                      : r.urgency === 'within_week'
                      ? (reportLang === 'hi' ? '⏰ एक हफ्ते में करें' : '⏰ Act within a week')
                      : r.urgency === 'monitor'
                      ? (reportLang === 'hi' ? '👀 निगरानी रखें' : '👀 Monitor')
                      : (reportLang === 'hi' ? '✓ कोई जरूरत नहीं' : '✓ No action needed')}
                  </span>
                </div>
                <p className="text-sm text-[#2d1f0e]">{r.overall_assessment}</p>
              </div>
            </div>
          </div>

          {/* Conditions */}
          {r.conditions?.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-[#1d3a1f] mb-3">{reportLang === 'hi' ? '🦠 पाई गई समस्याएं' : '🦠 Conditions Detected'}</h3>
              <div className="space-y-3">
                {r.conditions.map((c: any, i: number) => (
                  <div key={i} className={clsx(
                    'rounded-xl border p-4',
                    c.severity === 'severe' ? 'bg-red-50 border-red-200'
                    : c.severity === 'moderate' ? 'bg-orange-50 border-orange-200'
                    : 'bg-yellow-50 border-yellow-200'
                  )}>
                    <div className="flex justify-between flex-wrap gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#1d3a1f]">{c.name}</span>
                        <span className="badge bg-white/60 border text-xs capitalize">{c.type}</span>
                      </div>
                      <div className="text-xs text-[#7a6652]">
                        {c.severity} · ~{c.affected_area_percent}% {reportLang === 'hi' ? 'क्षेत्र' : 'area'} · {c.confidence}% {reportLang === 'hi' ? 'विश्वास' : 'confident'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.symptoms_observed?.map((s: string, j: number) => (
                        <span key={j} className="text-xs bg-white/50 border rounded-full px-2 py-0.5">{s}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remedies */}
          {r.remedies?.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-[#1d3a1f] mb-3">{reportLang === 'hi' ? '💊 उपचार' : '💊 Remedies'}</h3>
              <div className="space-y-3">
                {r.remedies.map((rem: any, i: number) => (
                  <div key={i} className="bg-[#fdf8f0] border border-[#e8ddd0] rounded-xl p-4">
                    <div className="flex justify-between flex-wrap gap-2 mb-2">
                      <span className="font-semibold text-sm text-[#1d3a1f]">{reportLang === 'hi' ? 'के लिए:' : 'For:'} {rem.condition}</span>
                      <div className="flex gap-1">
                        <span className={clsx('badge capitalize text-xs',
                          rem.remedy_type === 'organic' ? 'bg-green-100 text-green-700'
                          : rem.remedy_type === 'chemical' ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                        )}>{rem.remedy_type === 'organic' ? (reportLang === 'hi' ? 'जैविक' : 'organic') : rem.remedy_type === 'chemical' ? (reportLang === 'hi' ? 'रासायनिक' : 'chemical') : rem.remedy_type === 'biological' ? (reportLang === 'hi' ? 'जैव' : 'biological') : rem.remedy_type === 'cultural' ? (reportLang === 'hi' ? 'सांस्कृतिक' : 'cultural') : rem.remedy_type}</span>
                      </div>
                    </div>
                    <p className="font-bold text-[#1d3a1f] mb-2">{rem.treatment}</p>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-[#7a6652]">
                      <span>📏 {rem.dosage}</span>
                      <span>⏱ {rem.timing}</span>
                      {rem.estimated_cost_inr && <span className="mt-1">💰 {rem.estimated_cost_inr}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preventive */}
          {r.preventive_measures?.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-[#1d3a1f] mb-3">{reportLang === 'hi' ? '🛡️ बचाव के उपाय' : '🛡️ Preventive Measures'}</h3>
              <ul className="space-y-2">
                {r.preventive_measures.map((m: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-[#2d1f0e]">
                    <span className="text-leaf-500 shrink-0">✓</span>{m}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Grade + Price */}
          <div className="card">
            <div className="flex items-center gap-5 mb-5">
              <div className={clsx(
                'w-24 h-24 rounded-full flex flex-col items-center justify-center text-white shrink-0',
                GRADE_BG[r.grade] || 'bg-gray-400'
              )}>
                <span className="text-4xl font-black">{r.grade}</span>
                <span className="text-xs opacity-80">{r.score}/100</span>
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-xl text-[#1d3a1f] mb-1">{r.grade_label}</h2>
                <p className="text-sm text-[#7a6652]">{r.overall_assessment}</p>
                <div className="mt-2 bg-gray-100 rounded-full h-2">
                  <div
                    className={clsx('h-2 rounded-full', GRADE_BG[r.grade] || 'bg-gray-400')}
                    style={{ width: `${r.score}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Price */}
            <div className="bg-gradient-to-br from-leaf-50 to-earth-50 border border-leaf-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-[#7a6652] uppercase tracking-wide mb-3">{reportLang === 'hi' ? 'बाजार मूल्य अनुमान' : 'Market Price Estimate'}</p>
              <div className="flex items-center gap-4 mb-3">
                <div className="text-center">
                  <div className="text-3xl font-black text-leaf-700">₹{r.price_range?.min_inr_per_kg/100}</div>
                  <div className="text-xs text-[#7a6652]">{reportLang === 'hi' ? 'न्यूनतम/किग्रा' : 'Min/kg'}</div>
                </div>
                <div className="text-2xl text-[#7a6652]">—</div>
                <div className="text-center">
                  <div className="text-3xl font-black text-leaf-700">₹{r.price_range?.max_inr_per_kg/100}</div>
                  <div className="text-xs text-[#7a6652]">{reportLang === 'hi' ? 'अधिकतम/किग्रा' : 'Max/kg'}</div>
                </div>
                <div className="ml-2">
                  <div className="font-semibold text-sm text-[#1d3a1f]">{r.price_range?.market_type}</div>
                  <div className="text-xs text-[#7a6652] mt-0.5">{r.price_range?.basis}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { k: 'export_suitable',    lEn: 'Export',     lHi: 'निर्यात'    },
                  { k: 'wholesale_suitable', lEn: 'Wholesale',  lHi: 'थोक'       },
                  { k: 'retail_suitable',    lEn: 'Retail',     lHi: 'खुदरा'      },
                  { k: 'processing_suitable',lEn: 'Processing', lHi: 'प्रसंस्करण' },
                ].map(({ k, lEn, lHi }) => (
                  <div key={k} className={clsx(
                    'rounded-xl px-2 py-1.5 text-center text-xs font-semibold border',
                    r.marketability?.[k]
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  )}>
                    {r.marketability?.[k] ? '✅' : '❌'} {reportLang === 'hi' ? lHi : lEn}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quality breakdown */}
          <div className="card">
            <h3 className="font-bold text-[#1d3a1f] mb-3">{reportLang === 'hi' ? '📊 गुणवत्ता विवरण' : '📊 Quality Breakdown'}</h3>
            <div className="space-y-3">
              {[
                { k: 'color',           l: 'Color'           },
                { k: 'size_uniformity', l: 'Size Uniformity' },
                { k: 'surface_quality', l: 'Surface Quality' },
                { k: 'ripeness',        l: 'Ripeness'        },
              ].map(({ k, l }) => {
                const a = r.assessment?.[k];
                if (!a) return null;
                const stars = { excellent: 4, good: 3, fair: 2, poor: 1, optimal: 4, early: 3, overripe: 2, variable: 2 };
                const n = (stars as any)[a.rating] || 2;
                return (
                  <div key={k} className="flex items-start gap-3">
                    <div className="w-28 shrink-0">
                      <div className="text-xs text-[#7a6652]">{l}</div>
                      <div className="text-sm">{Array(n).fill('⭐').join('')}</div>
                    </div>
                    <div className="flex-1 bg-[#fdf8f0] rounded-xl px-3 py-2 text-xs">
                      <span className="font-semibold text-[#1d3a1f]">
                      {reportLang === 'hi'
                        ? ({excellent:'उत्कृष्ट',good:'अच्छा',fair:'ठीक',poor:'खराब',optimal:'उत्तम',early:'जल्दी',overripe:'अधिक पका',variable:'परिवर्तनशील'} as Record<string,string>)[a.rating] || a.rating
                        : a.rating}
                    </span>
                      <span className="text-[#7a6652]"> — {a.notes}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {r.improvement_suggestions?.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-[#1d3a1f] mb-3">{reportLang === 'hi' ? '💡 सुधार कैसे करें' : '💡 How to Improve'}</h3>
              <ul className="space-y-2">
                {r.improvement_suggestions.map((s: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-[#2d1f0e]">
                    <span className="text-earth-500 shrink-0">→</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CropAnalysisPage() {
  const { t } = useLanguage();
  const [mode, setMode]           = useState<Mode>('disease');
  const [stage, setStage]         = useState<Stage>('idle');
  const [file, setFile]           = useState<File | null>(null);
  const [videoUrl, setVideoUrl]   = useState<string | null>(null);
  const [isVideo, setIsVideo]     = useState(false);
  const [progress, setProgress]   = useState<ProgressEvent | null>(null);
  const [frameResults, setFrameResults] = useState<FrameResult[]>([]);
  const [currentStatus, setCurrentStatus] = useState<FrameResult['status']>('unclear');
  const [finalData, setFinalData] = useState<FinalEvent | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const fileRef  = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const esRef    = useRef<EventSource | null>(null);

  // Clean up
  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFrameResults([]);
    setFinalData(null);
    setError(null);
    setCurrentStatus('unclear');

    const vid = f.type.startsWith('video/') ||
      f.name.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)$/) !== null;
    setIsVideo(!!vid);
    setVideoUrl(URL.createObjectURL(f));
    setStage('idle');
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setStage('uploading');
    setFrameResults([]);
    setFinalData(null);
    setError(null);
    setCurrentStatus('unclear');

    // Play video from start
    if (videoRef.current && isVideo) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    // Use fetch + ReadableStream for SSE (EventSource doesn't support POST)
    try {
      const res = await fetch(`${AI_SERVICE}/analyze/stream`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      setStage('scanning');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.trim().split('\n');
          let eventName = 'message';
          let dataStr = '';

          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            if (line.startsWith('data:'))  dataStr   = line.slice(5).trim();
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventName === 'progress') {
              setProgress(data as ProgressEvent);
              if (data.stage === 'analyzing') setStage('analyzing');
            }

            if (eventName === 'frame') {
              const fr = data as FrameResult;
              setFrameResults(prev => [...prev, fr]);
              setCurrentStatus(fr.status);

              // Seek video to this frame's timestamp
              if (videoRef.current && isVideo && fr.timestamp != null) {
                videoRef.current.currentTime = fr.timestamp;
              }
            }

            if (eventName === 'final') {
              // Pause video at end
              if (videoRef.current) {
                videoRef.current.pause();
              }
              setFinalData(data as FinalEvent);
              setStage('overlay');
            }

            if (eventName === 'error') {
              setError(data.message);
              setStage('idle');
              if (videoRef.current) videoRef.current.pause();
            }
          } catch {
            // Skip malformed event
          }
        }
      }
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
      setStage('idle');
    }
  };

  const handleDone = () => setStage('dashboard');

  const reset = () => {
    setFile(null); setVideoUrl(null); setIsVideo(false);
    setStage('idle'); setProgress(null); setFrameResults([]);
    setFinalData(null); setError(null); setCurrentStatus('unclear');
    if (fileRef.current) fileRef.current.value = '';
  };

  const scanning  = stage === 'scanning' || stage === 'analyzing';
  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.unclear;

  if (stage === 'dashboard' && finalData) {
    return <DashboardReport final={finalData} mode={mode} onReset={reset} />;
  }

  return (
    <>
      {/* Scan line CSS */}
      <style>{`
        @keyframes scan-line {
          0%   { top: 5%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 95%; opacity: 0; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-[#1d3a1f]">{t('ai_title')}</h1>
          <p className="text-[#7a6652] text-sm mt-0.5">{t('ai_subtitle')}</p>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'disease', icon: '🔬', title: t('ai_disease'), desc: t('ai_disease_desc') },
            { id: 'grade',   icon: '🏅', title: t('ai_grade'),   desc: t('ai_grade_desc')   },
          ] as const).map(m => (
            <button key={m.id}
              onClick={() => { setMode(m.id); setFinalData(null); setFrameResults([]); setStage(file ? 'idle' : 'idle'); }}
              disabled={scanning}
              className={clsx(
                'p-3 rounded-2xl border-2 text-left transition-all',
                mode === m.id
                  ? 'border-leaf-500 bg-leaf-50'
                  : 'border-[#e8ddd0] hover:border-leaf-300 bg-white',
                scanning && 'opacity-50 cursor-not-allowed'
              )}>
              <span className="text-2xl mr-2">{m.icon}</span>
              <span className="font-bold text-[#1d3a1f] text-sm">{m.title}</span>
              <p className="text-xs text-[#7a6652] mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>

        {/* Upload zone */}
        {!file && (
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#e8ddd0] rounded-2xl p-12 text-center cursor-pointer hover:border-leaf-400 transition-colors bg-white">
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            <div className="text-6xl mb-4">🎬</div>
            <p className="font-bold text-[#1d3a1f] text-lg">{t('ai_upload_title')}</p>
            <p className="text-sm text-[#7a6652] mt-1">{t('ai_upload_desc')}</p>
          </div>
        )}

        {/* Video / image player with overlay */}
        {file && (
          <div className="space-y-4">
            {/* Media container */}
            <div
              className="relative rounded-2xl overflow-hidden bg-black"
              style={{
                boxShadow: scanning ? `0 0 0 2px ${statusCfg.color}, ${statusCfg.glow}` : '0 4px 20px rgba(0,0,0,0.15)',
                transition: 'box-shadow 0.5s ease',
                minHeight: 280,
              }}>
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={videoUrl || ''}
                  className="w-full max-h-96 object-contain"
                  muted
                  playsInline
                  onTimeUpdate={() => setVideoTime(videoRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration || 0)}
                />
              ) : (
                <img src={videoUrl || ''} alt="Crop" className="w-full max-h-96 object-contain" />
              )}

              {/* Scan line */}
              <ScanLine active={scanning} />

              {/* Live status badge */}
              {scanning && (
                <div
                  className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: `${statusCfg.color}cc` }}>
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  {statusCfg.labelEn}
                </div>
              )}

              {/* Frame counter */}
              {scanning && frameResults.length > 0 && (
                <div className="absolute top-4 right-4 bg-black/60 text-white text-xs px-2 py-1 rounded-lg font-mono">
                  {frameResults.length}/{progress?.total_frames || '?'} {t('ai_frames')}
                </div>
              )}

              {/* Frame timeline on video */}
              {isVideo && frameResults.length > 0 && stage !== 'overlay' && (
                <FrameTimeline
                  frames={frameResults}
                  duration={videoDuration}
                  current={videoTime}
                />
              )}

              {/* Final overlay */}
              {stage === 'overlay' && finalData && (
                <OverlayResult final={finalData} mode={mode} onDone={handleDone} />
              )}
            </div>

            {/* Progress bar */}
            {scanning && progress && (
              <div className="card py-3 px-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-[#1d3a1f]">{progress.message}</span>
                  <span className="text-[#7a6652]">{progress.percent}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-leaf-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Live frame observations */}
            {scanning && frameResults.length > 0 && (
              <div className="card space-y-2">
                <p className="text-xs font-semibold text-[#7a6652] uppercase tracking-wide">{t('ai_live_obs')}</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {[...frameResults].reverse().map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span
                        className="shrink-0 w-2 h-2 rounded-full mt-1"
                        style={{ backgroundColor: STATUS_CONFIG[f.status]?.color || '#94a3b8' }}
                      />
                      <span className="text-[#7a6652]">{f.timestamp.toFixed(1)}s —</span>
                      <span className="text-[#1d3a1f]">
                        {f.observations?.[0] || f.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                ⚠️ {error}
              </div>
            )}

            {/* Action buttons */}
            {stage === 'idle' && (
              <div className="flex gap-3">
                <button onClick={handleAnalyze} className="btn-primary flex-1 py-3 text-base">
                  {mode === 'disease' ? t('ai_start_disease') : t('ai_start_grade')}
                </button>
                <button onClick={reset} className="btn-secondary px-5">{t('ai_change_file')}</button>
              </div>
            )}

            {stage === 'overlay' && (
              <div className="flex gap-3">
                <button onClick={handleDone} className="btn-primary flex-1 py-3">{t('ai_view_report')}</button>
                <button onClick={reset} className="btn-secondary px-5">{t('ai_new_scan')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}