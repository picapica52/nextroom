#!/usr/bin/env python3
# The user's 「ファイル」 tab (workspaces/store.ts) in the character's computer, /workspace only. Run
# through `docker exec -i` once per request: a JSON request on the first line of stdin (an upload's
# bytes follow it), a JSON answer on stdout.

import json
import os
import shutil
import sys

WORKSPACE = "/workspace"
MAX_TAB_FILES = 500
SKIPPED = {"node_modules", ".git", "__pycache__", ".venv"}


class Failure(Exception):
    def __init__(self, message, kind="error"):
        super().__init__(message)
        self.kind = kind


def display(full):
    if full == WORKSPACE:
        return "."
    if full.startswith(WORKSPACE + "/"):
        return full[len(WORKSPACE) + 1 :]
    return full


def in_workspace(path, entry=True):
    full = os.path.normpath(os.path.join(WORKSPACE, path or "."))
    if full != WORKSPACE and not full.startswith(WORKSPACE + "/"):
        raise Failure("ファイルがありません", "not_found")
    if entry and full == WORKSPACE:
        raise Failure("パスを指定してください", "bad_request")
    return full


def tree(_r):
    out = []

    def walk(path):
        for entry in sorted(os.scandir(path), key=lambda e: e.name):
            if len(out) >= MAX_TAB_FILES:
                return
            try:
                info = entry.stat()
            except OSError:
                continue
            is_dir = entry.is_dir()
            out.append(
                {
                    "path": os.path.relpath(entry.path, WORKSPACE),
                    "size": 0 if is_dir else info.st_size,
                    "dir": is_dir,
                    "modified_at": info.st_mtime,
                }
            )
            if is_dir and not entry.is_symlink() and entry.name not in SKIPPED:
                walk(entry.path)

    walk(WORKSPACE)
    return sorted(out, key=lambda f: f["path"])


def save(r, data):
    base = in_workspace(r.get("dir"), entry=False)
    full = os.path.normpath(os.path.join(base, r["path"]))
    if not full.startswith(base + "/"):
        raise Failure(f"不正なパスです: {r['path']}", "bad_request")
    if os.path.isdir(full):
        raise Failure(f"同じ名前のフォルダがあります: {r['path']}", "conflict")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "wb") as f:
        f.write(data)
    return None


def make_folder(r):
    full = in_workspace(r["path"])
    if os.path.lexists(full):
        raise Failure(f"同じ名前があります: {r['path']}", "conflict")
    os.makedirs(full)
    return None


def move(r):
    source, target = in_workspace(r["from"]), in_workspace(r["to"])
    if source == target:
        return None
    if not os.path.lexists(source):
        raise Failure(f"ありません: {r['from']}", "not_found")
    if target.startswith(source + "/"):
        raise Failure("フォルダをその中には移動できません", "bad_request")
    if os.path.lexists(target):
        raise Failure(f"同じ名前があります: {r['to']}", "conflict")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    os.rename(source, target)
    return None


def remove(r):
    full = in_workspace(r["path"])
    if not os.path.lexists(full):
        raise Failure(f"ありません: {r['path']}", "not_found")
    if os.path.isdir(full) and not os.path.islink(full):
        shutil.rmtree(full)
    else:
        os.remove(full)
    return None


def file_of(r):
    """The file a download sends, as the path `cat` is given."""
    full = in_workspace(r["path"], entry=False)
    if not os.path.isfile(full):
        raise Failure("ファイルがありません", "not_found")
    return full


OPS = {
    "tree": tree,
    "make_folder": make_folder,
    "move": move,
    "remove": remove,
    "file": file_of,
}


def main():
    stdin = sys.stdin.buffer
    request = json.loads(stdin.readline())
    op = request.get("op")
    try:
        if op == "save":
            result = save(request, stdin.read())
        elif op in OPS:
            result = OPS[op](request)
        else:
            raise Failure(f"Unknown request: {op}")
        answer = {"result": result}
    except Failure as error:
        answer = {"error": str(error), "kind": error.kind}
    except FileNotFoundError as error:
        answer = {"error": f"{display(error.filename or '')} does not exist.", "kind": "not_found"}
    except OSError as error:
        where = f": {display(error.filename)}" if error.filename else ""
        answer = {"error": f"{error.strerror or error}{where}", "kind": "error"}
    sys.stdout.write(json.dumps(answer, ensure_ascii=False))


main()
