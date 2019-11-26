FROM node:10.16.0-alpine

WORKDIR /test

COPY package.json /test/

RUN npm install

COPY testSidePrefund.js /test/

ENTRYPOINT ["node", "testSidePrefund.js"]
