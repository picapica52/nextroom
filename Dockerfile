FROM oven/bun:1.4.2

WORKDIR /app

ENV TURBO_TELEMETRY_DISABLED=1

# The characters' desktops and workspace containers are made through the host's Docker.
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx

COPY . .
RUN bun install --frozen-lockfile && bun run build

# From inside the container, the host's Ollama / LM Studio and speech.cpp are at host.docker.internal.
# apps/server/.env (read by compose) overrides these.
ENV NODE_ENV=production \
	DATA_DIR=/data \
	WEB_DIST=/app/apps/web/dist \
	OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:11434/v1 \
	SPEECH_URL=http://host.docker.internal:8080

WORKDIR /app/apps/server
EXPOSE 8767 8768
CMD ["bun", "run", "src/index.ts"]
