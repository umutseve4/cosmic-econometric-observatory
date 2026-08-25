export const usesDetachedProcessGroup = process.platform !== 'win32';

export function killBrowserProcessTree(child) {
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
    const onError = (error) => finish(reject, error);
    const onClose = (code, signal) => {
      if (timedOut) {
        finish(reject, timeoutError());
        return;
      }
      finish(resolve, { code, signal });
    };

    child.once('error', onError);
    child.once('close', onClose);
    timeout = setTimeout(() => {
      timedOut = true;
      try {
        killTree(child);
      } catch {
        // The bounded shutdown deadline below remains authoritative.
      }
      shutdownDeadline = setTimeout(() => finish(reject, timeoutError()), shutdownGraceMs);
    }, timeoutMs);
  });
}
