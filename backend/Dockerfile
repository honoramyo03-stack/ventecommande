FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY db_setup.js ./
COPY src/ ./src/

RUN mkdir -p /app/data
RUN node db_setup.js

EXPOSE 4000

CMD ["node", "src/server.js"]
