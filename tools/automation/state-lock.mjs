// One Telegram state writer across isolated cloud runners. Never force-push.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const ref = 'refs/heads/codex/locado-telegram-state-lock';
const git = (args, input) => execFileSync('git', args, {
  encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000
}).trim();
const leasePath = git(['rev-parse', '--git-path', 'locado-telegram-state-lock.json']);
const remoteOwner = () => git(['ls-remote', 'origin', ref]).split(/\s/)[0] || null;
const localLease = () => existsSync(leasePath) ? JSON.parse(readFileSync(leasePath, 'utf8')) : null;
const clearLease = (oid) => {
  if (localLease()?.oid === oid) unlinkSync(leasePath);
};

try {
  const command = process.argv[2];
  if (command === 'acquire') {
    if (localLease()) throw new Error('local lease exists');
    const tree = git(['mktree'], '');
    // An orphan commit with a unique nonce cannot fast-forward another lease.
    const oid = git(['commit-tree', tree], JSON.stringify({
      purpose: 'locado-telegram-state', job: process.argv[3] || 'manual',
      acquiredAt: new Date().toISOString(), nonce: randomUUID()
    }) + '\n');
    writeFileSync(leasePath, JSON.stringify({ oid }) + '\n', { flag: 'wx', mode: 0o600 });
    try {
      git(['push', 'origin', `${oid}:${ref}`]);
    } catch {
      // A timeout can happen after the server accepted the ref. Preserve our
      // local lease then, so it can be inspected and safely released later.
      if (remoteOwner() !== oid) clearLease(oid);
      throw new Error('acquisition not confirmed');
    }
    if (remoteOwner() !== oid) throw new Error('lease verification failed');
    console.log('Telegram state lock acquired.');
  } else if (command === 'release') {
    const lease = localLease();
    if (!lease) throw new Error('no local lease');
    const owner = remoteOwner();
    if (owner && owner !== lease.oid) throw new Error('another runner owns the lock');
    if (owner) {
      git(['push', 'origin', `:${ref}`]);
      if (remoteOwner()) throw new Error('release verification failed');
    }
    clearLease(lease.oid);
    console.log('Telegram state lock released.');
  } else if (command === 'status') {
    const owner = remoteOwner();
    console.log(JSON.stringify({ locked: Boolean(owner), owned_here: Boolean(owner && owner === localLease()?.oid) }));
  } else {
    console.error('Usage: node tools/automation/state-lock.mjs acquire [job] | release | status');
    process.exitCode = 1;
  }
} catch {
  // Git/network error objects can contain credentials. Keep them out of logs.
  console.error('Telegram state lock operation failed. Do not send messages; inspect ownership before retrying.');
  process.exitCode = 1;
}
