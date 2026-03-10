FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/boards-core/package.json packages/boards-core/
COPY packages/boards-server/package.json packages/boards-server/
RUN bun install --frozen-lockfile --production

COPY packages/boards-core/ packages/boards-core/
COPY packages/boards-server/ packages/boards-server/

ENV BOARDS_DB=/data/boards.db
ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "packages/boards-server/src/serve.ts"]
