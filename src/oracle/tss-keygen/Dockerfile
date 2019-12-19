FROM node:10.16.0-slim

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y libssl-dev procps

COPY ./tss-keygen/package.json /tss/

RUN npm install

COPY --from=tss /tss/target/release/examples/gg18_keygen_client /tss/

COPY ./tss-keygen/keygen-entrypoint.sh /tss/
COPY ./tss-keygen/index.js /tss/src/
COPY ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js /tss/shared/

RUN mkdir /keys

ENTRYPOINT ["node", "src/index.js"]
