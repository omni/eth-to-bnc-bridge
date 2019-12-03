FROM ubuntu:19.10

RUN apt-get update && \
    apt-get install -y curl build-essential openssl pkg-config libssl-dev libgmp3-dev

RUN curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain 1.39.0 -y
ENV PATH=/root/.cargo/bin:$PATH
RUN cargo --version

WORKDIR /tss

COPY ./multi-party-ecdsa/Cargo.lock ./multi-party-ecdsa/Cargo.toml /tss/
COPY ./multi-party-ecdsa/examples /tss/examples
COPY ./multi-party-ecdsa/src/lib.rs /tss/src/lib.rs

# Download all dependencies
RUN cargo fetch

# Build dependencies
RUN cargo build --release --examples || true

COPY ./multi-party-ecdsa /tss/

# Build final executables
RUN cargo build --release --example gg18_keygen_client --example gg18_sign_client

CMD echo Done
