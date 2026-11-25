import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Trash2 } from 'lucide-react';
import { formatDuration, pickVoiceMimeType } from '@/lib/messenger/voice';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onSend: (audio: Blob, mimeType: string, durationMs: number) => void;
  onCancel: () => void;
}

type RecorderState = 'requesting' | 'recording' | 'denied' | 'unsupported';

/**
 * In-composer voice capture. Mounted only while a recording is active;
 * every mount releases its stream and timer on unmount.
 */
export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>('requesting');
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const mimeTypeRef = useRef('');
  const finishedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const release = () => {
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const start = async () => {
      if (typeof MediaRecorder === 'undefined' || !pickVoiceMimeType()) {
        setState('unsupported');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mimeType = pickVoiceMimeType();
        mimeTypeRef.current = mimeType;
        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.start(250);
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
        setState('recording');
      } catch {
        setState('denied');
      }
    };

    void start();
    return release;
  }, []);

  const finish = (send: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const recorder = recorderRef.current;
    const durationMs = Date.now() - startedAtRef.current;

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (send) {
          const mimeType = mimeTypeRef.current || 'audio/webm';
          onSend(new Blob(chunksRef.current, { type: mimeType }), mimeType, durationMs);
        }
      };
      recorder.stop();
      return;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (send) onSend(new Blob(chunksRef.current, { type: mimeTypeRef.current || 'audio/webm' }), mimeTypeRef.current, durationMs);
    else onCancel();
  };

  if (state === 'denied') {
    return (
      <div className="mx-auto flex max-w-[760px] items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[12.5px] text-destructive">
        <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1">Microphone access was blocked. Allow it in the system or browser settings, then try again.</span>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-lg border border-destructive/50 px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-destructive/15"
        >
          Close
        </button>
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className="mx-auto flex max-w-[760px] items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
        <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1">This browser cannot record audio, so voice messages are unavailable.</span>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-signal/50 hover:text-signal-strong"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[760px] items-center gap-3 rounded-xl border border-signal/40 bg-card px-3 py-2">
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/15" aria-hidden="true">
        <span
          className={cn(
            'absolute inset-0 rounded-full bg-destructive/30',
            state === 'recording' && 'animate-dot',
          )}
        />
        <Mic className="relative h-3.5 w-3.5 text-destructive" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">
          {state === 'requesting' ? 'Waiting for microphone…' : 'Recording'}
        </p>
        <p className="mono text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(elapsedMs)} · press the arrow to send
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          finish(false);
        }}
        disabled={state === 'requesting'}
        aria-label="Discard recording"
        title="Discard"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => finish(true)}
        disabled={state === 'requesting' || elapsedMs < 600}
        aria-label="Send voice message"
        title={elapsedMs < 600 ? 'Hold on a moment longer' : 'Send'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-signal text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
      >
        <Send aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
