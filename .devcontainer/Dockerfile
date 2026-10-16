FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG BUN_VERSION=1.4.2

RUN apt-get update \
	&& apt-get install -y --no-install-recommends unzip \
	&& rm -rf /var/lib/apt/lists/*

USER vscode

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN mkdir -p /home/vscode/.claude /home/vscode/.config/gh

ENV PATH="/home/vscode/.bun/bin:/home/vscode/.local/bin:${PATH}"
