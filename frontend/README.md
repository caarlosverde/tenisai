# TenisAI · Frontend

Aplicación Next.js 16 de TenisAI. La documentación completa (arquitectura, puesta en
marcha, variables de entorno y tests) está en el [README del proyecto](../README.md).

```bash
cp .env.example .env.local   # y rellena JWT_SECRET
npm install
npx prisma migrate deploy
npm run dev                  # http://localhost:3000
```

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run typecheck` | Comprobación de tipos (TypeScript) |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Tests de extremo a extremo con Playwright |
| `python scripts/generar_imagenes.py` | Regenera iconos, logo e imagen para compartir desde `assets/logo-original.jpg` |
