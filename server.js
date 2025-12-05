/**
 * AI WhatsApp Voice Automation - Backend Server
 *
 * Express server que integra com Google Gemini AI para geração
 * de áudio Text-to-Speech de alta qualidade.
 *
 * Endpoints:
 * - POST /api/tts - Geração de áudio TTS
 * - POST /api/generate - Compatível com n8n workflows
 * - GET /health - Status do servidor
 *
 * @author Art na Web
 * @license MIT
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '.env.local') });

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

console.log('🔑 API Key loaded:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT FOUND');

if (!API_KEY) {
  console.error("❌ ERROR: GEMINI_API_KEY is missing in .env.local");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Helper function to create WAV header
const createWavHeader = (dataSize, sampleRate = 24000) => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
};

// Função auxiliar para processar TTS
const processTTS = async (text, voice = 'Puck') => {
  console.log(`🎙️ Generating audio for text: "${text.substring(0, 50)}..." with voice: ${voice}`);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  console.log('📦 Response received from Gemini API');

  const candidate = response.candidates?.[0];
  const audioPart = candidate?.content?.parts?.[0];

  if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) {
    console.error('❌ No audio data in response:', JSON.stringify(response, null, 2));
    throw new Error("No audio data received from Gemini.");
  }

  console.log('✅ Audio data received successfully');

  // Decode base64 to raw PCM buffer
  const pcmBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
  console.log(`📊 PCM buffer size: ${pcmBuffer.length} bytes`);

  // Create WAV header
  const wavHeader = createWavHeader(pcmBuffer.length);

  // Combine header and PCM data
  return Buffer.concat([wavHeader, pcmBuffer]);
};

// Endpoint /api/tts
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'Puck' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const wavBuffer = await processTTS(text, voice);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wavBuffer.length,
    });

    res.send(wavBuffer);
    console.log(`✅ Audio sent successfully (${wavBuffer.length} bytes)`);

  } catch (error) {
    console.error("❌ Error generating speech:", error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
});

// Endpoint /api/generate (compatível com n8n)
app.post('/api/generate', async (req, res) => {
  try {
    const { text, voice = 'Puck' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const wavBuffer = await processTTS(text, voice);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wavBuffer.length,
    });

    res.send(wavBuffer);
    console.log(`✅ Audio sent successfully (${wavBuffer.length} bytes)`);

  } catch (error) {
    console.error("❌ Error generating speech:", error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    endpoints: ['/api/tts', '/api/generate'],
    apiKeyLoaded: !!API_KEY
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running at http://0.0.0.0:${port}`);
  console.log(`📡 Available endpoints:`);
  console.log(`   - POST /api/tts`);
  console.log(`   - POST /api/generate`);
  console.log(`   - GET /health`);
});
