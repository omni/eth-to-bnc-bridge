FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json ./

RUN npm install

COPY testGetAddresses.js ./

ENTRYPOINT ["node", "testGetAddresses.js"]
