#!/bin/sh
set -e

echo "==> Applying database migrations..."
npx prisma migrate deploy

echo "==> Starting الوكيل (Next.js) on :3000"
exec npm start
