/**
 * Direct Gemini audio analysis for locally imported videos.
 *
 * Audio is sent from the device to Google's Gemini API using the user's own key.
 * It is NOT sent through the Cheat Clip Pro backend.
 *
 * Gemini inline audio requests have a bounded payload. Larger files are rejected
 * with a clear message instead of silently falling back to the app server.
 */

export interface LocalTranscriptLine {
  start: number;
  end: number;
  text: string;
}

export interface LocalGeminiClip {
  title: string;
  start_time: number;
  end_time: number;
  hook_time: number;
  virality_score: number;
  key_quotes: string[];
  transcript: string;
  title_suggestion?: string;
  caption_suggestion?: string;
  hashtag_suggestion?: string;
}

export interface LocalGeminiAnalysis {
  summary: string;
  transcript: LocalTranscriptLine[];
  clips: LocalGeminiClip[];
}

const MAX_INLINE_AUDIO_BYTES = 18 * 1024 * 1024;

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Tidak dapat membaca audio lokal.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (comma < 0) {
        reject(new Error('Format audio tidak valid.'));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function extractJson(text: string): LocalGeminiAnalysis {
  const cleaned = text.trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.transcript) || !Array.isArray(parsed.clips)) {
    throw new Error('Gemini mengembalikan struktur analisis yang tidak lengkap.');
  }

  const transcript = parsed.transcript.map((line: any) => ({
    start: Number(line.start),
    end: Number(line.end),
    text: String(line.text || '').trim(),
  })).filter((line: LocalTranscriptLine) =>
    Number.isFinite(line.start) && Number.isFinite(line.end) &&
    line.start >= 0 && line.end > line.start && line.text
  );

  const clips = parsed.clips.map((clip: any) => ({
    title: String(clip.title || 'Highlight'),
    start_time: Number(clip.start_time),
    end_time: Number(clip.end_time),
    hook_time: Number(clip.hook_time),
    virality_score: Math.max(1, Math.min(100, Math.round(Number(clip.virality_score) || 1))),
    key_quotes: Array.isArray(clip.key_quotes) ? clip.key_quotes.map(String).slice(0, 2) : [],
    transcript: String(clip.transcript || ''),
    title_suggestion: String(clip.title_suggestion || ''),
    caption_suggestion: String(clip.caption_suggestion || ''),
    hashtag_suggestion: String(clip.hashtag_suggestion || ''),
  })).filter((clip: LocalGeminiClip) =>
    Number.isFinite(clip.start_time) && Number.isFinite(clip.end_time) &&
    clip.start_time >= 0 && clip.end_time > clip.start_time
  );

  return {
    summary: String(parsed.summary || ''),
    transcript,
    clips,
  };
}

/**
 * Transcribes a local WAV audio track and selects highlight clips in one Gemini
 * request. All timestamps must be absolute seconds from the original video.
 */
export async function analyzeLocalAudioWithGemini(args: {
  audioFile: File;
  apiKey: string;
  model: string;
  durationSeconds: number;
  clipDuration: string;
  targetClipCount?: number | 'auto';
  customPrompt?: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<LocalGeminiAnalysis> {
  const { audioFile, apiKey, model, durationSeconds, clipDuration, onProgress, signal } = args;

  if (!apiKey.trim()) throw new Error('Gemini API Key belum diisi.');
  if (!audioFile.type.startsWith('audio/')) {
    throw new Error('Audio lokal tidak valid. Ekstraksi audio video gagal.');
  }
  if (audioFile.size > MAX_INLINE_AUDIO_BYTES) {
    throw new Error(
      'Audio hasil ekstraksi lebih dari 18 MB. Jalur Gemini langsung saat ini memakai audio inline; file besar belum didukung dan tidak akan diunggah ke server aplikasi.'
    );
  }

  onProgress?.('Menyiapkan audio lokal untuk Gemini...');
  const data = await toBase64(audioFile);
  const countInstruction = args.targetClipCount === 'auto' || !args.targetClipCount
    ? 'Pilih 3–5 klip terbaik sesuai durasi dan kualitas.'
    : `Pilih sekitar ${args.targetClipCount} klip terbaik.`;

  const prompt = `
Analisis audio video ini untuk membuat transkrip bertimestamp dan memilih momen highlight.
Durasi video asli: ${durationSeconds.toFixed(2)} detik.
Bahasa yang diterima: Bahasa Indonesia atau Inggris. Pertahankan bahasa asli, jangan menerjemahkan.
Target durasi klip: ${clipDuration}.
${countInstruction}
Fokus tambahan: ${args.customPrompt?.trim() || 'Cari momen paling menarik, informatif, lucu, mengejutkan, atau memiliki hook kuat.'}

ATURAN:
- Buat transkrip seluruh audio dengan timestamp absolut dari awal video.
- Setiap baris transkrip: start, end, text.
- Pilih klip berdasarkan isi percakapan, bukan tebakan.
- start_time dan end_time harus berada dalam durasi video dan mengikuti batas kalimat.
- hook_time harus berada di dalam rentang klip.
- Kutipan harus benar-benar diucapkan.
- Skor virality_score bilangan bulat 1 sampai 100.
- Jangan membuat teks, kutipan, atau timestamp yang tidak didukung audio.
- Jika audio tidak berisi ucapan yang dapat dipahami, kembalikan transcript dan clips sebagai array kosong.

Kembalikan HANYA JSON valid dengan bentuk:
{
  "summary": "ringkasan singkat dan hashtag",
  "transcript": [{"start": 0.0, "end": 2.5, "text": "kalimat"}],
  "clips": [{
    "title": "judul singkat",
    "start_time": 0.0,
    "end_time": 20.0,
    "hook_time": 2.0,
    "virality_score": 90,
    "key_quotes": ["kutipan asli"],
    "transcript": "isi percakapan klip",
    "title_suggestion": "judul alternatif",
    "caption_suggestion": "caption",
    "hashtag_suggestion": "#tag"
  }]
}
`.trim();

  onProgress?.('Mengirim audio langsung ke Gemini (tanpa server Cheat Clip Pro)...');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: audioFile.type || 'audio/wav', data } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini API gagal (HTTP ${response.status}).`;
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    const reason = payload?.promptFeedback?.blockReason;
    throw new Error(reason ? `Permintaan Gemini diblokir: ${reason}` : 'Gemini tidak mengembalikan hasil analisis.');
  }

  const analysis = extractJson(text);
  if (!analysis.transcript.length) {
    throw new Error('Tidak ditemukan percakapan yang dapat ditranskripsikan pada audio.');
  }

  return analysis;
}
