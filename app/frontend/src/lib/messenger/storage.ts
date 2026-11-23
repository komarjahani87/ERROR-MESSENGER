import { DEFAULT_PREFERENCES, type Preferences, type StoredSession } from './types';

const PREF_KEY = 'error-messenger.preferences.v1';
const SESSION_KEY = 'error-messenger.sessions.v1';
const SESSION_LIMIT = 24;

function canStore(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function read<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be full or blocked; the app keeps working in memory */
  }
}

export const preferencesStore = {
  load(): Preferences {
    const stored = read<Partial<Preferences>>(PREF_KEY, {});
    return { ...DEFAULT_PREFERENCES, ...stored };
  },
  save(preferences: Preferences): void {
    write(PREF_KEY, preferences);
  },
};

export const sessionStore = {
  load(): StoredSession[] {
    const list = read<StoredSession[]>(SESSION_KEY, []);
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item.roomCode === 'string')
      .sort((a, b) => b.startedAt - a.startedAt);
  },
  saveAll(sessions: StoredSession[]): void {
    write(SESSION_KEY, sessions.slice(0, SESSION_LIMIT));
  },
  upsert(session: StoredSession): StoredSession[] {
    const rest = this.load().filter((item) => item.roomCode !== session.roomCode);
    const next = [session, ...rest].slice(0, SESSION_LIMIT);
    this.saveAll(next);
    return next;
  },
  remove(roomCode: string): StoredSession[] {
    const next = this.load().filter((item) => item.roomCode !== roomCode);
    this.saveAll(next);
    return next;
  },
  clear(): StoredSession[] {
    this.saveAll([]);
    return [];
  },
};