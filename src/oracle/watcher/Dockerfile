FROM node:10.16.0-alpine

WORKDIR /watcher

RUN apk update && \
    apk add libssl1.1 libressl-dev curl

COPY package.json /watcher/

RUN npm install

COPY ethWatcher.js db.js /watcher/

ENTRYPOINT ["node", "ethWatcher.js"]
