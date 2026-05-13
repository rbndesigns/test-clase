# 🏀 HA Basket — Scraper Automático de Partidos

Sistema que extrae los próximos partidos de **HA Basket** desde fbm.es cada noche
y los muestra en la web sin ninguna intervención manual.

## Arquitectura

```
GitHub Actions (cada noche)
       │
       ▼
  scraper.js  ──→  Puppeteer abre fbm.es
                   busca "HA Basket"
                   extrae partidos
                       │
                       ▼
              public/partidos.json  (commit automático)
                       │
                       ▼
              public/index.html  lee el JSON y renderiza
                       │
                       ▼
              GitHub Pages  (URL pública del club)
```

---

## Setup inicial (15 minutos)

### 1. Crear el repositorio en GitHub

1. Ve a github.com → **New repository**
2. Nombre: `ha-basket` (o el que prefieras)
3. Visibilidad: **Public** (necesario para GitHub Pages gratuito)
4. Sube todos estos archivos tal cual

### 2. Activar GitHub Pages

1. En tu repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / carpeta: `/public`
4. Guarda → en unos minutos tendrás URL tipo `https://tu-usuario.github.io/ha-basket`

### 3. Dar permisos de escritura a GitHub Actions

1. En tu repo → **Settings** → **Actions** → **General**
2. Baja hasta **Workflow permissions**
3. Selecciona **Read and write permissions**
4. Guarda

### 4. Ejecutar el scraper por primera vez

1. Ve a **Actions** en tu repo
2. Selecciona el workflow **"Scraper Partidos HA Basket"**
3. Pulsa **"Run workflow"** → **"Run workflow"** (botón verde)
4. En ~3 minutos verás si encontró partidos

---

## Estructura del proyecto

```
ha-basket/
├── scraper.js                    ← scraper principal (Puppeteer)
├── package.json                  ← dependencias Node.js
├── .github/
│   └── workflows/
│       └── scrape.yml            ← automatización nocturna
└── public/
    ├── index.html                ← web del club (lee partidos.json)
    └── partidos.json             ← datos generados por el scraper ← NO editar a mano
```

---

## Si el scraper no encuentra partidos

El scraper puede fallar si la FBM cambia su HTML. Señales:

- `partidos.json` tiene `"total": 0`
- En GitHub Actions verás capturas `debug_*.png` en los artefactos del workflow

**Cómo depurar:**

```bash
npm install
node scraper.js
# Abre debug_*.png si se generaron
```

Si la estructura del HTML de la FBM ha cambiado, edita los selectores
en `scraper.js` en la sección `CONTENT_SELECTORS` y `SEARCH_SELECTORS`.

---

## Cambiar el equipo

Para usarlo con otro equipo solo cambia esta línea en `scraper.js`:

```js
const TEAM_NAME = 'HA Basket';   // ← pon aquí el nombre exacto como aparece en la FBM
```

---

## Notas legales

Este scraper lee datos públicamente accesibles en fbm.es para uso
interno del club. La FBM tiene `robots.txt` que desaconseja el scraping
automático. Si la FBM o NBN23 ofrecen una API oficial, úsala en su lugar
(contacto: sales@nbn23.com).
