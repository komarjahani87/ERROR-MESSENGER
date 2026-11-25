import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Pause, Play, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatClock, initials } from '@/lib/messenger/format';
import { formatDuration } from '@/lib/messenger/voice';
import type { ChatMessage, VoicePayload } from '@/lib/messenger/types';

const STATUS_COPY = {
  sending: { icon: Clock, label: 'Sending' },
  sent: { icon: Check, label: 'Sent over the direct link' },
  delivered: { icon: CheckCheck, label: 'Delivered and acknowledged by the peer' },
  failed: { icon: AlertCircle, label: 'Not delivered' },
} as const;

function VoicePlayer({ voice, own }: { voice: VoicePayload; own: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPositionMs(audio.currentTime * 1000);
    const onEnd = () => {
      setPlaying(false);
      setPositionMs(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  if (!voice.audioUrl) {
    return (
      <div
        className={cn(
          'mt-1.5 flex items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5 text-[13px] text-muted-foreground',
          own ? 'rounded-tr-[4px] border-signal/20 bg-signal/8' : 'rounded-tl-[4px] border-border/70 bg-card',
        )}
      >
        <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>Voice message · audio is not kept after the app restarts</span>
        <span className="mono ml-auto shrink-0 tabular-nums">{formatDuration(voice.durationMs)}</span>
      </div>
    );
  }

  const durationMs = voice.durationMs;
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  return (
    <div
      className={cn(
        'mt-1.5 flex w-[min(78vw,300px)] items-center gap-3 rounded-[14px] border px-3 py-2.5',
        own ? 'rounded-tr-[4px] border-signal/30 bg-signal/14' : 'rounded-tl-[4px] border-border/70 bg-card',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-signal text-primary-foreground transition-opacity hover:opacity-90"
      >
        {playing ? (
          <Pause aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Play aria-hidden="true" className="ml-0.5 h-4 w-4" />
        )}
      </button>
      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
          <div
            className="h-full rounded-full bg-signal transition-[width] duration-150 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mono mt-1 flex items-center justify-between text-[10.5px] tabular-nums text-muted-foreground">
          <span>{formatDuration(positionMs)}</span>
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>
      {voice.audioUrl && (
        <audio ref={audioRef} src={voice.audioUrl} preload="metadata" className="hidden" />
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const own = message.direction === 'self';
  const status = STATUS_COPY[message.status];
  const StatusIcon = status.icon;

  return (
    <li
      className={cn('flex w-full gap-3 animate-slide-in', own ? 'flex-row-reverse' : 'flex-row')}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
          own ? 'bg-signal/18 text-signal-strong' : 'bg-secondary text-secondary-foreground',
        )}
      >
        {initials(message.author)}
      </span>

      <div className={cn('max-w-[min(78%,560px)]', own ? 'items-end text-right' : 'items-start')}>
        <div
          className={cn(
            'flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground',
            own && 'justify-end',
          )}
        >
          <span className="font-medium normal-case tracking-normal text-foreground/70">
            {own ? 'You' : message.author}
          </span>
          <span className="mono normal-case tracking-normal">{formatClock(message.at)}</span>
        </div>

        {message.voice ? (
          <VoicePlayer voice={message.voice} own={own} />
        ) : (
          <div
            className={cn(
              'mt-1.5 whitespace-pre-wrap break-words rounded-[14px] border px-3.5 py-2.5 text-[14px] leading-relaxed',
              own
                ? 'rounded-tr-[4px] border-signal/30 bg-signal/14 text-foreground'
                : 'rounded-tl-[4px] border-border/70 bg-card text-card-foreground',
            )}
          >
            {message.text}
          </div>
        )}

        {own && (
          <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <StatusIcon aria-hidden="true" className="h-3 w-3" />
            <span>{status.label}</span>
          </p>
        )}
      </div>
    </li>
  );
}
