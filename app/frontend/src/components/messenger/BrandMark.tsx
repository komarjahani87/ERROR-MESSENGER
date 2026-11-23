interface BrandMarkProps {
  className?: string;
}

/** Geometric link mark: two offset brackets interrupted by a signal gap. */
export function BrandMark({ className = 'h-9 w-9' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="Error Messenger mark"
      className={className}
      fill="none"
    >
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11" className="fill-signal/12 stroke-signal/45" strokeWidth="1.5" />
      <path d="M14.5 9.5h-4a2 2 0 0 0-2 2v17a2 2 0 0 0 2 2h4" className="stroke-signal" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M25.5 9.5h4a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2h-4" className="stroke-signal" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16.5 15.5h7M16.5 20h4M16.5 24.5h7" className="stroke-foreground/70" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      <div className="leading-tight">
        <p className={compact ? 'text-sm font-semibold tracking-tight' : 'text-base font-semibold tracking-tight'}>
          Error Messenger
        </p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Direct transport
        </p>
      </div>
    </div>
  );
}