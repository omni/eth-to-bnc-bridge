FROM node:10.16.0-alpine

WORKDIR /proxy

COPY ./proxy/package.json /proxy/

RUN npm install

COPY ./proxy/index.js ./proxy/encode.js ./proxy/decode.js ./proxy/contractsAbi.js ./proxy/utils.js ./proxy/expressUtils.js  /proxy/src/
COPY ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js ./shared/binanceClient.js ./shared/ethProvider.js /proxy/shared/

ENTRYPOINT ["node", "src/index.js"]
