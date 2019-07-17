FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY testGetBinanceBalance.js /test/

ENTRYPOINT ["node", "testGetBinanceBalance.js"]
