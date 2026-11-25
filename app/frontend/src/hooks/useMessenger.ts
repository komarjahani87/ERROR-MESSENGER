import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PeerLink, type LinkEvent } from '@/lib/messenger/link';
import { signaling, normalizeRoomCode } from '@/lib/messenger/signaling';
import { preferencesStore, sessionStore } from '@/lib/messenger/storage';
import type {
  ChatMessage,
  DiagnosticEntry,
  LinkState,
  Preferences,
  RoomPeer,
  SessionCredentials,
  StoredSession,
} from '@/lib/messenger/types';
import { stripVoiceTransport } from '@/lib/messenger/types';

const LOG_LIMIT = 60;

let audioContext: AudioContext | null = null;

function playChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = audioContext ?? new Ctor();
    const ctx = audioContext;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.26);
  } catch {
    /* audio is a nicety; blocked autoplay must never break messaging */
  }
}

function logEntry(level: DiagnosticEntry['level'], message: string): DiagnosticEntry {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    level,
    message,
  };
}

export function useMessenger() {
  const [prefs, setPrefs] = useState<Preferences>(() => preferencesStore.load());
  const [session, setSession] = useState<SessionCredentials | null>(null);
  const [linkState, setLinkState] = useState<LinkState>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [peer, setPeer] = useState<RoomPeer | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<DiagnosticEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StoredSession[]>(() => sessionStore.load());

  const linkRef = useRef<PeerLink | null>(null);
  const startedAtRef = useRef<number>(0);
  const prefsRef = useRef(prefs);
  const sessionRef = useRef<SessionCredentials | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const pushLog = useCallback((level: DiagnosticEntry['level'], message: string) => {
    setLogs((current) => [logEntry(level, message), ...current].slice(0, LOG_LIMIT));
  }, []);

  /* Apply theme + motion preferences to the document shell. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', prefs.theme === 'light');
    root.classList.toggle('reduce-motion', prefs.reducedMotion);
    root.style.colorScheme = prefs.theme === 'light' ? 'light' : 'dark';
  }, [prefs.theme, prefs.reducedMotion]);

  useEffect(() => {
    preferencesStore.save(prefs);
  }, [prefs]);

  /* Persist the transcript of the active room. */
  useEffect(() => {
    if (!session || messages.length === 0) return;
    const record: StoredSession = {
      roomCode: session.roomCode,
      role: session.role,
      selfName: session.displayName,
      peerName: peer?.displayName ?? 'Peer',
      peerId: peer?.peerId ?? '',
      startedAt: startedAtRef.current || Date.now(),
      endedAt: null,
      messages: messages.slice(-200).map(stripVoiceTransport),
    };
    const timer = setTimeout(() => setHistory(sessionStore.upsert(record)), 350);
    return () => clearTimeout(timer);
  }, [session, peer, messages]);

  const handleEvent = useCallback(
    (event: LinkEvent) => {
      switch (event.type) {
        case 'state':
          setLinkState(event.state);
          setStatusDetail(event.detail ?? '');
          break;
        case 'peer':
          setPeer(event.peer);
          break;
        case 'peers':
          setPeers(event.peers);
          break;
        case 'message': {
          setMessages((current) => [...current, event.message]);
          if (prefsRef.current.sound) playChime();
          if (prefsRef.current.notifications && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(event.message.author, {
                body: (event.message.voice ? 'Sent you a voice message' : event.message.text).slice(0, 120),
              });
            } catch {
              /* notifications can be blocked by the OS */
            }
          }
          break;
        }
        case 'delivered':
          setMessages((current) =>
            current.map((item) =>
              item.id === event.id ? { ...item, status: 'delivered' } : item,
            ),
          );
          break;
        case 'log':
          pushLog(event.level, event.message);
          break;
      }
    },
    [pushLog],
  );

  const attachLink = useCallback(
    async (credentials: SessionCredentials) => {
      const ice = await signaling.iceConfig();
      const link = new PeerLink(credentials, ice.iceServers, handleEvent);
      linkRef.current = link;
      startedAtRef.current = Date.now();
      setSession(credentials);
      setPeers(credentials.peers);
      setMessages([]);
      setLinkState('idle');
      setStatusDetail(
        credentials.role === 'host'
          ? 'Waiting for a peer to join the room.'
          : 'Waiting for the host to open the direct link.',
      );
      setLogs([]);
      pushLog(
        'info',
        ice.turnConfigured
          ? 'ICE configuration loaded with a TURN relay available.'
          : 'ICE configuration loaded with STUN only. Symmetric NATs may block direct links.',
      );
      if (credentials.role === 'guest') {
        const host = credentials.peers.find((item) => item.role === 'host');
        if (host) setPeer(host);
      }
      link.start();
    },
    [handleEvent, pushLog],
  );

  const createRoom = useCallback(
    async (displayName: string) => {
      setBusy(true);
      setError(null);
      try {
        const credentials = await signaling.createRoom(displayName);
        setPrefs((current) => ({ ...current, name: displayName.trim() }));
        await attachLink(credentials);
        return true;
      } catch (failure) {
        setError((failure as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [attachLink],
  );

  const joinRoom = useCallback(
    async (code: string, displayName: string) => {
      setBusy(true);
      setError(null);
      try {
        const credentials = await signaling.joinRoom(normalizeRoomCode(code), displayName);
        setPrefs((current) => ({ ...current, name: displayName.trim() }));
        await attachLink(credentials);
        return true;
      } catch (failure) {
        setError((failure as Error).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [attachLink],
  );

  const leaveRoom = useCallback(async () => {
    const active = sessionRef.current;
    const linked = linkRef.current;
    linkRef.current = null;
    if (linked) await linked.stop(true);

    if (active) {
      const record: StoredSession = {
        roomCode: active.roomCode,
        role: active.role,
        selfName: active.displayName,
        peerName: peer?.displayName ?? 'Peer',
        peerId: peer?.peerId ?? '',
        startedAt: startedAtRef.current || Date.now(),
        endedAt: Date.now(),
        messages: messages.slice(-200).map(stripVoiceTransport),
      };
      setHistory(sessionStore.upsert(record));
    }

    setSession(null);
    setPeer(null);
    setPeers([]);
    setMessages([]);
    setLinkState('idle');
    setStatusDetail('');
    setLogs([]);
  }, [messages, peer]);

  const sendMessage = useCallback((text: string) => {
    const link = linkRef.current;
    const active = sessionRef.current;
    if (!link || !active) return false;
    const message = link.send(text, active.displayName);
    if (!message) {
      setError('The direct link is not ready, so the message was not sent.');
      return false;
    }
    setError(null);
    setMessages((current) => [...current, message]);
    return true;
  }, []);

  const sendVoice = useCallback(
    async (audio: Blob, mimeType: string, durationMs: number) => {
      const link = linkRef.current;
      const active = sessionRef.current;
      if (!link || !active) return false;
      const message = await link.sendVoice(audio, mimeType, durationMs, active.displayName);
      if (!message) {
        setError('The direct link is not ready, so the voice note was not sent.');
        return false;
      }
      setError(null);
      setMessages((current) => [...current, message]);
      return true;
    },
    [],
  );

  const retryLink = useCallback(() => {
    setError(null);
    linkRef.current?.retry();
  }, []);

  const updatePrefs = useCallback((patch: Partial<Preferences>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      setError('This browser does not support desktop notifications.');
      return;
    }
    if (Notification.permission === 'granted') {
      updatePrefs({ notifications: true });
      return;
    }
    const permission = await Notification.requestPermission();
    updatePrefs({ notifications: permission === 'granted' });
    if (permission !== 'granted') {
      setError('Desktop notifications were not allowed by the browser.');
    }
  }, [updatePrefs]);

  /* Clean up the peer connection when the tab goes away. */
  useEffect(() => {
    const onUnload = () => {
      void linkRef.current?.stop(true);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void linkRef.current?.stop(false);
    };
  }, []);

  const activePeerCount = useMemo(() => peers.length, [peers]);

  return {
    prefs,
    session,
    linkState,
    statusDetail,
    peers,
    peer,
    messages,
    logs,
    busy,
    error,
    history,
    activePeerCount,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendVoice,
    retryLink,
    updatePrefs,
    requestNotifications,
    clearError: () => setError(null),
    deleteHistory: (roomCode: string) => setHistory(sessionStore.remove(roomCode)),
    clearHistory: () => setHistory(sessionStore.clear()),
  };
}

export type MessengerController = ReturnType<typeof useMessenger>;