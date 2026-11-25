export type PeerRole = 'host' | 'guest';

export interface RoomPeer {
  peerId: string;
  displayName: string;
  role: PeerRole;
  lastSeenMs: number;
}

export interface SessionCredentials {
  roomCode: string;
  peerId: string;
  token: string;
  role: PeerRole;
  displayName: string;
  peers: RoomPeer[];
}

export type LinkState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed';

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface VoicePayload {
  mimeType: string;
  durationMs: number;
  /** Base64 audio while in flight; never persisted. */
  data?: string;
  /** Runtime-only object URL used for playback. */
  audioUrl?: string;
}

export interface ChatMessage {
  id: string;
  author: string;
  direction: 'self' | 'peer';
  text: string;
  at: number;
  status: DeliveryStatus;
  voice?: VoicePayload;
}

/** Drop transport-only fields before a message is written to storage. */
export function stripVoiceTransport(message: ChatMessage): ChatMessage {
  if (!message.voice) return message;
  return {
    ...message,
    voice: {
      mimeType: message.voice.mimeType,
      durationMs: message.voice.durationMs,
    },
  };
}

export interface StoredSession {
  roomCode: string;
  role: PeerRole;
  selfName: string;
  peerName: string;
  peerId: string;
  startedAt: number;
  endedAt: number | null;
  messages: ChatMessage[];
}

export interface Preferences {
  name: string;
  theme: 'dark' | 'light';
  reducedMotion: boolean;
  sound: boolean;
  notifications: boolean;
}

export interface IceConfig {
  iceServers: RTCIceServer[];
  turnConfigured: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  name: '',
  theme: 'dark',
  reducedMotion: false,
  sound: true,
  notifications: false,
};

export interface DiagnosticEntry {
  id: string;
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}