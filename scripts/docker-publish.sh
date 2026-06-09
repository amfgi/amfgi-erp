#!/usr/bin/env bash
# Build on your PC (needs Docker Desktop) and push to Docker Hub.
# Coolify then pulls the image — no compile on the 4GB VPS.
#
# Usage:
#   export DOCKER_USER=your-dockerhub-username
#   ./scripts/docker-publish.sh
#
# Or one-liner:
#   DOCKER_USER=yourname ./scripts/docker-publish.sh

set -euo pipefail

DOCKER_USER="${DOCKER_USER:?Set DOCKER_USER to your Docker Hub username}"
IMAGE="${DOCKER_IMAGE:-${DOCKER_USER}/amfgi-erp}"
TAG="${DOCKER_TAG:-latest}"

echo "Running typecheck (local only) ..."
npm run typecheck

echo "Building ${IMAGE}:${TAG} ..."
docker build -t "${IMAGE}:${TAG}" .

echo "Pushing ${IMAGE}:${TAG} ..."
docker push "${IMAGE}:${TAG}"

echo "Done. In Coolify set image to: ${IMAGE}:${TAG}"
