# Stage 1: Build React admin
FROM node:20-alpine AS admin-build
WORKDIR /admin
COPY admin/package*.json ./
RUN npm install
COPY admin/ .
RUN npm run build

# Stage 2: Backend + built admin
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ .
# Copy React build output into backend/public (served as static files)
COPY --from=admin-build /admin/dist ./public
EXPOSE 3001
CMD ["node", "src/index.js"]
