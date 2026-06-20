# Dev-oriented image for the API (and, in Phase 3, the worker — same image,
# different start command). Source is bind-mounted at runtime for hot-reload;
# this build just gives us a Linux node_modules and the tooling.
FROM node:24-alpine

WORKDIR /app

# Install deps first so this layer is cached unless package files change.
COPY package*.json ./
RUN npm install

# Copy the rest (overridden by the bind-mount at runtime, needed for prod builds).
COPY . .

EXPOSE 4000

CMD ["npm", "run", "dev"]
