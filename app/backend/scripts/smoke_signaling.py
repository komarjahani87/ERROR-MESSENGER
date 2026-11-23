import json
import random
import string
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1/signaling"


def call(path, payload):
    req = urllib.request.Request(
        f"{BASE}/{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            return exc.code, json.loads(body)
        except Exception:
            return exc.code, {"detail": body}


def get(path):
    with urllib.request.urlopen(f"{BASE}/{path}", timeout=15) as resp:
        return json.loads(resp.read())


ok = True


def check(label, condition, extra=""):
    global ok
    if condition:
        print(f"PASS  {label}")
    else:
        ok = False
        print(f"FAIL  {label} {extra}")


print("=== ICE ===")
ice = get("ice_servers")
check("ice_servers returns STUN", len(ice.get("iceServers", [])) >= 1, ice)

print("\n=== create room ===")
status, host = call("create_room", {"display_name": "Komar"})
check("create_room 200", status == 200, host)
check("code is 8 chars", len(host.get("code", host.get("roomCode", ""))) == 8, host.keys())
code = host["roomCode"]
check("host role", host["role"] == "host")
check("token present", len(host["token"]) > 10)

print("\n=== validation errors ===")
status, err = call("create_room", {"display_name": "   "})
check("blank name rejected", status == 400, (status, err))
status, err = call("join_room", {"code": "ZZZZZZZZ", "display_name": "Ghost"})
check("unknown room rejected", status == 404, (status, err))
status, err = call("join_room", {"code": "bad", "display_name": "Ghost"})
check("malformed code rejected", status == 400, (status, err))

print("\n=== join room ===")
status, guest = call("join_room", {"code": code, "display_name": "Ava"})
check("join_room 200", status == 200, guest)
check("guest role", guest["role"] == "guest")
check("host visible to guest", any(p["role"] == "host" for p in guest["peers"]), guest.get("peers"))

status, hostview = call(
    "sync",
    {"code": code, "peer_id": host["peerId"], "token": host["token"], "since_signal_id": 0},
)
check("host sync 200", status == 200, hostview)
check("guest visible to host", any(p["role"] == "guest" for p in hostview["peers"]), hostview.get("peers"))

print("\n=== signaling relay ===")
status, sent = call(
    "send_signal",
    {
        "code": code,
        "peer_id": host["peerId"],
        "token": host["token"],
        "target_peer_id": guest["peerId"],
        "kind": "offer",
        "payload": json.dumps({"type": "offer", "sdp": "v=0 fake-offer"}),
    },
)
check("host sends offer", status == 200 and sent.get("ok"), (status, sent))

status, gsync = call(
    "sync",
    {"code": code, "peer_id": guest["peerId"], "token": guest["token"], "since_signal_id": 0},
)
check("guest receives offer", status == 200 and len(gsync["signals"]) == 1, gsync.get("signals"))
if gsync["signals"]:
    check("relayed payload intact", "fake-offer" in gsync["signals"][0]["payload"])

status, again = call(
    "sync",
    {"code": code, "peer_id": guest["peerId"], "token": guest["token"], "since_signal_id": gsync["signals"][0]["id"] if gsync["signals"] else 1},
)
check("cursor prevents duplicate delivery", len(again["signals"]) == 0, again.get("signals"))

status, ans = call(
    "send_signal",
    {
        "code": code,
        "peer_id": guest["peerId"],
        "token": guest["token"],
        "target_peer_id": host["peerId"],
        "kind": "answer",
        "payload": json.dumps({"type": "answer", "sdp": "v=0 fake-answer"}),
    },
)
check("guest sends answer", status == 200, (status, ans))

print("\n=== security checks ===")
status, bad = call(
    "sync",
    {"code": code, "peer_id": host["peerId"], "token": "wrong-token", "since_signal_id": 0},
)
check("bad token rejected", status == 403, (status, bad))

status, bad = call(
    "sync",
    {"code": code, "peer_id": "deadbeef", "token": "x", "since_signal_id": 0},
)
check("unknown peer rejected", status == 401, (status, bad))

status, bad = call(
    "send_signal",
    {
        "code": code,
        "peer_id": host["peerId"],
        "token": host["token"],
        "target_peer_id": guest["peerId"],
        "kind": "payload-exec",
        "payload": "{}",
    },
)
check("unsupported kind rejected", status == 400, (status, bad))

status, bad = call(
    "send_signal",
    {
        "code": code,
        "peer_id": host["peerId"],
        "token": host["token"],
        "target_peer_id": guest["peerId"],
        "kind": "candidate",
        "payload": "x" * 70000,
    },
)
check("oversized payload rejected", status == 400, (status, bad))

status, bad = call(
    "send_signal",
    {
        "code": code,
        "peer_id": host["peerId"],
        "token": host["token"],
        "target_peer_id": host["peerId"],
        "kind": "candidate",
        "payload": "{}",
    },
)
check("self-target rejected", status == 400, (status, bad))

print("\n=== duplicate names ===")
status, room3 = call("create_room", {"display_name": "DupHost"})
code3 = room3["roomCode"]
status, first = call("join_room", {"code": code3, "display_name": "DupHost"})
check("duplicate name disambiguated", status == 200 and first["displayName"] != "DupHost", first.get("displayName"))
if status == 200:
    call("leave_room", {"code": code3, "peer_id": first["peerId"], "token": first["token"]})
call("leave_room", {"code": code3, "peer_id": room3["peerId"], "token": room3["token"]})

print("\n=== leave + close ===")
status, left = call("leave_room", {"code": code, "peer_id": guest["peerId"], "token": guest["token"]})
check("guest leaves", status == 200, (status, left))
status, joined = call("join_room", {"code": code, "display_name": "Late"})
check("room still open for host", status == 200, (status, joined))
if status == 200:
    call("leave_room", {"code": code, "peer_id": joined["peerId"], "token": joined["token"]})

status, left = call("leave_room", {"code": code, "peer_id": host["peerId"], "token": host["token"]})
check("host leaves", status == 200, (status, left))
status, joined = call("join_room", {"code": code, "display_name": "Nope"})
check("closed room rejected", status == 410, (status, joined))

print("\n=== capacity ===")
status, room2 = call("create_room", {"display_name": "Cap Host"})
code2 = room2["roomCode"]
created = []
capacity_hit = False
for index in range(3):
    status, member = call("join_room", {"code": code2, "display_name": f"Member {index}"})
    if status == 409:
        capacity_hit = True
        break
    if status == 200:
        created.append(member)
check("room caps at one guest (one direct link)", capacity_hit and len(created) == 1, f"created={len(created)}")

for member in created:
    call("leave_room", {"code": code2, "peer_id": member["peerId"], "token": member["token"]})
call("leave_room", {"code": code2, "peer_id": room2["peerId"], "token": room2["token"]})

print("\nRESULT:", "ALL PASS" if ok else "FAILURES PRESENT")
sys.exit(0 if ok else 1)