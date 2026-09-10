// Child process for `tests/browser-artifact-portability.test.mjs`.
//
// It exists as a separate process for one reason: `TZ` is read when the
// process starts. Assigning `process.env.TZ` afterwards does not reliably
// reset the cached zone on every platform, so an in-process attempt would
// pass without ever having tested anything. The parent therefore spawns this
// file with the hostile environment already in place.
//
// It reports the environment it actually observed rather than the environment
// the parent asked for, so the parent can refuse a run in which the variant
// silently failed to apply.

import { generateBrowserArtifact } from '../../scripts/generate-browser-artifact.mjs';

const [, , repositoryRoot, destination] = process.argv;
if (!repositoryRoot || !destination) {
  throw new Error('HOSTILE_LOCALE_USAGE:expected <repositoryRoot> <destination>');
}

const observed = {
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  collatorLocale: new Intl.Collator().resolvedOptions().locale,
  offsetMinutesAtEpoch: new Date(0).getTimezoneOffset(),
  epochRenderedLocally: new Date(0).toString()
};

generateBrowserArtifact(repositoryRoot, destination);

process.stdout.write(JSON.stringify(observed));
