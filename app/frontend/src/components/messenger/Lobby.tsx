import { useState, type FormEvent } from 'react';
import { ArrowRight, Cable, Copy, KeyRound, Radio, ShieldCheck, TriangleAlert } from 'lucide-react';
import { BrandLockup } from './BrandMark';
import { cn } from '@/lib/utils';
import { formatRoomCode, isValidRoomCode, normalizeRoomCode } from '@/lib/messenger/signaling';

interface LobbyProps {
  defaultName: string;
  busy: boolean;
  error: string | null;
  onCreate: (name: string) => Promise<boolean>;
  onJoin: (code: string, name: string) => Promise<boolean>;
  onOpenSettings: () => void;
  onDismissError: () => void;
  history: Array<{ roomCode: string; selfName: string; startedAt: number }>;
}

type Mode = 'host' | 'join';

export function Lobby({
  defaultName,
  busy,
  error,
  onCreate,
  onJoin,
  onOpenSettings,
  onDismissError,
  history,
}: LobbyProps) {
  const [mode, setMode] = useState<Mode>('host');
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmedName = name.trim();
  const nameError = touched && trimmedName.length === 0 ? 'Enter a display name.' : '';
  const codeError =
    mode === 'join' && code.length > 0 && !isValidRoomCode(code)
      ? 'Room codes use 8 letters and digits.'
      : '';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!trimmedName) return;
    if (mode === 'host') {
      await onCreate(trimmedName);
      return;
    }
    if (!isValidRoomCode(code)) return;
    await onJoin(normalizeRoomCode(code), trimmedName);
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="lobby-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="stage-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <BrandLockup />
        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:border-signal/50 hover:text-signal-strong"
        >
          Preferences
        </button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-10 pt-4 sm:px-8">
        <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          <section className="reveal">
            <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <Cable aria-hidden="true" className="h-3 w-3 text-signal" />
              Peer to peer · WebRTC DataChannel
            </p>

            <h1 className="mt-5 text-[38px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[46px] lg:text-[54px]">
              Messages that never
              <br className="hidden sm:block" /> touch the server.
            </h1>

            <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
              Error Messenger uses a small signaling service to introduce two browsers, then
              hands the conversation to a direct encrypted channel. Create a room, share the code,
              and talk without a central relay in the middle.
            </p>

            <dl className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Radio,
                  title: 'Signaling only',
                  body: 'SDP and ICE metadata pass through the server. Message bodies do not.',
                },
                {
                  icon: KeyRound,
                  title: 'Paired identities',
                  body: 'Each session gets a private peer token so only room members can exchange metadata.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Honest status',
                  body: 'Connected appears only after the DataChannel actually opens.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-border/70 bg-card/55 p-3.5"
                >
                  <item.icon aria-hidden="true" className="h-4 w-4 text-signal" />
                  <dt className="mt-2 text-[12.5px] font-medium">{item.title}</dt>
                  <dd className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>

            {history.length > 0 && (
              <div className="mt-6">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Earlier rooms on this device
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {history.slice(0, 4).map((room) => (
                    <li key={room.roomCode}>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('join');
                          setCode(formatRoomCode(room.roomCode));
                        }}
                        className="mono rounded-lg border border-border/70 bg-card/50 px-2.5 py-1.5 text-[11.5px] transition-colors hover:border-signal/50 hover:text-signal-strong"
                      >
                        {formatRoomCode(room.roomCode)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="reveal-late panel p-5 sm:p-6">
            <div className="flex rounded-xl border border-border/70 bg-secondary/40 p-1" role="tablist" aria-label="Room entry mode">
              {(
                [
                  { id: 'host' as Mode, label: 'Host a room', icon: Radio },
                  { id: 'join' as Mode, label: 'Join a room', icon: KeyRound },
                ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  onClick={() => {
                    setMode(tab.id);
                    onDismissError();
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors',
                    mode === tab.id
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon aria-hidden="true" className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
              <div>
                <label htmlFor="display-name" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Display name
                </label>
                <input
                  id="display-name"
                  value={name}
                  maxLength={32}
                  autoComplete="nickname"
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="How peers will see you"
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? 'name-error' : undefined}
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-signal/60"
                />
                {nameError && (
                  <p id="name-error" className="mt-1.5 text-[11.5px] text-destructive">
                    {nameError}
                  </p>
                )}
              </div>

              {mode === 'host' ? (
                <div className="rounded-xl border border-border/70 bg-surface/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    What happens next
                  </p>
                  <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    <li>1. A private 8-character room code is reserved for you.</li>
                    <li>2. The other person joins with that code.</li>
                    <li>3. The app negotiates a direct link and unlocks messaging.</li>
                  </ol>
                </div>
              ) : (
                <div>
                  <label htmlFor="room-code" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Room code
                  </label>
                  <input
                    id="room-code"
                    value={code}
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={9}
                    onChange={(event) => setCode(formatRoomCode(event.target.value))}
                    placeholder="K7M2-QX4B"
                    aria-invalid={Boolean(codeError)}
                    aria-describedby={codeError ? 'code-error' : 'code-hint'}
                    className="mono mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[16px] tracking-[0.18em] outline-none transition-colors placeholder:tracking-[0.18em] placeholder:text-muted-foreground/50 focus:border-signal/60"
                  />
                  {codeError ? (
                    <p id="code-error" className="mt-1.5 text-[11.5px] text-destructive">
                      {codeError}
                    </p>
                  ) : (
                    <p id="code-hint" className="mt-1.5 text-[11.5px] text-muted-foreground">
                      Ask the host for the 8 characters in their sidebar.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[12px] leading-relaxed text-destructive"
                >
                  <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="shrink-0 rounded px-1 text-[11px] underline underline-offset-2"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-signal px-4 py-3 text-[13.5px] font-semibold text-primary-foreground shadow-md transition-transform hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? 'Connecting…' : mode === 'host' ? 'Create room' : 'Join room'}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>

              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
                <Copy aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                Conversations are stored only in this browser. Clearing site data removes them.
              </p>
            </form>
          </section>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-6 text-[11px] text-muted-foreground/70 sm:px-8">
        Direct links require both peers online. Behind strict NATs a TURN relay may be required.
      </footer>
    </div>
  );
}