# syntax = docker/dockerfile:1

ARG NODE_VERSION=24
ARG BUN_VERSION=1.2.21

FROM oven/bun:${BUN_VERSION}-slim AS bun

FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Remix"

WORKDIR /app

ENV NODE_ENV="production"

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun


# Throw-away build stage to reduce size of final image
FROM base AS build

COPY bun.lock package.json ./
RUN bun install --frozen-lockfile

COPY . .


# Final stage for app image
FROM base

COPY --from=build /app /app

EXPOSE 3000
CMD [ "bun", "run", "start" ]
