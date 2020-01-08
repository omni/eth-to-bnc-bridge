FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk --no-cache add libressl-dev

COPY ./homeWatcher/package.json ./

RUN npm install

COPY ./homeWatcher/index.js ./src/
COPY ./shared/db.js ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js ./shared/ethProvider.js ./shared/

ENTRYPOINT ["node", "src/index.js"]
