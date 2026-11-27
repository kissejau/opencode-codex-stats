#!/usr/bin/env python3
"""Exercise the packed plugin in a fresh OpenCode instance without credentials."""

import base64
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import socket
import struct
import subprocess
import tarfile
import tempfile
import termios
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def stop(process):
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


with tempfile.TemporaryDirectory(prefix="codex-stats-smoke-") as directory:
    home = Path(directory)
    result = subprocess.run(
        ["npm", "pack", "--json", "--pack-destination", str(home)],
        cwd=ROOT, capture_output=True, text=True, check=True, timeout=60,
    )
    archive = home / json.loads(result.stdout)[0]["filename"]
    with tarfile.open(archive) as package:
        package.extractall(home, filter="data")

    config = home / "config" / "opencode"
    config.mkdir(parents=True)
    (config / "opencode.json").write_text(json.dumps({"plugins": [str(home / "package")]}))
    env = {
        "PATH": os.environ["PATH"],
        "LANG": "C.UTF-8",
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(home / "config"),
        "XDG_DATA_HOME": str(home / "data"),
        "XDG_CACHE_HOME": str(home / "cache"),
        "XDG_STATE_HOME": str(home / "state"),
        "TERM": "xterm-256color",
    }

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    log_path = home / "server.log"
    with log_path.open("w+") as log:
        server = subprocess.Popen(
            ["opencode", "serve", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=home, env=env, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 40
            password = None
            while time.monotonic() < deadline and server.poll() is None:
                match = re.search(r"server password (\S+)", log_path.read_text())
                if match:
                    password = match.group(1)
                    break
                time.sleep(0.2)
            assert password, "OpenCode server did not start"
            headers = {
                "Authorization": "Basic " + base64.b64encode(f"opencode:{password}".encode()).decode(),
                "Content-Type": "application/json",
            }

            def request(path, data=None):
                req = urllib.request.Request(
                    f"http://127.0.0.1:{port}{path}", headers=headers,
                    data=None if data is None else json.dumps(data).encode(),
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    return json.load(response)

            plugin = None
            deadline = time.monotonic() + 40
            while time.monotonic() < deadline:
                plugins = request("/api/plugin")["data"]
                plugin = next((item for item in plugins if item["id"] == "opencode-codex-stats.server"), None)
                if plugin and plugin["state"]["status"] == "active":
                    break
                time.sleep(0.2)
            assert plugin and plugin["state"]["status"] == "active", "server plugin not active"
            assert plugin["features"].get("tui") and plugin["features"].get("rpc"), "TUI or RPC missing"
            result = request("/api/rpc/opencode-codex-stats/read", {"input": {}})["output"]
            assert result["status"] == "unavailable" and "/connect" in result["message"], result
            print("Server and unauthenticated RPC: OK")
        finally:
            stop(server)

    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 140, 0, 0))
    tui = subprocess.Popen(
        ["opencode", "--standalone", "--log-level", "debug", "--print-logs"], cwd=home, env=env,
        stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
    )
    os.close(slave)
    output = bytearray()
    try:
        deadline = time.monotonic() + 60
        sent = False
        submitted = False
        while time.monotonic() < deadline and tui.poll() is None:
            if select.select([master], [], [], 0.2)[0]:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break
            if not sent and b"plugin=opencode-codex-stats.tui" in output and b"ctrl+p" in output.lower():
                os.write(master, b"/codex-stats")
                sent = True
            if sent and not submitted and b"Codex Stats Settings" in output:
                os.write(master, b"\r")
                submitted = True
            if all(value in output for value in (b"Hourly usage", b"Weekly usage", b"Poll interval")):
                print("TUI settings command: OK")
                break
        else:
            raise AssertionError(
                f"TUI settings menu did not open within 60 seconds "
                f"(plugin loaded: {b'plugin=opencode-codex-stats.tui' in output}, "
                f"prompt visible: {b'ctrl+p' in output.lower()}, command sent: {sent})"
            )
        assert all(value in output for value in (b"Hourly usage", b"Weekly usage", b"Poll interval")), \
            "TUI exited before opening settings"
    finally:
        stop(tui)
        os.close(master)
