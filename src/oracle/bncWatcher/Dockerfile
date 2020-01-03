FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk --no-cache add libressl-dev

COPY ./bncWatcher/package.json ./

RUN npm install

COPY ./bncWatcher/index.js ./src/
COPY ./shared/db.js ./shared/logger.js ./shared/crypto.js ./shared/amqp.js ./shared/wait.js ./shared/binanceClient.js ./shared/

ENTRYPOINT ["node", "src/index.js"]
