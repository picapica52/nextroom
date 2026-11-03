# A character's Linux desktop: Xvfb with fluxbox and Chromium, shown to the app through noVNC.
# The app builds it on first use (agent/tools/desktop.ts) and tags it by these files' contents.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
	LANG=C.UTF-8 \
	TZ=Asia/Tokyo

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		xvfb x11vnc fluxbox xterm xdotool x11-utils imagemagick \
		novnc websockify python3 python3-pil \
		chromium dbus-x11 xdg-utils \
		fonts-noto-cjk fonts-noto-color-emoji fonts-dejavu-core \
		ca-certificates curl git procps tzdata unzip \
	&& rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /bin/bash user \
	&& mkdir -p /workspace && chown user:user /workspace

COPY view.html /usr/share/novnc/nextroom.html
COPY start.sh /usr/local/bin/nextroom-desktop
COPY control.py /usr/local/bin/nextroom-control
RUN chmod 755 /usr/local/bin/nextroom-desktop /usr/local/bin/nextroom-control

WORKDIR /workspace
EXPOSE 6080
CMD ["/usr/local/bin/nextroom-desktop"]
