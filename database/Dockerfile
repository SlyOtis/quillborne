FROM golang:1.26-alpine AS smig-build
RUN apk add --no-cache git
RUN go install -ldflags "-X github.com/nimling/samna-migrate/pkg/cli.Version=v1.5.14" github.com/nimling/samna-migrate/cmd@v1.5.14 \
    && mv /go/bin/cmd /usr/local/bin/smig

FROM postgres:17-alpine

ARG APP_NAME=quillborne
ARG PGPORT=5432

ENV POSTGRES_DB=${APP_NAME}
ENV POSTGRES_USER=${APP_NAME}
ENV POSTGRES_PASSWORD=${APP_NAME}
ENV PGPORT=${PGPORT}
ENV PGUSER=${APP_NAME}
ENV PGPASSWORD=${APP_NAME}
ENV PGDATABASE=${APP_NAME}
ENV PGSSLMODE=disable
ENV DB_DIR=/database
ENV MIGRATE_SCHEMA=/database/migrate.yml

RUN apk add --no-cache git

COPY . /database/
COPY --from=smig-build /usr/local/bin/smig /usr/local/bin/smig

RUN printf '#!/bin/sh\nset -e\nexport PGHOST=/var/run/postgresql\nsmig upgrade --yes --schema=/database/migrate.yml --db-dir=/database\nsmig up --yes --schema=/database/migrate.yml --db-dir=/database\n' > /docker-entrypoint-initdb.d/migrate.sh && chmod +x /docker-entrypoint-initdb.d/migrate.sh
