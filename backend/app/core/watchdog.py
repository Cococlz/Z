import os
import sys
import time
import threading
import psutil

def start_watchdog(parent_pid: int | None, interval_seconds: float = 2.0) -> None:
    """
    Monitor the parent process (e.g. Electron main process).
    If parent process terminates or disappears, exit Python immediately to prevent zombie processes.
    """
    if not parent_pid or parent_pid <= 1:
        return

    def _monitor():
        while True:
            time.sleep(interval_seconds)
            try:
                # Check if process exists and is not a zombie
                if not psutil.pid_exists(parent_pid):
                    os._exit(0)
                proc = psutil.Process(parent_pid)
                if proc.status() == psutil.STATUS_ZOMBIE:
                    os._exit(0)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                os._exit(0)
            except Exception:
                pass

    thread = threading.Thread(target=_monitor, daemon=True, name="ParentProcessWatchdog")
    thread.start()
