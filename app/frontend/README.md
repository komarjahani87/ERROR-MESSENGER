# Error Messenger

A peer-to-peer desktop messenger. Two browsers are introduced by a small signaling
service, then the conversation moves to a direct encrypted WebRTC DataChannel —
message text never passes through the server.

Built with React + Vite + TypeScript + Tailwind/shadcn on the front end and
FastAPI + PostgreSQL on the back end (Atoms Cloud / FuncSea).

## What it does

- **Host a room** and receive an 8-character room code.
- **Join** an existing room with that code and a display name.
- The host automatically offers a direct WebRTC link; the guest answers. A room
  holds one host and one guest, because the client maintains a single direct
  DataChannel per session.
- Messages, timestamps, sender identity, and delivery acknowledgements travel
  peer to peer. Delivery marks reflect a real acknowledgement from the peer.
- Connection status is literal: `Connected` only appears after the DataChannel
  reports `open`. `Connecting`, `Failed`, and `Offline` are distinct states.
- Session log, saved transcripts, name, theme, sound, motion, and notification
  preferences are stored locally in the browser.
- Light and dark themes, reduced-motion support, keyboard-accessible controls,
  skip link, visible focus rings, `aria-live` status regions.

## Architecture

```
Browser A ──HTTP(S) signaling──► FastAPI (rooms, peers, SDP/ICE relay)
Browser A ◄──── WebRTC DataChannel (encrypted, direct) ────► Browser B
```

**Signaling API** (`/api/v1/signaling`)

| Route | Purpose |
|---|---|
| `POST /create_room` | Reserve a room code, register the host, return a peer token |
| `POST /join_room` | Register a guest in an existing room |
| `POST /sync` | Presence heartbeat + fetch pending signals for this peer |
| `POST /send_signal` | Relay one `offer` / `answer` / `candidate` blob to a peer |
| `POST /leave_room` | Remove the peer and close the room when empty |
| `GET /ice_servers` | STUN/TURN configuration for `RTCPeerConnection` |

Peer tokens are random and stored hashed (SHA-256); every state-changing call
requires a matching room + peer + token. Signals are scoped to one target peer,
capped at 64 KB, and expire after three minutes. Peers that stop heartbeating are
pruned after 45 seconds.

**Tables**: `signal_rooms`, `signal_peers`, `signal_signals` (infrastructure only —
no message content is persisted server-side).

## Run locally

Prerequisites: Node 18+, pnpm, Python 3.11+.

```bash
# Front end
cd app/frontend
pnpm install
pnpm run dev

# Back end + front end together
cd app
./start_app_v2.sh --local
```

The bundled start script loads the database and object-storage configuration
from the platform runtime. For a standalone deployment, provide the same
environment variables the template already expects (database URL, OIDC issuer
and client credentials, JWT secret) and run:

```bash
cd app/backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Build the front end with `pnpm run build`; the production bundle is emitted to
`app/frontend/dist`.

## Configuration

| Variable | Purpose |
|---|---|
| `TURN_URLS` | Comma-separated TURN URLs, e.g. `turn:turn.example.com:3478` |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | TURN credentials handed to the browser |

Without TURN, only STUN is offered. Two peers behind symmetric NATs or strict
corporate firewalls may then fail to connect — that is a network limitation, not
an app bug.

## Security and privacy (actual properties)

- WebRTC mandates DTLS, so the DataChannel is encrypted in transit between the
  two browsers. This project adds no extra end-to-end layer on top of that, and
  it does not claim one.
- The signaling service sees room codes, display names, peer IDs, timestamps,
  and SDP/ICE payloads. It does not see message text.
- A direct peer connection exposes each participant's IP address to the other.
  This is inherent to peer-to-peer transport.
- Rooms are joinable by anyone holding the code; codes are random 8-character
  values from a 32-symbol alphabet. There is no password layer or account system.
- Transcripts and preferences live in browser local storage and are not synced
  anywhere.

## Known limitations

- No authentication or account system by design: possession of the room code
  grants entry.
- One active direct link per session (host ↔ one guest); additional peers in the
  room are listed but do not open their own channels yet.
- No file or image attachments, no message editing, no server-side history.
- Reconnection is manual (`Retry`) after a transport failure.
- iOS/macOS Safari requires HTTPS for WebRTC on non-localhost origins.

## Testing notes

Validated with `pnpm exec tsc --noEmit`, `pnpm run lint`, `pnpm run build`, and
`mgx-pycheck` on the backend modules. The direct link path was exercised between
two browser contexts; NAT-restricted networks were not available in this
environment, so TURN behavior is documented rather than verified end to end.

## License

No license has been applied yet. MIT is the recommended choice for a public
open-source release of this kind; adding it requires the owner's decision.

## Project layout

```
app/
├── backend/
│   ├── routers/signaling.py     # HTTP signaling endpoints
│   ├── services/signaling.py    # room/peer/signal lifecycle
│   └── models/signal_*.py       # generated ORM models
└── frontend/
    ├── src/components/messenger/  # Lobby, SessionRail, ChatStage, MessageBubble, Settings
    ├── src/hooks/useMessenger.ts  # session + preference state
    └── src/lib/messenger/link.ts  # WebRTC PeerLink (offer/answer/ICE/acks)
```