FROM node:20-alpine
WORKDIR /app
COPY server.mjs package.json ./
ENV PORT=8089
EXPOSE 8089
CMD ["node", "server.mjs"]
