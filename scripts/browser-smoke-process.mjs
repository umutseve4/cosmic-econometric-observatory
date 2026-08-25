import { spawn } from 'node:child_process';

export const usesDetachedProcessGroup = process.platform !== 'win32';

export function killBrowserProcessTree(child) {
  if (process.platform === 'win32' && Number.isInteger(child.pid)) {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    killer.unref();
    return;
  }

  let groupError;
  if (usesDetachedProcessGroup && Number.isInteger(child.pid)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch (error) {
      groupError = error;
    }
  }
  try {
    if (child.kill('SIGKILL')) return;
  } catch (error) {
    if (groupError === undefined) groupError = error;
  }
  if (groupError !== undefined && groupError?.code !== 'ESRCH') throw groupError;
}

function releaseChildHandles(child) {
  child.stdin?.destroy();
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref?.();
}

export function waitForBrowserExit(child, page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const shutdownGraceMs = options.shutdownGraceMs ?? 2_000;
  const killTree = options.killTree ?? killBrowserProcessTree;

  return new Promise((resolve, reject) => {
    let timeout;
    let shutdownDeadline;
    let timedOut = false;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(shutdownDeadline);
      child.off('error', onError);
      child.off('close', onClose);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const timeoutError = () => new Error(`real-browser smoke timed out for ${page} after ${timeoutMs}ms; shutdown grace ${shutdownGraceMs}ms`);
    const rejectTimeout = () => {
      releaseChildHandles(child);
      finish(reject, timeoutError());
    };
    const onError = (error) => finish(reject, error);
    const onClose = (code, signal) => {
      if (timedOut) {
        rejectTimeout();
        return;
      }
      finish(resolve, { code, signal });
    };

    child.once('error', onError);
    child.once('close', onClose);
    timeout = setTimeout(() => {
      timedOut = true;
      shutdownDeadline = setTimeout(rejectTimeout, shutdownGraceMs);
      try {
        killTree(child);
      } catch {
        // The shutdown deadline releases parent-side handles even if termination fails.
      }
    }, timeoutMs);
  });
}

export function closeServerBounded(server, shutdownGraceMs = 2_000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve();
    };
    const deadline = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, shutdownGraceMs);
    server.close(finish);
    server.closeIdleConnections?.();
  });
}
