import { spawn } from 'child_process';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Caps the number of concurrent ffmpeg processes per bot-api instance.
 * Each ffmpeg run buffers the input + output and keeps a child process —
 * a burst of voice messages would otherwise exhaust Render's memory budget.
 * The wait queue is unbounded but grows only briefly under spikes.
 */
const FFMPEG_MAX_CONCURRENT = 3;
let ffmpegInFlight = 0;
const ffmpegWaitQueue: Array<() => void> = [];

async function acquireFfmpegSlot(): Promise<void> {
  if (ffmpegInFlight < FFMPEG_MAX_CONCURRENT) {
    ffmpegInFlight++;
    return;
  }
  await new Promise<void>((resolve) => ffmpegWaitQueue.push(resolve));
  ffmpegInFlight++;
}

function releaseFfmpegSlot(): void {
  ffmpegInFlight--;
  const next = ffmpegWaitQueue.shift();
  if (next) next();
}

/**
 * Converts an audio buffer (OGG/Opus or any ffmpeg-supported format) to MP3
 * using ffmpeg via stdin→stdout pipe. No temporary files are written.
 *
 * Returns null on any error (spawn failure, ffmpeg non-zero exit, etc).
 *
 * Concurrency is capped via an in-process semaphore — see FFMPEG_MAX_CONCURRENT.
 */
export async function convertToMp3(
  inputBuffer: Buffer,
  ffmpegPath: string,
  logger: FastifyBaseLogger,
): Promise<Buffer | null> {
  await acquireFfmpegSlot();
  return new Promise((resolve) => {
    const finish = (result: Buffer | null): void => {
      releaseFfmpegSlot();
      resolve(result);
    };
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(ffmpegPath, [
        '-i', 'pipe:0',   // read from stdin
        '-f', 'mp3',       // output format
        '-vn',             // no video
        '-ar', '16000',    // 16 kHz sample rate (Whisper optimum)
        '-ac', '1',        // mono
        'pipe:1',          // write to stdout
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      logger.error({ err }, 'ffmpeg spawn error');
      finish(null);
      return;
    }

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr!.on('data', (chunk: Buffer) => errChunks.push(chunk));

    proc.on('error', (err) => {
      logger.error({ err }, 'ffmpeg process error');
      finish(null);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').slice(0, 500);
        logger.error({ code, stderr }, 'ffmpeg exited with non-zero code');
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks));
    });

    // Write input and close stdin to signal EOF
    proc.stdin!.end(inputBuffer);
  });
}
