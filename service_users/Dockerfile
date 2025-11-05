FROM node:20-alpine
WORKDIR /app
COPY service_users/package*.json ./
RUN npm ci --omit=dev
COPY service_users/ ./
RUN mkdir -p /app/data && \
    if [ ! -f /app/data/users.json ]; then echo "[]" > /app/data/users.json; fi
EXPOSE 4001
CMD ["node", "index.js"]
