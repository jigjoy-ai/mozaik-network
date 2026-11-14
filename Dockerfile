FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
# Only what the server runs with: tsx runs the TypeScript as it is, so it is a dependency, not a build tool.
RUN npm ci --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node_modules/.bin/tsx", "src/server.ts"]
