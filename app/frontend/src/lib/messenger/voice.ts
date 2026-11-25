/* Voice notes travel over the same DataChannel as text, framed in small
 * JSON chunks so no single send exceeds the message-size guard. */

export const MAX_VOICE_BYTES = 12 * 1024 * 1024;
export const VOICE_CHUNK_BYTES = 16 * 1024;
/** Pause feeding the DataChannel above this much unacknowledged payload. */
export const VOICE_BUFFER_LIMIT = 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

export function bytesToBase64Chunks(bytes: Uint8Array, chunkSize = VOICE_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytesToBase64(bytes.subarray(offset, offset + chunkSize)));
  }
  return chunks;
}

export async function blobToBase64Chunks(blob: Blob): Promise<string[]> {
  return bytesToBase64Chunks(new Uint8Array(await blob.arrayBuffer()));
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64ToBlob(data: string, mimeType: string): Blob {
  return new Blob([base64ToBytes(data)], { type: mimeType });
}

export function createVoiceUrl(data: string, mimeType: string): string {
  return URL.createObjectURL(base64ToBlob(data, mimeType));
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Pick the best container the current browser can record and play back. */
export function pickVoiceMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}
