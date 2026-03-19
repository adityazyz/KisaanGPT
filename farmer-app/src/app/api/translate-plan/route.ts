import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function POST(req: NextRequest) {
  const { plan } = await req.json();

  if (!plan) {
    return NextResponse.json({ error: 'Missing plan data' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  // Extract only the translatable text fields — never translate keys, dates, numbers, crop names as IDs
  const payload = {
    notes: plan.notes || null,
    weather_alerts: plan.weather_alerts || [],
    ai_rationale: plan.ai_suggestions?.rationale || null,
    ai_risks: plan.ai_suggestions?.risks || [],
    ai_input_recommendations: (plan.ai_suggestions?.input_recommendations || []).map((r: any) => ({
      item: r.item,
      quantity: r.quantity,
      timing: r.timing,
    })),
    timeline_descriptions: (plan.timeline || []).map((t: any) => ({
      label: t.label,
      description: t.description,
    })),
  };

  const prompt = `You are a Hindi translator for agricultural crop planning data.
Translate ALL text values in this JSON from English to Hindi.
Rules:
- Translate every string value
- Keep JSON keys exactly as they are
- Keep dates, numbers, crop names (like Wheat, Rice) in their original form
- Keep technical terms like NPK, pH transliterated if needed
- Return ONLY valid JSON — no markdown, no explanation

JSON to translate:
${JSON.stringify(payload, null, 2)}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: 'You are a precise JSON translator. Return only valid JSON. Never add markdown or backticks.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq API error');
    }

    const data = await response.json();
    const raw = data.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let translated;
    try {
      translated = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) translated = JSON.parse(match[0]);
      else throw new Error('Could not parse translated JSON');
    }

    return NextResponse.json({ translated });
  } catch (err: any) {
    console.error('[translate-plan]', err);
    return NextResponse.json({ error: err.message || 'Translation failed' }, { status: 500 });
  }
}