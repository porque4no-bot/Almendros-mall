# Almendros Mall - BERLÍN° Vite Refactor

Proyecto refactorizado de React monolítico a arquitectura modular con Vite, separación de responsabilidades e integración con Firebase Firestore.

## Estructura del Proyecto

```
src/
├── config/           # Configuración de servicios externos
│   └── firebase.js   # Inicialización de Firebase
├── data/             # Datos y constantes
│   └── constants.js  # CAISSONS, ITEMS, REND, mapeos, etc.
├── utils/            # Lógica pura y funciones de cálculo
│   └── caissonUtils.js
├── hooks/            # Custom React hooks
│   └── useFirebaseData.js
├── components/
│   ├── ui/           # Componentes visuales reutilizables
│   │   ├── BerlinLogo.jsx
│   │   ├── ExcBar.jsx
│   │   ├── StatCard.jsx
│   │   └── CaissonDraw.jsx
│   ├── charts/       # Componentes de gráficos
│   │   └── ProgressChart.jsx
│   ├── layout/       # Componentes de layout
│   │   └── Header.jsx
│   └── caissons/     # Componentes específicos de caissons
│       ├── InteractiveMap.jsx
│       └── CaissonDetailPanel.jsx
├── App.jsx           # Componente principal
├── main.jsx          # Entry point
└── index.css         # Estilos globales + Tailwind

Archivos de configuración:
├── vite.config.js    # Configuración de Vite
├── tailwind.config.js # Configuración de Tailwind CSS
├── postcss.config.js  # Configuración de PostCSS
├── package.json       # Dependencias
└── index.html         # HTML template
```

## Principios de Diseño

### 1. Separación de Responsabilidades
- **Config**: Servicios externos (Firebase, APIs)
- **Data**: Constantes e información estática
- **Utils**: Funciones puras sin efectos secundarios
- **Hooks**: Lógica stateful reutilizable
- **Components**: Presentación y interacción de UI

### 2. Rendimiento
- `useMemo` para cálculos complejos
- `useCallback` para funciones estables
- Debouncing de escrituras a Firestore
- Lazy loading de componentes

### 3. Maintainibilidad
- Componentes pequeños y enfocados
- Props tipadas explícitas
- Archivos con responsabilidad única
- Imports organizados por relación

## Instalación

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview
```

## Dependencias Principales

- **React 18.2**: Framework UI
- **Vite 5.0**: Build tool y dev server
- **Tailwind CSS 3.3**: Utilidades CSS
- **Firebase 11.0**: Firestore para sincronización de datos
- **Lucide React 0.263**: Iconos SVG

## Migración desde el Monolito

### Cambios Realizados

1. **CDN → ESM**: De Babel standalone + CDN a imports ES6
2. **localStorage → Firestore**: De persistencia local a cloud
3. **Monolito → Modular**: De 1348 líneas a 10+ archivos especializados
4. **Babel → Vite**: De Babel en navegador a compilación optimizada
5. **CSS-in-JS → Tailwind**: De styles en JSX a utilities

### Compatibilidad

✅ Todas las funciones matemáticas preservadas
✅ Misma estética BERLÍN°
✅ Datos sincronizados en tiempo real
✅ Dark/Light mode mantenido
✅ Mobile responsive

## Próximos Pasos

1. Conectar con Netlify para deployment automático
2. Agregar PWA para uso offline
3. Implementar autenticación de usuarios
4. Mejorar visualizaciones con D3.js o Recharts
5. Tests unitarios con Vitest
6. E2E testing con Playwright

## Notas de Desarrollo

- Firebase Firestore ya está configurado y conectado
- Las credenciales están en `src/config/firebase.js`
- El custom hook `useFirebaseData` maneja toda la sincronización
- Los cálculos mantienen la lógica exacta del monolito
- El proyecto está listo para ser desplegado en Netlify
