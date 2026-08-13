# FROM node:22-bookworm-slim AS ui
FROM docker.sre.meitu-int.com/docker-io/node/node:22-bookworm-slim AS ui
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# FROM golang:1.22 AS build
FROM docker.sre.meitu-int.com/docker-io/golang/golang:1.22 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
COPY pkg ./pkg
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} go build -o /out/umodel-server ./cmd/umodel-server

# Runtime image includes /bin/sh for kubectl exec and k9s shell access.
FROM debian:bookworm-slim
# FROM docker.sre.meitu-int.com/docker-io/debian/debian:bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates procps \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/umodel-server /usr/local/bin/umodel-server
COPY --from=ui /app/dist /ui
EXPOSE 18080
ENTRYPOINT ["umodel-server"]
CMD ["--addr", ":18080", "--data", "/data", "--graphstore", "file.memory", "--ui-dir", "/ui"]
