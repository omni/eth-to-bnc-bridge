FROM node:10.16.0-alpine

ARG BNC_VERSION=0.6.2

WORKDIR /http-api

COPY --from=testnet-binaries /binaries/cli/testnet/${BNC_VERSION}/linux/tbnbcli ./

COPY ./package.json ./

RUN npm install

COPY ./index.js ./parser.js ./

ENTRYPOINT ["node", "./index.js"]
