import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, TimeoutError } from './errors.js';
import { confirmAfterTimeout } from './confirmAfterTimeout.js';

interface Me {
  activeRole: 'client' | 'provider';
}

const asProvider: Me = { activeRole: 'provider' };
const asClient: Me = { activeRole: 'client' };
const wantsProvider = (me: Me) => me.activeRole === 'provider';

describe('confirmAfterTimeout', () => {
  it('reports success when the server already holds the state the action wanted', async () => {
    // The case that made role switching "fail" and then turn out to have
    // worked: the switch was committed, the response just never arrived.
    const confirm = vi.fn().mockResolvedValue(asProvider);

    await expect(
      confirmAfterTimeout(new TimeoutError(new Error('aborted')), confirm, wantsProvider),
    ).resolves.toEqual(asProvider);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('still fails when the server shows the action did not take effect', async () => {
    const error = new TimeoutError(new Error('aborted'));

    await expect(
      confirmAfterTimeout(error, () => Promise.resolve(asClient), wantsProvider),
    ).rejects.toBe(error);
  });

  it('rethrows the original timeout when the confirming read also fails', async () => {
    // Not the follow-up's error: the user asked to switch roles, not to read
    // their profile, so that is the failure worth describing.
    const error = new TimeoutError(new Error('aborted'));
    const confirm = () => Promise.reject(new NetworkError(new Error('offline')));

    await expect(confirmAfterTimeout(error, confirm, wantsProvider)).rejects.toBe(error);
  });

  it('never re-reads state for an error the server actually answered', async () => {
    // A 400 is a real answer. Confirming after one would let a rejected action
    // pass as successful whenever the state happened to match already.
    const confirm = vi.fn().mockResolvedValue(asProvider);
    const rejected = new ApiError(400, 'You do not have a stylist page');

    await expect(confirmAfterTimeout(rejected, confirm, wantsProvider)).rejects.toBe(rejected);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not confirm a plain network failure, which proves nothing was sent', async () => {
    const confirm = vi.fn().mockResolvedValue(asProvider);
    const offline = new NetworkError(new Error('offline'));

    await expect(confirmAfterTimeout(offline, confirm, wantsProvider)).rejects.toBe(offline);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('TimeoutError', () => {
  it('is a NetworkError, so existing offline handling still catches it', () => {
    const error = new TimeoutError(new Error('aborted'));
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('does not claim the server was unreachable, because it was reached', () => {
    expect(new TimeoutError(new Error('aborted')).message).not.toBe('Could not reach the server');
  });
});
