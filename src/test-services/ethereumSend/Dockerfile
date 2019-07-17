FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY testEthereumSend.js IERC20.json /test/

ENTRYPOINT ["node", "testEthereumSend.js"]
