import { useState } from 'react';
import {
  Check,
  Copy,
  LogOut,
  Power,
  Radio,
  Settings2,
  Users,
  UserRound,
} from 'lucide-react';
import { BrandLockup } from './BrandMark';
import { ConnectionDot, StatusBadge } from './StatusBadge';
import { formatRoomCode } from '@/lib/messenger/signaling';
import { formatRelative, initials } from '@/lib/messenger/format';
import type { LinkState, RoomPeer, SessionCredentials, StoredSession } from '@/lib/messenger/types';
import { cn } from '@/lib/utils';

interface SessionRailProps {
  session: SessionCredentials;
  peers: RoomPeer[];
  peer: RoomPeer | null;
  linkState: LinkState;
  statusDetail: string;
  history: StoredSession[];
  onLeave: () => void;
  onOpenSettings: () => void;
  onDeleteHistory: (roomCode: string) => void;
}

export function SessionRail({
  session,
  peers,
  peer,
  linkState,
  statusDetail,
  history,
  onLeave,
  onOpenSettings,
  onDeleteHistory,
}: SessionRailProps) {
  const [copied, setCopied] = useState(false);
  const code = formatRoomCode(session.roomCode);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const others = peers.filter((item) => item.peerId !== session.peerId);
  const pastRooms = history.filter((item) => item.roomCode !== session.roomCode).slice(0, 4);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <BrandLockup compact />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="grid h-9 w-9 place-items-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-signal/50 hover:text-signal-strong"
        >
          <Settings2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-xl border border-border/70 bg-surface/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Radio aria-hidden="true" className="h-3 w-3" />
            {session.role === 'host' ? 'Hosting' : 'Joined'}
          </span>
          <StatusBadge state={linkState} detail={statusDetail} />
        </div>

        <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Room code
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="mono flex-1 truncate text-[17px] font-medium tracking-[0.08em]" aria-live="polite">
            {code}
          </p>
          <button
            type="button"
            onClick={copyCode}
            aria-label={copied ? 'Room code copied' : 'Copy room code'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-signal/50 hover:text-signal-strong"
          >
            {copied ? (
              <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {session.role === 'host'
            ? 'Send this code to the person you want to talk to.'
            : 'You joined this room. The host opens the direct link.'}
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-surface/60 p-3">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <UserRound aria-hidden="true" className="h-3 w-3" />
          Your identity
        </p>
        <div className="mt-2 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-signal/16 text-[11px] font-semibold text-signal-strong"
          >
            {initials(session.displayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{session.displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {session.role === 'host' ? 'Room host' : 'Room guest'}
            </p>
          </div>
        </div>
        <p className="mono mt-2 truncate text-[10px] text-muted-foreground/80">
          peer {session.peerId}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Users aria-hidden="true" className="h-3 w-3" />
            Direct link
          </p>
          <span className="mono text-[11px] text-muted-foreground tabular-nums">
            {others.length + 1} peer{others.length === 0 ? '' : 's'}
          </span>
        </div>

        <ul className="scrollbar-slim mt-2 flex flex-col gap-1.5 overflow-y-auto pr-1">
          {others.length === 0 && (
            <li className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-[12px] leading-relaxed text-muted-foreground">
              {session.role === 'host'
                ? 'No one has joined yet. The link negotiates automatically the moment someone enters this code.'
                : 'You are alone in this room right now.'}
            </li>
          )}
          {others.map((item) => {
            const isActive = peer?.peerId === item.peerId;
            const online = Date.now() - item.lastSeenMs < 45_000;
            return (
              <li
                key={item.peerId}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-2.5 py-2',
                  isActive
                    ? 'border-signal/40 bg-signal/10'
                    : 'border-transparent bg-surface/50',
                )}
              >
                <ConnectionDot online={online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{item.displayName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.role === 'host' ? 'Host' : 'Guest'}
                  </p>
                </div>
                {isActive && linkState === 'connected' && (
                  <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-success">
                    Live
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {pastRooms.length > 0 && (
        <div className="min-h-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Recent rooms
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {pastRooms.map((room) => (
              <li
                key={room.roomCode}
                className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12px] transition-colors hover:bg-secondary/60"
              >
                <span className="mono flex-1 truncate">{formatRoomCode(room.roomCode)}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelative(room.startedAt)}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteHistory(room.roomCode)}
                  aria-label={`Remove saved transcript for room ${formatRoomCode(room.roomCode)}`}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onLeave}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
        Leave room
      </button>

      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
        <span className="flex items-center gap-1.5">
          <Power aria-hidden="true" className="h-3 w-3" />
          v1.0.0
        </span>
        <span>P2P</span>
      </div>
    </aside>
  );
}