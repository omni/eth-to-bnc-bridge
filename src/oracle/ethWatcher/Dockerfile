FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libssl1.1 libressl-dev curl

COPY ./ethWatcher/package.json /watcher/

RUN npm install

COPY ./ethWatcher/ethWatcher.js ./ethWatcher/db.js /watcher/

ENTRYPOINT ["node", "ethWatcher.js"]
