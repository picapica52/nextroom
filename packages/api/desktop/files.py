#!/usr/bin/env python3
# File work in the character's computer for the app: the agent's file tools (agent/tools/sandbox.ts)
# and the user's 「ファイル」 tab (workspaces/store.ts). Run through `docker exec -i` once per
# request: a JSON request on the first line of stdin (an upload's bytes follow it), a JSON answer
# on stdout. The agent's paths may be anywhere in the container, relative ones under /workspace;
# the tab's stay in /workspace.

import base64
import fnmatch
import json
import mimetypes
import os
import re
import shutil
import sys

WORKSPACE = "/workspace"
MAX_LIST_ENTRIES = 1000
MAX_GREP_MATCHES = 200
MAX_GREP_FILE_BYTES = 1024 * 1024
MAX_LINE_CHARS = 300
MAX_READ_CHARS = 100_000
MAX_TAB_FILES = 500
SKIPPED = {"node_modules", ".git", "__pycache__", ".venv"}


class Failure(Exception):
    def __init__(self, message, kind="error"):
        super().__init__(message)
        self.kind = kind


def full_path(path):
    given = (path or "").strip() or "."
    return os.path.normpath(os.path.join(WORKSPACE, os.path.expanduser(given)))


def display(full):
    if full == WORKSPACE:
        return "."
    if full.startswith(WORKSPACE + "/"):
        return full[len(WORKSPACE) + 1 :]
    return full


def is_binary(data):
    return b"\0" in data[:8000]


def lines_of(data):
    return re.split(r"\r?\n", data.decode("utf-8", "replace"))


def glob_regex(pattern):
    """A glob as a regex over a relative path: ** crosses folders, * and ? do not."""
    out, i = "", 0
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
            continue
        if pattern.startswith("**", i):
            out += ".*"
            i += 2
            continue
        if c == "*":
            out += "[^/]*"
        elif c == "?":
            out += "[^/]"
        elif c == "{":
            end = pattern.find("}", i)
            if end < 0:
                out += re.escape(c)
            else:
                out += "(?:" + "|".join(glob_regex(p) for p in pattern[i + 1 : end].split(",")) + ")"
                i = end + 1
                continue
        elif c == "[":
            end = pattern.find("]", i + 1)
            if end < 0:
                out += re.escape(c)
            else:
                body = pattern[i + 1 : end]
                out += "[" + ("^" + body[1:] if body.startswith("!") else body) + "]"
                i = end + 1
                continue
        else:
            out += re.escape(c)
        i += 1
    return out


def glob_matcher(pattern):
    return re.compile(glob_regex(pattern) + r"\Z").match


# The agent's tools


def read(r):
    full = full_path(r["path"])
    if os.path.isdir(full):
        raise Failure(f"{display(full)} is a directory.")
    with open(full, "rb") as f:
        data = f.read()
    encoding = r.get("encoding")
    if encoding in ("base64", "hex"):
        encoded = base64.b64encode(data).decode() if encoding == "base64" else data.hex()
        if len(encoded) > MAX_READ_CHARS:
            return f"{encoded[:MAX_READ_CHARS]}\n[truncated: {len(data)} bytes in all]"
        return encoded
    if is_binary(data):
        kind = mimetypes.guess_type(full)[0] or "application/octet-stream"
        return f'{display(full)} is a binary file ({kind}, {len(data)} bytes). Pass encoding "base64" or "hex" to see its bytes.'
    lines = lines_of(data)
    start = (r.get("offset") or 1) - 1
    end = start + r["limit"] if r.get("limit") else len(lines)
    picked = lines[start:end]
    if r.get("showLineNumbers", True):
        picked = [f"{str(start + i + 1).rjust(6)}→{line}" for i, line in enumerate(picked)]
    text = "\n".join(picked)
    if len(text) <= MAX_READ_CHARS:
        return text
    return f"{text[:MAX_READ_CHARS]}\n[truncated: the file has {len(lines)} lines; read the rest with offset/limit]"


def write(r):
    full = full_path(r["path"])
    if os.path.isdir(full):
        raise Failure("Give the path of a file.")
    if not r.get("overwrite", True) and os.path.lexists(full):
        raise Failure(f"{r['path']} already exists; pass overwrite: true to replace it.")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    data = r["content"].encode("utf-8")
    with open(full, "wb") as f:
        f.write(data)
    return f"Wrote {len(data)} bytes to {display(full)}"


def edit(r):
    full = full_path(r["path"])
    with open(full, encoding="utf-8", newline="") as f:
        text = f.read()
    old, path = r["old_string"], r["path"]
    count = text.count(old)
    if count == 0:
        raise Failure(f"old_string was not found in {path}.")
    if count > 1 and not r.get("replace_all"):
        raise Failure(
            f"old_string was found {count} times in {path}; include more context to make it unique, or pass replace_all: true."
        )
    with open(full, "w", encoding="utf-8", newline="") as f:
        f.write(text.replace(old, r["new_string"]))
    return f"Replaced {count} occurrence{'s' if count > 1 else ''} in {display(full)}"


def list_files(r):
    top = full_path(r.get("path"))
    if not os.path.isdir(top):
        raise Failure(f"{display(top)} is not a directory.")
    patterns = [glob_matcher(p) for p in ([r["pattern"]] if isinstance(r.get("pattern"), str) else r.get("pattern") or [])]
    exclude = r.get("exclude")
    extension = r.get("extension")
    max_depth = r.get("maxDepth", 2)
    filtering = bool(patterns or extension)
    counts = {"dirs": 0, "files": 0, "listed": 0}

    def keep_file(rel, name):
        return (not extension or name.endswith(extension)) and (
            not patterns or any(m(rel) for m in patterns)
        )

    def walk(path, depth):
        try:
            entries = sorted(os.scandir(path), key=lambda e: e.name)
        except OSError:
            return []
        lines = []
        for entry in entries:
            if counts["listed"] >= MAX_LIST_ENTRIES:
                break
            name = entry.name
            if not r.get("showHidden") and name.startswith("."):
                continue
            if exclude and (name == exclude or fnmatch.fnmatchcase(name, exclude)):
                continue
            rel = os.path.relpath(entry.path, top)
            indent = "\t" * depth
            if entry.is_dir(follow_symlinks=False):
                inner = walk(entry.path, depth + 1) if depth + 1 < max_depth else []
                if filtering and not inner:
                    continue
                counts["dirs"] += 1
                counts["listed"] += 1
                lines += [f"{indent}{name}/", *inner]
            elif not r.get("dirsOnly") and keep_file(rel, name):
                counts["files"] += 1
                counts["listed"] += 1
                lines.append(f"{indent}{name}")
        return lines

    lines = walk(top, 0)
    more = " (stopped there; list a narrower path)" if counts["listed"] >= MAX_LIST_ENTRIES else ""
    head = display(top).rstrip("/") + "/"
    return "\n".join(
        [head, *(f"\t{line}" for line in lines), f"{counts['dirs']} directories, {counts['files']} files{more}"]
    )


def delete(r):
    full = full_path(r["path"])
    if full in ("/", WORKSPACE):
        raise Failure(f"{r['path']} cannot be deleted.")
    if not os.path.lexists(full):
        raise Failure(f"{r['path']} does not exist.")
    if os.path.isdir(full) and not os.path.islink(full):
        if r.get("recursive"):
            shutil.rmtree(full)
        else:
            try:
                os.rmdir(full)
            except OSError as error:
                if error.errno == 39:
                    raise Failure(f"{r['path']} is not empty; pass recursive: true to delete it.")
                raise
    else:
        os.remove(full)
    return f"Deleted {display(full)}"


def mkdir(r):
    full = full_path(r["path"])
    if r.get("recursive", True):
        os.makedirs(full, exist_ok=True)
    else:
        os.mkdir(full)
    return f"Created {display(full)}/"


def files_to_search(path, include_hidden):
    segments = path.replace("\\", "/").split("/")
    glob_at = next((i for i, s in enumerate(segments) if re.search(r"[*?[{]", s)), -1)
    base = full_path(path if glob_at < 0 else "/".join(segments[:glob_at]))
    if glob_at < 0 and os.path.isfile(base):
        return [base]
    match = glob_matcher("**/*" if glob_at < 0 else "/".join(segments[glob_at:]))
    found = []
    for root, dirs, names in os.walk(base):
        if not include_hidden:
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            names = [n for n in names if not n.startswith(".")]
        for name in names:
            full = os.path.join(root, name)
            if match(os.path.relpath(full, base)) and os.path.isfile(full):
                found.append(full)
    return sorted(found)


def grep(r):
    try:
        regex = re.compile(r["pattern"], 0 if r.get("caseSensitive", True) else re.IGNORECASE)
    except re.error as error:
        raise Failure(f"The pattern is not a valid regular expression: {error}")
    context = r.get("contextLines", 0)
    max_count = r.get("maxCount")
    out, matches, files = [], 0, 0
    for full in files_to_search(r.get("path") or ".", r.get("includeHidden")):
        if matches >= MAX_GREP_MATCHES:
            break
        try:
            if os.path.getsize(full) > MAX_GREP_FILE_BYTES:
                continue
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            continue
        if is_binary(data):
            continue
        lines = lines_of(data)
        rel = display(full)
        hits = []
        for i, line in enumerate(lines):
            if matches + len(hits) >= MAX_GREP_MATCHES:
                break
            if not regex.search(line):
                continue
            hits.append(i)
            if max_count and len(hits) >= max_count:
                break
        if not hits:
            continue
        files += 1
        matches += len(hits)
        hit = set(hits)
        shown_up_to = -1
        for i in hits:
            start = max(i - context, shown_up_to + 1)
            end = min(i + context, len(lines) - 1)
            if context > 0 and shown_up_to >= 0 and start > shown_up_to + 1:
                out.append("--")
            for j in range(start, end + 1):
                mark = ":" if j in hit else "-"
                out.append(f"{rel}{mark}{j + 1}{mark}{lines[j][:MAX_LINE_CHARS]}")
            shown_up_to = max(shown_up_to, end)
    if matches == 0:
        return "No matches found."
    more = " (stopped there; narrow the search)" if matches >= MAX_GREP_MATCHES else ""
    return "\n".join(out) + f"\n\n{matches} matches in {files} files{more}"


# The 「ファイル」 tab: /workspace only


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
    "read": read,
    "write": write,
    "edit": edit,
    "list": list_files,
    "delete": delete,
    "mkdir": mkdir,
    "grep": grep,
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
