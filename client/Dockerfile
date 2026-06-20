# Dev-oriented image for the Vite dashboard. Source is bind-mounted at runtime
# for HMR; --host makes Vite listen on 0.0.0.0 so it's reachable from outside
# the container.
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
