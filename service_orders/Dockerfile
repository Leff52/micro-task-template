FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && \
    if [ ! -f /app/data/orders.json ]; then echo "[]" > /app/data/orders.json; fi
EXPOSE 3002
CMD ["node", "index.js"]
