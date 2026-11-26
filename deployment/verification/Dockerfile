FROM node:24-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir numpy==2.5.5 opencv-python-headless==4.13.0.92 Pillow==12.3.0
ENV ITC_PYTHON=/opt/venv/bin/python
WORKDIR /app
COPY deployment/verification/package*.json deployment/verification/
RUN cd deployment/verification && npm ci --omit=dev
COPY deployment/verification/server.mjs deployment/verification/
COPY experiments/board-library/photo-shape.mjs experiments/board-library/photo-verification-server.mjs experiments/board-library/verify-photo-proposals.py experiments/board-library/photo-verification-policy.json experiments/board-library/
COPY experiments/component-parallax/policy.json experiments/component-parallax/
COPY src/component-parallax/engine.py src/component-parallax/
USER node
CMD ["node","deployment/verification/server.mjs"]
