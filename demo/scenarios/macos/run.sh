#!/bin/bash

RELOAD=${RELOAD:=false}

RELOAD="$RELOAD" osascript -l JavaScript ./demo/scenarios/macos/main.jxa
