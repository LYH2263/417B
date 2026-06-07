FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npm rebuild

COPY . .

RUN npm run build
EXPOSE 5417
CMD ["npm", "run", "preview", "--", "--host", "--port", "5417"]
