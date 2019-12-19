FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libressl-dev

COPY ./sideWatcher/package.json /watcher/

RUN npm install

COPY ./sideWatcher/index.js /watcher/src/
COPY ./shared/logger.js ./shared/db.js ./shared/amqp.js ./shared/wait.js ./shared/ethProvider.js /watcher/shared/

ENTRYPOINT ["node", "src/index.js"]
