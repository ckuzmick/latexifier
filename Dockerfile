# Backend compile service: Node + a TeX install so latexmk/pdflatex can run.
# Deploy this image to a container host (Render / Railway / Fly.io). The Vercel
# frontend points at it via VITE_API_BASE. The server is stateless — it writes
# nothing except throwaway temp dirs during a compile.
FROM node:20-bookworm-slim

# A focused TeX set that covers the common article/amsmath/geometry stack.
# Add more texlive-* packages here if your documents need them.
RUN apt-get update && apt-get install -y --no-install-recommends \
      latexmk \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-latex-extra \
      texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only production deps are needed to run the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server ./server
COPY projects ./projects

ENV PORT=3019
EXPOSE 3019
CMD ["node", "server/index.js"]
