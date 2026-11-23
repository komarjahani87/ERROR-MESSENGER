"""HTTP signaling endpoints used to bootstrap direct WebRTC sessions."""

from typing import Any, Optional

from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from services import signaling
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/signaling", tags=["signaling"])


class CreateRoomRequest(BaseModel):
    display_name: str = Field(default="", max_length=64)


class JoinRoomRequest(BaseModel):
    code: str = Field(default="", max_length=32)
    display_name: str = Field(default="", max_length=64)


class SessionRequest(BaseModel):
    code: str = Field(default="", max_length=32)
    peer_id: str = Field(default="", max_length=64)
    token: str = Field(default="", max_length=128)


class SyncRequest(SessionRequest):
    since_signal_id: int = 0


class SendSignalRequest(SessionRequest):
    target_peer_id: str = Field(default="", max_length=64)
    kind: str = Field(default="", max_length=16)
    # The transport cap is enforced in the service so oversized payloads return a
    # readable 400 instead of a framework-level 422 validation dump.
    payload: str = Field(default="", max_length=200_000)


async def _run(action: Any) -> Any:
    try:
        return await action
    except signaling.SignalingError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message)
    except Exception as error:  # surfacing a readable message beats a bare 500
        raise HTTPException(status_code=500, detail=f"Signaling failed: {error}")


@router.post("/create_room")
async def create_room(
    data: CreateRoomRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    return await _run(signaling.create_room(db, data.display_name))


@router.post("/join_room")
async def join_room(
    data: JoinRoomRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    return await _run(signaling.join_room(db, data.code, data.display_name))


@router.post("/sync")
async def sync(
    data: SyncRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    return await _run(
        signaling.sync_session(
            db, data.code, data.peer_id, data.token, data.since_signal_id
        )
    )


@router.post("/send_signal")
async def send_signal(
    data: SendSignalRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    return await _run(
        signaling.send_signal(
            db,
            data.code,
            data.peer_id,
            data.token,
            data.target_peer_id,
            data.kind,
            data.payload,
        )
    )


@router.post("/leave_room")
async def leave_room(
    data: SessionRequest, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    return await _run(signaling.leave_room(db, data.code, data.peer_id, data.token))


@router.get("/ice_servers")
async def ice_servers() -> dict[str, Any]:
    """Public ICE configuration.

    STUN is always offered (no credentials). TURN credentials are optional and
    only appear when the deployment supplies them through its secret store.
    """
    import os

    servers: list[dict[str, Any]] = [
        {"urls": ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"]}
    ]

    turn_urls = [item.strip() for item in (os.environ.get("TURN_URLS") or "").split(",") if item.strip()]
    if turn_urls:
        servers.append(
            {
                "urls": turn_urls,
                "username": os.environ.get("TURN_USERNAME", ""),
                "credential": os.environ.get("TURN_CREDENTIAL", ""),
            }
        )

    return {"iceServers": servers, "turnConfigured": bool(turn_urls)}