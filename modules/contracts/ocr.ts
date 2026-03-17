import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';
import type { SkillsParseResult } from './types.js';
import type { Logger } from '../../src/utils/logger.js';

const MAX_LEVEL_DEFAULT = 5;
const LOG_TEXT_MAX = 500;
const UPSCALE_FACTOR = 2;

/** Extract whole numbers from text (e.g. 1, 5, 10, 11), cap each at maxLevel, return sum and list */
function parseSkillLevels(text: string, maxLevel: number): { levels: number[]; sum: number } {
  const levels: number[] = [];
  const numberRegex = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = numberRegex.exec(text)) !== null) {
    const n = parseInt(m[0], 10);
    if (n >= 1) levels.push(n > maxLevel ? maxLevel : n);
  }
  const sum = levels.reduce((a, b) => a + b, 0);
  return { levels, sum };
}

/** Fetch image as buffer (Node may fail to load Discord CDN URL inside Tesseract) */
async function fetchImageBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DiscordBot (Fate Bot, 1.0)' },
  });
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Run OCR on an image URL (Discord attachment proxy or direct).
 * Fetches image in Node and passes buffer to Tesseract for reliable recognition.
 */
export async function parseSkillsFromImage(
  imageUrl: string,
  options: { maxSkillLevel?: number; confidenceThreshold?: number; logger?: Logger } = {}
): Promise<SkillsParseResult> {
  const maxLevel = options.maxSkillLevel ?? MAX_LEVEL_DEFAULT;
  const confidenceThreshold = options.confidenceThreshold ?? 0.55;
  const log = options.logger;

  let imageBuffer: ArrayBuffer;
  try {
    imageBuffer = await fetchImageBuffer(imageUrl);
    if (log) log.info(`Contracts OCR: image fetched, size=${imageBuffer.byteLength} bytes`);
  } catch (err) {
    if (log) log.warn(`Contracts OCR: fetch failed - ${err instanceof Error ? err.message : String(err)}`);
    return { success: false, reason: 'ocr_failed' };
  }

  let preprocessedBuffer: Buffer = Buffer.from(imageBuffer);
  try {
    const meta = await sharp(preprocessedBuffer).metadata();
    if (meta.width && meta.height && meta.width < 2000 && meta.height < 2000) {
      preprocessedBuffer = await sharp(preprocessedBuffer)
        .resize(meta.width * UPSCALE_FACTOR, meta.height * UPSCALE_FACTOR, { withoutEnlargement: false })
        .png()
        .toBuffer();
      if (log) log.info(`Contracts OCR: image upscaled ${UPSCALE_FACTOR}x to ${meta.width * UPSCALE_FACTOR}x${meta.height * UPSCALE_FACTOR}`);
    }
  } catch {
    // keep original buffer if sharp fails
  }

  type WorkerInstance = Awaited<ReturnType<typeof createWorker>>;
  let worker: WorkerInstance | undefined;
  try {
    worker = await createWorker('eng', 1, {
      logger: () => {},
    });
    await worker.setParameters({ tessedit_char_whitelist: '0123456789' });

    const buffer = preprocessedBuffer;
    let confidence: number;
    let levels: number[];
    let sum: number;
    let lastText = '';

    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, tessedit_char_whitelist: '0123456789' });
    const { data: data1 } = await worker.recognize(buffer);
    const text1 = data1.text || '';
    lastText = text1;
    const parsed1 = parseSkillLevels(text1, maxLevel);

    if (parsed1.levels.length > 0) {
      confidence = data1.confidence / 100;
      levels = parsed1.levels;
      sum = parsed1.sum;
      if (log) {
        log.info(`Contracts OCR: SPARSE_TEXT | confidence=${(confidence * 100).toFixed(1)}% | levels=[${levels.join(',')}] | sum=${sum}`);
        log.debug(`Contracts OCR: raw text (${text1.length} chars): ${text1.slice(0, LOG_TEXT_MAX).replace(/\s+/g, ' ')}${text1.length > LOG_TEXT_MAX ? '...' : ''}`);
      }
    } else {
      if (log) log.info(`Contracts OCR: SPARSE_TEXT gave 0 numbers, trying PSM.SINGLE_BLOCK. Text length=${text1.length}`);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: '0123456789' });
      const { data: data2 } = await worker.recognize(buffer);
      const text2 = data2.text || '';
      lastText = text2;
      const parsed2 = parseSkillLevels(text2, maxLevel);
      confidence = data2.confidence / 100;
      levels = parsed2.levels;
      sum = parsed2.sum;
      if (log) {
        log.info(`Contracts OCR: SINGLE_BLOCK | confidence=${(confidence * 100).toFixed(1)}% | levels=[${levels.join(',')}] | sum=${sum}`);
        log.debug(`Contracts OCR: raw text (${text2.length} chars): ${text2.slice(0, LOG_TEXT_MAX).replace(/\s+/g, ' ')}${text2.length > LOG_TEXT_MAX ? '...' : ''}`);
      }
      if (levels.length === 0) {
        if (log) log.info(`Contracts OCR: SINGLE_BLOCK gave 0 numbers, trying PSM.AUTO`);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '0123456789' });
        const { data: data3 } = await worker.recognize(buffer);
        const text3 = data3.text || '';
        lastText = text3;
        const parsed3 = parseSkillLevels(text3, maxLevel);
        confidence = data3.confidence / 100;
        levels = parsed3.levels;
        sum = parsed3.sum;
        if (log) {
          log.info(`Contracts OCR: AUTO | confidence=${(confidence * 100).toFixed(1)}% | levels=[${levels.join(',')}] | sum=${sum}`);
          log.debug(`Contracts OCR: raw text (${text3.length} chars): ${text3.slice(0, LOG_TEXT_MAX).replace(/\s+/g, ' ')}${text3.length > LOG_TEXT_MAX ? '...' : ''}`);
        }
      }
    }

    if (levels.length === 0) {
      if (log) log.warn(`Contracts OCR: REJECT no_numbers | confidence=${(confidence * 100).toFixed(1)}% | raw text preview: "${lastText.slice(0, 300).replace(/\s+/g, ' ')}"`);
      return {
        success: false,
        reason: 'no_numbers',
        confidence,
      };
    }

    const plausibleSum = sum >= 10 && sum <= 200;
    const enoughNumbers = levels.length >= 2;
    const acceptByConfidence = confidence >= confidenceThreshold;
    const acceptByPlausibility = enoughNumbers && plausibleSum;

    if (!acceptByConfidence && !acceptByPlausibility) {
      if (log) log.warn(`Contracts OCR: REJECT low_confidence | confidence=${(confidence * 100).toFixed(1)}% | levels=[${levels.join(',')}] sum=${sum} (threshold=${confidenceThreshold}, enoughNumbers=${enoughNumbers}, plausibleSum=${plausibleSum})`);
      return {
        success: false,
        reason: 'low_confidence',
        confidence,
      };
    }

    if (log) log.info(`Contracts OCR: ACCEPT | sum=${sum} levels=[${levels.join(',')}] confidence=${(confidence * 100).toFixed(1)}%`);
    return {
      success: true,
      sum,
      confidence,
      levels,
    };
  } catch (err) {
    if (log) log.error(`Contracts OCR: exception - ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: false,
      reason: 'ocr_failed',
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
