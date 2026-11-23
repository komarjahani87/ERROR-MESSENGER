import { useState } from 'react';
import { Bell, Eraser, Gauge, Info, ShieldAlert, Volume2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/messenger/format';
import type { DiagnosticEntry, Preferences, StoredSession } from '@/lib/messenger/types';

type Tab = 'preferences' | 'diagnostics' | 'privacy';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: Preferences;
  onUpdate: (patch: Partial<Preferences>) => void;
  logs: DiagnosticEntry[];
  history: StoredSession[];
  onDeleteHistory: (roomCode: string) => void;
  onClearHistory: () => void;
  onRequestNotifications: () => void;
  turnNote: string;
}

const TABS: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: 'preferences', label: 'Preferences', icon: Gauge },
  { id: 'diagnostics', label: 'Diagnostics', icon: Info },
  { id: 'privacy', label: 'Privacy', icon: ShieldAlert },
];

export function SettingsPanel({
  open,
  onOpenChange,
  prefs,
  onUpdate,
  logs,
  history,
  onDeleteHistory,
  onClearHistory,
  onRequestNotifications,
  turnNote,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>('preferences');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(94vw,560px)] overflow-hidden border-border/80 bg-popover p-0 shadow-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4 text-left">
          <DialogTitle className="text-[16px] font-semibold tracking-tight">Settings</DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground">
            Preferences stay on this device. Connection details are shown exactly as the browser reports them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border/70 px-3 py-2" role="tablist" aria-label="Settings sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                tab === item.id
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <item.icon aria-hidden="true" className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="scrollbar-slim max-h-[58vh] space-y-4 overflow-y-auto px-5 py-4">
          {tab === 'preferences' && (
            <>
              <div>
                <Label htmlFor="pref-name" className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Display name
                </Label>
                <input
                  id="pref-name"
                  value={prefs.name}
                  maxLength={32}
                  onChange={(event) => onUpdate({ name: event.target.value })}
                  placeholder="Used on new rooms"
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[13.5px] outline-none transition-colors focus:border-signal/60"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Applies the next time you host or join a room.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-surface/60 px-3 py-3">
                <div>
                  <p className="text-[13px] font-medium">Appearance</p>
                  <p className="text-[11px] text-muted-foreground">
                    {prefs.theme === 'dark' ? 'Midnight (default)' : 'Daylight'}
                  </p>
                </div>
                <div className="flex rounded-lg border border-border p-0.5">
                  {(['dark', 'light'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onUpdate({ theme: value })}
                      aria-pressed={prefs.theme === value}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors',
                        prefs.theme === value
                          ? 'bg-card text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <ToggleRow
                  id="pref-motion"
                  icon={Gauge}
                  title="Reduce motion"
                  body="Disables message and panel animation."
                  checked={prefs.reducedMotion}
                  onChange={(value) => onUpdate({ reducedMotion: value })}
                />
                <ToggleRow
                  id="pref-sound"
                  icon={Volume2}
                  title="Message chime"
                  body="Plays a short tone for incoming messages."
                  checked={prefs.sound}
                  onChange={(value) => onUpdate({ sound: value })}
                />
                <ToggleRow
                  id="pref-notify"
                  icon={Bell}
                  title="Desktop notifications"
                  body="Uses the browser notification API when the tab is in the background."
                  checked={prefs.notifications}
                  onChange={(value) => {
                    if (value) onRequestNotifications();
                    else onUpdate({ notifications: false });
                  }}
                />
              </div>
            </>
          )}

          {tab === 'diagnostics' && (
            <>
              <div className="rounded-xl border border-border/70 bg-surface/60 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Connection capability
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed">{turnNote}</p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Session log
                </p>
                {logs.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-border/70 px-3 py-4 text-[12px] text-muted-foreground">
                    No activity yet. Join a room to collect connection events.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {logs.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex gap-2 rounded-lg border border-border/60 bg-surface/50 px-2.5 py-2"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            entry.level === 'error'
                              ? 'bg-destructive'
                              : entry.level === 'warn'
                                ? 'bg-warning'
                                : 'bg-signal',
                          )}
                        />
                        <div className="min-w-0">
                          <p className="break-words text-[12px] leading-relaxed">{entry.message}</p>
                          <p className="mono text-[10px] text-muted-foreground">
                            {new Date(entry.at).toLocaleTimeString()}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {tab === 'privacy' && (
            <>
              <div className="space-y-3 text-[12.5px] leading-relaxed text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">What the server sees.</span> The
                  signaling service stores room codes, display names, peer identifiers, and the
                  WebRTC handshake blobs (SDP and ICE). Message text is never sent to it.
                </p>
                <p>
                  <span className="font-medium text-foreground">What the peer sees.</span> A direct
                  WebRTC connection exposes IP addresses to each participant. That is inherent to
                  peer-to-peer transport and is not hidden by this app.
                </p>
                <p>
                  <span className="font-medium text-foreground">Encryption.</span> WebRTC mandates
                  DTLS, so the data channel is encrypted in transit between the two browsers. This
                  app does not add a separate end-to-end messaging layer beyond that.
                </p>
                <p>
                  <span className="font-medium text-foreground">Local storage.</span> Transcripts,
                  your name, and preferences stay in this browser's local storage until you remove
                  them.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-surface/60 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12.5px] font-medium">Saved transcripts</p>
                  <span className="mono text-[11px] text-muted-foreground">{history.length}</span>
                </div>
                {history.length === 0 ? (
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Nothing saved on this device yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {history.map((room) => (
                      <li
                        key={room.roomCode}
                        className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12px]"
                      >
                        <span className="mono flex-1 truncate">{room.roomCode}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {room.messages.length} msg · {formatRelative(room.startedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteHistory(room.roomCode)}
                          aria-label={`Delete transcript for room ${room.roomCode}`}
                          className="rounded px-1.5 py-0.5 text-muted-foreground hover:text-destructive"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                  >
                    <Eraser aria-hidden="true" className="h-3.5 w-3.5" />
                    Clear all transcripts
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  id,
  icon: Icon,
  title,
  body,
  checked,
  onChange,
}: {
  id: string;
  icon: typeof Gauge;
  title: string;
  body: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-surface/60 px-3 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium">
          <Icon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </Label>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}