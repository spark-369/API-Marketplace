# Frontend container: builds the SPA, then serves it with nginx.
#
# Two stages keep the runtime image free of Node, npm caches and source maps.

# ---- Build stage ------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy manifests first so the dependency layer is cached until they actually change.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# The SPA talks to a same-origin /api path, which nginx proxies at runtime (see nginx.conf),
# so no build-time API URL is needed.
RUN npm run build

# ---- Runtime stage ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Our own server block: SPA history fallback plus the /api reverse proxy.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Run unprivileged. nginx:alpine ships a `nginx` user already.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
