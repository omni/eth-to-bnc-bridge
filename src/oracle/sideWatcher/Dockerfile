FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk --no-cache add libressl-dev

COPY ./sideWatcher/package.json ./

RUN npm install

COPY ./sideWatcher/index.js ./src/
COPY ./shared/logger.js ./shared/db.js ./shared/amqp.js ./shared/wait.js ./shared/ethProvider.js ./shared/

ENTRYPOINT ["node", "src/index.js"]
