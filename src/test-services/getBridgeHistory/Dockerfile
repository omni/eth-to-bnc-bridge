FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json ./

RUN npm install

COPY testGetBridgeHistory.js ./

ENTRYPOINT ["node", "testGetBridgeHistory.js"]
