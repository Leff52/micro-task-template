FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && \
    if [ ! -f /app/data/users.json ]; then echo "[]" > /app/data/users.json; fi
EXPOSE 3001
CMD ["node", "index.js"]
