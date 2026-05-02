# DungeonMaker

> Generador de historias de Dungeons & Dragons impulsado por IA.

DungeonMaker es una aplicación web diseñada para Dungeon Masters y entusiastas
del rol que buscan generar aventuras personalizadas y coherentes en segundos.
Utilizando los modelos de lenguaje de OpenAI, la plataforma transforma una
serie de preferencias y datos específicos (temas, personajes, ambientación,
villanos...) en una narrativa estructurada lista para llevar a mesa.

## Características

- Selección de temas mediante tarjetas (fantasía épica, terror, misterio, intriga, etc.).
- Campos opcionales para personalizar lugares, personajes, villanos y ambientación.
- Configuración de tono y duración de la historia.
- Respuesta en streaming: ves la historia escribirse en tiempo real.
- Diseño minimalista en blanco con acentos azules (`#0077b6` / `#00b4d8`).
- 100 % cliente: HTML, CSS y JavaScript vanilla. Sin backend, sin dependencias.

## Cómo usarlo

1. Clona el repo y abre `index.html` en tu navegador, o sírvelo con cualquier
   servidor estático:

   ```bash
   git clone https://github.com/IKER2222/DungeonMaker.git
   cd DungeonMaker
   python3 -m http.server 8000
   # abre http://localhost:8000
   ```

2. Consigue una API key de OpenAI en
   [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
3. Pega tu key en el primer campo del formulario.
4. Selecciona temas, rellena los detalles que quieras y pulsa **Forjar historia**.

## Sobre la API key

La aplicación usa el modelo `gpt-4o-mini` directamente desde el navegador. Tu
API key:

- **Nunca sale de tu navegador.** Se envía únicamente a `api.openai.com`.
- Se guarda opcionalmente en `localStorage` para no tener que reintroducirla.
- Puedes borrarla en cualquier momento desde el botón "Olvidar key".

> ⚠️ Guardar la key en `localStorage` es cómodo pero no es la opción más segura
> en equipos compartidos. Si te preocupa, desmarca la casilla "Recordar en este
> navegador" y la key vivirá solo durante la sesión.

## Estructura del proyecto

```
DungeonMaker/
├── index.html      # Estructura y formulario
├── styles.css      # Estilos minimalistas
├── script.js       # Lógica + integración con OpenAI (streaming)
├── README.md
└── LICENSE
```

## Licencia

[MIT](./LICENSE)
