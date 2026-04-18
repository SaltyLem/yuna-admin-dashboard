FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-fund --no-audit
COPY src ./src
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json ./
# No runtime deps — the agent uses only Node builtins + fetch.
CMD ["node", "dist/index.js"]
