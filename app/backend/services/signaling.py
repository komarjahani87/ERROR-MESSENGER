"""Signaling service for direct peer-to-peer WebRTC sessions.

The server only relays connection metadata (SDP offers/answers and ICE
candidates) and presence. Chat payloads travel over the WebRTC DataChannel and
never reach this service.
"""

from __future__ import annotations

import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from models.signal_peers import SignalPeers
from models.signal_rooms import SignalRooms
from models.signal_signals import SignalSignals
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

# The generated tables type these counters as 32-bit INTEGER, so persistence uses
# epoch *seconds* and the API converts to milliseconds at the boundary.
PEER_TTL_S = 45
SIGNAL_TTL_S = 180
ORPHAN_ROOM_GRACE_S = 60
MAX_SIGNAL_BYTES = 64_000
MAX_NAME_LEN = 32
# The client maintains exactly one direct DataChannel per session (one host, one
# guest), so admitting more guests would show peers nobody can actually message.
MAX_GUESTS = 1
SIGNAL_KINDS = {"offer", "answer", "candidate", "renegotiate"}
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LEN = 8


class SignalingError(Exception):
    """Business error surfaced to the client as a readable message."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def now_ms() -> int:
    return int(time.time() * 1000)


def now_s() -> int:
    """Epoch seconds — the unit persisted in the 32-bit timestamp columns."""
    return int(time.time())


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def clean_display_name(name: str | None) -> str:
    cleaned = " ".join((name or "").split()).strip()
    if not cleaned:
        raise SignalingError("Choose a display name with at least one character.")
    return cleaned[:MAX_NAME_LEN]


def normalize_code(code: str | None) -> str:
    normalized = "".join(ch for ch in (code or "").upper() if ch.isalnum())
    if len(normalized) != CODE_LEN or any(ch not in CODE_ALPHABET for ch in normalized):
        raise SignalingError("Room codes are 8 characters, for example K7M2-QX4B.")
    return normalized


def peer_dto(peer: SignalPeers) -> dict[str, Any]:
    return {
        "peerId": peer.peer_id,
        "displayName": peer.display_name,
        "role": peer.role,
        # Stored in seconds; the browser works in milliseconds.
        "lastSeenMs": int(peer.last_seen_ms or 0) * 1000,
    }


async def _allocate_room_code(db: AsyncSession) -> str:
    for _ in range(8):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        exists = await db.scalar(select(SignalRooms.id).where(SignalRooms.code == code))
        if exists is None:
            return code
    raise SignalingError("Could not allocate a room code right now. Please retry.", 503)


async def _purge_orphan_rooms(db: AsyncSession) -> None:
    """Remove rooms whose host never registered or that were left without peers."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=ORPHAN_ROOM_GRACE_S)
    candidates = await db.scalars(
        select(SignalRooms).where(SignalRooms.status == "open", SignalRooms.created_at < cutoff)
    )
    for room in list(candidates):
        has_peer = await db.scalar(
            select(SignalPeers.id).where(SignalPeers.room_id == room.id).limit(1)
        )
        if has_peer is None:
            room.status = "closed"


async def _load_room(db: AsyncSession, code: str | None) -> SignalRooms:
    room = await db.scalar(select(SignalRooms).where(SignalRooms.code == normalize_code(code)))
    if room is None:
        raise SignalingError("That room code is not active. Check the code and try again.", 404)
    if room.status != "open":
        raise SignalingError("This room has been closed.", 410)
    return room


async def _prune(db: AsyncSession, room_id: int) -> None:
    """Drop peers that stopped sending heartbeats and stale signals."""
    moment = now_s()
    await db.execute(
        delete(SignalPeers).where(
            SignalPeers.room_id == room_id,
            SignalPeers.last_seen_ms < moment - PEER_TTL_S,
        )
    )
    await db.execute(
        delete(SignalSignals).where(
            SignalSignals.room_id == room_id,
            SignalSignals.created_at_ms < moment - SIGNAL_TTL_S,
        )
    )


async def _close_room(db: AsyncSession, room: SignalRooms) -> None:
    """Close a room and drop its peers and pending signals."""
    await db.execute(delete(SignalSignals).where(SignalSignals.room_id == room.id))
    await db.execute(delete(SignalPeers).where(SignalPeers.room_id == room.id))
    room.status = "closed"


async def _register_peer(
    db: AsyncSession, room: SignalRooms, display_name: str, role: str
) -> tuple[SignalPeers, str]:
    token = secrets.token_urlsafe(24)
    peer = SignalPeers(
        room_id=room.id,
        peer_id=secrets.token_hex(8),
        display_name=display_name,
        role=role,
        token_hash=hash_token(token),
        last_seen_ms=now_s(),
    )
    db.add(peer)
    await db.commit()
    return peer, token


async def _authenticate(
    db: AsyncSession, room: SignalRooms, peer_id: str, token: str
) -> SignalPeers:
    peer = await db.scalar(
        select(SignalPeers).where(
            SignalPeers.room_id == room.id,
            SignalPeers.peer_id == peer_id,
        )
    )
    if peer is None:
        raise SignalingError("This session left the room. Rejoin to continue.", 401)
    if not secrets.compare_digest(peer.token_hash, hash_token(token or "")):
        raise SignalingError("Session token rejected.", 403)
    return peer


async def _peers_in_room(db: AsyncSession, room_id: int) -> list[SignalPeers]:
    result = await db.scalars(
        select(SignalPeers).where(SignalPeers.room_id == room_id).order_by(SignalPeers.id)
    )
    return list(result)


def _unique_name(name: str, taken: set[str]) -> str:
    candidate = name
    counter = 2
    while candidate.lower() in taken:
        suffix = f" ({counter})"
        candidate = f"{name[: MAX_NAME_LEN - len(suffix)]}{suffix}"
        counter += 1
        if counter > 99:
            candidate = f"{name[: MAX_NAME_LEN - 4]}-{secrets.token_hex(1)}"
            break
    return candidate


async def create_room(db: AsyncSession, display_name: str | None) -> dict[str, Any]:
    name = clean_display_name(display_name)
    await _purge_orphan_rooms(db)
    await db.commit()

    room = SignalRooms(code=await _allocate_room_code(db), host_peer_id="", status="open")
    db.add(room)
    await db.commit()

    peer, token = await _register_peer(db, room, name, "host")
    room.host_peer_id = peer.peer_id
    await db.commit()

    return {
        "roomCode": room.code,
        "peerId": peer.peer_id,
        "token": token,
        "role": peer.role,
        "displayName": peer.display_name,
        "peers": [peer_dto(peer)],
    }


async def join_room(db: AsyncSession, code: str | None, display_name: str | None) -> dict[str, Any]:
    name = clean_display_name(display_name)
    room = await _load_room(db, code)

    await _prune(db, room.id)
    await db.commit()

    others = await _peers_in_room(db, room.id)
    if not any(peer.role == "host" for peer in others):
        await _close_room(db, room)
        await db.commit()
        raise SignalingError("This room has been closed.", 410)

    if sum(1 for peer in others if peer.role == "guest") >= MAX_GUESTS:
        raise SignalingError("This room is full. A direct link connects two peers.", 409)

    name = _unique_name(name, {peer.display_name.lower() for peer in others})
    peer, token = await _register_peer(db, room, name, "guest")

    return {
        "roomCode": room.code,
        "peerId": peer.peer_id,
        "token": token,
        "role": peer.role,
        "displayName": peer.display_name,
        "peers": [peer_dto(item) for item in await _peers_in_room(db, room.id)],
    }


async def sync_session(
    db: AsyncSession,
    code: str | None,
    peer_id: str | None,
    token: str | None,
    since_signal_id: int = 0,
) -> dict[str, Any]:
    room = await _load_room(db, code)
    peer = await _authenticate(db, room, peer_id or "", token or "")

    peer.last_seen_ms = now_s()
    await db.flush()
    await _prune(db, room.id)

    peers = await _peers_in_room(db, room.id)
    host_present = any(item.role == "host" for item in peers)
    self_present = any(item.peer_id == peer.peer_id for item in peers)

    if not host_present or not self_present:
        await _close_room(db, room)
        await db.commit()
        raise SignalingError("This room has been closed.", 410)

    await db.commit()

    signals = await db.scalars(
        select(SignalSignals)
        .where(
            SignalSignals.room_id == room.id,
            SignalSignals.target_peer_id == peer.peer_id,
            SignalSignals.id > max(since_signal_id, 0),
        )
        .order_by(SignalSignals.id)
        .limit(200)
    )

    return {
        "serverTimeMs": now_ms(),
        "self": peer_dto(peer),
        "peers": [peer_dto(item) for item in peers],
        "signals": [
            {
                "id": signal.id,
                "from": signal.sender_peer_id,
                "kind": signal.kind,
                "payload": signal.payload,
            }
            for signal in signals
        ],
    }


async def send_signal(
    db: AsyncSession,
    code: str | None,
    peer_id: str | None,
    token: str | None,
    target_peer_id: str,
    kind: str,
    payload: str,
) -> dict[str, Any]:
    room = await _load_room(db, code)
    peer = await _authenticate(db, room, peer_id or "", token or "")

    if kind not in SIGNAL_KINDS:
        raise SignalingError("Unsupported signal type.")
    if target_peer_id == peer.peer_id:
        raise SignalingError("Cannot signal yourself.")
    if len(payload.encode("utf-8")) > MAX_SIGNAL_BYTES:
        raise SignalingError("Signal payload is too large.")

    target = await db.scalar(
        select(SignalPeers).where(
            SignalPeers.room_id == room.id,
            SignalPeers.peer_id == target_peer_id,
        )
    )
    if target is None:
        raise SignalingError("That peer is no longer in the room.", 404)

    signal = SignalSignals(
        room_id=room.id,
        sender_peer_id=peer.peer_id,
        target_peer_id=target_peer_id,
        kind=kind,
        payload=payload,
        created_at_ms=now_s(),
    )
    db.add(signal)
    peer.last_seen_ms = now_s()
    await db.commit()
    return {"ok": True, "id": signal.id}


async def leave_room(
    db: AsyncSession, code: str | None, peer_id: str | None, token: str | None
) -> dict[str, Any]:
    room = await _load_room(db, code)
    peer = await _authenticate(db, room, peer_id or "", token or "")

    await db.execute(
        delete(SignalSignals).where(
            SignalSignals.room_id == room.id,
            (SignalSignals.target_peer_id == peer.peer_id)
            | (SignalSignals.sender_peer_id == peer.peer_id),
        )
    )
    await db.execute(delete(SignalPeers).where(SignalPeers.id == peer.id))

    # The host owns the offer side of every link, so a room cannot stay useful
    # without it. Closing keeps guests from waiting on a link nobody will open.
    if peer.role == "host":
        await _close_room(db, room)
    else:
        remaining = await db.scalar(
            select(SignalPeers.id).where(SignalPeers.room_id == room.id).limit(1)
        )
        if remaining is None:
            room.status = "closed"

    await db.commit()
    return {"ok": True, "roomClosed": room.status != "open"}