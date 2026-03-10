#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# ///
"""PTY test harness for Ink TUI applications.

Spawns a command in a real pseudo-terminal with proper window size,
collects output, and optionally sends a signal. Results are printed
as JSON to stdout for consumption by bun:test.

Usage:
  uv run pty-harness.py <action> <timeout_s> <cmd> [args...]

Actions:
  render   — wait for output, print it, then SIGKILL
  sigint   — wait for output, send SIGINT, report exit code
"""

import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time


def read_pty(fd: int, timeout_s: float, stop_marker: bytes | None = None) -> bytes:
    """Read from PTY fd until timeout or stop_marker found."""
    buf = b""
    start = time.time()
    while time.time() - start < timeout_s:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                data = os.read(fd, 4096)
                if not data:
                    break
                buf += data
                if stop_marker and stop_marker in buf:
                    break
            except OSError:
                break
    return buf


def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from text."""
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)  # OSC
    text = re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]", "", text)  # CSI
    text = re.sub(r"\x1b[()][A-Za-z0-9]", "", text)  # charset
    text = re.sub(r"\x1b[=>#78]", "", text)  # simple escapes
    text = re.sub(r"[\x00-\x08\x0e-\x1f]", "", text)  # control chars except \t \n \r
    return text


def main() -> None:
    if len(sys.argv) < 4:
        print(json.dumps({"error": "usage: pty-harness.py <action> <timeout> <cmd> [args]"}))
        sys.exit(1)

    action = sys.argv[1]
    timeout_s = float(sys.argv[2])
    cmd = sys.argv[3:]

    pid, fd = pty.fork()

    if pid == 0:
        # Child — exec the command
        os.environ["TERM"] = "xterm-256color"
        os.execvp(cmd[0], cmd)
        # unreachable

    # Parent — set terminal size (80×24)
    winsize = struct.pack("HHHH", 24, 80, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

    result: dict = {"pid": pid}

    try:
        # Collect output
        raw = read_pty(fd, timeout_s, stop_marker=b"[q] quit")
        decoded = raw.decode("utf-8", errors="replace")
        clean = strip_ansi(decoded).strip()

        result["output_bytes"] = len(raw)
        result["has_content"] = len(clean) > 0
        result["clean_text"] = clean[:500]
        result["raw_hex"] = raw[:200].hex()

        if action == "render":
            # Just report what we saw, then kill
            os.kill(pid, signal.SIGKILL)
            _, status = os.waitpid(pid, 0)
            result["action"] = "render"

        elif action == "sigint":
            # Send SIGINT and observe exit
            time.sleep(0.3)
            os.kill(pid, signal.SIGINT)

            # Wait for exit
            start = time.time()
            exit_code = None
            while time.time() - start < 5:
                try:
                    r, _, _ = select.select([fd], [], [], 0.1)
                    if r:
                        try:
                            os.read(fd, 4096)
                        except OSError:
                            pass
                except (ValueError, OSError):
                    pass

                try:
                    wpid, status = os.waitpid(pid, os.WNOHANG)
                    if wpid:
                        if os.WIFSIGNALED(status):
                            exit_code = 128 + os.WTERMSIG(status)
                        else:
                            exit_code = os.WEXITSTATUS(status)
                        pid = 0
                        break
                except ChildProcessError:
                    pid = 0
                    break

            result["action"] = "sigint"
            if exit_code is not None:
                result["exit_code"] = exit_code
            else:
                result["exit_code"] = None
                result["error"] = "process did not exit after SIGINT"

        else:
            result["error"] = f"unknown action: {action}"

    finally:
        # Ensure no zombie processes
        if pid > 0:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass
        try:
            os.close(fd)
        except OSError:
            pass

    print(json.dumps(result))


if __name__ == "__main__":
    main()
