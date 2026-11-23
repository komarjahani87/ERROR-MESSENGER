import type { ChatMessage, LinkState, RoomPeer, SessionCredentials } from './types';
import { signaling, type SyncPayload } from './signaling';

const POLL_MS = 2000;
export const MAX_TEXT_LENGTH = 4000;

export type LinkEvent =
  | { type: 'state'; state: LinkState; detail?: string }
  | { type: 'message'; message: ChatMessage }
  | { type: 'delivered'; id: string }
  | { type: 'peers'; peers: RoomPeer[] }
  | { type: 'peer'; peer: RoomPeer | null }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

interface WireMessage {
  t: 'msg' | 'ack' | 'hello';
  id?: string;
  text?: string;
  at?: number;
  author?: string;
}

interface WireCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

interface WireSdp {
  type: 'offer' | 'answer';
  sdp: string;
}

/**
 * One direct WebRTC link between this browser and a single remote peer.
 *
 * The signaling service only carries SDP and ICE metadata. Once the
 * DataChannel opens, every chat message travels peer to peer.
 */
export class PeerLink {
  private session: SessionCredentials;
  private iceServers: RTCIceServer[];
  private emit: (event: LinkEvent) => void;

  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private busy = false;
  private stopped = false;
  private state: LinkState = 'idle';
  private peers: RoomPeer[] = [];
  private lastPeerListKey = '';
  private lastOfferAt = 0;
  private interruptedSince = 0;

  constructor(
    session: SessionCredentials,
    iceServers: RTCIceServer[],
    emit: (event: LinkEvent) => void,
  ) {
    this.session = session;
    this.iceServers = iceServers;
    this.emit = emit;
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.log('info', `Signaling started for room ${this.session.roomCode}.`);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  async stop(leave = true): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.teardown();
    if (leave) {
      try {
        await signaling.leaveRoom({
          code: this.session.roomCode,
          peer_id: this.session.peerId,
          token: this.session.token,
        });
        this.log('info', 'Left the room.');
      } catch {
        this.log('warn', 'Could not notify the room that you left.');
      }
    }
  }

  get remoteName(): string {
    return this.peers.find((peer) => peer.peerId === this.remotePeerId)?.displayName ?? 'Peer';
  }

  get remotePeer(): RoomPeer | null {
    return this.peers.find((peer) => peer.peerId === this.remotePeerId) ?? null;
  }

  send(text: string, author: string): ChatMessage | null {
    const clean = text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!clean) return null;
    const channel = this.channel;
    if (!channel || channel.readyState !== 'open') {
      this.log('warn', 'Message not sent: the direct link is not open.');
      return null;
    }

    const message: ChatMessage = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      author,
      direction: 'self',
      text: clean,
      at: Date.now(),
      status: 'sent',
    };

    try {
      channel.send(JSON.stringify({ t: 'msg', id: message.id, text: clean, at: message.at, author } satisfies WireMessage));
    } catch (error) {
      this.log('error', `Send failed: ${(error as Error).message}`);
      return null;
    }
    return message;
  }

  retry(): void {
    this.log('info', 'Reconnecting the direct link.');
    this.teardown();
    this.setState('connecting');
    this.lastOfferAt = 0;
    if (this.session.role === 'host') {
      void this.initiate();
      return;
    }
    // Guests cannot create an offer alone; ask the host to renegotiate.
    const host = this.peers.find((peer) => peer.role === 'host');
    if (host) void this.sendSignal(host.peerId, 'renegotiate', { reason: 'guest-retry' });
  }

  private setState(next: LinkState, detail?: string): void {
    if (this.state === next && !detail) return;
    this.state = next;
    this.emit({ type: 'state', state: next, detail });
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    this.emit({ type: 'log', level, message });
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try {
      const data: SyncPayload = await signaling.sync({
        code: this.session.roomCode,
        peer_id: this.session.peerId,
        token: this.session.token,
        since_signal_id: this.cursor,
      });

      this.applyPeers(data.peers);

      for (const signal of data.signals) {
        this.cursor = Math.max(this.cursor, signal.id);
        try {
          await this.handleSignal(signal.from, signal.kind, signal.payload);
        } catch (error) {
          this.log('error', `Signal "${signal.kind}" failed: ${(error as Error).message}`);
        }
      }

      if (this.session.role === 'host' && this.state !== 'connected') {
        await this.initiate();
      }
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      if (status === 401 || status === 403) {
        this.setState('closed', 'This session is no longer valid. Rejoin the room.');
        await this.stop(false);
      } else if (status === 404 || status === 410) {
        this.setState('closed', 'The room was closed.');
        await this.stop(false);
      } else {
        this.log('warn', `Presence refresh failed: ${(error as Error).message}`);
        if (this.state === 'connected') this.setState('failed', 'Lost contact with the signaling service.');
      }
    } finally {
      this.busy = false;
    }
  }

  private applyPeers(peers: RoomPeer[]): void {
    this.peers = peers;
    const key = peers.map((peer) => `${peer.peerId}:${peer.displayName}`).join('|');
    if (key !== this.lastPeerListKey) {
      this.lastPeerListKey = key;
      this.emit({ type: 'peers', peers });
    }

    if (this.remotePeerId && !peers.some((peer) => peer.peerId === this.remotePeerId)) {
      this.log('info', 'The peer left the room.');
      this.teardown();
      this.setState('idle', 'The peer left. Waiting for someone to join.');
      this.emit({ type: 'peer', peer: null });
    }
  }

  private async initiate(force = false): Promise<void> {
    if (this.stopped) return;
    if (this.channel?.readyState === 'open') return;

    const guest = this.peers.find((peer) => peer.role === 'guest');
    if (!guest) {
      if (this.state !== 'idle') {
        this.teardown();
        this.setState('idle', 'Waiting for a peer to join the room.');
      }
      return;
    }

    if (!force && this.pc && this.remotePeerId === guest.peerId) {
      const connectionState = this.pc.connectionState;
      const recoverable =
        connectionState === 'new' ||
        connectionState === 'connecting' ||
        connectionState === 'connected';
      // A `disconnected` link often heals on its own, but if it stays down the
      // host must open a fresh one; otherwise the session is stuck forever.
      const staleInterruption =
        connectionState === 'disconnected' &&
        this.interruptedSince > 0 &&
        Date.now() - this.interruptedSince > 7000;
      if (recoverable || (connectionState === 'disconnected' && !staleInterruption)) {
        return;
      }
      this.log('warn', 'Retrying the direct link with a fresh offer.');
      this.teardown();
    }

    // Each new connection consumes a round trip on the signaling service, so a
    // fresh offer is rate limited unless a peer explicitly asked to renegotiate.
    const moment = Date.now();
    if (!force && moment - this.lastOfferAt < 2500) return;
    this.lastOfferAt = moment;

    this.emit({ type: 'peer', peer: guest });
    const pc = this.createConnection(guest.peerId, true);
    this.setState('connecting', `Offering a direct link to ${guest.displayName}.`);

    const channel = pc.createDataChannel('chat', { ordered: true });
    this.bindChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.sendSdp(guest.peerId, 'offer', pc.localDescription as RTCSessionDescription);
    this.log('info', `Offer sent to ${guest.displayName}.`);
  }

  private createConnection(remotePeerId: string, initiator: boolean): RTCPeerConnection {
    this.teardown();
    this.remotePeerId = remotePeerId;

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 4,
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void this.sendSignal(remotePeerId, 'candidate', {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        usernameFragment: event.candidate.usernameFragment,
      } satisfies WireCandidate);
    };

    pc.onconnectionstatechange = () => {
      const connectionState = pc.connectionState;
      if (connectionState === 'connected') {
        this.interruptedSince = 0;
      } else if (connectionState === 'failed') {
        this.interruptedSince = 0;
        this.log('error', 'The direct link failed. Retrying may help.');
        this.setState('failed', 'The direct link failed.');
      } else if (connectionState === 'disconnected') {
        if (this.interruptedSince === 0) this.interruptedSince = Date.now();
        this.log('warn', 'The direct link is interrupted.');
        this.setState('connecting', 'Link interrupted. Recovering…');
      } else if (connectionState === 'closed') {
        this.interruptedSince = 0;
        if (this.state === 'connected') this.setState('idle', 'The link closed.');
      }
    };

    pc.ondatachannel = (event) => {
      if (!initiator) this.bindChannel(event.channel);
    };

    this.pc = pc;
    return pc;
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this.setState('connected');
      this.log('info', 'DataChannel open — messages now travel peer to peer.');
      try {
        channel.send(JSON.stringify({ t: 'hello', author: this.session.displayName } satisfies WireMessage));
      } catch {
        /* hello is a courtesy message; a closed channel is reported elsewhere */
      }
      const peer = this.remotePeer;
      if (peer) this.emit({ type: 'peer', peer });
    };

    channel.onclose = () => {
      if (this.stopped) return;
      this.log('warn', 'The peer closed the direct link.');
      if (this.state === 'connected') this.setState('idle', 'The peer disconnected.');
    };

    channel.onerror = (event) => {
      const detail = (event as RTCErrorEvent).error?.message ?? 'unknown error';
      this.log('error', `DataChannel error: ${detail}`);
      this.setState('failed', 'The direct link reported an error.');
    };

    channel.onmessage = (event) => this.handleWire(String(event.data));
  }

  private handleWire(raw: string): void {
    let parsed: WireMessage;
    try {
      parsed = JSON.parse(raw) as WireMessage;
    } catch {
      this.log('warn', 'Ignored a malformed peer payload.');
      return;
    }

    if (parsed.t === 'msg' && parsed.id && parsed.text) {
      const message: ChatMessage = {
        id: parsed.id,
        author: parsed.author || this.remoteName,
        direction: 'peer',
        text: parsed.text.slice(0, MAX_TEXT_LENGTH),
        at: Number(parsed.at) || Date.now(),
        status: 'delivered',
      };
      this.emit({ type: 'message', message });
      try {
        this.channel?.send(JSON.stringify({ t: 'ack', id: parsed.id } satisfies WireMessage));
      } catch {
        /* acknowledgement is best effort */
      }
      return;
    }

    if (parsed.t === 'ack' && parsed.id) {
      this.emit({ type: 'delivered', id: parsed.id });
      return;
    }

    if (parsed.t === 'hello' && parsed.author) {
      this.log('info', `${parsed.author} confirmed the direct link.`);
    }
  }

  private async handleSignal(
    from: string,
    kind: 'offer' | 'answer' | 'candidate' | 'renegotiate',
    payload: string,
  ): Promise<void> {
    if (kind === 'renegotiate') {
      if (this.session.role !== 'host') return;
      this.log('info', 'The guest asked for a new direct link.');
      this.teardown();
      this.setState('connecting', 'Reopening the direct link.');
      await this.initiate(true);
      return;
    }

    if (kind === 'offer') {
      if (this.session.role !== 'guest') return;
      const offer = JSON.parse(payload) as WireSdp;
      const pc = this.pc && this.remotePeerId === from ? this.pc : this.createConnection(from, false);
      this.emit({ type: 'peer', peer: this.peers.find((peer) => peer.peerId === from) ?? null });
      this.setState('connecting', 'Answering the host offer.');

      await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      await this.drainCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.sendSdp(from, 'answer', pc.localDescription as RTCSessionDescription);
      this.log('info', 'Answer sent to the host.');
      return;
    }

    if (kind === 'answer') {
      if (!this.pc || this.remotePeerId !== from) return;
      const answer = JSON.parse(payload) as WireSdp;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      await this.drainCandidates();
      return;
    }

    const candidate = JSON.parse(payload) as WireCandidate;
    const init: RTCIceCandidateInit = {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment ?? undefined,
    };

    if (this.pc && this.pc.remoteDescription) {
      try {
        await this.pc.addIceCandidate(init);
      } catch (error) {
        this.log('warn', `ICE candidate rejected: ${(error as Error).message}`);
      }
    } else {
      this.pendingCandidates.push(init);
    }
  }

  private async drainCandidates(): Promise<void> {
    if (!this.pc) return;
    const queue = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queue) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch (error) {
        this.log('warn', `Queued ICE candidate rejected: ${(error as Error).message}`);
      }
    }
  }

  private async sendSdp(
    target: string,
    kind: 'offer' | 'answer',
    description: RTCSessionDescription,
  ): Promise<void> {
    await this.sendSignal(target, kind, { type: kind, sdp: description.sdp } satisfies WireSdp);
  }

  private async sendSignal(target: string, kind: string, body: unknown): Promise<void> {
    try {
      await signaling.sendSignal({
        code: this.session.roomCode,
        peer_id: this.session.peerId,
        token: this.session.token,
        target_peer_id: target,
        kind,
        payload: JSON.stringify(body),
      });
    } catch (error) {
      this.log('error', `Could not deliver "${kind}" metadata: ${(error as Error).message}`);
    }
  }

  private teardown(): void {
    try {
      this.channel?.close();
    } catch {
      /* already closed */
    }
    this.channel = null;

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.ondatachannel = null;
      try {
        this.pc.close();
      } catch {
        /* already closed */
      }
    }
    this.pc = null;
    this.remotePeerId = null;
    this.pendingCandidates = [];
    this.interruptedSince = 0;
  }
}