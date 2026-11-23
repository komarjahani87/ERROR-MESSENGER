import { client } from '@/lib/api';
import type { IceConfig, RoomPeer, SessionCredentials } from './types';

const BASE = '/api/v1/signaling';

export interface SyncPayload {
  serverTimeMs: number;
  self: RoomPeer;
  peers: RoomPeer[];
  signals: Array<{ id: number; from: string; kind: 'offer' | 'answer' | 'candidate'; payload: string }>;
}

export class SignalingFailure extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SignalingFailure';
    this.status = status;
  }
}

function describeError(error: unknown): SignalingFailure {
  const candidate = error as {
    status?: number;
    statusCode?: number;
    message?: string;
    data?: { detail?: string };
    response?: { status?: number; data?: { detail?: string } };
  };
  const status =
    candidate?.response?.status ?? candidate?.status ?? candidate?.statusCode ?? 0;
  const detail =
    candidate?.response?.data?.detail ?? candidate?.data?.detail ?? candidate?.message;
  return new SignalingFailure(detail || 'The signaling service is unreachable.', status);
}

async function post<T>(path: string, data: Record<string, unknown>): Promise<T> {
  try {
    const response = await client.apiCall.invoke({
      url: `${BASE}/${path}`,
      method: 'POST',
      data,
    });
    return response.data as T;
  } catch (error) {
    throw describeError(error);
  }
}

export const signaling = {
  createRoom(displayName: string) {
    return post<SessionCredentials>('create_room', { display_name: displayName });
  },
  joinRoom(code: string, displayName: string) {
    return post<SessionCredentials>('join_room', {
      code,
      display_name: displayName,
    });
  },
  sync(payload: {
    code: string;
    peer_id: string;
    token: string;
    since_signal_id: number;
  }) {
    return post<SyncPayload>('sync', payload);
  },
  sendSignal(payload: {
    code: string;
    peer_id: string;
    token: string;
    target_peer_id: string;
    kind: string;
    payload: string;
  }) {
    return post<{ ok: boolean; id: number }>('send_signal', payload);
  },
  leaveRoom(payload: { code: string; peer_id: string; token: string }) {
    return post<{ ok: boolean }>('leave_room', payload);
  },
  async iceConfig(): Promise<IceConfig> {
    try {
      const response = await client.apiCall.invoke({
        url: `${BASE}/ice_servers`,
        method: 'GET',
      });
      const data = response.data as IceConfig;
      if (!Array.isArray(data?.iceServers) || data.iceServers.length === 0) {
        throw new Error('empty');
      }
      return data;
    } catch {
      return {
        iceServers: [
          {
            urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'],
          },
        ],
        turnConfigured: false,
      };
    }
  },
};

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function formatRoomCode(raw: string): string {
  const code = normalizeRoomCode(raw);
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isValidRoomCode(raw: string): boolean {
  return /^[A-Z0-9]{8}$/.test(normalizeRoomCode(raw));
}