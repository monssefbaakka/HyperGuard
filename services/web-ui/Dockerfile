# syntax=docker/dockerfile:1

# --- Build stage ---------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies are installed from the lockfile alone so this layer is reused whenever only source
# files change.
COPY package.json package-lock.json ./
RUN npm ci

COPY postcss.config.js tailwind.config.js tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# --- Runtime stage -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# The upstream hosts are substituted into the config at container start (nginx templates), so the
# same image works against Compose service names or host.docker.internal.
ENV PULSESTREAM_QUERY_HOST=query-service \
    PULSESTREAM_QUERY_PORT=8083 \
    PULSESTREAM_INGESTION_HOST=ingestion-service \
    PULSESTREAM_INGESTION_PORT=8081 \
    PULSESTREAM_PROMETHEUS_HOST=prometheus \
    PULSESTREAM_PROMETHEUS_PORT=9090

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8090
