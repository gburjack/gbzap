// src/services/media/media.service.js
// Processa todos os tipos de mídia que chegam pelo WhatsApp:
// - Áudio → transcrição via Whisper/Groq
// - Imagem → descrição via Gemini Vision
// - PDF/documento → extração de texto
// - Localização → texto legível
// - Outros → mensagem educada

import fetch from 'node-fetch';
import FormData from 'form-data';
import { logger } from '../../utils/logger.js';

// ─── ÁUDIO: Whisper via Groq ──────────────────────────────────────────────────

/**
 * Transcreve um áudio usando Whisper via API do Groq.
 * O áudio pode ser qualquer formato suportado (ogg, mp3, m4a, webm, wav).
 *
 * @param {Buffer} audioBuffer - Buffer do arquivo de áudio
 * @param {string} groqApiKey  - Chave de API do Groq
 * @param {string} mimeType    - Ex: 'audio/ogg', 'audio/mpeg'
 * @returns {Promise<string>}  - Texto transcrito
 */
export async function transcribeAudio(audioBuffer, groqApiKey, mimeType = 'audio/ogg') {
  if (!groqApiKey) throw new Error('Chave Groq não configurada para transcrição');

  try {
    const form = new FormData();
    // Groq aceita o arquivo como 'file'
    form.append('file', audioBuffer, {
      filename: 'audio.ogg',
      contentType: mimeType,
    });
    form.append('model', 'whisper-large-v3');
    form.append('language', 'pt'); // força português para melhor precisão
    form.append('response_format', 'text');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper error ${res.status}: ${err}`);
    }

    const transcription = await res.text();
    logger.info(`Áudio transcrito: "${transcription.substring(0, 60)}..."`);
    return transcription.trim();
  } catch (err) {
    logger.error('Erro na transcrição de áudio:', err.message);
    throw err;
  }
}

// ─── IMAGEM: Gemini Vision ────────────────────────────────────────────────────

/**
 * Analisa uma imagem usando Gemini 1.5 Flash Vision.
 * Retorna uma descrição detalhada da imagem para ser usada como contexto pela IA.
 *
 * @param {Buffer} imageBuffer  - Buffer da imagem
 * @param {string} geminiApiKey - Chave de API do Gemini
 * @param {string} mimeType     - Ex: 'image/jpeg', 'image/png', 'image/webp'
 * @param {string} userPrompt   - Pergunta ou contexto do usuário (opcional)
 * @returns {Promise<string>}   - Descrição da imagem
 */
export async function analyzeImage(imageBuffer, geminiApiKey, mimeType = 'image/jpeg', userPrompt = '') {
  if (!geminiApiKey) throw new Error('Chave Gemini não configurada para análise de imagens');

  try {
    const base64 = imageBuffer.toString('base64');

    const body = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
          {
            text: userPrompt
              ? `O cliente enviou esta imagem junto com a mensagem: "${userPrompt}". Descreva o que você vê e responda ao contexto.`
              : 'Descreva detalhadamente o que você vê nesta imagem. Se houver texto, transcreva-o. Seja objetivo e completo.',
          },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.3,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Gemini Vision error ${res.status}: ${JSON.stringify(data?.error)}`);
    }

    const description = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!description) throw new Error('Gemini Vision retornou descrição vazia');

    logger.info(`Imagem analisada: "${description.substring(0, 80)}..."`);
    return description;
  } catch (err) {
    logger.error('Erro na análise de imagem:', err.message);
    throw err;
  }
}

// ─── DOWNLOAD DE MÍDIA DA EVOLUTION API ──────────────────────────────────────

/**
 * Faz download de um arquivo de mídia a partir da URL fornecida pela Evolution API.
 * Retorna o Buffer do arquivo.
 */
export async function downloadMedia(mediaUrl, evolutionApiKey) {
  try {
    const res = await fetch(mediaUrl, {
      headers: evolutionApiKey ? { 'apikey': evolutionApiKey } : {},
    });

    if (!res.ok) {
      throw new Error(`Falha ao baixar mídia: HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    logger.info(`Mídia baixada: ${buffer.length} bytes de ${mediaUrl}`);
    return buffer;
  } catch (err) {
    logger.error('Erro ao baixar mídia:', err.message);
    throw err;
  }
}

// ─── LOCALIZAÇÃO ──────────────────────────────────────────────────────────────

/**
 * Converte coordenadas de localização em texto legível.
 */
export function formatLocation(latitude, longitude, name, address) {
  let text = '📍 O cliente compartilhou sua localização:\n';

  if (name)      text += `Local: ${name}\n`;
  if (address)   text += `Endereço: ${address}\n`;
  if (latitude && longitude) {
    text += `Coordenadas: ${latitude}, ${longitude}\n`;
    text += `Google Maps: https://maps.google.com/?q=${latitude},${longitude}`;
  }

  return text;
}

// ─── ROTEADOR DE MÍDIA ────────────────────────────────────────────────────────

/**
 * Ponto central de processamento de mídia.
 * Recebe o payload do webhook da Evolution e retorna texto processado.
 *
 * @returns {{ processedText: string, handled: boolean }}
 */
export async function processMediaMessage(message, client) {
  const { mediaType, mediaUrl, mediaBuffer, latitude, longitude, locationName, locationAddress } = message;

  try {
    switch (mediaType) {
      case 'audio':
      case 'ptt': { // ptt = push-to-talk (mensagem de voz do WhatsApp)
        if (!mediaBuffer && !mediaUrl) return { processedText: '[áudio não disponível]', handled: true };

        const buffer = mediaBuffer || await downloadMedia(mediaUrl, client.evolution_api_key);
        const transcription = await transcribeAudio(buffer, client.groq_api_key);
        return {
          processedText: `[Mensagem de voz transcrita]: ${transcription}`,
          handled: true,
        };
      }

      case 'image': {
        if (!mediaBuffer && !mediaUrl) return { processedText: '[imagem não disponível]', handled: true };

        const buffer = mediaBuffer || await downloadMedia(mediaUrl, client.evolution_api_key);
        const description = await analyzeImage(buffer, client.gemini_api_key, 'image/jpeg', message.caption);
        return {
          processedText: message.caption
            ? `[Imagem enviada com legenda "${message.caption}"]: ${description}`
            : `[Imagem enviada]: ${description}`,
          handled: true,
        };
      }

      case 'document':
      case 'pdf': {
        // Por ora: notifica que recebeu o documento
        // Fase futura: extração de texto via pdf-parse
        return {
          processedText: `[Documento recebido: ${message.fileName || 'arquivo'}]. Por enquanto não consigo processar o conteúdo do arquivo.`,
          handled: true,
        };
      }

      case 'location': {
        const locationText = formatLocation(latitude, longitude, locationName, locationAddress);
        return { processedText: locationText, handled: true };
      }

      case 'sticker':
        return { processedText: '[Sticker enviado]', handled: true };

      case 'video':
        return {
          processedText: '[Vídeo recebido]. No momento não consigo processar vídeos, mas posso ajudar com texto, áudio ou imagens!',
          handled: true,
        };

      default:
        return {
          processedText: `[Mídia do tipo "${mediaType}" recebida]. Não consigo processar este tipo de arquivo, mas estou aqui para ajudar por texto!`,
          handled: false,
        };
    }
  } catch (err) {
    logger.error(`Erro ao processar mídia (${mediaType}):`, err.message);
    return {
      processedText: `[Recebi sua ${mediaType === 'audio' ? 'mensagem de voz' : 'mídia'} mas tive um problema ao processar. Pode tentar enviar em texto?]`,
      handled: false,
    };
  }
}
