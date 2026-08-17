# Build context is the repo root (see docker-compose.yml), so paths below
# are rooted at the repo, not at docker/.
FROM node:20-slim

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install

COPY frontend/ .

EXPOSE 5173

CMD ["npm", "run", "dev"]
