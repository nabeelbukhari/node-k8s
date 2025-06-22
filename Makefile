.PHONY: build push build-local run-local

build:
	npm run docker:build

push:
	npm run docker:push

build-local:
	npm run docker:build-local

run-local:
	npm run docker:run-local
