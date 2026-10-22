import cloudbase from '@cloudbase/js-sdk';
import { CHANNEL_NAME } from './events';

export interface RealtimeConfig {
  env: string;
  region: string;
  accessKey: string;
}

export interface RoomHandlers {
  onStatus: (status: 'connecting' | 'connected' | 'error', detail?: string) => void;
  onBroadcast: (event: string, payload: any) => void;
  onPresence: (state: Record<string, any[]>) => void;
  onPostgres: (payload: any) => void;
  onSystem?: (payload: any) => void;
}

export interface RoomConnection {
  clientId: string;
  db: any;
  send: (event: string, payload: any) => Promise<boolean>;
  track: (meta: any) => Promise<void>;
  insertEvent: (type: string, payload: any) => Promise<void>;
  upsertState: (row: Record<string, any>) => Promise<void>;
  leave: () => Promise<void>;
}

const randomId = () => Math.random().toString(36).slice(2, 10);

/**
 * 连接 CloudBase Realtime。
 * 顺序：init（不传 auth）→ 把 Publishable Key 注入 OAuth 凭证 → realtime.setAuth() → 订阅频道。
 * 第一次 subscribe 有可能直接报 transport failure，注入一次凭证后重建频道再订阅就好。
 */
export async function connectRoom(config: RealtimeConfig, handlers: RoomHandlers): Promise<RoomConnection> {
  const clientId = `titan-${randomId()}`;
  handlers.onStatus('connecting');

  const app = (cloudbase as any).init({
    env: config.env,
    region: config.region,
    accessKey: config.accessKey,
    clientId,
    persistence: 'none',
    auth: { detectSessionInUrl: false },
  });

  const auth = (app as any).auth();
  const oauth = auth?.oauthInstance?.oauth2client;
  const injectCredentials = () => {
    if (!oauth) return;
    const cacheExpiry = Date.now() * 2;
    oauth.setAccessKeyCredentials({
      access_token: config.accessKey,
      token_type: 'Bearer',
      scope: 'accessKey',
      expires_at: new Date(cacheExpiry),
      expires_in: cacheExpiry,
    });
  };

  const db = (app as any).rdb();
  const realtime = (app as any).realtime();

  injectCredentials();
  try {
    await realtime.setAuth();
  } catch {
    /* 旧版 SDK 可能没有 setAuth，订阅时会自行握手 */
  }

  const makeChannel = () => {
    const channel = realtime.channel(CHANNEL_NAME, {
      config: {
        broadcast: { self: true, ack: true },
        presence: { enabled: true, key: clientId },
      },
    });
    channel.on('broadcast', { event: '*' }, (message: any) => {
      handlers.onBroadcast(message?.event ?? '', message?.payload ?? {});
    });
    channel.on('presence', { event: 'sync' }, () => {
      handlers.onPresence(channel.presenceState() ?? {});
    });
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'raid_events' }, (payload: any) => {
      handlers.onPostgres(payload);
    });
    channel.on('system', {}, (payload: any) => handlers.onSystem?.(payload));
    return channel;
  };

  const subscribe = (channel: any) =>
    new Promise<string>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve('TIMED_OUT');
        }
      }, 20000);
      channel.subscribe((status: string, error: any) => {
        if (settled) return;
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          settled = true;
          window.clearTimeout(timer);
          resolve(status === 'CHANNEL_ERROR' && error?.message ? `CHANNEL_ERROR:${error.message}` : status);
        }
      }, 20000);
    });

  let channel = makeChannel();
  let status = await subscribe(channel);

  if (status.startsWith('CHANNEL_ERROR') && status.includes('transport failure')) {
    injectCredentials();
    try {
      await realtime.setAuth();
    } catch {}
    try {
      await realtime.removeChannel(channel);
    } catch {}
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    channel = makeChannel();
    status = await subscribe(channel);
  }

  if (status !== 'SUBSCRIBED') {
    handlers.onStatus('error', status.replace('CHANNEL_ERROR:', ''));
    throw new Error(status.replace('CHANNEL_ERROR:', '') || '实时频道连接失败');
  }

  handlers.onStatus('connected');

  const send = async (event: string, payload: any) => {
    try {
      const result = await channel.send({ type: 'broadcast', event, payload });
      return result === 'ok';
    } catch {
      return false;
    }
  };

  const insertEvent = async (type: string, payload: any) => {
    try {
      await db.from('raid_events').insert({ room: 'main', type, payload });
    } catch (error) {
      console.warn('[raid_events] 写入失败', type, error);
    }
  };

  const upsertState = async (row: Record<string, any>) => {
    try {
      await db.from('raid_state').upsert({ room: 'main', ...row }, { onConflict: 'room' });
    } catch (error) {
      console.warn('[raid_state] upsert 失败', error);
    }
  };

  return {
    clientId,
    db,
    send,
    insertEvent,
    upsertState,
    async track(meta: any) {
      try {
        await channel.track(meta);
      } catch (error) {
        console.warn('presence track 失败', error);
      }
    },
    async leave() {
      try {
        await realtime.removeChannel(channel);
      } catch {}
      try {
        await realtime.disconnect();
      } catch {}
      try {
        oauth?.destroy?.();
      } catch {}
    },
  };
}
