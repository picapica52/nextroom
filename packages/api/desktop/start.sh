#!/bin/sh
# Starts the display, the window manager, two VNC servers (one only to watch, one to take over)
# and websockify, which serves noVNC and turns the token in the URL into one of the two.
set -u

# The workspace and the home are volumes of their own, kept as the character's user's (a home
# from before may be another user id's).
for dir in /workspace /home/user; do
	[ "$(stat -c %u "$dir")" = "$(id -u user)" ] || chown -R user:user "$dir"
done

# A container stopped and started again keeps /tmp, and with it the last display's lock when
# Xvfb was killed before it could remove it; Xvfb then refuses to start.
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1
mkdir -p /tmp/.X11-unix
chown root:root /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

as_user() {
	runuser -u user -- env HOME=/home/user DISPLAY=:1 LANG=C.UTF-8 "$@"
}

as_user Xvfb :1 -screen 0 1280x800x24 -nolisten tcp &
for _ in $(seq 100); do
	as_user xdpyinfo >/dev/null 2>&1 && break
	sleep 0.1
done

# A plain background: the style's wallpaper setter fails here and says so in a dialog.
as_user sh -c 'mkdir -p ~/.fluxbox && echo "background: none" >~/.fluxbox/overlay'
# A clock without seconds, so that a screen nothing happened on stays the same frame (control.py).
as_user sh -c 'f=~/.fluxbox/init; touch "$f"; sed -i "/^session.screen0.strftimeFormat:/d" "$f"; echo "session.screen0.strftimeFormat: %H:%M" >>"$f"'
as_user fbsetroot -solid "#2f3136"
as_user fluxbox >/dev/null 2>&1 &
as_user x11vnc -display :1 -forever -shared -viewonly -nopw -localhost -rfbport 5900 -quiet &
as_user x11vnc -display :1 -forever -shared -nopw -localhost -rfbport 5901 -quiet &

printf 'view: localhost:5900\ncontrol: localhost:5901\n' >/tmp/vnc-tokens
as_user websockify --web=/usr/share/novnc --token-plugin=TokenFile --token-source=/tmp/vnc-tokens \
	0.0.0.0:6080 &

wait
