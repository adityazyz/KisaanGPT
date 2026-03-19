'use client';
import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';

type Lang = 'en' | 'hi';

interface SpeakButtonProps {
  getText: (lang: Lang) => string;
}

export function SpeakButton({ getText }: SpeakButtonProps) {
  const [open, setOpen]       = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [activeLang, setActiveLang] = useState<Lang | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const utterRef    = useRef<SpeechSynthesisUtterance | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Stop speech on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  const stop = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setActiveLang(null);
  };

  const speak = (lang: Lang) => {
    if (!window.speechSynthesis) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    // If already speaking this language, stop it
    if (speaking && activeLang === lang) { stop(); setOpen(false); return; }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    const text = getText(lang);
    const utter = new SpeechSynthesisUtterance(text);

    if (lang === 'hi') {
      utter.lang = 'hi-IN';
      // Try to find a Hindi voice
      const voices = window.speechSynthesis.getVoices();
      const hindiVoice = voices.find(v =>
        v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi')
      );
      if (hindiVoice) utter.voice = hindiVoice;
    } else {
      utter.lang = 'en-IN'; // Indian English accent preferred
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find(v => v.lang === 'en-IN') ||
                      voices.find(v => v.lang.startsWith('en'));
      if (enVoice) utter.voice = enVoice;
    }

    utter.rate   = 0.92;
    utter.pitch  = 1.0;
    utter.volume = 1.0;

    utter.onstart = () => { setSpeaking(true); setActiveLang(lang); };
    utter.onend   = () => { setSpeaking(false); setActiveLang(null); };
    utter.onerror = () => { setSpeaking(false); setActiveLang(null); };

    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Main button */}
      <button
        onClick={() => speaking ? stop() : setOpen(o => !o)}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all',
          speaking
            ? 'bg-leaf-600 text-white border-leaf-600 shadow-lg'
            : 'bg-white text-[#1d3a1f] border-[#e8ddd0] hover:border-leaf-400 hover:bg-leaf-50'
        )}
        title={speaking ? 'Stop reading' : 'Read report aloud'}
      >
        {speaking ? (
          <>
            {/* Animated sound waves */}
            <span className="flex items-end gap-0.5 h-4">
              {[1, 2, 3].map(i => (
                <span
                  key={i}
                  className="w-0.5 bg-white rounded-full"
                  style={{
                    animation: `sound-wave 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
                    height: `${i * 4 + 4}px`,
                  }}
                />
              ))}
            </span>
            <span>{activeLang === 'hi' ? 'रोकें' : 'Stop'}</span>
          </>
        ) : (
          <>
            <span className="text-base">🔊</span>
            <span>Read Aloud</span>
            <span className="text-[#7a6652] text-xs">▾</span>
          </>
        )}
      </button>

      {/* Language dropdown */}
      {open && !speaking && (
        <div className="absolute right-0 mt-2 w-44 bg-white rounded-2xl border border-[#e8ddd0] shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 text-xs text-[#7a6652] border-b border-[#e8ddd0]">
            Choose language
          </div>
          <button
            onClick={() => speak('en')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-leaf-50 transition-colors text-left"
          >
            <span className="text-xl">🇬🇧</span>
            <div>
              <div className="font-semibold text-[#1d3a1f] text-sm">English</div>
              <div className="text-xs text-[#7a6652]">Read in English</div>
            </div>
          </button>
          <button
            onClick={() => speak('hi')}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-leaf-50 transition-colors text-left border-t border-[#e8ddd0]"
          >
            <span className="text-xl">🇮🇳</span>
            <div>
              <div className="font-semibold text-[#1d3a1f] text-sm">हिंदी</div>
              <div className="text-xs text-[#7a6652]">Hindi में पढ़ें</div>
            </div>
          </button>
        </div>
      )}

      <style>{`
        @keyframes sound-wave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Text generators ───────────────────────────────────────────────────────────

export function getDiseaseReportText(result: any, lang: 'en' | 'hi'): string {
  if (!result) return '';

  if (lang === 'hi') {
    const crop    = result.crop_identified || 'फसल';
    const healthy = result.is_healthy;
    const urgency = result.urgency;

    let text = `AgriConnect फसल विश्लेषण रिपोर्ट। `;
    text += `फसल: ${crop}। `;

    if (healthy) {
      text += `खुशखबरी! आपकी फसल पूरी तरह स्वस्थ है। कोई बीमारी या कीट नहीं मिले। `;
    } else {
      text += `${result.conditions?.length || 'कुछ'} समस्याएं पाई गई हैं। `;

      if (urgency === 'immediate') text += `तुरंत कार्रवाई जरूरी है। `;
      else if (urgency === 'within_week') text += `एक हफ्ते के अंदर उपाय करें। `;
      else if (urgency === 'monitor') text += `फसल पर नजर रखें। `;

      result.conditions?.forEach((c: any, i: number) => {
        text += `समस्या ${i + 1}: ${c.name}। गंभीरता: ${
          c.severity === 'severe' ? 'अधिक' : c.severity === 'moderate' ? 'मध्यम' : 'कम'
        }। लगभग ${c.affected_area_percent} प्रतिशत क्षेत्र प्रभावित। `;
      });

      text += `उपचार: `;
      result.remedies?.forEach((r: any, i: number) => {
        text += `${i + 1}. ${r.treatment}। मात्रा: ${r.dosage}। समय: ${r.timing}। `;
      });
    }

    if (result.preventive_measures?.length) {
      text += `बचाव के उपाय: ${result.preventive_measures.slice(0, 3).join('. ')}। `;
    }

    text += result.overall_assessment || '';
    return text;
  }

  // English
  const crop    = result.crop_identified || 'the crop';
  let text = `AgriConnect Crop Analysis Report. Crop identified: ${crop}. `;

  if (result.is_healthy) {
    text += `Great news! Your crop is completely healthy. No diseases or pests were detected. `;
  } else {
    const count = result.conditions?.length || 'some';
    text += `${count} issue${count !== 1 ? 's' : ''} detected. `;

    const urgencyMap: Record<string, string> = {
      immediate:   'Immediate action is required.',
      within_week: 'Please take action within the next week.',
      monitor:     'Continue to monitor your crop closely.',
      none:        'No urgent action needed.',
    };
    text += `${urgencyMap[result.urgency] || ''} `;

    result.conditions?.forEach((c: any, i: number) => {
      text += `Issue ${i + 1}: ${c.name}. Severity: ${c.severity}. Approximately ${c.affected_area_percent} percent of the crop is affected. `;
    });

    text += `Recommended treatments: `;
    result.remedies?.forEach((r: any, i: number) => {
      text += `${i + 1}. ${r.treatment}. Dosage: ${r.dosage}. Apply ${r.timing}. `;
    });
  }

  if (result.preventive_measures?.length) {
    text += `Preventive measures: ${result.preventive_measures.slice(0, 3).join('. ')}. `;
  }

  text += result.overall_assessment || '';
  return text;
}

export function getGradeReportText(result: any, lang: 'en' | 'hi'): string {
  if (!result) return '';

  if (lang === 'hi') {
    const crop  = result.crop_identified || 'फसल';
    const grade = result.grade;
    const score = result.score;
    const min   = result.price_range?.min_inr_per_kg;
    const max   = result.price_range?.max_inr_per_kg;

    let text = `AgriConnect फसल गुणवत्ता रिपोर्ट। `;
    text += `फसल: ${crop}। `;
    text += `ग्रेड: ${grade}। गुणवत्ता स्कोर: ${score} में से 100। `;
    text += `${result.grade_label}। `;
    text += `अनुमानित बाजार मूल्य: ${min} रुपये से ${max} रुपये प्रति किलोग्राम। `;
    text += `बाजार: ${result.price_range?.market_type}। `;

    const m = result.marketability;
    const markets = [];
    if (m?.export_suitable)    markets.push('निर्यात');
    if (m?.wholesale_suitable) markets.push('थोक मंडी');
    if (m?.retail_suitable)    markets.push('खुदरा बाजार');
    if (m?.processing_suitable) markets.push('प्रसंस्करण इकाई');
    if (markets.length) text += `यह फसल इन बाजारों के लिए उपयुक्त है: ${markets.join(', ')}। `;

    const a = result.assessment;
    if (a) {
      text += `रंग: ${a.color?.rating === 'excellent' ? 'उत्कृष्ट' : a.color?.rating === 'good' ? 'अच्छा' : 'ठीक'}। `;
      text += `आकार समानता: ${a.size_uniformity?.rating === 'excellent' ? 'उत्कृष्ट' : a.size_uniformity?.rating === 'good' ? 'अच्छी' : 'ठीक'}। `;
      text += `पकाव: ${a.ripeness?.notes}। `;
    }

    if (result.improvement_suggestions?.length) {
      text += `सुधार के सुझाव: ${result.improvement_suggestions.slice(0, 3).join('. ')}। `;
    }

    text += result.overall_assessment || '';
    return text;
  }

  // English
  const crop  = result.crop_identified || 'the crop';
  const min   = result.price_range?.min_inr_per_kg;
  const max   = result.price_range?.max_inr_per_kg;

  let text = `AgriConnect Crop Quality Report. Crop: ${crop}. `;
  text += `Grade: ${result.grade}. Quality score: ${result.score} out of 100. `;
  text += `${result.grade_label}. `;
  text += `Estimated market price: ${min} to ${max} rupees per kilogram. `;
  text += `Suitable for ${result.price_range?.market_type}. `;

  const m = result.marketability;
  const markets = [];
  if (m?.export_suitable)    markets.push('export');
  if (m?.wholesale_suitable) markets.push('wholesale mandi');
  if (m?.retail_suitable)    markets.push('retail market');
  if (m?.processing_suitable) markets.push('processing unit');
  if (markets.length) text += `This crop is suitable for: ${markets.join(', ')}. `;

  const a = result.assessment;
  if (a) {
    text += `Color quality: ${a.color?.rating}, ${a.color?.notes}. `;
    text += `Size uniformity: ${a.size_uniformity?.rating}, ${a.size_uniformity?.notes}. `;
    text += `Ripeness: ${a.ripeness?.notes}. `;
    if (a.defects?.present) text += `Defects noted: ${a.defects?.description}. `;
  }

  if (result.improvement_suggestions?.length) {
    text += `Suggestions to improve grade: ${result.improvement_suggestions.slice(0, 3).join('. ')}. `;
  }

  text += result.overall_assessment || '';
  return text;
}
