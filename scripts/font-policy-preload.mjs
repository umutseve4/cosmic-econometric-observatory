import childProcess from 'node:child_process';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const originalSpawn = childProcess.spawn;
const blockedHosts = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const resolverRule = blockedHosts.map((host) => `MAP ${host} ~NOTFOUND`).join(', ');

childProcess.spawn = function spawnWithDeterministicFontPolicy(command, args = [], options) {
  const executable = path.basename(String(command));
  const isCaptureChrome =
    ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].includes(executable) &&
    args.includes('--headless=new');

  if (!isCaptureChrome) {
    return originalSpawn.call(this, command, args, options);
  }

  const nextArgs = args.some((arg) => arg.startsWith('--host-resolver-rules='))
    ? args
    : [...args, `--host-resolver-rules=${resolverRule}`];

  return originalSpawn.call(this, command, nextArgs, options);
};

syncBuiltinESMExports();
