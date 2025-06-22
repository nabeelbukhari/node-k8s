IMAGE_NAME ?= node-k8s-loadtest
IMAGE_TAG ?= latest
PLATFORMS ?= linux/amd64,linux/arm64

.PHONY: build push build-local run-local

build:
	docker buildx build --platform $(PLATFORMS) -t $(IMAGE_NAME):$(IMAGE_TAG) --push .

push:
	docker push $(IMAGE_NAME):$(IMAGE_TAG)

build-local:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .

run-local:
	docker run --rm -p 3000:3000 $(IMAGE_NAME):$(IMAGE_TAG)
