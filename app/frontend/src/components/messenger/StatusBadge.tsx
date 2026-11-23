import { cn } from '@/lib/utils';
import type { LinkState } from '@/lib/messenger/types';

const COPY: Record<LinkState, { label: string; tone: string; dot: string; pulse: boolean }> = {
  idle: {
    label: 'Offline',
    tone: 'border-border/80 bg-secondary/60 text-muted-foreground',
    dot: 'bg-muted-foreground/70',
    pulse: false,
  },
  connecting: {
    label: 'Connecting',
    tone: 'border-warning/40 bg-warning/10 text-warning',
    dot: 'bg-warning',
    pulse: true,
  },
  connected: {
    label: 'Connected',
    tone: 'border-success/40 bg-success/10 text-success',
    dot: 'bg-success',
    pulse: false,
  },
  failed: {
    label: 'Failed',
    tone: 'border-destructive/45 bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    pulse: false,
  },
  closed: {
    label: 'Closed',
    tone: 'border-border/80 bg-secondary/60 text-muted-foreground',
    dot: 'bg-muted-foreground/70',
    pulse: false,
  },
};

export function StatusBadge({
  state,
  detail,
  className,
}: {
  state: LinkState;
  detail?: string;
  className?: string;
}) {
  const config = COPY[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em]',
        config.tone,
        className,
      )}
      title={detail || config.label}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', config.dot, config.pulse && 'animate-dot')}
      />
      {config.label}
    </span>
  );
}

export function ConnectionDot({ online }: { online: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'h-2 w-2 shrink-0 rounded-full ring-2 ring-card',
        online ? 'bg-success' : 'bg-muted-foreground/50',
      )}
    />
  );
}