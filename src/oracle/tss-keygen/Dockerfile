FROM node:10.16.0-slim

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y --no-install-recommends libssl-dev procps && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY ./tss-keygen/package.json ./

RUN npm install

COPY --from=tss /tss/target/release/examples/gg18_keygen_client ./

COPY ./tss-keygen/keygen-entrypoint.sh ./
COPY ./tss-keygen/index.js ./src/
COPY ./shared/logger.js ./shared/amqp.js ./shared/crypto.js ./shared/wait.js ./shared/

RUN mkdir /keys

ENTRYPOINT ["node", "src/index.js"]
