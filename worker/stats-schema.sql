-- 自建访问统计的表结构（D1 / SQLite）
--
-- 设计说明：
--   · 每次页面访问写一行；at 是毫秒时间戳，day 是按「北京时间」算出来的日期，
--     这样后台看到的「今天」和你手机上的日期一致。
--   · visitor 不是 IP，而是「IP + UA + 当天盐」的 sha256：每天的盐都不同，
--     所以只能统计「今天有几个不同的人来过」，无法跨天追踪同一个人，
--     也拿不回原始 IP。不种 cookie、不引第三方脚本。
--   · ref 只存来源「域名」（不存完整地址），country 用 Cloudflare 提供的国家码。
--
-- 部署后执行（远端生效）：
--   npx.cmd wrangler@latest d1 execute class-web-stats --remote --file=worker/stats-schema.sql

CREATE TABLE IF NOT EXISTS hits (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,   -- 毫秒时间戳
  day     TEXT    NOT NULL,   -- YYYY-MM-DD（北京时间）
  path    TEXT    NOT NULL,   -- 访问的路径，例如 / 或 /anime
  visitor TEXT    NOT NULL,   -- 当日盐化指纹（不可逆）
  country TEXT,               -- 国家码，例如 CN / US
  ref     TEXT                -- 来源域名，例如 www.baidu.com
);

CREATE INDEX IF NOT EXISTS idx_hits_day ON hits(day);
CREATE INDEX IF NOT EXISTS idx_hits_path ON hits(path);
CREATE INDEX IF NOT EXISTS idx_hits_day_visitor ON hits(day, visitor);
CREATE INDEX IF NOT EXISTS idx_hits_at ON hits(at);
