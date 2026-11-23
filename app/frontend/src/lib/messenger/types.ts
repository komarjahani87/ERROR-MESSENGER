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

export interface ChatMessage {
  id: string;
  author: string;
  direction: 'self' | 'peer';
  text: string;
  at: number;
  status: DeliveryStatus;
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