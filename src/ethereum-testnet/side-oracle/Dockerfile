FROM node:10.16.0-alpine

WORKDIR /side-oracle

RUN apk update && \
    apk add libssl1.1 libressl-dev curl

COPY ./package.json /side-oracle/

RUN npm install

COPY ./index.js ./

ENTRYPOINT ["node", "index.js"]
