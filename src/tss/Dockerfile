FROM ubuntu:19.10

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

WORKDIR /tss

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl build-essential openssl pkg-config libssl-dev libgmp3-dev  && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN curl https://sh.rustup.rs -sSf | sh -s -- --default-toolchain 1.39.0 -y
ENV PATH=/root/.cargo/bin:$PATH
RUN cargo --version

COPY ./multi-party-ecdsa/Cargo.lock ./multi-party-ecdsa/Cargo.toml ./
COPY ./multi-party-ecdsa/examples ./examples
COPY ./multi-party-ecdsa/src/lib.rs ./src/lib.rs

# Download all dependencies
RUN cargo fetch

# Build dependencies
RUN cargo build --release --examples || true

COPY ./multi-party-ecdsa ./

# Build final executables
RUN cargo build --release --example gg18_keygen_client --example gg18_sign_client

CMD ["echo", "Done"]
