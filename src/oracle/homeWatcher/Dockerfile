FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libressl-dev

COPY ./homeWatcher/package.json /watcher/

RUN npm install

COPY ./homeWatcher/index.js /watcher/src/
COPY ./shared/db.js ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js ./shared/ethProvider.js /watcher/shared/

ENTRYPOINT ["node", "src/index.js"]
