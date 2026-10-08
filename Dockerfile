# --- Build du front ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Image de prod ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
# La configuration (titre, apps, favicon, protection) vit dans /data : à monter en volume.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/api/config > /dev/null || exit 1
CMD ["node", "server/index.js"]
