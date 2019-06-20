FROM ubuntu:19.10

RUN apt-get update && \
    apt-get install -y curl build-essential git openssl pkg-config libssl-dev libgmp3-dev

RUN curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain nightly -y

ENV PATH=/root/.cargo/bin:$PATH

WORKDIR /repo

RUN git clone https://github.com/KZen-networks/multi-party-ecdsa.git .

RUN mkdir -p /tss/src && \
    cp /repo/Cargo.toml /tss/ && \
    cp /repo/src/lib.rs /tss/src/

WORKDIR /tss

RUN cargo build --release || true

RUN cp -Tr /repo /tss

RUN cargo build --release

CMD echo Done
