/**
 * Whether the server can be reached, inferred from the app's own requests: a request that gets no
 * response marks the app offline, any response marks it online again. While offline, the server
 * is pinged now and then so the app notices when the connection is back.
 *
 * (No network-state library: it would be another native module, and "has a network" is not the
 * same as "can reach the server" anyway.)
 */

import { useSyncExternalStore } from 'react';

type Listener = () => void;

let online = true;
const listeners = new Set<Listener>();
const backOnline = new Set<Listener>();
let ping: (() => Promise<unknown>) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const PING_EVERY_MS = 20_000;

function set(next: boolean) {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l());
  if (next) {
    if (timer) clearInterval(timer);
    timer = null;
    backOnline.forEach((l) => l());
  } else if (!timer) {
    timer = setInterval(() => void checkConnection(), PING_EVERY_MS);
  }
}

/** Called by the API client after every request. */
export function reportRequest(result: 'response' | 'no-response') {
  set(result === 'response');
}

/** How to ask the server whether it is there. Set once by the API client. */
export function setPing(fn: () => Promise<unknown>) {
  ping = fn;
}

/** Ask the server now. The request itself reports the result. */
export async function checkConnection(): Promise<boolean> {
  try {
    await ping?.();
  } catch {
    // reportRequest has already recorded it.
  }
  return online;
}

export const isOnline = () => online;

/** Run something each time the server becomes reachable again. Returns an unsubscribe function. */
export function onBackOnline(listener: Listener): () => void {
  backOnline.add(listener);
  return () => backOnline.delete(listener);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnline);
}
