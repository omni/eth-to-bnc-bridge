FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libressl-dev

COPY ./bncWatcher/package.json /watcher/

RUN npm install

COPY ./bncWatcher/index.js /watcher/src/
COPY ./shared/db.js ./shared/logger.js ./shared/crypto.js ./shared/amqp.js ./shared/wait.js ./shared/binanceClient.js /watcher/shared/

ENTRYPOINT ["node", "src/index.js"]
