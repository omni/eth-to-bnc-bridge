FROM node:10.16.0-alpine

WORKDIR /proxy

COPY ./proxy/package.json /proxy/

RUN npm install

COPY ./proxy/index.js ./proxy/encode.js ./proxy/decode.js ./proxy/sendTx.js ./proxy/contractsAbi.js ./proxy/utils.js ./shared/logger.js ./shared/crypto.js ./shared/wait.js /proxy/

ENTRYPOINT ["node", "index.js"]
