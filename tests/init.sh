#!/bin/bash

set -e
set -v

./demo/start-environment.sh
echo "FOREIGN_PRIVATE_KEY=$FOREIGN_PRIVATE_KEY" > ./src/test-services/.keys.$TARGET_NETWORK
./src/test-services/binanceSend/run.sh tbnb14r3z8xk7qsar3vwj05w8cd8gqwk7g6gfurlt5l 100 0.1
./src/test-services/binanceSend/run.sh tbnb1efjg7xt98t67ql2cmwjc5860lgayet9l8m55ym 100 0.1
./src/test-services/binanceSend/run.sh tbnb12epcy4p7ktas0nlyrfuektcyh0e83dwzuq73f4 100 0.1
N=1 ./demo/validator-demo.sh -d
N=2 ./demo/validator-demo.sh -d
N=3 ./demo/validator-demo.sh -d
sleep 10
