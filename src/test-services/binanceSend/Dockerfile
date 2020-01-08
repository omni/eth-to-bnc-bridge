FROM node:10.16.0-alpine

WORKDIR /test

RUN apk --no-cache add build-base python

COPY package.json ./

RUN npm install

COPY testBinanceSend.js ./

ENTRYPOINT ["node", "testBinanceSend.js"]
