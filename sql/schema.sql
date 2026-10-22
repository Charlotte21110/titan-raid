-- 泰坦讨伐战 · 需要的两张表
-- 在 CloudBase Postgres 的 SQL 编辑器里整段执行即可。

-- 战斗事件流（append-only，只插入不更新）
CREATE TABLE IF NOT EXISTS public.raid_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room text NOT NULL DEFAULT 'main',
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 房间状态（一个房间一行，房主定时 upsert）
CREATE TABLE IF NOT EXISTS public.raid_state (
  room text PRIMARY KEY,
  boss_hp integer NOT NULL DEFAULT 12000,
  boss_hp_max integer NOT NULL DEFAULT 12000,
  phase text NOT NULL DEFAULT 'idle',
  round integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 前端是匿名身份，直接把写权限给 anon（这个 demo 没开 RLS）
GRANT SELECT, INSERT ON public.raid_events TO anon;
GRANT SELECT, INSERT, UPDATE ON public.raid_state TO anon;
GRANT SELECT ON public.raid_events, public.raid_state TO authenticated;

-- 把两张表加进实时发布，postgres_changes 才会有事件
-- publication 名字以你环境里的实际值为准，一般叫 cloudbase_realtime
ALTER PUBLICATION cloudbase_realtime ADD TABLE public.raid_events, public.raid_state;

-- CDC 那条连接还需要读权限，角色名按下面这个查出来填：
--   SELECT rolname FROM pg_roles WHERE rolname LIKE '%realtime%';
-- GRANT SELECT ON public.raid_events, public.raid_state TO <上面查到的角色>;
