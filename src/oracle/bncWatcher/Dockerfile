FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libssl1.1 libressl-dev curl

COPY ./bncWatcher/package.json /watcher/

RUN npm install

COPY ./bncWatcher/bncWatcher.js ./bncWatcher/db.js /watcher/

ENTRYPOINT ["node", "bncWatcher.js"]
