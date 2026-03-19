import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function POST(req: NextRequest) {
  const { result, mode } = await req.json();

  if (!result || !mode) {
    return NextResponse.json({ error: 'Missing result or mode' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  // Build a targeted list of fields to translate based on mode
  // We only translate human-readable text, never keys, numbers, booleans, or enum values
  const fieldsToTranslate =
    mode === 'disease'
      ? [
          'overall_assessment',
          'conditions[].name',
          'conditions[].symptoms_observed[]',
          'remedies[].condition',
          'remedies[].treatment',
          'remedies[].dosage',
          'remedies[].timing',
          'remedies[].estimated_cost_inr',
          'preventive_measures[]',
        ]
      : [
          'overall_assessment',
          'grade_label',
          'assessment.color.notes',
          'assessment.size_uniformity.notes',
          'assessment.surface_quality.notes',
          'assessment.ripeness.notes',
          'assessment.defects.description',
          'price_range.market_type',
          'price_range.basis',
          'improvement_suggestions[]',
        ];

  const prompt = `You are a Hindi translator for agricultural reports. 
Translate ONLY the specified text fields in this JSON from English to Hindi.
Do NOT translate: keys, numbers, boolean values, enum values (like "mild", "severe", "high", "A", "B", "C"), or anything not in the fields list.
Keep all JSON structure, keys, numbers, booleans, and enum values EXACTLY as they are.
Return ONLY the complete translated JSON object — no markdown, no explanation.

Fields to translate:
${fieldsToTranslate.join('\n')}

JSON to translate:
${JSON.stringify(result, null, 2)}`;

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
        max_tokens: 3000,
        messages: [
          {
            role: 'system',
            content: 'You are a precise JSON translator. Return only valid JSON. Never add markdown. Never change keys, numbers, booleans, or enum values.',
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

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let translated;
    try {
      translated = JSON.parse(cleaned);
    } catch {
      // Try extracting JSON object from response
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        translated = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse translated JSON');
      }
    }

    return NextResponse.json({ translated });
  } catch (err: any) {
    console.error('[translate-report]', err);
    return NextResponse.json({ error: err.message || 'Translation failed' }, { status: 500 });
  }
}