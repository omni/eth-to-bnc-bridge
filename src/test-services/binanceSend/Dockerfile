FROM node:10.16.0-alpine

WORKDIR /test

RUN apk add build-base python

COPY package.json /test/

RUN npm install

COPY testBinanceSend.js /test/

ENTRYPOINT ["node", "testBinanceSend.js"]
