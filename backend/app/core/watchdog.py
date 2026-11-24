import os
import sys
import time
import threading
import psutil

def start_watchdog(parent_pid: int | None, interval_seconds: float = 3.0) -> None:
    """
    Monitor the parent process (e.g. Electron main process).
    If parent process terminates or disappears for 3 consecutive checks (9s), exit Python immediately.
    This prevents false positives during sleep/wake while guaranteeing zero zombie processes on exit.
    """
    if not parent_pid or parent_pid <= 1:
        return

    def _monitor():
        miss_count = 0
        while True:
            time.sleep(interval_seconds)
            try:
                if not psutil.pid_exists(parent_pid):
                    miss_count += 1
                else:
                    proc = psutil.Process(parent_pid)
                    if sys.platform != "win32" and hasattr(psutil, "STATUS_ZOMBIE"):
                        if proc.status() == psutil.STATUS_ZOMBIE:
                            miss_count += 1
                        else:
                            miss_count = 0
                    else:
                        miss_count = 0
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                miss_count += 1
            except Exception:
                pass

            if miss_count >= 3:
                os._exit(0)

    thread = threading.Thread(target=_monitor, daemon=True, name="ParentProcessWatchdog")
    thread.start()
