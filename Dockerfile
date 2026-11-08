FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

FROM golang:1.26-alpine AS go-builder

ARG IMAGE_VERSION=dev

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags "-X github.com/SlyOtis/quillborne/internal/version.Version=${IMAGE_VERSION}" \
    -o main ./cmd

FROM golang:1.26-alpine AS smig-builder
RUN apk add --no-cache git
RUN go install -ldflags "-X github.com/nimling/samna-migrate/pkg/cli.Version=v1.5.13" github.com/nimling/samna-migrate/cmd@v1.5.13 \
    && mv /go/bin/cmd /go/bin/smig

FROM alpine:latest AS migrate

RUN apk --no-cache add ca-certificates git postgresql17-client

COPY --from=smig-builder /go/bin/smig /usr/local/bin/smig
COPY database/ /database/

CMD ["sh", "-c", "smig upgrade --yes --schema=/database/migrate.yml --db-dir=/database && smig up --yes --schema=/database/migrate.yml --db-dir=/database"]

FROM alpine:latest
ARG IMAGE_VERSION

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
COPY --from=go-builder /app/main .
COPY --from=web-builder /web/dist ./web/dist

EXPOSE 4290

ENV SERVER_VERSION=$IMAGE_VERSION
ENV SERVER_HTML_PATH=/app/web/dist
ENV SERVER_PORT=4290

CMD ["/app/main"]
