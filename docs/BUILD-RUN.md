# How to Build

## Install Dependencies

Install dependencies using npm:

```shell
npm install
```

## 1. Create a Custom Builder

Set up a Docker builder using the `docker-container` driver:

```shell
docker buildx create --name container-builder --driver docker-container --bootstrap --use
```

## 2. Build and Push Docker Image

Build the Docker image using the provided npm script:

```shell
npm run docker:local:build
```

Push the built image to your Docker image registry:

```shell
npm run docker:push
```

## 3. Build and Push Multi-Arch Docker Image

Build and push the multi-architecture Docker image using the provided npm script:

```shell
npm run docker:multi:push
```

# How to Run

## Run via CLI

1. Start the benchmark tool:

   ```shell
   npm run cli:start
   ```

2. Follow the interactive prompts to choose the server type and load distribution.

## Run via Web UI

1. Launch the web interface:

   ```shell
   npm run web:start
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser.

3. The UI will appear as shown below:

   ![Web UI Screenshot](docs/images/ui-image.png)

4. Select your desired server type and load distribution, then click **Run Benchmark**.

NOTE: To run the web in debug mode use:

```shell
npm run web:debug
```

Now you can connect your debugger on port: **9229**

## Run in Docker

After building and pushing your Docker image (see [Build and Push Docker Image](#build-and-push-docker-image)), you can run the app in Docker:

```shell
npm run docker:local:run
```

This will start the web UI in a Docker container, accessible at [http://localhost:3000](http://localhost:3000).

## Notes

- The benchmark will automatically start the selected server, run the load test, and display results.
- Make sure port 3000 is available before running the benchmark.
