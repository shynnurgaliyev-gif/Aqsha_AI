import { spawn } from 'child_process';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Converts an audio buffer (OGG/Opus or any ffmpeg-supported format) to MP3
 * using ffmpeg via stdin→stdout pipe. No temporary files are written.
 *
 * Returns null on any error (spawn failure, ffmpeg non-zero exit, etc).
 */
export async function convertToMp3(
  inputBuffer: Buffer,
  ffmpegPath: string,
  logger: FastifyBaseLogger,
): Promise<Buffer | null> {
  return new Promise((resolve) => {
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
      resolve(null);
      return;
    }

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr!.on('data', (chunk: Buffer) => errChunks.push(chunk));

    proc.on('error', (err) => {
      logger.error({ err }, 'ffmpeg process error');
      resolve(null);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').slice(0, 500);
        logger.error({ code, stderr }, 'ffmpeg exited with non-zero code');
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    // Write input and close stdin to signal EOF
    proc.stdin!.end(inputBuffer);
  });
}
