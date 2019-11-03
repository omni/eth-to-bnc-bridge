FROM node:10.16.0-alpine

WORKDIR /proxy

COPY ./proxy/package.json /proxy/

RUN npm install

COPY ./proxy/index.js ./proxy/encode.js ./proxy/decode.js ./proxy/sendTx.js ./shared/logger.js ./shared/crypto.js ./shared/wait.js /proxy/
COPY ./proxy/Bridge.json ./proxy/IERC20.json ./proxy/SharedDB.json /proxy/contracts_data/

ENTRYPOINT ["node", "index.js"]
