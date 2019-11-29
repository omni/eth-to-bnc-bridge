FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libressl-dev

COPY ./bncWatcher/package.json /watcher/

RUN npm install

COPY ./bncWatcher/bncWatcher.js ./shared/db.js ./shared/logger.js ./shared/crypto.js ./shared/amqp.js ./shared/wait.js ./shared/binanceClient.js /watcher/

ENTRYPOINT ["node", "bncWatcher.js"]
