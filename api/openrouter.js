const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function callGPT(messages, opts = {}) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://presalesos.novark.ai',
      'X-Title': 'Presales OS'
    },
    body: JSON.stringify({
      model: opts.model || 'openai/gpt-4.1',
      messages,
      max_tokens: opts.maxTokens || 2000,
      temperature: opts.temp ?? 0.3
    })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `OpenRouter error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// Vision variant — OCR fallback when extracted PDF text is empty or too short
// (scanned tender, no embedded text layer). images: [{ base64, mimeType }, ...]
export async function callGPTVision(prompt, images, opts = {}) {
  const content = [
    { type: 'text', text: prompt },
    ...images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
    }))
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://presalesos.novark.ai',
      'X-Title': 'Presales OS'
    },
    body: JSON.stringify({
      model: opts.model || 'openai/gpt-4.1',
      messages: [{ role: 'user', content }],
      max_tokens: opts.maxTokens || 3000,
      temperature: opts.temp ?? 0.2
    })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `OpenRouter vision error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
