import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Lock, Mic, ShieldCheck, TriangleAlert, WifiOff } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { VoiceRecorder } from './VoiceRecorder';
import { ConnectionDot, StatusBadge } from './StatusBadge';
import { formatDay, initials } from '@/lib/messenger/format';
import { MAX_TEXT_LENGTH } from '@/lib/messenger/link';
import type { ChatMessage, LinkState, RoomPeer } from '@/lib/messenger/types';
import { cn } from '@/lib/utils';

interface ChatStageProps {
  messages: ChatMessage[];
  peer: RoomPeer | null;
  peers: RoomPeer[];
  selfName: string;
  linkState: LinkState;
  statusDetail: string;
  onSend: (text: string) => boolean;
  onSendVoice: (audio: Blob, mimeType: string, durationMs: number) => Promise<boolean> | boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
  onLeave: () => void;
  isHost: boolean;
}

export function ChatStage({
  messages,
  peer,
  peers,
  selfName,
  linkState,
  statusDetail,
  onSend,
  onSendVoice,
  onRetry,
  onOpenSettings,
  onLeave,
  isHost,
}: ChatStageProps) {
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const connected = linkState === 'connected';
  const peerOnline = peer ? peers.some((item) => item.peerId === peer.peerId) : false;
  const peerName = peer?.displayName ?? 'Waiting for peer';

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`;
  }, [draft]);

  const grouped = useMemo(() => {
    const groups: Array<{ day: string; items: ChatMessage[] }> = [];
    for (const message of messages) {
      const day = formatDay(message.at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(message);
      else groups.push({ day, items: [message] });
    }
    return groups;
  }, [messages]);

  const submit = () => {
    if (!draft.trim() || !connected) return;
    if (onSend(draft)) setDraft('');
  };

  const composerHint = connected
    ? 'Press Enter to send · Shift + Enter for a new line'
    : linkState === 'connecting'
      ? 'Messages unlock as soon as the direct link opens.'
      : isHost
        ? 'Share your room code so someone can join and open the link.'
        : 'Waiting for the host to open the direct link.';

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface"
      aria-label="Conversation"
    >
      <header className="relative z-10 flex items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-[13px] font-semibold text-secondary-foreground"
        >
          {initials(peerName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">{peerName}</h2>
            {peer && <ConnectionDot online={peerOnline} />}
          </div>
          <p className="truncate text-[12px] text-muted-foreground">
            {peerOnline ? 'In the room · ' : peer ? 'Not responding · ' : ''}
            {connected ? 'Direct DataChannel' : 'No direct link yet'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge state={linkState} detail={statusDetail} />
          {linkState === 'failed' && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-signal/50 hover:text-signal-strong"
            >
              Retry
            </button>
          )}
          {linkState === 'closed' ? (
            <button
              type="button"
              onClick={onLeave}
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/15"
            >
              Leave room
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-signal/50 hover:text-signal-strong"
            >
              Settings
            </button>
          )}
        </div>
      </header>

      <div className="stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      <div
        ref={scrollRef}
        className="scrollbar-slim relative z-10 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
      >
        {messages.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md text-center animate-slide-in">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-border/70 bg-card">
              <Lock aria-hidden="true" className="h-6 w-6 text-signal" />
            </div>
            <h3 className="mt-4 text-[17px] font-semibold tracking-tight">Empty conversation</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {connected
                ? `The link to ${peerName} is open. Your first message travels straight to their browser and never through the signaling server.`
                : isHost
                  ? 'You are hosting. Share the room code on the left. When someone joins, the app negotiates a direct link on its own.'
                  : 'The host has the room open. The direct link appears here as soon as they send the first offer.'}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-2 text-left">
              <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Identity
                </dt>
                <dd className="mt-1 truncate text-[12px] font-medium">{selfName}</dd>
              </div>
              <div className="rounded-xl border border-border/70 bg-card/60 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Transport
                </dt>
                <dd className="mt-1 text-[12px] font-medium">
                  {connected ? 'WebRTC DataChannel' : 'Signaling only'}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-4">
            {grouped.map((group) => (
              <div key={`${group.day}-${group.items[0].id}`} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {group.day}
                  </span>
                  <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
                </div>
                <ol className="flex flex-col gap-3">
                  {group.items.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 border-t border-border/70 bg-surface px-4 py-3 sm:px-6">
        {!connected && (
          <p
            className={cn(
              'mb-2.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]',
              linkState === 'failed'
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border/70 bg-secondary/50 text-muted-foreground',
            )}
          >
            {linkState === 'failed' ? (
              <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <WifiOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            )}
            {statusDetail || composerHint}
          </p>
        )}

        {!recording ? (
        <div className="mx-auto flex max-w-[760px] items-end gap-2 rounded-xl border border-border/80 bg-card px-2.5 py-2 transition-colors focus-within:border-signal/60">
          <label htmlFor="message-input" className="sr-only">
            Message {peerName}
          </label>
          <textarea
            id="message-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_TEXT_LENGTH}
            disabled={!connected}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={connected ? `Message ${peerName}…` : 'Direct link not open yet'}
            className="scrollbar-slim max-h-[168px] min-h-[38px] flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
            aria-describedby="composer-hint"
          />
          <button
            type="button"
            onClick={() => setRecording(true)}
            disabled={!connected}
            aria-label="Record a voice message"
            title="Record a voice message"
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-signal/60 hover:text-signal-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!connected || !draft.trim()}
            aria-label="Send message"
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-signal text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
          >
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        ) : (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onSend={(audio, mimeType, durationMs) => {
              setRecording(false);
              void onSendVoice(audio, mimeType, durationMs);
            }}
          />
        )}

        <div className="mx-auto mt-2 flex max-w-[760px] items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <p id="composer-hint" className="truncate">
            {composerHint}
          </p>
          <p className="mono shrink-0 tabular-nums">
            {draft.length}/{MAX_TEXT_LENGTH}
          </p>
        </div>

        <p className="mx-auto mt-1.5 flex max-w-[760px] items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <ShieldCheck aria-hidden="true" className="h-3 w-3 shrink-0" />
          Encrypted in transit by DTLS. Peer IP addresses become visible to each other.
        </p>
      </div>
    </section>
  );
}