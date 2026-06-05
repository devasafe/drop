<h1 align="center">DROP — Marketplace de delivery com chat em tempo real</h1>

<p align="center">
  Marketplace conectando lojas, entregadores e clientes, com mensageria em tempo real e painel administrativo.
  <br/>
  <i>A delivery marketplace connecting stores, couriers and customers, with realtime messaging and an admin panel.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-000?logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-000?logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.io-010101?logo=socket.io&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white" />
</p>

<p align="center">🇧🇷 Português &nbsp;|&nbsp; <a href="#-english">🇺🇸 English</a></p>

<!-- 📸 Dica: adicione um print aqui → ![DROP](docs/screenshot.png) -->

---

## 🇧🇷 Português

### Sobre
Marketplace de **delivery** com três perfis — **loja**, **entregador (motoboy)** e **cliente** — e **chat em tempo real** entre eles via WebSockets. Tem painel administrativo, carteira, cupons, gamificação para entregadores e um **design system próprio** dark.

### Funcionalidades
- 💬 **Chat em tempo real** com Socket.io (cliente ↔ loja ↔ entregador)
- 🛒 Marketplace com lojas, produtos e pedidos
- 🏍️ **Gamificação de entregadores** (ranking, benefícios) e carteira
- 🎟️ Cupons, broadcasts e tickets de suporte
- 📊 **Analytics** (usuários ao vivo, métricas) no painel admin
- 🎨 **Design system próprio** (dark, tokens reutilizáveis)

### Stack
**Frontend:** Next.js (Pages Router) · React 18 · TypeScript · CSS Modules
**Backend:** Node.js · Express · Socket.io · MongoDB/Mongoose · Cloudinary · Jest

### Como rodar
```bash
# Backend (API)
npm install
cp .env.example .env        # configure MONGODB_URI, JWT_SECRET, Cloudinary...
npm run dev                 # ts-node-dev src/index.ts

# Frontend
cd frontend && npm install && npm run dev
```

---

## 🇺🇸 English

### About
A **delivery** marketplace with three roles — **store**, **courier** and **customer** — and **realtime chat** between them via WebSockets. It includes an admin panel, wallet, coupons, courier gamification and a **custom dark design system**.

### Features
- 💬 **Realtime chat** with Socket.io (customer ↔ store ↔ courier)
- 🛒 Marketplace with stores, products and orders
- 🏍️ **Courier gamification** (ranking, perks) and wallet
- 🎟️ Coupons, broadcasts and support tickets
- 📊 **Analytics** (live users, metrics) in the admin panel
- 🎨 **Custom design system** (dark, reusable tokens)

### Tech stack
**Frontend:** Next.js · React 18 · TypeScript · CSS Modules
**Backend:** Node.js · Express · Socket.io · MongoDB · Cloudinary · Jest

### Getting started
```bash
# Backend (API)
npm install
cp .env.example .env        # set MONGODB_URI, JWT_SECRET, Cloudinary...
npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

---

<p align="center">
  Feito por <b>Asafe Oliveira</b> · <a href="https://devasafe.vercel.app">Portfólio</a> · <a href="https://www.linkedin.com/in/devasafemota/">LinkedIn</a> · <a href="https://github.com/devasafe">GitHub</a>
</p>
