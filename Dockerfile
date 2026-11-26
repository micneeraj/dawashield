# DawaShield: builds the PWA and serves it on port 3000. No API keys are needed.
FROM node:24-alpine

WORKDIR /app

# Install first so the dependency layer is cached between code changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Optional public build values, passed by docker-compose from .env if set. Empty = not set.
ARG VITE_RECAPTCHA_SITE_KEY=""
ARG VITE_APPCHECK_DEBUG_TOKEN=""
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY \
    VITE_APPCHECK_DEBUG_TOKEN=$VITE_APPCHECK_DEBUG_TOKEN

RUN npm run build

EXPOSE 3000
CMD ["sh", "-c", "echo 'DawaShield is running at http://localhost:3000' && exec npx vite preview --host 0.0.0.0 --port 3000 --strictPort"]
