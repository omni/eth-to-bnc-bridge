FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY testGetBridgeHistory.js /test/

ENTRYPOINT ["node", "testGetBridgeHistory.js"]
