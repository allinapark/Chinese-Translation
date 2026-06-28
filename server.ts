import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import https from 'https';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

// Ensure the Gemini API key exists
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in the environment. AI features will require configuration.");
}

// Initialize the @google/genai client
// We set User-Agent header to 'aistudio-build' as required by instructions
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Helper to call generateContent with model fallbacks to bypass peak demand/quota errors.
 * Tries 'gemini-3.1-flash-lite' (most stable/available), then 'gemini-3.5-flash', then 'gemini-2.5-flash'.
 */
async function generateContentWithFallback(options: { contents: any; config?: any }) {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash'];
  let lastErr: any = null;
  
  for (const model of models) {
    try {
      console.log(`[Gemini] Requesting model: ${model}...`);
      const response = await ai.models.generateContent({
        ...options,
        model: model,
      });
      console.log(`[Gemini] Content generation successful with model: ${model}`);
      return response;
    } catch (err: any) {
      console.warn(`[Gemini] Model ${model} failed:`, err.message || err);
      lastErr = err;
      
      const status = err.status || (err.error && err.error.code);
      // Bad request (400) is a client-side/input error, so don't try other models
      if (status === 400) {
        throw err;
      }
    }
  }
  throw lastErr;
}

/**
 * Maps raw Gemini/Google API errors (429, 503, 403, 400) to supportive, descriptive, human-friendly JSON error messages.
 */
function formatGeminiError(err: any): string {
  const errMsg = err?.message || String(err);
  const status = err?.status || (err?.error && err?.error?.code);

  console.log(`[Error Formatting] Parsing error: "${errMsg}", status code: ${status}`);

  if (status === 429 || errMsg.includes('quota') || errMsg.includes('Quota') || errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini API Quota Exceeded (429): Your API key has exceeded its request rate or token limits. Please wait 1-2 minutes, check your billing details, or configure a paid tier key in Settings, then try again.';
  }
  if (status === 503 || errMsg.includes('503') || errMsg.includes('demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('temporary')) {
    return 'Gemini Service Temporarily Overloaded (503): Google\'s AI models are currently experiencing extremely high demand. This spike is temporary—please click the button again in a few seconds!';
  }
  if (status === 403 || errMsg.includes('API key') || errMsg.includes('API_KEY_INVALID') || errMsg.includes('invalid') || errMsg.includes('403') || errMsg.includes('Forbidden')) {
    return 'Invalid Gemini API Key: Your API key is invalid or not authorized. Please open Settings in AI Studio, verify your GEMINI_API_KEY environment variable is configured correctly, and try again.';
  }

  // Handle nested JSON string error messages returned from some API packages
  if (typeof errMsg === 'string' && (errMsg.trim().startsWith('{') || errMsg.trim().startsWith('['))) {
    try {
      const parsed = JSON.parse(errMsg);
      if (parsed?.error?.message) {
        return formatGeminiError(new Error(parsed.error.message));
      }
    } catch (_) {}
  }

  return errMsg || 'An unexpected server-side error occurred. Please try again.';
}

const app = express();
const PORT = 3000;

// Increase body limit for large JSON payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer to upload to system temp directory
const upload = multer({ 
  dest: os.tmpdir(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max video file
  }
});

// API Routes

/**
 * Health check route
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * Video proxy route to stream external videos on same-origin (port 3000)
 * Bypasses iframe sandbox / CSP restrictions on cross-domain media
 */
app.get('/api/video-proxy', (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return res.status(400).send('Invalid protocol');
  }

  console.log(`[Proxy] Streaming video from: ${targetUrl}`);

  const protocol = targetUrl.startsWith('https') ? https : http;

  const proxyReq = protocol.request(targetUrl, {
    headers: {
      'range': req.headers.range || '',
      'User-Agent': 'Mozilla/5.0'
    }
  }, (proxyRes) => {
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'video/mp4');
    }

    if (proxyRes.headers['content-range']) {
      res.setHeader('Content-Range', proxyRes.headers['content-range']);
    }
    if (proxyRes.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
    }
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }

    res.writeHead(proxyRes.statusCode || 200);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err);
    res.status(500).send('Error proxying video');
  });

  proxyReq.end();
});

/**
 * Endpoint to upload a video for background streaming
 * Saves the video to the temp directory and returns a same-origin URL
 */
app.post('/api/upload-video', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file uploaded' });
  }

  res.json({
    success: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    videoUrl: `/api/video-stream/${req.file.filename}`
  });
});

/**
 * Segmented/chunked video streaming with byte-range support
 * Enables stable playback and scrub/seek in iframe video elements
 */
app.get('/api/video-stream/:filename', (req, res) => {
  const filename = req.params.filename;
  // Security validation: filename must be alphanumeric (multer format)
  if (!/^[a-f0-9]+$/.test(filename)) {
    return res.status(400).send('Invalid file identifier');
  }

  const filePath = path.join(os.tmpdir(), filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Video not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * Main transcription & translation endpoint
 * Accepts a video or audio file and returns a structured subtitle JSON
 */
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video or audio file provided.' });
  }

  const localFilePath = req.file.path;
  const originalName = req.file.originalname;
  const mimeType = req.file.mimetype;
  let geminiFileRef: any = null;

  try {
    console.log(`[Upload] Received file: ${originalName} (${req.file.size} bytes), mime: ${mimeType}`);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing on the server. Please add your Gemini API key in Settings.');
    }

    // 1. Rename to original extension so Gemini can auto-detect MIME type, then upload
    const fileExt = path.extname(originalName) || '.mp4';
    const filePathWithExt = `${localFilePath}${fileExt}`;
    fs.renameSync(localFilePath, filePathWithExt);

    console.log(`[Gemini] Uploading file to Gemini File API... Path: ${filePathWithExt}`);
    geminiFileRef = await ai.files.upload({
      file: filePathWithExt,
    });

    console.log(`[Gemini] Upload complete. File ID: ${geminiFileRef.name}. Checking status...`);

    // 2. Poll status until ACTIVE
    let fileState = await ai.files.get({ name: geminiFileRef.name });
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max polling
    
    while (fileState.state === 'PROCESSING' && attempts < maxAttempts) {
      console.log(`[Gemini] File is processing (attempt ${attempts + 1})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      fileState = await ai.files.get({ name: geminiFileRef.name });
      attempts++;
    }

    if (fileState.state !== 'ACTIVE') {
      throw new Error(`File processing state: ${fileState.state}. Transcription cannot proceed.`);
    }

    console.log(`[Gemini] File is ACTIVE. Running transcription and translation model...`);

    // 3. Ask Gemini to transcribe and translate
    // We use generateContentWithFallback to automatically select the most available model (e.g. gemini-3.1-flash-lite)
    const response = await generateContentWithFallback({
      contents: [
        {
          fileData: {
            fileUri: fileState.uri,
            mimeType: fileState.mimeType,
          }
        },
        'Please watch or listen to this Chinese drama clip. Accurately transcribe all Chinese spoken dialogue. ' +
        'For each spoken line, generate: ' +
        '1) startTime (in seconds, as a decimal number, e.g., 1.5) ' +
        '2) endTime (in seconds, as a decimal number, e.g., 4.2) ' +
        '3) chinese (original transcribed Chinese text) ' +
        '4) burmese (natural, smooth, poetic, and dramatically fitting translation in Burmese for drama subtitles). ' +
        'Output a flat JSON array of these dialogue blocks in chronological order. ' +
        'Ensure the start and end times are very precise and match the speech exactly.'
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: { type: Type.NUMBER, description: 'Start time of dialogue in seconds' },
              endTime: { type: Type.NUMBER, description: 'End time of dialogue in seconds' },
              chinese: { type: Type.STRING, description: 'Transcribed Chinese spoken dialogue' },
              burmese: { type: Type.STRING, description: 'Natural, modern Burmese translation text' }
            },
            required: ['startTime', 'endTime', 'chinese', 'burmese']
          }
        }
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error('Gemini returned an empty response.');
    }

    console.log(`[Gemini] Transcription complete. Parsing response...`);
    const subtitles = JSON.parse(outputText);

    res.json({
      success: true,
      subtitles: subtitles
    });

  } catch (error: any) {
    console.error(`[Error] Transcription failed:`, error);
    res.status(500).json({
      error: formatGeminiError(error)
    });
  } finally {
    // 4. Cleanup local file (both original and with extension)
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        console.log(`[Cleanup] Deleted local temp file: ${localFilePath}`);
      }
      const fileExt = path.extname(originalName) || '.mp4';
      const filePathWithExt = `${localFilePath}${fileExt}`;
      if (fs.existsSync(filePathWithExt)) {
        fs.unlinkSync(filePathWithExt);
        console.log(`[Cleanup] Deleted local temp file with extension: ${filePathWithExt}`);
      }
    } catch (err) {
      console.error(`[Cleanup] Failed to delete local temp file:`, err);
    }

    // 5. Cleanup Gemini file to save space and respect privacy
    if (geminiFileRef) {
      try {
        console.log(`[Cleanup] Deleting Gemini file ref: ${geminiFileRef.name}...`);
        await ai.files.delete({ name: geminiFileRef.name });
        console.log(`[Cleanup] Successfully deleted Gemini file.`);
      } catch (err) {
        console.error(`[Cleanup] Failed to delete Gemini file ref:`, err);
      }
    }
  }
});

/**
 * Subtitle refinement endpoint
 * Enhances the style, poetic quality, or drama-vibe of existing Burmese translations
 */
app.post('/api/refine', async (req, res) => {
  const { subtitles, tone } = req.body;
  if (!subtitles || !Array.isArray(subtitles)) {
    return res.status(400).json({ error: 'Invalid or empty subtitles array.' });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing.');
    }

    console.log(`[Refine] Refining ${subtitles.length} subtitle lines. Tone style: ${tone || 'dramatic'}`);

    const promptText = `You are a professional Chinese-to-Burmese translation editor specializing in Chinese dramas (Wuxia, Xianxia, Romance, Modern). ` +
      `Review this array of translated subtitle blocks. Keep the start/end times and original Chinese identical, but refine the Burmese translations to be more: "${tone || 'poetic and natural'}" ` +
      `for a high-quality drama experience. Avoid literal or Google-translated phrasing; use elegant, dramatic, and emotionally resonant Burmese phrasing. ` +
      `Return the updated array in the exact same JSON schema. Here is the data:\n\n${JSON.stringify(subtitles)}`;

    const response = await generateContentWithFallback({
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
              chinese: { type: Type.STRING },
              burmese: { type: Type.STRING }
            },
            required: ['startTime', 'endTime', 'chinese', 'burmese']
          }
        }
      }
    });

    const refinedText = response.text;
    if (!refinedText) {
      throw new Error('Refined response is empty');
    }

    const refinedSubtitles = JSON.parse(refinedText);
    res.json({
      success: true,
      subtitles: refinedSubtitles
    });

  } catch (error: any) {
    console.error(`[Error] Refinement failed:`, error);
    res.status(500).json({ error: formatGeminiError(error) });
  }
});

// Vite Middleware Setup

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`Chinese Drama Auto Translator is online!`);
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=========================================`);
  });
}

startServer();
