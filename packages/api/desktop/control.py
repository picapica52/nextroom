#!/usr/bin/env python3
# Works the desktop for the app (agent/tools/desktop.ts), which keeps one of these running per
# desktop through `docker exec -i`: one JSON request per line on stdin, one answer per line on
# stdout. The screen is read through MIT-SHM with a connection kept open, so a screenshot costs
# neither a process nor a copy through a pipe.

import base64
import ctypes
import hashlib
import io
import json
import subprocess
import sys

from PIL import Image

IPC_PRIVATE = 0
IPC_CREAT = 0o1000
IPC_RMID = 0
Z_PIXMAP = 2
ALL_PLANES = ctypes.c_ulong(-1).value


class XImage(ctypes.Structure):
    _fields_ = [
        ("width", ctypes.c_int),
        ("height", ctypes.c_int),
        ("xoffset", ctypes.c_int),
        ("format", ctypes.c_int),
        ("data", ctypes.c_void_p),
        ("byte_order", ctypes.c_int),
        ("bitmap_unit", ctypes.c_int),
        ("bitmap_bit_order", ctypes.c_int),
        ("bitmap_pad", ctypes.c_int),
        ("depth", ctypes.c_int),
        ("bytes_per_line", ctypes.c_int),
        ("bits_per_pixel", ctypes.c_int),
    ]


class ShmInfo(ctypes.Structure):
    _fields_ = [
        ("shmseg", ctypes.c_ulong),
        ("shmid", ctypes.c_int),
        ("shmaddr", ctypes.c_void_p),
        ("readOnly", ctypes.c_int),
    ]


class ShmScreen:
    """The root window, read into a shared memory segment the X server writes to."""

    def __init__(self):
        x11 = ctypes.CDLL("libX11.so.6")
        xext = ctypes.CDLL("libXext.so.6")
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
        x11.XOpenDisplay.restype = ctypes.c_void_p
        for name in ("XDefaultScreen", "XDefaultDepth", "XDisplayWidth", "XDisplayHeight"):
            getattr(x11, name).argtypes = [ctypes.c_void_p] + ([] if name == "XDefaultScreen" else [ctypes.c_int])
        x11.XRootWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
        x11.XRootWindow.restype = ctypes.c_ulong
        x11.XDefaultVisual.argtypes = [ctypes.c_void_p, ctypes.c_int]
        x11.XDefaultVisual.restype = ctypes.c_void_p
        x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
        xext.XShmQueryExtension.argtypes = [ctypes.c_void_p]
        xext.XShmCreateImage.argtypes = [
            ctypes.c_void_p,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_int,
            ctypes.c_char_p,
            ctypes.POINTER(ShmInfo),
            ctypes.c_uint,
            ctypes.c_uint,
        ]
        xext.XShmCreateImage.restype = ctypes.POINTER(XImage)
        xext.XShmAttach.argtypes = [ctypes.c_void_p, ctypes.POINTER(ShmInfo)]
        xext.XShmGetImage.argtypes = [
            ctypes.c_void_p,
            ctypes.c_ulong,
            ctypes.POINTER(XImage),
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_ulong,
        ]
        libc.shmget.argtypes = [ctypes.c_int, ctypes.c_size_t, ctypes.c_int]
        libc.shmat.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_int]
        libc.shmat.restype = ctypes.c_void_p
        libc.shmctl.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]

        display = x11.XOpenDisplay(None)
        if not display or not xext.XShmQueryExtension(display):
            raise RuntimeError("MIT-SHM is unavailable")
        screen = x11.XDefaultScreen(display)
        self.width = x11.XDisplayWidth(display, screen)
        self.height = x11.XDisplayHeight(display, screen)
        self.info = ShmInfo()
        image = xext.XShmCreateImage(
            display,
            x11.XDefaultVisual(display, screen),
            x11.XDefaultDepth(display, screen),
            Z_PIXMAP,
            None,
            ctypes.byref(self.info),
            self.width,
            self.height,
        )
        if not image:
            raise RuntimeError("XShmCreateImage failed")
        fields = image.contents
        if fields.bits_per_pixel != 32 or fields.byte_order != 0:
            raise RuntimeError("unexpected pixel format")
        self.stride = fields.bytes_per_line
        self.size = self.stride * self.height
        shmid = libc.shmget(IPC_PRIVATE, self.size, IPC_CREAT | 0o600)
        if shmid < 0:
            raise RuntimeError("shmget failed")
        address = libc.shmat(shmid, None, 0)
        # Marked for removal now: it goes once both this process and the X server detach.
        libc.shmctl(shmid, IPC_RMID, None)
        if address in (None, ctypes.c_void_p(-1).value):
            raise RuntimeError("shmat failed")
        self.info.shmid = shmid
        self.info.shmaddr = address
        self.info.readOnly = 0
        fields.data = address
        if not xext.XShmAttach(display, ctypes.byref(self.info)):
            raise RuntimeError("XShmAttach failed")
        x11.XSync(display, 0)
        self.x11, self.xext, self.display, self.image = x11, xext, display, image
        self.root = x11.XRootWindow(display, screen)

    def grab(self):
        if not self.xext.XShmGetImage(self.display, self.root, self.image, 0, 0, ALL_PLANES):
            raise RuntimeError("XShmGetImage failed")
        raw = ctypes.string_at(self.info.shmaddr, self.size)
        image = Image.frombuffer("RGB", (self.width, self.height), raw, "raw", "BGRX", self.stride, 1)
        return image, raw


def grab_with_import():
    shot = subprocess.run(["import", "-silent", "-window", "root", "ppm:-"], capture_output=True, timeout=15)
    if shot.returncode or not shot.stdout:
        raise RuntimeError("could not take a screenshot")
    image = Image.open(io.BytesIO(shot.stdout))
    return image, image.tobytes()


try:
    SCREEN = ShmScreen()
except (OSError, RuntimeError) as error:
    print(f"nextroom-control: {error}; screenshots go through import", file=sys.stderr)
    SCREEN = None


def capture():
    image, raw = SCREEN.grab() if SCREEN else grab_with_import()
    jpeg = io.BytesIO()
    image.save(jpeg, "JPEG", quality=80)
    title = subprocess.run(
        ["xdotool", "getactivewindow", "getwindowname"], capture_output=True, text=True, timeout=5
    )
    return {
        "image": base64.b64encode(jpeg.getvalue()).decode("ascii"),
        "frame": hashlib.blake2b(raw, digest_size=16).hexdigest(),
        "title": title.stdout.strip() if title.returncode == 0 else "",
    }


def handle(request):
    if "xdotool" in request:
        done = subprocess.run(["xdotool", *request["xdotool"]], capture_output=True, text=True, timeout=30)
        if done.returncode:
            raise RuntimeError(done.stderr.strip().splitlines()[-1] if done.stderr.strip() else f"exit {done.returncode}")
        return {}
    if "launch" in request:
        # setsid -f leaves the app to init, which reaps it when it exits.
        subprocess.run(
            ["setsid", "-f", *request["launch"]],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
        return {}
    if "capture" in request:
        return capture()
    raise RuntimeError("unknown request")


for line in sys.stdin:
    if not line.strip():
        continue
    request = json.loads(line)
    try:
        answer = {"id": request.get("id"), **handle(request)}
    except Exception as error:
        answer = {"id": request.get("id"), "error": str(error) or type(error).__name__}
    sys.stdout.write(json.dumps(answer, separators=(",", ":")) + "\n")
    sys.stdout.flush()
