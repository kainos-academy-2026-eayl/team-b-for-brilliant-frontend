FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN ./node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=dist/index.js --sourcemap

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY views ./views
COPY public ./public
COPY src/public ./src/public

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]