import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatClock, initials } from '@/lib/messenger/format';
import type { ChatMessage } from '@/lib/messenger/types';

const STATUS_COPY = {
  sending: { icon: Clock, label: 'Sending' },
  sent: { icon: Check, label: 'Sent over the direct link' },
  delivered: { icon: CheckCheck, label: 'Delivered and acknowledged by the peer' },
  failed: { icon: AlertCircle, label: 'Not delivered' },
} as const;

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