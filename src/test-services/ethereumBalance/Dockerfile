FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY testGetEthereumBalance.js IERC20.json /test/

ENTRYPOINT ["node", "testGetEthereumBalance.js"]
