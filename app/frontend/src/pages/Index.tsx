import { useState } from 'react';
import { Lobby } from '@/components/messenger/Lobby';
import { SessionRail } from '@/components/messenger/SessionRail';
import { ChatStage } from '@/components/messenger/ChatStage';
import { SettingsPanel } from '@/components/messenger/SettingsPanel';
import { CreditFooter } from '@/components/messenger/CreditFooter';
import { useMessenger } from '@/hooks/useMessenger';

const TURN_NOTE =
  'STUN is always configured for direct links. When the deployment supplies TURN_URLS and credentials, a relay is offered for symmetric NATs.';

export default function Index() {
  const messenger = useMessenger();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dismissError = messenger.clearError;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#conversation-stage"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-signal focus:px-3 focus:py-2 focus:text-[12px] focus:font-medium focus:text-primary-foreground"
      >
        Skip to conversation
      </a>

      {messenger.session ? (
        <main className="flex min-h-0 w-full flex-1 gap-0 overflow-hidden p-0 sm:gap-3 sm:p-3 lg:gap-4 lg:p-4">
          <div className="hidden w-[308px] shrink-0 lg:block">
            <SessionRail
              session={messenger.session}
              peers={messenger.peers}
              peer={messenger.peer}
              linkState={messenger.linkState}
              statusDetail={messenger.statusDetail}
              history={messenger.history}
              onLeave={() => void messenger.leaveRoom()}
              onOpenSettings={() => setSettingsOpen(true)}
              onDeleteHistory={messenger.deleteHistory}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-2 sm:p-0">
            <div className="lg:hidden">
              <details className="group rounded-xl border border-border/70 bg-card/70">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[12.5px] font-medium">
                  <span>
                    Room {messenger.session.roomCode} · {messenger.session.role}
                  </span>
                  <span className="text-[11px] text-muted-foreground group-open:hidden">
                    Show details
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground group-open:inline">
                    Hide
                  </span>
                </summary>
                <div className="border-t border-border/70 p-2">
                  <SessionRail
                    session={messenger.session}
                    peers={messenger.peers}
                    peer={messenger.peer}
                    linkState={messenger.linkState}
                    statusDetail={messenger.statusDetail}
                    history={messenger.history}
                    onLeave={() => void messenger.leaveRoom()}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onDeleteHistory={messenger.deleteHistory}
                  />
                </div>
              </details>
            </div>

            <div id="conversation-stage" className="flex min-h-0 flex-1">
              <ChatStage
                messages={messenger.messages}
                peer={messenger.peer}
                peers={messenger.peers}
                selfName={messenger.session.displayName}
                linkState={messenger.linkState}
                statusDetail={messenger.statusDetail}
                onSend={messenger.sendMessage}
                onSendVoice={messenger.sendVoice}
                onRetry={messenger.retryLink}
                onOpenSettings={() => setSettingsOpen(true)}
                onLeave={() => void messenger.leaveRoom()}
                isHost={messenger.session.role === 'host'}
              />
            </div>
          </div>
        </main>
      ) : (
        <div id="conversation-stage" className="flex min-h-0 flex-1 flex-col">
          <Lobby
            defaultName={messenger.prefs.name}
            busy={messenger.busy}
            error={messenger.error}
            onCreate={messenger.createRoom}
            onJoin={messenger.joinRoom}
            onOpenSettings={() => setSettingsOpen(true)}
            onDismissError={dismissError}
            history={messenger.history}
          />
        </div>
      )}

      <CreditFooter />

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        prefs={messenger.prefs}
        onUpdate={messenger.updatePrefs}
        logs={messenger.logs}
        history={messenger.history}
        onDeleteHistory={messenger.deleteHistory}
        onClearHistory={messenger.clearHistory}
        onRequestNotifications={() => void messenger.requestNotifications()}
        turnNote={TURN_NOTE}
      />
    </div>
  );
}