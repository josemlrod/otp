# syntax = docker/dockerfile:1

ARG NODE_VERSION=24
ARG BUN_VERSION=1.2.21

FROM oven/bun:${BUN_VERSION}-slim AS bun

FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Remix"

WORKDIR /app

ENV NODE_ENV="production"

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun


FROM base AS build

COPY bun.lock package.json ./
RUN bun install --frozen-lockfile

COPY . .


FROM base

COPY --from=build /app /app

# Names this deploy, so installed apps can tell when a newer one is live.
ARG APP_VERSION=""
ENV APP_VERSION=${APP_VERSION}

EXPOSE 3000
CMD [ "bun", "run", "start" ]
