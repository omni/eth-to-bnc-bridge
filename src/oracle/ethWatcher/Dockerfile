FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libressl-dev

COPY ./ethWatcher/package.json /watcher/

RUN npm install

COPY ./ethWatcher/ethWatcher.js ./shared/db.js ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js /watcher/

ENTRYPOINT ["node", "ethWatcher.js"]
