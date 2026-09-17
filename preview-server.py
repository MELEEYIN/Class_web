"""临时预览服务器（只在你本机跑，跑完可以删）

为什么不用 `python -m http.server`：
    本地没有 Cloudflare Worker，`/api/notice` 会 404，
    首页的通知栏就会显示「通知暂时读不到」。

这个脚本做三件事：
    1. 照常发 site/ 下的静态文件；
    2. 把 /api/bangumi/... 转发到中转站（线上是 Worker 在做同样的事）；
    3. **在本机实现一套 /api/* 后台**，让 /admin.html 能真的登录和发布：
       · 管理密码：第一次在后台输入的密码会成为本机密码（只存 sha256，文件在本目录）
       · 通知数据：存本目录 .preview-notify.json，发布后首页通知栏立刻能看到
       · 没有发布过任何通知时，/api/notice 仍然给一份假数据，方便看通知栏的样子

想重来（忘掉密码 / 清空通知）：删掉本目录的 .preview-notify.json 即可。
"""

import hashlib
import json
import os
import re
import secrets
import sys
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "site")
STORE = os.path.join(HERE, ".preview-notify.json")
FILES_DIR = os.path.join(HERE, ".preview-files")   # 本地预览的附件目录（已 gitignore）
MAX_FILE_BYTES = 5 * 1024 * 1024
FILE_TYPES = {
    "png": ("image/png", True), "jpg": ("image/jpeg", True), "jpeg": ("image/jpeg", True),
    "gif": ("image/gif", True), "webp": ("image/webp", True),
    "pdf": ("application/pdf", False), "txt": ("text/plain; charset=utf-8", False),
    "doc": ("application/msword", False),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", False),
    "xls": ("application/vnd.ms-excel", False),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", False),
    "ppt": ("application/vnd.ms-powerpoint", False),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", False),
    "zip": ("application/zip", False),
}


def safe_file_name(raw):
    s2 = str(raw or "").replace("\\", "/").split("/")[-1]
    s2 = "".join(ch for ch in s2 if ord(ch) >= 32 and ord(ch) != 127).strip() or "file"
    dot = s2.rfind(".")
    if dot > 0:
        return s2[:dot][:60] + s2[dot:].lower()
    return s2[:60]


def pick_file_type(name):
    ext = str(name or "").rsplit(".", 1)[-1].lower() if "." in str(name or "") else ""
    t = FILE_TYPES.get(ext)
    return t if t else (None, False)
PORT = 8931

# 本机预览的默认管理密码（想换：删掉 .preview-notify.json 再改这里，
# 或者启动时给环境变量 PREVIEW_ADMIN_PASSWORD 赋一个新值）
DEFAULT_PASSWORD = os.environ.get("PREVIEW_ADMIN_PASSWORD", "45110")

# 和 Cloudflare Worker（worker/index.js）保持一致的字段与上限
MAX_ITEMS = 40
MAX_TITLE = 60
MAX_BODY = 500
MAX_SOURCE = 24
LEVELS = ["info", "ok", "warn", "danger"]

# 请求路径要映射到文件，URL 里不带 /site 前缀
os.chdir(ROOT)


def iso(minutes_ago=0):
    return (datetime.now() - timedelta(minutes=minutes_ago)).isoformat(timespec="seconds")


def str_clean(v, max_len):
    """和 worker 的 str() 一样：压空白、去首尾、截断"""
    s = " ".join(str("" if v is None else v).split())
    return s[:max_len] if max_len else s


def body_clean(v, max_len):
    """和 worker 的 bodyText() 一样：保留换行，压掉连续空行"""
    s = str("" if v is None else v).replace("\r\n", "\n").replace("\r", "\n")
    while "\n\n\n" in s:
        s = s.replace("\n\n\n", "\n\n")
    s = s.strip()
    return s[:max_len] if max_len else s


def sha256_hex(text):
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# 本机存储
# ---------------------------------------------------------------------------
def load_store():
    """读取本机存储；文件不存在时用默认密码初始化一份。"""
    try:
        with open(STORE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("bad store")
        data.setdefault("hash", "")
        data.setdefault("items", [])
        data.setdefault("updatedAt", "")
        data.setdefault("updatedBy", "")
        if not data["hash"]:
            data["hash"] = sha256_hex(DEFAULT_PASSWORD)
            save_store(data)
        return data
    except FileNotFoundError:
        data = {"hash": sha256_hex(DEFAULT_PASSWORD), "items": [], "updatedAt": "", "updatedBy": ""}
        try:
            save_store(data)
        except Exception:
            pass
        return data
    except Exception:
        return {"hash": sha256_hex(DEFAULT_PASSWORD), "items": [], "updatedAt": "", "updatedBy": ""}


def save_store(data):
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STORE)


def sanitize_item(raw, fallback_at):
    if not isinstance(raw, dict):
        return None
    title = str_clean(raw.get("title"), MAX_TITLE)
    body = body_clean(raw.get("body"), MAX_BODY)
    if not title and not body:
        return None
    level = raw.get("level") if raw.get("level") in LEVELS else "info"
    return {
        "id": str_clean(raw.get("id"), 40) or ("n_" + secrets.token_hex(4)),
        "title": title,
        "body": body,
        "level": level,
        "source": str_clean(raw.get("source"), MAX_SOURCE),
        "pinned": True if raw.get("pinned") is None else bool(raw.get("pinned")),
        "at": str_clean(raw.get("at"), 40) or fallback_at or now_iso(),
    }


def public_payload(items):
    """和 worker 的 publicPayload 一样：置顶优先，其余按时间倒序，最近 12 条"""
    ordered = sorted(
        items,
        key=lambda x: (0 if x.get("pinned") else 1, _neg_str(x.get("at", ""))),
    )
    current = next((x for x in ordered if x.get("pinned")), None)
    return {"ok": True, "storage": "local", "current": current, "recent": ordered[:12]}


def _neg_str(s):
    # 让时间倒序：字符串比较反过来用，这里用取反的元组技巧不方便，直接返回负时间戳
    try:
        return -datetime.fromisoformat(str(s).replace("Z", "")).timestamp()
    except Exception:
        return 0


# ---------------- 公共事务（和 worker 的 sanitizePublicItem 保持一致的字段白名单） ----------------
PUBLIC_KINDS = ("date", "weekly")


def sanitize_public_item(raw):
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "date")
    if kind not in PUBLIC_KINDS:
        kind = "date"
    title = str_clean(raw.get("title"), 60)
    if not title:
        return None
    item = {
        "id": str_clean(raw.get("id"), 40) or ("ev_" + uuid.uuid4().hex[:12]),
        "title": title,
        "kind": kind,
        "location": str_clean(raw.get("location"), 40),
        "note": str_clean(raw.get("note"), 300),
        "owner": str_clean(raw.get("owner"), 20) or "主机",
        "allDay": bool(raw.get("allDay")),
        "start": str_clean(raw.get("start"), 5),
        "end": str_clean(raw.get("end"), 5),
        "at": str_clean(raw.get("at"), 40) or now_iso(),
        "repeat": str_clean(raw.get("repeat"), 10) or "none",
    }
    if kind == "weekly":
        try:
            day = int(raw.get("day") or 1)
        except Exception:
            day = 1
        item["kind"] = "weekly"
        item["day"] = day if 1 <= day <= 7 else 1
    else:
        item["kind"] = "date"
        item["date"] = str_clean(raw.get("date"), 10)
        if not item["date"]:
            return None
    return item


def sanitize_public_items(items):
    out = []
    for raw in (items or []):
        it = sanitize_public_item(raw)
        if it:
            out.append(it)
    return out[:80]


# 没发布过任何通知时的演示数据（原来的行为，保留）
DEMO_NOTICE = {
    "ok": True,
    "storage": "preview",
    "updatedAt": iso(4),
    "current": {
        "id": "demo-1",
        "title": "明天第一节课调到 C-5-201",
        "body": "第一节大学英语改到 C-5-201。\n请提前十分钟到，带上课本。",
        "level": "warn",
        "source": "班长",
        "at": iso(4),
    },
    "recent": [
        {
            "id": "demo-1",
            "title": "明天第一节课调到 C-5-201",
            "body": "第一节大学英语改到 C-5-201。\n请提前十分钟到，带上课本。",
            "level": "warn",
            "source": "班长",
            "at": iso(4),
        },
        {
            "id": "demo-2",
            "title": "周五下午开班会",
            "body": "15:00 在 C-5-101，请带学生证。",
            "level": "info",
            "source": "班长",
            "at": iso(180),
        },
        {
            "id": "demo-3",
            "title": "英语四级报名今天截止",
            "body": "还没报名的同学记得今晚 24:00 前去教务系统提交。",
            "level": "danger",
            "source": "学委",
            "at": iso(600),
        },
    ],
}


class Handler(SimpleHTTPRequestHandler):
    server_version = "ClassWebPreview/2.0"

    # ---------------- 工具 ----------------
    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _provided_key(self, body=None):
        key = self.headers.get("x-cw-key") or ""
        if not key and body:
            key = str(body.get("key") or "")
        return key

    # ---------------- GET ----------------
    def do_GET(self):
        path = self.path.split("?")[0]
        store = load_store()

        # 附件读取（本地：文件落在 .preview-files/）
        if path.startswith("/api/file/"):
            fid = path[len("/api/file/"):]
            if not re.match(r"^f_[A-Za-z0-9]{4,32}$", fid or ""):
                self.send_error(404)
                return
            fp = os.path.join(FILES_DIR, fid + ".bin")
            mp = os.path.join(FILES_DIR, fid + ".json")
            if not (os.path.exists(fp) and os.path.exists(mp)):
                self.send_error(404)
                return
            meta = json.loads(open(mp, encoding="utf-8").read())
            with open(fp, "rb") as fh:
                raw = fh.read()
            self.send_response(200)
            self.send_header("content-type", meta.get("type") or "application/octet-stream")
            self.send_header("content-length", str(len(raw)))
            self.send_header("cache-control", "public, max-age=31536000, immutable")
            self.send_header("x-content-type-options", "nosniff")
            if not str(meta.get("type") or "").startswith("image/"):
                ascii_name = str(meta.get("name") or "file").encode("ascii", "replace").decode()
                self.send_header("content-disposition", 'attachment; filename="%s"' % ascii_name)
            self.end_headers()
            self.wfile.write(raw)
            return

        if path == "/api/notice":
            items = store.get("items") or []
            if items:
                payload = public_payload(items)
                payload["updatedAt"] = store.get("updatedAt", "")
                self._json(payload)
            else:
                self._json(DEMO_NOTICE)
            return

        if path == "/api/state":
            provided = self._provided_key()
            if not store.get("hash"):
                # 还没设过密码：让后台显示「设置密码」表单
                self._json({"ok": True, "initialized": False, "storage": "local",
                            "fixed": False, "items": [], "updatedAt": ""})
                return
            if not provided:
                # 已设过密码、但还没带密码来：只是「需要登录」，不是鉴权失败
                self._json({"ok": True, "initialized": True, "storage": "local",
                            "fixed": False, "items": [], "updatedAt": ""})
                return
            if sha256_hex(provided) != store["hash"]:
                self._json({"ok": False, "error": "密码不对，或者还没初始化。"}, 401)
                return
            self._json({
                "ok": True,
                "initialized": True,
                "storage": "local",
                "fixed": False,
                "source": "preview",
                "items": store.get("items") or [],
                "updatedAt": store.get("updatedAt", ""),
            })
            return

        if path == "/api/public-events":
            # 公共事务：全班共用的一份清单（线上存在 Cloudflare KV 里，本地存在 .preview-notify.json）
            self._json({
                "ok": True,
                "source": "local",
                "updatedAt": store.get("publicUpdatedAt", ""),
                "items": sanitize_public_items(store.get("publicItems")),
            })
            return

        if path.startswith("/api/bangumi/"):
            # 本地没有 Worker，就直接转发到中转站（线上是 Worker 在 /api/bangumi 里做同样的事）。
            self._proxy_bangumi()
            return

        if path.startswith("/api/"):
            self._json({"ok": False, "error": "没有这个接口。"}, 404)
            return

        return super().do_GET()

    def _proxy_bangumi(self, method="GET", body=None):
        upstream = "https://bgmapi.anibt.net" + self.path[len("/api/bangumi"):]
        try:
            data = None
            headers = {
                "accept": "application/json",
                "user-agent": "ClassWebPreview/1.0",
            }
            if method == "POST":
                # v0 搜索走 POST + JSON body（官方 api.bgm.tv 国内连不上，本地同样中转）
                data = json.dumps(body if isinstance(body, dict) else {}, ensure_ascii=False).encode("utf-8")
                headers["content-type"] = "application/json"
            req = urllib.request.Request(upstream, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=15) as r:
                raw = r.read()
            self.send_response(200)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(raw)))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
        except Exception as e:  # noqa: BLE001
            self._json({"ok": False, "error": "本地预览的中转失败: %s" % e}, 502)

    # ---------------- POST ----------------
    def do_POST(self):
        path = self.path.split("?")[0]
        if not path.startswith("/api/"):
            self.send_error(404)
            return

        # 附件上传：原始字节，必须在 self._read_body() 之前处理，
        # 否则文件内容会被当成 JSON 读掉，后面再读就会一直等（卡住）。
        if path == "/api/file":
            # 只从请求头取密码：绝不能再调 _read_body()（那会把文件字节读掉/卡住）
            provided = str(self.headers.get("x-cw-key") or "").strip()
            if not store.get("hash") or not provided or sha256_hex(provided) != store["hash"]:
                self._json({"ok": False, "error": "上传附件需要管理密码。"}, 401)
                return
            raw_name = self.headers.get("x-cw-name") or ""
            try:
                raw_name = urllib.parse.unquote(raw_name)
            except Exception:
                pass
            name = safe_file_name(raw_name)
            mime, is_image = pick_file_type(name)
            if not mime:
                self._json({"ok": False, "error": "不支持这种文件。只收：图片(png/jpg/gif/webp)、pdf、txt、Word/Excel/PPT、zip。"}, 415)
                return
            length = int(self.headers.get("content-length") or 0)
            if length <= 0:
                self._json({"ok": False, "error": "文件是空的。"}, 400)
                return
            if length > MAX_FILE_BYTES:
                self._json({"ok": False, "error": "文件太大：单个最大 5MB。"}, 413)
                return
            data = self.rfile.read(length)
            fid = "f_" + secrets.token_hex(5)
            os.makedirs(FILES_DIR, exist_ok=True)
            with open(os.path.join(FILES_DIR, fid + ".bin"), "wb") as fh:
                fh.write(data)
            meta = {"name": name, "type": mime, "image": is_image, "size": len(data), "at": now_iso()}
            with open(os.path.join(FILES_DIR, fid + ".json"), "w", encoding="utf-8") as fh:
                fh.write(json.dumps(meta, ensure_ascii=False))
            self._json({"ok": True, "file": {"id": fid, "name": name, "type": mime, "image": is_image, "size": len(data)}})
            return

        body = self._read_body()
        store = load_store()

        # Bangumi 中转（v0 搜索是 POST）——放在鉴权之前，它不需要密码
        if path.startswith("/api/bangumi/"):
            self._proxy_bangumi("POST", body)
            return

        # 登录（本机默认密码见文件顶部 DEFAULT_PASSWORD）
        if path == "/api/login":
            password = str(body.get("password") or "")
            if len(password) < 5:
                self._json({"ok": False, "error": "密码至少 5 位。"}, 400)
                return
            if not store.get("hash"):
                store["hash"] = sha256_hex(password)
                save_store(store)
                self._json({"ok": True, "initialized": True, "storage": "local", "fixed": False,
                            "message": "管理密码已设置（存在本机的 .preview-notify.json 里）。请记住它。"})
                return
            if sha256_hex(password) != store["hash"]:
                self._json({"ok": False, "error": "密码不对。"}, 401)
                return
            self._json({"ok": True, "initialized": True, "storage": "local", "fixed": False})
            return

        if path == "/api/public-event":
            provided = self._provided_key(body)
            if not store.get("hash") or not provided or sha256_hex(provided) != store["hash"]:
                self._json({"ok": False, "error": "发布公共事务需要管理密码。"}, 401)
                return

            action = str(body.get("action") or "publish")
            items = sanitize_public_items(store.get("publicItems"))

            if action == "clear":
                store["publicItems"] = []
                store["publicUpdatedAt"] = now_iso()
                save_store(store)
                self._json({"ok": True, "source": "local", "updatedAt": store["publicUpdatedAt"],
                            "items": [], "cleared": True})
                return

            if action == "delete":
                ids = [str_clean(x, 40) for x in (body.get("ids") or []) if str_clean(x, 40)]
                one = str_clean(body.get("id"), 40)
                if one and one not in ids:
                    ids.append(one)
                if ids:
                    items = [x for x in items if x.get("id") not in ids]
            else:
                item = sanitize_public_item(body.get("item") or body)
                if item is None:
                    self._json({"ok": False, "error": "标题不能为空；kind=date 时还要有合法日期。"}, 400)
                    return
                item["at"] = now_iso()
                idx = next((i for i, x in enumerate(items) if x.get("id") == item["id"]), -1)
                if idx >= 0:
                    items[idx] = item
                else:
                    items.insert(0, item)
                items = items[:80]

            store["publicItems"] = items
            store["publicUpdatedAt"] = now_iso()
            save_store(store)
            self._json({"ok": True, "source": "local", "updatedAt": store["publicUpdatedAt"], "items": items})
            return

        if path in ("/api/publish", "/api/reset"):
            provided = self._provided_key(body)
            if not store.get("hash") or not provided or sha256_hex(provided) != store["hash"]:
                self._json({"ok": False, "error": "密码不对，或者还没初始化。"}, 401)
                return

            if path == "/api/reset":
                store["items"] = []
                store["updatedAt"] = now_iso()
                save_store(store)
                self._json({"ok": True, "items": [], "updatedAt": store["updatedAt"]})
                return

            items = store.get("items") or []
            action = str(body.get("action") or "publish")

            if action == "delete":
                del_id = str_clean(body.get("id"), 40)
                items = [x for x in items if x.get("id") != del_id]
            else:
                item = sanitize_item(body.get("item") or body, store.get("updatedAt"))
                if item is None:
                    self._json({"ok": False, "error": "标题和正文不能都是空的。"}, 400)
                    return
                item["source"] = item["source"] or "主机"
                item["at"] = now_iso()
                idx = next((i for i, x in enumerate(items) if x.get("id") == item["id"]), -1)
                if idx >= 0:
                    items[idx] = item
                else:
                    items.insert(0, item)
                # 置顶唯一
                if item["pinned"]:
                    for x in items:
                        if x.get("id") != item["id"]:
                            x["pinned"] = False
                items = items[:MAX_ITEMS]

            store["items"] = items
            store["updatedBy"] = str_clean(body.get("by"), MAX_SOURCE) or store.get("updatedBy") or "主机"
            store["updatedAt"] = now_iso()
            save_store(store)
            self._json({"ok": True, "items": items, "updatedAt": store["updatedAt"]})
            return

        self._json({"ok": False, "error": "没有这个接口。"}, 404)

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


if __name__ == "__main__":
    print("预览服务器： http://127.0.0.1:%d/" % PORT)
    print("  · 首页      http://127.0.0.1:%d/index.html" % PORT)
    print("  · 通知管理  http://127.0.0.1:%d/admin.html" % PORT)
    print("  · 通知数据  http://127.0.0.1:%d/api/notice" % PORT)
    print("  · 管理密码  默认 %s（存在 %s，改密码就删掉或编辑这个文件）" % (DEFAULT_PASSWORD, os.path.basename(STORE)))
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
