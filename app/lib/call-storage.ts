import { Redis } from "@upstash/redis";
import {
  getCallStoreSnapshot,
  replaceCallStore,
  type ThisNeedsACallStore,
} from "@/app/lib/calls";

const storeKey = process.env.CALL_STORE_KEY ?? "this-needs-a-call:store";

let redis: Redis | null | undefined;

export async function hydrateCallStore(): Promise<void> {
  const adapter = getStorageAdapter();
  const snapshot = await adapter.load();
  if (snapshot) {
    replaceCallStore(snapshot);
  }
}

export async function persistCallStore(): Promise<void> {
  await getStorageAdapter().save(getCallStoreSnapshot());
}

export async function withHydratedCallStore<T>(
  callback: () => T | Promise<T>,
  options?: { persist?: boolean },
): Promise<T> {
  await hydrateCallStore();
  const result = await callback();
  if (options?.persist) {
    await persistCallStore();
  }
  return result;
}

function getStorageAdapter(): {
  load: () => Promise<ThisNeedsACallStore | null>;
  save: (store: ThisNeedsACallStore) => Promise<void>;
} {
  if (shouldUseMemoryStorage()) {
    return {
      async load() {
        return null;
      },
      async save() {
        return;
      },
    };
  }

  const client = getRedis();
  return {
    async load() {
      return await client.get<ThisNeedsACallStore>(storeKey);
    },
    async save(store) {
      await client.set(storeKey, store);
    },
  };
}

function shouldUseMemoryStorage(): boolean {
  return (
    process.env.CALL_STORAGE_ADAPTER === "memory" ||
    (!isProductionRuntime() && !hasUpstashEnv())
  );
}

function getRedis(): Redis {
  if (redis) {
    return redis;
  }

  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Upstash KV storage is required outside local memory mode. Set KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  redis = new Redis({ url, token });
  return redis;
}

function hasUpstashEnv(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}
