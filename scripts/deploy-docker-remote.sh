#!/bin/sh
set -eu

deploy_dir=$1
image_tag=$2
port=$3
build_dir="$deploy_dir/builds/$image_tag"
image="icon-family:$image_tag"

docker info >/dev/null
docker compose version
mkdir -p "$deploy_dir/data"
tar -xzf "$build_dir/source.tar.gz" -C "$build_dir"
docker build -t "$image" "$build_dir"

# Preserve server-side .env credentials and validate before replacing configuration.
cd "$deploy_dir"
docker compose -p icon-family --project-directory "$deploy_dir" -f "$build_dir/docker-compose.yml" config --quiet
if [ -f docker-compose.yml ]; then
  cp -p docker-compose.yml "docker-compose.yml.before-$image_tag"
fi
cp "$build_dir/docker-compose.yml" docker-compose.yml
docker compose -p icon-family up -d --no-build

# The minimal runtime has no shell or curl.
attempt=0
until docker exec icon-family /usr/local/bin/node --input-type=module -e \
  'const r = await fetch("http://127.0.0.1:3000/api/health", {signal: AbortSignal.timeout(3000)}); if (!r.ok || !(await r.json()).ok) process.exit(1)' >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 15 ]; then
    docker compose -p icon-family logs --tail=50
    echo 'Health check failed; previous Compose configuration and images were retained.' >&2
    exit 1
  fi
  sleep 2
done
docker tag "$image" icon-family:latest
docker compose -p icon-family ps
echo "Ready on port $port; data: $deploy_dir/data"
