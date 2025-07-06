# Kubernetes Deployment

## Prerequisites

- Docker (for building images)
- kubectl (for applying manifests)
- [Kustomize](https://kustomize.io/) (built into kubectl)
- [Helm](https://helm.sh/) (for Helm-based deployment)

**NOTE: Please ensure that k8s cluster is setup with all CPUs available**

---

## Deploying with Kustomize

### 1. Build Docker Image

```sh
npm run docker:local:build
```

### 2. Deploy with Kustomize

```sh
npm run start:k8s
```

- Edit `deploy/kustomization.yaml` to set the default image and replica count.

#### Overlays

- To override image/tag/replicas for a specific environment (e.g., production), use the overlay in `deploy/overlays/prod/`:
  ```sh
  kubectl apply -k deploy/overlays/prod/
  ```
- The overlay sets:
  - Image: `myrepo/node-k8s-loadtest:prod-20250622`
  - Replicas: 3

#### Uninstall

```sh
npm run stop:k8s
```

---

## Deploying with Helm

### 1. Build Docker Image

```sh
npm run docker:local:build
```

### 2. Deploy with Helm

```sh
npm run start:helm

```

- See `deploy/helm/` for Helm chart configuration.

#### Uninstall

```sh
npm run stop:helm
```

---

## Accessing the Service

- The service is exposed as a load balancer on port 3000 by default.
- Access at: `http://<node-ip>:3000`

## Note for Minikube Users on Windows

If you're running **Minikube on Windows**, you need to set up an external IP to access your NodePort service from your host machine. Open a separate terminal with administrator privileges and run:

```sh
minikube tunnel
```

This command creates a routable external IP for your service.

To verify the external IP assignment, run:

```sh
kubectl get service node-k8s-loadtest-service
```

Look for a value in the `EXTERNAL-IP` column.

You can now access your service in your browser at:

```
http://<EXTERNAL-IP>:3000
```
