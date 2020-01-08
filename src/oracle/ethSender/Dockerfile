FROM node:10.16.0-alpine

WORKDIR /sender

RUN apk --no-cache add libressl-dev

COPY ./ethSender/package.json ./

RUN npm install

COPY ./ethSender/index.js ./src/
COPY ./shared/logger.js ./shared/amqp.js ./shared/wait.js ./shared/ethProvider.js ./shared/

ENTRYPOINT ["node", "src/index.js"]
