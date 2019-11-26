FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY testGetEthereumBalance.js /test/

ENTRYPOINT ["node", "testGetEthereumBalance.js"]
