FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json ./

RUN npm install

COPY testEthereumSend.js ./

ENTRYPOINT ["node", "testEthereumSend.js"]
