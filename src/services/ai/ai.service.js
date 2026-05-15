// src/services/ai/ai.service.js
// Motor de IA do GbZap
// Tenta Groq primeiro (Llama 3.3 70B) — se falhar por limite diário, usa Gemini 1.5 Flash
// Transparente para quem chama: sempre retorna { text, model, tokens }

import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';

// ─── GROQ ────────────────────────────────────────────────────────────────────

async function callGroq({ apiKey, messages, systemPrompt, model = 'llama-3.3-70b-versatile' }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 1024,
    temperature: 0.7,
  };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  // Rate limit diário atingido → sinaliza para usar fallback
  if (res.status === 429 || data?.error?.code === 'rate_limit_exceeded') {
    throw new Error('GROQ_RATE_LIMIT');
  }

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${data?.error?.message}`);
  }

  return {
    text:   data.choices[0].message.content.trim(),
    model:  `groq/${model}`,
    tokens: {
      prompt:     data.usage?.prompt_tokens || 0,
      completion: data.usage?.completion_tokens || 0,
    },
  };
}

// ─── GEMINI ───────────────────────────────────────────────────────────────────

async function callGemini({ apiKey, messages, systemPrompt }) {
  // Converte histórico de mensagens para formato Gemini
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.7,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const res  = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${JSON.stringify(data?.error)}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini retornou resposta vazia');

  return {
    text,
    model: 'gemini/gemini-1.5-flash',
    tokens: {
      prompt:     data.usageMetadata?.promptTokenCount || 0,
      completion: data.usageMetadata?.candidatesTokenCount || 0,
    },
  };
}

// ─── INTERFACE PÚBLICA ────────────────────────────────────────────────────────

/**
 * Gera uma resposta de IA com fallback automático Groq → Gemini.
 *
 * @param {object} params
 * @param {string} params.groqApiKey
 * @param {string} params.geminiApiKey
 * @param {string} params.systemPrompt  - system prompt já construído pelo prompt.utils
 * @param {Array}  params.messages      - histórico [{role:'user'|'assistant', content:'...'}]
 * @returns {Promise<{text:string, model:string, tokens:{prompt,completion}}>}
 */
export async function generateAiResponse({ groqApiKey, geminiApiKey, systemPrompt, messages }) {
  // 1. Tenta Groq (modelo principal — alta qualidade)
  if (groqApiKey) {
    try {
      const result = await callGroq({ apiKey: groqApiKey, messages, systemPrompt });
      logger.info(`IA respondeu via Groq | tokens: ${result.tokens.completion}`);
      return result;
    } catch (err) {
      if (err.message === 'GROQ_RATE_LIMIT') {
        logger.warn('Groq rate limit atingido — ativando fallback Gemini');
      } else {
        logger.error('Erro Groq (tentando Gemini):', err.message);
      }
    }
  }

  // 2. Fallback para Gemini
  if (geminiApiKey) {
    try {
      const result = await callGemini({ apiKey: geminiApiKey, messages, systemPrompt });
      logger.info(`IA respondeu via Gemini (fallback) | tokens: ${result.tokens.completion}`);
      return result;
    } catch (err) {
      logger.error('Erro Gemini:', err.message);
      throw err;
    }
  }

  throw new Error('Nenhuma chave de IA configurada para este cliente');
}

// ─── MODELO LEVE (para operações de alta frequência) ─────────────────────────

/**
 * Usa o modelo leve Llama 3.1 8B para classificações rápidas.
 * Ex: detectar intenção, classificar estágio do funil, etc.
 */
export async function quickClassify({ groqApiKey, geminiApiKey, prompt }) {
  return generateAiResponse({
    groqApiKey,
    geminiApiKey,
    systemPrompt: 'Você é um classificador. Responda APENAS com o valor solicitado, sem explicações.',
    messages: [{ role: 'user', content: prompt }],
  });
}
