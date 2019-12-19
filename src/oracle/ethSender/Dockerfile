FROM node:10.16.0-alpine

WORKDIR /sender

RUN apk update && \
    apk add libressl-dev

COPY ./ethSender/package.json /sender/

RUN npm install

COPY ./ethSender/index.js /sender/src/
COPY ./shared/logger.js ./shared/amqp.js ./shared/wait.js ./shared/ethProvider.js /sender/shared/

ENTRYPOINT ["node", "src/index.js"]
